// Equipment categories (mirrors masterkraft.com). `wcId` maps each to its
// WooCommerce product-category term id in the live store.
//
// `image` and `wcId` are optional for categories that are being stood up ahead
// of their products. With no image PageHero falls back to the mk-glow treatment,
// which is a designed state rather than a hole, and is honest in a way that
// borrowing another category's photography would not be. With no wcId there is
// nothing to query, so the page shows its "no products to show right now" state.
export type Category = { slug: string; label: string; image?: string; blurb: string; wcId?: number };

export const categories: Category[] = [
  { slug: "body-weight", label: "Body Weight", image: "/category/body-weight.jpg", blurb: "Functional and calisthenics gear for bodyweight training.", wcId: 48 },
  { slug: "cardio", label: "Cardio", image: "/category/cardio.jpg", blurb: "Air bikes, rowers, ski trainers and curved treadmills.", wcId: 49 },
  { slug: "equipment-storage", label: "Equipment Storage", image: "/category/equipment-storage.jpg", blurb: "Racks, shelving and storage to keep your floor tidy.", wcId: 51 },
  { slug: "flooring", label: "Flooring", image: "/category/flooring.jpg", blurb: "Rubber tiles, rolls and platforms built for heavy use.", wcId: 50 },
  { slug: "mixed-implements", label: "Mixed Implements", image: "/category/mixed-implements.jpg", blurb: "Kettlebells, slam balls, sleds and conditioning tools.", wcId: 33 },
  { slug: "rigs-racks", label: "Rigs & Racks", image: "/category/rigs-racks.jpg", blurb: "Power racks, rigs and squat stands engineered to last.", wcId: 231 },
  { slug: "strength", label: "Strength", image: "/category/strength.jpg", blurb: "Plate-loaded and selectorised strength machines.", wcId: 52 },
  { slug: "weightlifting", label: "Weightlifting", image: "/category/weightlifting.jpg", blurb: "Barbells, bumper plates, benches and platforms.", wcId: 53 },
  { slug: "packages", label: "Packages", image: "/category/packages.jpg", blurb: "Curated equipment packages for a complete setup.", wcId: 275 },
  { slug: "clearance", label: "Clearance", image: "/category/clearance.jpg", blurb: "Ex-display and end-of-line equipment at reduced prices.", wcId: 356 },

  // ADDED 2026-08-27, AND CURRENTLY EMPTY ON PURPOSE. Unleashed carries all
  // three ranges under MasterKraft's own codes - 107 products in its Apparel
  // group (MAAAU01 Trucker Hat, MAACU02 Oversized Hoodie and so on), NBLLE2501 /
  // NBLLE2502 in Lighting, and MCRFAL01 / MCRFWO01 reformers filed under Cardio.
  // None of them were ever created in WooCommerce, which only ever got the Snap
  // and REVL versions (SAAAU01/SAAAU02, SLLE/RLLE), and those are excluded by
  // isForeignBrandSku. The site lists from the WooCommerce snapshot, so these
  // three render their empty state until the products exist there.
  //
  // Apparel and Lighting point at the real WooCommerce terms, so they populate
  // by themselves the moment MasterKraft-coded products are filed under them.
  // Reformers has NO WooCommerce category at all - that term needs creating in
  // the store before this one can be wired to anything.
  { slug: "apparel", label: "Apparel", blurb: "Training wear and accessories in MasterKraft colours.", wcId: 349 },
  { slug: "lighting", label: "Lighting", blurb: "Linear LED systems and dimmers built for training floors.", wcId: 348 },
  { slug: "reformers", label: "Reformers", blurb: "Studio and performance reformers for Pilates programming." },
];

export function getCategory(slug: string) {
  return categories.find((c) => c.slug === slug);
}
