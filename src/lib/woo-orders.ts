// Creates real WooCommerce orders with EXPLICIT line-item prices sourced from
// Unleashed — overriding WooCommerce's distorted `price` field. Requires a
// WRITE-capable WC key. Gated behind WC_WRITE_ENABLED so nothing hits the live
// store until we've verified the price-override behaviour.

import { getProductById, getVariation } from "@/lib/woocommerce";
import { getUnleashedMap, enrich, lookupBySku } from "@/lib/unleashed";

// READ AT CALL TIME. As a module-level const this froze at import, which made
// the gate below unable to see a value set afterwards and untestable — the same
// fault as the freight code in lib/unleashed-orders. No behaviour change in the
// server runtime, where the variable is present before this module loads.
const storeUrl = () => process.env.WC_STORE_URL;
// The store has GST (10%) enabled and adds it on top of submitted line totals.
// Our unitPrice is GST-INCLUSIVE, so we divide it back out before submitting.
const GST = 1.1;

export type CartRef = {
  productId: number;
  variationId?: number;
  quantity: number;
  /** Unleashed ProductCode. The preferred key — see resolveOrderLines. */
  sku?: string;
};

// Re-price the cart on the SERVER — never trust client-sent prices for payment.
// Returns authoritative lines + total (inc GST).
//
// THE ERP IS THE PRICE, AND NOW THE NAME TOO. Both halves of a line already came
// from Unleashed in all but name: `enrich` reads the price off the cached map and
// WooCommerce was consulted only for the product's title and its variation label.
// That made a live WooCommerce the difference between an order and a 500, for two
// strings the ERP holds itself.
//
// So a ref carrying a ProductCode resolves entirely from the map, and the
// WooCommerce path below is kept only for carts saved before this shipped —
// localStorage outlives a deploy, and a cart mid-checkout must not start failing
// because we changed our minds about the lookup key. That branch can go once the
// oldest surviving cart has expired.
//
// GST IS UNCHANGED. `UnleashedEntry.price` is GST-INCLUSIVE (unleashed.ts applies
// the 1.1 at map-build time), which is exactly what `enrich().priceValue` returned
// here before. Both paths still produce an inc-GST unitPrice, so the ex-GST
// conversion at submission is untouched. Getting this backwards would charge or
// record a figure 10% out, which is the fault that produced order 490118.
export async function resolveOrderLines(
  refs: CartRef[]
): Promise<{ lines: OrderLine[]; total: number; hasPoa: boolean }> {
  const map = await getUnleashedMap().catch(() => ({}));
  const lines: OrderLine[] = [];
  for (const r of refs) {
    const qty = Math.max(1, Math.floor(r.quantity || 1));

    const code = r.sku?.trim();
    const erp = code ? lookupBySku(map, code) : null;
    // A code that the ERP does not know is NOT a reason to fall through to
    // WooCommerce: it means the cart and the catalogue disagree, and quietly
    // re-pricing that line somewhere else is how the wrong number gets charged.
    if (code && !erp) throw new Error(`Unresolvable line item: ERP code ${code}`);
    if (erp) {
      // A sellable product with no name in the ERP cannot be put on an order
      // line a human has to read in the warehouse.
      if (!erp.name) throw new Error(`ERP code ${code} has no product name`);
      lines.push({
        productId: r.productId,
        variationId: r.variationId,
        sku: code,
        quantity: qty,
        unitPrice: erp.price,
        name: erp.name,
      });
      continue;
    }

    if (r.variationId) {
      const [v, parent] = await Promise.all([
        getVariation(r.productId, r.variationId),
        getProductById(r.productId),
      ]);
      // Fail closed: never silently drop a line from a cart we're about to charge.
      // A missing product here means we'd price/charge for a subset (pre-payment)
      // or mismatch the PaymentIntent and fail after the card was charged (post-payment).
      if (!v || !parent) throw new Error(`Unresolvable line item: product ${r.productId} variation ${r.variationId}`);
      const label = v.attributes?.map((a) => a.option).filter(Boolean).join(" / ");
      lines.push({
        productId: r.productId,
        variationId: r.variationId,
        quantity: qty,
        unitPrice: enrich(v, map).priceValue,
        name: `${parent.name}${label ? ` - ${label}` : ""}`,
      });
    } else {
      const p = await getProductById(r.productId);
      if (!p) throw new Error(`Unresolvable line item: product ${r.productId}`);
      lines.push({ productId: r.productId, quantity: qty, unitPrice: enrich(p, map).priceValue, name: p.name });
    }
  }
  const total = Math.round(lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0) * 100) / 100;
  const hasPoa = lines.some((l) => l.unitPrice <= 0);
  return { lines, total, hasPoa };
}

function authHeader() {
  const ck = process.env.WC_CONSUMER_KEY ?? "";
  const cs = process.env.WC_CONSUMER_SECRET ?? "";
  return "Basic " + Buffer.from(`${ck}:${cs}`).toString("base64");
}

export type OrderLine = {
  productId: number; // WC parent/product id
  variationId?: number; // set for variable products
  /** Unleashed ProductCode, when the line resolved from the ERP. */
  sku?: string;
  quantity: number;
  unitPrice: number; // GST-inclusive unit price (from Unleashed/cart)
  name: string;
};

export type OrderAddress = {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  company?: string;
  address_1?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
};

export type CreateOrderInput = {
  billing: OrderAddress;
  shipping?: OrderAddress;
  lines: OrderLine[];
  paymentIntentId?: string;
  customerNote?: string;
  // The GST-inclusive amount the card was actually charged (the PaymentIntent
  // total). Used to sanity-check that WooCommerce computed the same order total.
  chargedTotal?: number;
  /** What freight was charged, so the order records it instead of "free". */
  freight?: { amount: number; service?: string; carrier?: string };
};

export type WooOrderResult = {
  id: number;
  number: string;
  status: string;
  total: string;
};

export function ordersEnabled(): boolean {
  return process.env.WC_WRITE_ENABLED === "true" && !!storeUrl();
}

export async function createWooOrder(input: CreateOrderInput): Promise<WooOrderResult> {
  if (!ordersEnabled()) throw new Error("WC order creation is disabled (WC_WRITE_ENABLED)");

  const line_items = input.lines.map((l) => {
    // Submit the EX-GST amount: the store re-adds 10% GST, landing back on the
    // GST-inclusive price we actually charged, and records a correct GST line on
    // the order. Submitting the inclusive price here would double-count GST.
    const lineTotalExGst = ((l.unitPrice * l.quantity) / GST).toFixed(2);
    return {
      product_id: l.productId,
      ...(l.variationId ? { variation_id: l.variationId } : {}),
      quantity: l.quantity,
      subtotal: lineTotalExGst,
      total: lineTotalExGst,
    };
  });

  const body = {
    payment_method: "stripe",
    payment_method_title: "Credit / Debit Card (Stripe)",
    set_paid: true,
    status: "processing",
    currency: "AUD",
    billing: input.billing,
    shipping: input.shipping ?? input.billing,
    line_items,
    // Send the shipping line explicitly so WooCommerce never computes and adds a
    // cost the customer wasn't charged for. When freight WAS charged this records
    // the real figure, so the order, Stripe and Unleashed agree. When it wasn't,
    // the line reads "quoted separately" rather than "Free shipping": these are
    // heavy goods, freight is still owed, and whoever picks the order must not
    // read a $0 line as permission to ship it for nothing.
    shipping_lines: [
      input.freight && input.freight.amount > 0
        ? {
            method_id: "flat_rate",
            method_title:
              [input.freight.carrier, input.freight.service].filter(Boolean).join(" ") || "Freight",
            // EX-GST, for exactly the reason the line items are: the store adds
            // 10% back. Order 490118 was recorded at $90.48 against a card charge
            // of $86.80 because this sent the GST-inclusive $36.80 and WooCommerce
            // dutifully added another $3.68 on top.
            total: (input.freight.amount / GST).toFixed(2),
          }
        : { method_id: "flat_rate", method_title: "Freight quoted separately", total: "0.00" },
    ],
    customer_note: input.customerNote,
    meta_data: [
      { key: "_created_via_headless", value: "masterkraft-site" },
      ...(input.paymentIntentId
        ? [{ key: "_stripe_payment_intent", value: input.paymentIntentId }]
        : []),
    ],
    ...(input.paymentIntentId ? { transaction_id: input.paymentIntentId } : {}),
  };

  const res = await fetch(`${storeUrl()}/wp-json/wc/v3/orders`, {
    method: "POST",
    headers: { Authorization: authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`WC order create ${res.status}: ${text.slice(0, 300)}`);
  }
  const order = (await res.json()) as WooOrderResult;

  // Reconciliation guard: WooCommerce recomputes the order total from its own
  // tax/shipping config. If that differs from what Stripe actually charged, the
  // customer paid a different amount than the order records — log it loudly so
  // it can be caught, without failing (the payment already went through).
  if (typeof input.chargedTotal === "number") {
    const wcCents = Math.round(parseFloat(order.total) * 100);
    const chargedCents = Math.round(input.chargedTotal * 100);
    if (Number.isFinite(wcCents) && wcCents !== chargedCents) {
      console.warn(
        `[order] total mismatch: charged ${chargedCents}c but WC order ${order.id} totals ${wcCents}c`
      );
    }
  }

  return { id: order.id, number: order.number, status: order.status, total: order.total };
}
