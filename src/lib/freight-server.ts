// Server-side glue between a cart and a freight quote.
//
// Both the /api/freight/quote route (which shows the customer their options) and
// the payment-intent route (which decides what to actually charge) go through
// here, so the two can never disagree about what a delivery costs.

import { productById, variationsFor } from "@/lib/catalogue";
import { getUnleashedMap, lookupBySku } from "@/lib/unleashed";
import {
  quoteFreight,
  defaultCartonFor,
  freightConfigured,
  isPlausibleCarton,
  type FreightItem,
  type FreightOption,
} from "@/lib/freight";

export type DeliveryInput = {
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
  /** Street line. Australia Post ignores it; Easyship's schema requires one. */
  line1?: string;
};

export type CartRefLike = {
  productId: number;
  variationId?: number;
  quantity: number;
  /** Unleashed ProductCode. The only handle an ERP-only line has. */
  sku?: string;
};

const num = (v: unknown): number => {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * Resolve carton weight and dimensions on the SERVER, never from the client.
 *
 * TWO SOURCES, SNAPSHOT FIRST. These came from a LIVE WooCommerce, for data that
 * has been committed in src/data all along — so a freight quote depended on a
 * store that has had no hostname since 27 August. The snapshot answers for 84%
 * of servable products against the ERP's 47%, so it leads; the ERP fills the
 * lines the snapshot has never had, which is every ERP-only unit and every size
 * the old store did not list.
 *
 * THE TWO AGREE ON UNITS AND DISAGREE ON AXES. Across the 307 codes carrying
 * dimensions in both, weight and largest-dimension ratios are exactly 1.000 —
 * same units, no conversion. But the ERP orders them Width/Height/Depth against
 * the snapshot's length/width/height, so 77/52/62 there is 77/62/52 here. The
 * mapping below is length=Width, width=Depth, height=Height, and it is the whole
 * reason this translation lives in one place: reading them positionally would
 * scramble every carton it filled in.
 */
export async function refsToFreightItems(refs: CartRefLike[]): Promise<FreightItem[]> {
  const erp = await getUnleashedMap().catch(() => ({}));
  const items: FreightItem[] = [];

  for (const ref of refs) {
    const quantity = Math.max(1, Math.floor(ref.quantity ?? 1));
    const product = ref.productId ? productById(ref.productId) : undefined;
    // A variation can carry its own carton; fall back to the parent's.
    const variation = ref.variationId
      ? variationsFor(ref.productId).find((v) => v.id === ref.variationId)
      : undefined;

    const code = (ref.sku || variation?.sku || product?.sku || "").trim();
    const unit = code ? lookupBySku(erp, code) : null;

    const weightKg =
      num(variation?.weight) || num(product?.weight) || num(unit?.weightKg);

    // WHOLE CARTONS, IN ORDER, AND ONLY IF THEY COULD BE REAL.
    //
    // This used to resolve each axis independently with a `||` chain, which had
    // two faults. It could take length from one source and width from another
    // and ship a box that exists in neither - dangerous precisely because the
    // ERP orders its axes Width/Depth/Height against the snapshot's
    // length/width/height. And a source offering an impossible carton still won,
    // because a wrong number is still non-zero.
    //
    // That second fault had teeth. 25 of the 36 millimetre errors being
    // corrected in Unleashed are ALSO in the frozen snapshot, and the snapshot
    // is consulted first - so importing the fix would have corrected the ERP,
    // the warehouse and the catalogues while the site kept quoting 259 cubic
    // metres for a foam box. Rejecting the implausible carton rather than
    // reordering the sources fixes it whichever way round they are asked, and
    // keeps working if bad data ever appears in the other system instead.
    const candidates: { l: number; w: number; h: number }[] = [
      { l: num(variation?.dimensions?.length), w: num(variation?.dimensions?.width), h: num(variation?.dimensions?.height) },
      { l: num(product?.dimensions?.length), w: num(product?.dimensions?.width), h: num(product?.dimensions?.height) },
      // The ERP's own axis order, mapped once, here.
      { l: num(unit?.widthCm), w: num(unit?.depthCm), h: num(unit?.heightCm) },
    ];
    const found = candidates.find(
      (c) => c.l > 0 && c.w > 0 && c.h > 0 && isPlausibleCarton({ weight: weightKg, length: c.l, width: c.w, height: c.h })
    );

    // Nothing measured, but some groups have one honest shape. Apparel goes in a
    // satchel; see defaultCartonFor. The default supplies the WEIGHT as well,
    // because those products carry neither - a carton with no weight is not a
    // carton, and half a default is worse than none.
    const satchel = found ? null : defaultCartonFor(unit?.group);
    const carton = found ?? (satchel ? { l: satchel.length, w: satchel.width, h: satchel.height } : { l: 0, w: 0, h: 0 });
    const lengthCm = carton.l;
    const widthCm = carton.w;
    const heightCm = carton.h;

    // An unresolvable line counts as UNQUOTABLE rather than being dropped.
    // Dropping it would under-declare the consignment and under-charge the
    // delivery, which the carrier discovers and we absorb. Zeroes make the
    // quote fail loudly instead. This is why the fallbacks above never
    // part-fill: a carton with a weight and no dimensions is not a carton.
    items.push({
      sku: code || (ref.productId ? String(ref.productId) : "unknown"),
      name: product?.name ?? unit?.name ?? "Unknown",
      quantity,
      weightKg: weightKg || satchel?.weight || 0,
      lengthCm,
      widthCm,
      heightCm,
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
 * `required` is false until at least one carrier is configured. Until then the
 * checkout carries on as it does today, with freight confirmed on quote - it must
 * still never claim freight is free. Once credentials and a collection address exist,
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
  if (!freightConfigured()) {
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
    line1: delivery?.line1?.trim(),
  });

  if (!quote.ok) {
    return { required: true, selected: null, options: [], reason: quote.reason };
  }
  const selected =
    quote.options.find((o) => o.id === chosenServiceId) ?? quote.options[0] ?? null;
  return { required: true, selected, options: quote.options };
}
