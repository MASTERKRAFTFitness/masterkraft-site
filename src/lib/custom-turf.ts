// Custom artificial turf, priced by size.
//
// Customers enter any width and length (to the millimetre). The price is a rate per
// square metre plus one flat fee that covers the custom design, print, cut and
// production (Michael, 19 Nov 2026: $75/m² and $500), and the total ex GST is
// rounded up to the whole dollar.
//
// Both figures are EX GST, as Unleashed holds every price: the standard 2m x 10m
// black roll is $1,500 ex GST, which is the same $75/m². The site shows prices
// inc. GST, so the calculator leads with that and shows the ex-GST figure under it.
//
// Pure and dependency-free so the client and the tests share the same arithmetic.

// The Unleashed product (created 19 Nov 2026), filed with the other turf so it
// lists on the site. ONE PRODUCT, ONE LINE (Michael, 19 Nov): a quote carries
// MFATCT01 x 1 at the whole price for the size, fee included. Its ERP price is
// the $75 per m² rate, which is what the card shows; the line price is worked
// out here from the size, never taken from the browser.
export const CUSTOM_TURF_CODE = "MFATCT01";
// Fernwood's twin (created 19 Nov 2026, same $75 on every tier). This site never
// lists Fernwood codes; it is named here so it can never be paid for by card
// either. The Fernwood catalogue (masterkraft-catalogues) has its own calculator.
export const FERNWOOD_CUSTOM_TURF_CODE = "FFATCT01";
const QUOTE_ONLY = new Set([CUSTOM_TURF_CODE, FERNWOOD_CUSTOM_TURF_CODE]);

/**
 * Codes that are sold by quote only, never by card. A custom piece needs the
 * customer's artwork confirmed before anything is cut, and its price is the area
 * plus a fee, which a cart line priced per unit cannot express.
 */
export function isQuoteOnlyCode(sku: string | undefined | null): boolean {
  return QUOTE_ONLY.has((sku ?? "").trim().toUpperCase());
}

export const TURF_RATE_PER_M2_EX_GST = 75;
export const TURF_CUSTOM_FEE_EX_GST = 500;
export const GST_RATE = 0.1;

// Bounds of the size. They are not production limits (nobody has given us
// any). They just stop the calculator quoting a football field, or a postage
// stamp, by accident.
export const TURF_MIN_M = 0.1;
export const TURF_MAX_WIDTH_M = 10;
export const TURF_MAX_LENGTH_M = 50;
/** Millimetres is plenty. More decimals than this is refused, never rounded. */
export const TURF_MAX_DECIMALS = 3;

export type TurfQuote = {
  widthM: number;
  lengthM: number;
  areaM2: number;
  turfExGst: number;
  customFeeExGst: number;
  /** Area x rate + fee, before the round up to a whole dollar. */
  unroundedExGst: number;
  /** The line's price ex GST: unroundedExGst rounded UP to the whole dollar. */
  totalExGst: number;
  /** True when the round up changed the figure. */
  roundedUp: boolean;
  gst: number;
  totalIncGst: number;
};

const SCALE = 10 ** TURF_MAX_DECIMALS;

/**
 * A side of the piece, in metres, taken exactly as given (any size, Michael,
 * 19 Nov 2026), or null when it cannot be priced: not a finite number, outside
 * TURF_MIN_M..max, or more than TURF_MAX_DECIMALS places. Nothing is rounded or
 * snapped to a step. Strings are refused: the request carries numbers, and the
 * calculator's text box goes through parseTurfMetres first.
 */
export function validTurfMetres(value: unknown, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < TURF_MIN_M || value > max) return null;
  const scaled = value * SCALE;
  if (Math.abs(scaled - Math.round(scaled)) > 1e-6) return null;
  return value;
}

/** What someone typed in a size box, or null when it is not a size we can price. */
export function parseTurfMetres(text: string, max: number): number | null {
  const t = text.trim();
  if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  return validTurfMetres(Number(t), max);
}

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * Area x $75 + $500, ex GST, rounded UP to the whole dollar (the only rounding,
 * apart from GST to the cent). Null when either side is not a valid size.
 */
export function priceCustomTurf(width: unknown, length: unknown): TurfQuote | null {
  const widthM = validTurfMetres(width, TURF_MAX_WIDTH_M);
  const lengthM = validTurfMetres(length, TURF_MAX_LENGTH_M);
  if (widthM === null || lengthM === null) return null;
  // Exact: both sides are whole millimetres, so multiply those as integers.
  const areaM2 = (Math.round(widthM * SCALE) * Math.round(lengthM * SCALE)) / (SCALE * SCALE);
  const turfExGst = areaM2 * TURF_RATE_PER_M2_EX_GST;
  const unroundedExGst = turfExGst + TURF_CUSTOM_FEE_EX_GST;
  // The 1e-9 keeps float noise (2000.0000000001) from adding a dollar. A real
  // fraction is never that small: the area has at most six places.
  const totalExGst = Math.ceil(unroundedExGst - 1e-9);
  const gst = cents(totalExGst * GST_RATE);
  return {
    widthM,
    lengthM,
    areaM2,
    turfExGst,
    customFeeExGst: TURF_CUSTOM_FEE_EX_GST,
    unroundedExGst,
    totalExGst,
    roundedUp: totalExGst - unroundedExGst > 1e-9,
    gst,
    totalIncGst: cents(totalExGst + gst),
  };
}

/** The width and length a quote line for custom turf carries. */
export type TurfSize = { widthM: number; lengthM: number };

/** Price a size as it arrived in a request. Null (POA) when it is missing or invalid. */
export function priceTurfSize(size: unknown): TurfQuote | null {
  if (!size || typeof size !== "object") return null;
  const s = size as Partial<Record<keyof TurfSize, unknown>>;
  return priceCustomTurf(s.widthM, s.lengthM);
}

/** A number of metres (or m²) as typed: at most three places, trailing zeros gone. */
export function formatMetres(n: number): string {
  return String(Number(n.toFixed(TURF_MAX_DECIMALS)));
}

/** "2.35m x 10.8m (25.38 m²)" */
export function turfSizeLabel(q: TurfQuote): string {
  return `${formatMetres(q.widthM)}m x ${formatMetres(q.lengthM)}m (${formatMetres(q.areaM2)} m²)`;
}

/** One line a person in the team can read in the quote email and in HubSpot. */
export function describeCustomTurf(q: TurfQuote): string {
  return `Custom Artificial Turf ${turfSizeLabel(q)}, incl. custom design, print, cut & production`;
}

/** The Comments on the Unleashed sales order line, so the size is on the order itself. */
export function turfLineComment(q: TurfQuote): string {
  return `Custom Turf size: ${turfSizeLabel(q)}`;
}
