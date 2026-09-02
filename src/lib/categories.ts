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
