// Custom artificial turf, priced by size.
//
// Customers pick a width and a length in whole metres. The price is a rate per
// square metre plus one flat fee that covers the custom design, print, cut and
// production (Michael, 19 Nov 2026: $75/m² and $500).
//
// Both figures are EX GST, as Unleashed holds every price: the standard 2m x 10m
// black roll is $1,500 ex GST, which is the same $75/m². The site shows prices
// inc. GST, so the calculator leads with that and shows the ex-GST figure under it.
//
// Pure and dependency-free so the client and the tests share the same arithmetic.

// The Unleashed products (created 19 Nov 2026). MFATCT01 is the turf itself,
// one unit per m², filed with the other turf so it lists on the site.
// MFATCT02 is the once-off fee, filed under Other Costs so it never lists.
// Unleashed has no m² unit in use, so both are EA and the quantity is the area.
export const CUSTOM_TURF_CODE = "MFATCT01";
export const CUSTOM_TURF_FEE_CODE = "MFATCT02";

/**
 * Codes that are sold by quote only, never by card. A custom piece needs the
 * customer's artwork confirmed before anything is cut, and its price is the area
 * plus a fee, which a cart line priced per unit cannot express.
 */
export function isQuoteOnlyCode(sku: string | undefined | null): boolean {
  const code = (sku ?? "").trim().toUpperCase();
  return code === CUSTOM_TURF_CODE || code === CUSTOM_TURF_FEE_CODE;
}

export const TURF_RATE_PER_M2_EX_GST = 75;
export const TURF_CUSTOM_FEE_EX_GST = 500;
export const GST_RATE = 0.1;

// Bounds of the pickers. They are not production limits (nobody has given us
// any). They just stop the calculator quoting a football field by accident.
export const TURF_MIN_M = 1;
export const TURF_MAX_WIDTH_M = 10;
export const TURF_MAX_LENGTH_M = 50;

export type TurfQuote = {
  widthM: number;
  lengthM: number;
  areaM2: number;
  turfExGst: number;
  customFeeExGst: number;
  totalExGst: number;
  gst: number;
  totalIncGst: number;
};

/** Clamp to a whole number of metres inside the picker's range. */
export function clampMetres(value: number, max: number): number {
  if (!Number.isFinite(value)) return TURF_MIN_M;
  return Math.min(max, Math.max(TURF_MIN_M, Math.round(value)));
}

const cents = (n: number) => Math.round(n * 100) / 100;

export function priceCustomTurf(width: number, length: number): TurfQuote {
  const widthM = clampMetres(width, TURF_MAX_WIDTH_M);
  const lengthM = clampMetres(length, TURF_MAX_LENGTH_M);
  const areaM2 = widthM * lengthM;
  const turfExGst = areaM2 * TURF_RATE_PER_M2_EX_GST;
  const totalExGst = turfExGst + TURF_CUSTOM_FEE_EX_GST;
  const gst = cents(totalExGst * GST_RATE);
  return {
    widthM,
    lengthM,
    areaM2,
    turfExGst,
    customFeeExGst: TURF_CUSTOM_FEE_EX_GST,
    totalExGst,
    gst,
    totalIncGst: cents(totalExGst + gst),
  };
}

/** One line a person in the team can read in the quote email and in HubSpot. */
export function describeCustomTurf(q: TurfQuote): string {
  return `Custom Artificial Turf ${q.widthM}m x ${q.lengthM}m (${q.areaM2} m²), incl. custom design, print, cut & production`;
}
