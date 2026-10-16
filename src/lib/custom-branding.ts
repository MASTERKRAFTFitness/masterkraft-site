// Custom-branding setup fees for the independent gyms page.
//
// SOURCE: Steve's "CUSTOM BRANDING OPTIONS" workbook (CUSTOMER COSTS sheet),
// October 2026. Every figure is a one-off setup charge PER SIZE, ex GST - it
// pays for the mold, laser file, print screen or label die for that size. It is
// not a per-unit price; the equipment itself is priced separately.
//
// Where the workbook's summary table (CUSTOM01-18) and its per-SKU rows agree,
// the figure is used as-is. Two lines come from the per-SKU rows only, because
// the summary table has no entry for them:
//   - Urethane Fixed Barbells (mold $200, PVC label $50)
//   - Pro Bumper Plates is mold-only in both
// The steel competition kettlebell is $340 per size in the summary table - the
// $4,000 mold spread across the 12 bells - and that is the figure shown.
//
// Do not add anything here that is not in Steve's sheet. A price on this page is
// a promise to a gym owner.

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
  laser: "Your logo is etched into the surface. Crisp and permanent, with no tooling to build.",
  print: "Your logo is printed onto the shell. The quickest, lowest-cost way to brand.",
  label: "A moulded PVC badge with your logo, fitted to the product.",
};

export type BrandingLine = {
  product: string;
  group: "Plates" | "Dumbbells & barbells" | "Kettlebells" | "Balls" | "Studio";
  /** How many sizes the range comes in, so a gym can total a full set. */
  sizes: number;
  /** Setup fee per size, ex GST, for each method offered. */
  fees: Partial<Record<BrandingMethod, number>>;
};

export const BRANDING_LINES: BrandingLine[] = [
  { product: "Olympic Urethane Plates (4 Grip)", group: "Plates", sizes: 7, fees: { mold: 650 } },
  { product: "Olympic Urethane Plates (3 Grip)", group: "Plates", sizes: 8, fees: { laser: 125 } },
  { product: "Olympic Premium Rubber Plates (3 Grip)", group: "Plates", sizes: 7, fees: { mold: 650 } },
  { product: "Pro Bumper Plates", group: "Plates", sizes: 5, fees: { mold: 650 } },
  { product: "Competition Bumper Plates", group: "Plates", sizes: 5, fees: { mold: 650, laser: 125 } },
  { product: "Change Plates", group: "Plates", sizes: 6, fees: { mold: 650, laser: 125 } },
  { product: "Urethane Fixed Dumbbells (pair)", group: "Dumbbells & barbells", sizes: 32, fees: { mold: 200, label: 50 } },
  { product: "Premium Rubber Hex Dumbbells", group: "Dumbbells & barbells", sizes: 28, fees: { mold: 75 } },
  { product: "Urethane Fixed Barbells", group: "Dumbbells & barbells", sizes: 19, fees: { mold: 200, label: 50 } },
  { product: "Rubber Fixed Barbells", group: "Dumbbells & barbells", sizes: 17, fees: { mold: 200 } },
  { product: "Competition Kettlebells (steel)", group: "Kettlebells", sizes: 12, fees: { mold: 340 } },
  { product: "Urethane Competition Kettlebells", group: "Kettlebells", sizes: 10, fees: { label: 50 } },
  { product: "Medicine Balls", group: "Balls", sizes: 5, fees: { print: 50 } },
  { product: "Dead Balls", group: "Balls", sizes: 15, fees: { print: 50 } },
  { product: "High Grip Dead Balls", group: "Balls", sizes: 15, fees: { print: 50 } },
  { product: "Group Fitness Step", group: "Studio", sizes: 1, fees: { mold: 250 } },
];

/** Column order for the matrix: most premium finish first. */
export const METHODS: BrandingMethod[] = ["mold", "laser", "print", "label"];

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

/** Minimum order before custom branding is considered (Steve's sheet, note 1). */
export const BRANDING_MIN_ORDER = 50_000;

/** First-12-months spend above which tooling is built into pricing, not invoiced. */
export const TOOLING_WAIVER_SPEND = 300_000;
