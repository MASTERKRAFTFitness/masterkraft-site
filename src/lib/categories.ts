// Equipment categories. **`erpGroup` is what decides membership** — the site's
// categories are Unleashed's `ProductGroup`, the same way the franchisee
// catalogues have always grouped, so a product appears here because the ERP
// files it here and for no other reason. See lib/erp-catalogue.ts.
//
// SLUGS ARE DELIBERATELY NOT DERIVED FROM THE GROUP NAME. "Rigs & Racks"
// slugifies to `rigs-and-racks`, and this category has lived at `/equipment/
// rigs-racks` since launch. The taxonomy changing is not a reason to break every
// inbound link and search result pointing at it, so the slug, the photograph and
// the blurb stay hand-written and only the CONTENTS come from the ERP.
//
// `wcId` is the WooCommerce term this used to list from. It is kept for the
// Clearance carve-out below and as the fallback when Unleashed is unreachable —
// a listing page that cannot reach the ERP falls back to the snapshot rather
// than telling a visitor we sell nothing.
//
// REFORMERS IS GONE. It was added on 2026-08-27 and never had a product: the two
// reformers (MCRFAL01, MCRFWO01) are filed under Cardio in the ERP, and that is
// now where they appear. A category the ERP does not have is a category with
// nothing to put in it.
export type Category = {
  slug: string;
  label: string;
  image?: string;
  blurb: string;
  /** Unleashed ProductGroup. Absent only for Clearance — see below. */
  erpGroup?: string;
  wcId?: number;
};

export const categories: Category[] = [
  { slug: "strength", label: "Strength", image: "/category/strength.jpg", blurb: "Plate-loaded and selectorised strength machines.", erpGroup: "Strength", wcId: 52 },
  { slug: "weightlifting", label: "Weightlifting", image: "/category/weightlifting.jpg", blurb: "Barbells, bumper plates, benches and platforms.", erpGroup: "Weightlifting", wcId: 53 },
  { slug: "rigs-racks", label: "Rigs & Racks", image: "/category/rigs-racks.jpg", blurb: "Power racks, rigs and squat stands engineered to last.", erpGroup: "Rigs & Racks", wcId: 231 },
  { slug: "cardio", label: "Cardio", image: "/category/cardio.jpg", blurb: "Air bikes, rowers, ski trainers and curved treadmills.", erpGroup: "Cardio", wcId: 49 },
  { slug: "mixed-implements", label: "Mixed Implements", image: "/category/mixed-implements.jpg", blurb: "Kettlebells, slam balls, sleds and conditioning tools.", erpGroup: "Mixed Implements", wcId: 33 },
  { slug: "body-weight", label: "Body Weight", image: "/category/body-weight.jpg", blurb: "Functional and calisthenics gear for bodyweight training.", erpGroup: "Body Weight", wcId: 48 },
  { slug: "equipment-storage", label: "Equipment Storage", image: "/category/equipment-storage.jpg", blurb: "Racks, shelving and storage to keep your floor tidy.", erpGroup: "Equipment Storage", wcId: 51 },
  { slug: "flooring", label: "Flooring", image: "/category/flooring.jpg", blurb: "Rubber tiles, rolls and platforms built for heavy use.", erpGroup: "Flooring", wcId: 50 },
  { slug: "apparel", label: "Apparel", blurb: "Training wear and accessories in MasterKraft colours.", erpGroup: "Apparel", wcId: 349 },
  { slug: "lighting", label: "Lighting", blurb: "Linear LED systems and dimmers built for training floors.", erpGroup: "Lighting", wcId: 348 },
  { slug: "packages", label: "Packages", image: "/category/packages.jpg", blurb: "Curated equipment packages for a complete setup.", erpGroup: "Packages", wcId: 275 },

  // CLEARANCE IS NOT AN ERP GROUP and is deliberately still listed from the
  // WooCommerce snapshot. It is ex-display and end-of-line stock on A-prefixed
  // codes, which is why it is the one category that runs with the brand-SKU
  // filter OFF. Unleashed has a "Clearance" group holding a single product, and
  // it is not the same thing.
  { slug: "clearance", label: "Clearance", image: "/category/clearance.jpg", blurb: "Ex-display and end-of-line equipment at reduced prices.", wcId: 356 },
];

export function getCategory(slug: string) {
  return categories.find((c) => c.slug === slug);
}

/**
 * The category page a product actually belongs on.
 *
 * NEEDED BECAUSE A PRODUCT'S OWN CATEGORY IS NOT ONE OF THESE TWELVE. Both
 * kinds of product carry a category that does not name a page:
 *
 *   WOOCOMMERCE PRODUCTS carry one of the store's 80 terms — "Chest & Shoulder
 *   Machines", "Kettlebells", "Bumper Plates". Only twelve of those are pages.
 *   The rest are children, and a link built from the raw slug is a 404.
 *
 *   ERP UNITS carry `slugify(group)`, and the slugs here are deliberately NOT
 *   derived from the group name — see the note at the top of this file. "Rigs &
 *   Racks" slugifies to `rigs-and-racks`; the page has lived at `rigs-racks`
 *   since launch. Same product, different string, 404.
 *
 * Both were live on the product page's breadcrumb until 2026-09-03, one of them
 * in the BreadcrumbList JSON-LD as well, and neither was visible because the
 * category page answered those URLs with a 200 and a "Page not found" body. See
 * the layout beside `equipment/[category]/page.tsx`.
 *
 * Resolution runs cheapest first: an exact page slug, then the ERP group, then
 * WooCommerce's own term tree — a child term walks up its parents until it
 * reaches the term a page lists from. Returns undefined rather than guessing,
 * so a caller can drop the crumb instead of linking somewhere wrong.
 */
export function siteCategoryFor(
  cat: { id?: number; name?: string; slug?: string } | undefined,
  terms: { id: number; parent: number }[]
): Category | undefined {
  if (!cat) return undefined;

  if (cat.slug) {
    const direct = categories.find((c) => c.slug === cat.slug);
    if (direct) return direct;
  }

  if (cat.name) {
    const byGroup = categories.find((c) => c.erpGroup === cat.name);
    if (byGroup) return byGroup;
  }

  if (typeof cat.id === "number" && cat.id > 0) {
    const byId = new Map(terms.map((t) => [t.id, t]));
    let cur = byId.get(cat.id);
    // Bounded: a cycle in the term tree must not hang a render.
    for (let hops = 0; cur && hops < 10; hops++) {
      const page = categories.find((c) => c.wcId === cur!.id);
      if (page) return page;
      cur = byId.get(cur.parent);
    }
  }

  return undefined;
}
