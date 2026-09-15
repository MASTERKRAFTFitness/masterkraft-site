import copy from "@/data/product-copy.json";

/**
 * AUTHORED COPY FOR THE PRODUCTS THE ERP SELLS AND WOOCOMMERCE NEVER HELD.
 *
 * Half the catalogue arrived mute. Of the products in the sitemap, half carry a
 * frozen-snapshot record with WooCommerce copy behind it and half have no record
 * at all - they are ERP-only units, so there was nothing to migrate and
 * unitDescription() generated "Buy <name> at MASTERKRAFT. $X inc. GST." for the
 * meta description, the JSON-LD description and the page body alike. Near
 * identical across ~145 indexable URLs is the thin-content shape, and it was the
 * largest single SEO problem on the site.
 *
 * IT COULD NOT BE RECOVERED, ONLY WRITTEN. Checked three ways before writing a
 * word: the frozen snapshot has no record for them (3 recoverable by fuzzy name
 * match, out of 145); the live WooCommerce store - still running behind the old
 * origin - holds 524 products across every status and none of these; and a SKU
 * cross-match over a 40-product sample returned 0 exact hits. They are lines
 * WooCommerce never carried: the apparel, the Concept2 ergs, and the machines
 * added to the ERP after the store froze.
 *
 * WHAT IT IS WRITTEN FROM, which is less than you would hope. The ERP's Notes
 * and AttributeSet are empty on all 1,425 products (see
 * scripts/erp-copy.report.ts), so there is no material, no colour, no assembled
 * size and no warranty text in the system anywhere. The honest inputs are the
 * product NAME - which carries the material and form for most of this catalogue,
 * since a "Rubber Hex Dumbbell" is rubber and hex - the group and subgroup, and
 * the size range. scripts/copy-gaps.report.ts collects exactly those.
 *
 * SO NOTHING HERE STATES A SPEC. No weights the ERP does not hold, no
 * dimensions, no steel gauges, no load ratings, no warranty terms. Those are
 * checkable claims and the system cannot check them; a confident invented
 * number is worse than an absent one, and it is the kind of wrong a customer
 * discovers on delivery. Where a number appears it came from the unit's own
 * sizes or its name. When the ERP's attributes are filled in, this file is where
 * the specifics should land.
 *
 * KEYED BY SLUG, because that is what the page has and what the URL shows.
 *
 * IT ALSO OVERRIDES SNAPSHOT COPY, not just fills its absence. Some WooCommerce
 * products share a short_description with a sibling - the Core Trainer
 * (Landmine) pair and the Rope & Band Rack pair each ship one description
 * across two products - so two pages go to Google describing themselves
 * identically. An entry here wins over the snapshot for whichever fields it
 * sets, which is how those get separated without editing the frozen mirror
 * (which `check:snapshot` verifies against the live store, so an edit there
 * would read as drift).
 */
export type ProductCopy = {
  /** One sentence, <= 155 chars: the meta description and the JSON-LD description. */
  short: string;
  /**
   * Body paragraphs, rendered as the Product Overview.
   *
   * OPTIONAL, because an override entry may only need to fix the meta. The Core
   * Trainer pair share a short_description but have genuinely different bodies
   * (486 and 436 characters), so replacing their bodies would throw away good
   * copy to fix a different problem. An entry with no `body` leaves the
   * snapshot's own description rendering.
   */
  body?: string[];
  /** Optional bullets, rendered under the paragraphs. */
  features?: string[];
};

const COPY = copy as Record<string, ProductCopy>;

export function productCopy(slug: string): ProductCopy | undefined {
  return COPY[slug];
}

/**
 * The body as the HTML the product page renders. ERP-only units carry no
 * WooCommerce meta_data, so parseProductDetail finds no overviewDescription and
 * no features, and the page falls through to rendering `description` as HTML -
 * which is what this produces. The container styles ul/li and p already.
 */
export function productCopyHtml(slug: string): string | undefined {
  const c = COPY[slug];
  if (!c?.body?.length) return undefined;
  const paras = c.body.map((p) => `<p>${p}</p>`).join("");
  const features = c.features?.length
    ? `<h3>Features</h3><ul>${c.features.map((f) => `<li>${f}</li>`).join("")}</ul>`
    : "";
  return paras + features;
}

/** How many products have authored copy — used by the coverage test. */
export function authoredCount(): number {
  return Object.keys(COPY).length;
}
