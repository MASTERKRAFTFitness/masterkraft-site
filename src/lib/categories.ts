// Equipment categories (mirrors masterkraft.com). `wcId` maps each to its
// WooCommerce product-category term id in the live store.
export type Category = { slug: string; label: string; image: string; blurb: string; wcId: number };

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
];

export function getCategory(slug: string) {
  return categories.find((c) => c.slug === slug);
}
