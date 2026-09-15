// Re-prices a cart from the ERP, and the shapes an order is built out of.
//
// NOTHING HERE WRITES ANYWHERE. This was `woo-orders.ts` and created WooCommerce
// orders until 2026-09-15, when `createWooOrder`, its ex-GST conversion, its auth
// header and the WC_WRITE_ENABLED gate were deleted: production was confirmed to
// be writing orders to Unleashed instead (UNLEASHED_WRITE_ENABLED true,
// WC_WRITE_ENABLED false), so the WooCommerce writer was unreachable — and it
// pointed at WC_STORE_URL, which is this storefront, and 404s. What is left is
// the repricing and the types, both backend-neutral, hence the rename.

import { getUnleashedMap, lookupBySku } from "@/lib/unleashed";

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
// THE WOOCOMMERCE FALLBACK IS GONE, 2026-09-15. It existed for carts saved
// before `sku` became part of a cart line on 2026-09-02, because localStorage
// outlives a deploy and a cart mid-checkout must not start failing because we
// changed the lookup key. Two things retired it:
//
//   - CartProvider already drops a line with no `sku` at hydration, before the
//     server is asked anything, so such a line cannot reach this function from
//     the UI at all.
//   - `WC_STORE_URL` points at the storefront itself, so the calls that branch
//     made — getProductById / getVariation — 404. It could not have priced a
//     line since the cutover; it could only spend 2.5s failing to.
//
// So the branch was not a fallback, it was a slower way to raise the same error
// while naming the wrong cause. A line with no ERP code now says so directly.
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

    // Fail closed, at every step. Never silently drop or improvise a line from a
    // cart we are about to charge: a missing line means charging for a subset
    // pre-payment, or mismatching the PaymentIntent after the card was charged.
    const code = r.sku?.trim();
    if (!code) throw new Error(`Unresolvable line item: product ${r.productId} has no ERP code`);

    // A code the ERP does not know means the cart and the catalogue disagree.
    // Re-pricing that line from somewhere else is how the wrong number gets
    // charged, so it stops here.
    const erp = lookupBySku(map, code);
    if (!erp) throw new Error(`Unresolvable line item: ERP code ${code}`);

    // A sellable product with no name in the ERP cannot be put on an order line
    // a human has to read in the warehouse.
    if (!erp.name) throw new Error(`ERP code ${code} has no product name`);

    lines.push({
      productId: r.productId,
      variationId: r.variationId,
      sku: code,
      quantity: qty,
      unitPrice: erp.price,
      name: erp.name,
    });
  }
  const total = Math.round(lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0) * 100) / 100;
  const hasPoa = lines.some((l) => l.unitPrice <= 0);
  return { lines, total, hasPoa };
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
  // total). Used to sanity-check that the order system computed the same total.
  chargedTotal?: number;
  /** What freight was charged, so the order records it instead of "free". */
  freight?: { amount: number; service?: string; carrier?: string };
};

