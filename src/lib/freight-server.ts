// Server-side glue between a cart and a freight quote.
//
// Both the /api/freight/quote route (which shows the customer their options) and
// the payment-intent route (which decides what to actually charge) go through
// here, so the two can never disagree about what a delivery costs.

import { getProductById, getVariation } from "@/lib/woocommerce";
import { quoteFreight, collectionAddress, type FreightItem, type FreightOption } from "@/lib/freight";

export type DeliveryInput = {
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
};

export type CartRefLike = { productId: number; variationId?: number; quantity: number };

const num = (v: unknown): number => {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Resolve carton weight and dimensions from WooCommerce, never from the client. */
export async function refsToFreightItems(refs: CartRefLike[]): Promise<FreightItem[]> {
  const items: FreightItem[] = [];
  for (const ref of refs) {
    const product = await getProductById(ref.productId).catch(() => null);
    const quantity = Math.max(1, Math.floor(ref.quantity ?? 1));
    if (!product) {
      // Unknown line counts as unquotable rather than being dropped, which would
      // under-declare the consignment and under-charge the delivery.
      items.push({
        sku: `product-${ref.productId}`,
        name: "Unknown",
        quantity,
        weightKg: 0,
        lengthCm: 0,
        widthCm: 0,
        heightCm: 0,
      });
      continue;
    }
    // A variation can carry its own carton; fall back to the parent's.
    const variation = ref.variationId
      ? await getVariation(ref.productId, ref.variationId).catch(() => null)
      : null;
    items.push({
      sku: product.sku ?? String(ref.productId),
      name: product.name,
      quantity,
      weightKg: num(variation?.weight) || num(product.weight),
      lengthCm: num(variation?.dimensions?.length) || num(product.dimensions?.length),
      widthCm: num(variation?.dimensions?.width) || num(product.dimensions?.width),
      heightCm: num(variation?.dimensions?.height) || num(product.dimensions?.height),
    });
  }
  return items;
}

export type FreightDecision = {
  /** True once freight quoting is switched on, i.e. there is a key and an origin. */
  required: boolean;
  selected: FreightOption | null;
  options: FreightOption[];
  reason?: string;
};

/**
 * Price the delivery for a cart.
 *
 * `required` is false until Australia Post is configured. Until then the checkout
 * carries on as it does today, with freight confirmed on quote - it must still
 * never claim freight is free. Once a key and a collection address exist,
 * freight becomes part of the charge, and a cart that cannot be quoted goes to
 * the quote flow rather than being charged with an unknown delivery cost.
 *
 * `chosenServiceId` selects among the re-quoted options. The client says WHICH
 * service, never what it costs.
 */
export async function quoteFreightForRefs(
  refs: CartRefLike[],
  delivery?: DeliveryInput,
  chosenServiceId?: string
): Promise<FreightDecision> {
  const configured = Boolean(process.env.AUSPOST_API_KEY) && collectionAddress() !== null;
  if (!configured) {
    return { required: false, selected: null, options: [], reason: "not_configured" };
  }

  const city = delivery?.city?.trim();
  const postcode = delivery?.postcode?.trim();
  if (!city || !postcode) {
    return { required: true, selected: null, options: [], reason: "no_delivery_address" };
  }

  const items = await refsToFreightItems(refs);
  const quote = await quoteFreight(items, {
    city,
    state: delivery?.state?.trim(),
    postcode,
    country: delivery?.country?.trim() || "Australia",
  });

  if (!quote.ok) {
    return { required: true, selected: null, options: [], reason: quote.reason };
  }
  const selected =
    quote.options.find((o) => o.id === chosenServiceId) ?? quote.options[0] ?? null;
  return { required: true, selected, options: quote.options };
}
