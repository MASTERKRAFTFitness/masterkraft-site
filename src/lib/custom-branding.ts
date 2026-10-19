// Custom-branding fees and Buying Club terms for the independent gyms page.
//
// SOURCE: the "Branded Kit" sales sheet for independent gyms
// (masterkraft-migration/branded-kit/branded-kit-sales-sheet.html), which
// carries the decisions of 13-14 Oct 2026: Steve's 13 Oct fee rule (we pay half
// the fees over $20k and all of them over $50k), an 8-week lead time, trade
// login at 10% off the website price and a Buying Club run at 15% off. It
// replaced Steve's earlier CUSTOMER COSTS sheet, whose $50k minimum and $300k
// tooling waiver no longer apply to independents.
//
// Every fee is a one-off setup charge PER SIZE, PER DESIGN, ex GST. It is not a
// per-unit price; the equipment itself is priced separately.
//
// Do not add anything here that is not on the sales sheet. A price on this page
// is a promise to a gym owner.

export const GST_RATE = 0.1;

export type BrandingMethod = "mold" | "laser" | "print" | "label";

export const METHOD_LABEL: Record<BrandingMethod, string> = {
  mold: "Moulded logo",
  laser: "Laser engraved",
  print: "Printed",
  label: "PVC label",
};

export const METHOD_NOTE: Record<BrandingMethod, string> = {
  mold: "Your logo is cast into the product. Permanent, raised or recessed, and the most premium finish.",
  laser: "Your logo is etched into the surface. Crisp and permanent, with no mould to make.",
  print: "Your logo is printed onto the shell. The quickest, lowest-cost way to brand.",
  label: "A moulded PVC badge with your logo, fitted to the product.",
};

export type BrandingLine = {
  product: string;
  method: BrandingMethod;
  /** Setup fee per size, ex GST. */
  fee: number;
  /** How many sizes the range comes in, so a gym can total a full set. */
  sizes: number;
};

/** The sales sheet's "What it costs" table, in its order. */
export const BRANDING_LINES: BrandingLine[] = [
  { product: "Competition bumper plates", method: "laser", fee: 125, sizes: 5 },
  { product: "Olympic urethane plates (3 grip)", method: "laser", fee: 125, sizes: 7 },
  { product: "Change plates", method: "laser", fee: 125, sizes: 6 },
  { product: "Urethane fixed dumbbells (pairs)", method: "label", fee: 50, sizes: 27 },
  { product: "Urethane fixed barbells", method: "label", fee: 50, sizes: 12 },
  { product: "Urethane competition kettlebells", method: "label", fee: 50, sizes: 10 },
  { product: "Medicine balls", method: "print", fee: 50, sizes: 5 },
  { product: "Dead balls & high-grip dead balls", method: "print", fee: 50, sizes: 22 },
  { product: "Premium rubber hex dumbbells", method: "mold", fee: 75, sizes: 26 },
];

/** The methods the matrix uses, in the sheet's order of first appearance. */
export const METHODS_IN_USE: BrandingMethod[] = Array.from(new Set(BRANDING_LINES.map((l) => l.method)));

/** Branding every size of a range, ex GST. */
export const fullRangeFee = (l: BrandingLine) => l.fee * l.sizes;

/**
 * Steve's 13 Oct rule: how much of the branding fees MasterKraft pays, by the
 * product value of a single order, ex GST. Highest threshold first.
 */
export const FEE_SHARE: { over: number; weCover: number }[] = [
  { over: 50_000, weCover: 1 },
  { over: 20_000, weCover: 0.5 },
  { over: 0, weCover: 0 },
];

/** The share of the branding fees MasterKraft covers on an order of this value. */
export function feeShareCovered(orderExGst: number): number {
  return FEE_SHARE.find((t) => orderExGst > t.over)?.weCover ?? 0;
}

/** Off the website price: a trade login, and an order placed in a Buying Club run. */
export const TRADE_DISCOUNT = 0.1;
export const CLUB_DISCOUNT = 0.15;

/** Branded kit is made to order. */
export const LEAD_TIME_WEEKS = 8;

/** Buying Club cut-offs (all Fridays) and when each run is delivered. */
export const CLUB_RUNS: { cutoff: string; delivered: string }[] = [
  { cutoff: "Fri 13 Nov 2026", delivered: "from Jan 2027" },
  { cutoff: "Fri 12 Mar 2027", delivered: "from May 2027" },
  { cutoff: "Fri 11 Jun 2027", delivered: "from Aug 2027" },
  { cutoff: "Fri 10 Sep 2027", delivered: "from Nov 2027" },
];

/** The inc-GST figure, rounded to the cent. */
export function incGst(exGst: number): number {
  return Math.round(exGst * (1 + GST_RATE) * 100) / 100;
}

export function formatAud(n: number): string {
  return n.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}
