// Creates real WooCommerce orders with EXPLICIT line-item prices sourced from
// Unleashed — overriding WooCommerce's distorted `price` field. Requires a
// WRITE-capable WC key. Gated behind WC_WRITE_ENABLED so nothing hits the live
// store until we've verified the price-override behaviour.

import { getProductById, getVariation } from "@/lib/woocommerce";
import { getUnleashedMap, enrich } from "@/lib/unleashed";

const STORE = process.env.WC_STORE_URL;

export type CartRef = { productId: number; variationId?: number; quantity: number };

// Re-price the cart on the SERVER from WooCommerce + Unleashed — never trust
// client-sent prices for payment. Returns authoritative lines + total (inc GST).
export async function resolveOrderLines(
  refs: CartRef[]
): Promise<{ lines: OrderLine[]; total: number; hasPoa: boolean }> {
  const map = await getUnleashedMap().catch(() => ({}));
  const lines: OrderLine[] = [];
  for (const r of refs) {
    const qty = Math.max(1, Math.floor(r.quantity || 1));
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
};

export type WooOrderResult = {
  id: number;
  number: string;
  status: string;
  total: string;
};

export function ordersEnabled(): boolean {
  return process.env.WC_WRITE_ENABLED === "true" && !!STORE;
}

export async function createWooOrder(input: CreateOrderInput): Promise<WooOrderResult> {
  if (!ordersEnabled()) throw new Error("WC order creation is disabled (WC_WRITE_ENABLED)");

  const line_items = input.lines.map((l) => {
    const lineTotal = (l.unitPrice * l.quantity).toFixed(2);
    return {
      product_id: l.productId,
      ...(l.variationId ? { variation_id: l.variationId } : {}),
      quantity: l.quantity,
      // Explicit prices → WooCommerce should use these, not the (broken) product price.
      subtotal: lineTotal,
      total: lineTotal,
    };
  });

  const body = {
    payment_method: "stripe",
    payment_method_title: "Credit / Debit Card (Stripe)",
    set_paid: true,
    status: "processing",
    currency: "AUD",
    prices_include_tax: true,
    billing: input.billing,
    shipping: input.shipping ?? input.billing,
    line_items,
    shipping_lines: [
      { method_id: "free_shipping", method_title: "Free shipping", total: "0.00" },
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

  const res = await fetch(`${STORE}/wp-json/wc/v3/orders`, {
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
  return { id: order.id, number: order.number, status: order.status, total: order.total };
}
