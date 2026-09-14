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
  /** The line under the H1. Short on purpose — it is a subtitle, not a summary. */
  blurb: string;
  /**
   * The meta description, SEPARATE FROM THE BLURB.
   *
   * These were the same field, which meant every category page advertised
   * itself in 46 to 57 characters — "Plate-loaded and selectorised strength
   * machines." — where Google will show about 155. A subtitle and a search
   * result are different jobs: one sits under a heading that already says
   * "Strength", the other has to work with no page around it.
   *
   * Hand-written rather than taken from the WooCommerce copy below the grid.
   * That copy is good and it is genuinely distinct per category, but it opens
   * in headline voice — "LIFT AND SHIFT..", "THE ONLY LIMIT IS YOU.." — which
   * describes nothing to somebody reading a list of search results. Same
   * pattern as `meta` on a Location in lib/locations.ts.
   */
  meta: string;
  /** Unleashed ProductGroup. Absent only for Clearance — see below. */
  erpGroup?: string;
  wcId?: number;
  /**
   * Long-form copy for the two categories the WooCommerce snapshot has none
   * for. Everything else renders `getCategoryDescription(wcId)` under "About
   * <label>"; Apparel and Lighting are empty there, so those two pages ended at
   * the product grid with no prose at all. Plain HTML, rendered the same way.
   */
  about?: string;
};

export const categories: Category[] = [
  {
    slug: "strength",
    label: "Strength",
    image: "/category/strength.jpg",
    blurb: "Plate-loaded and selectorised strength machines.",
    meta: "Commercial strength machines from MasterKraft — plate-loaded and selectorised presses, rows, pulldowns, leg machines, benches and multi-stations.",
    erpGroup: "Strength",
    wcId: 52,
  },
  {
    slug: "weightlifting",
    label: "Weightlifting",
    image: "/category/weightlifting.jpg",
    blurb: "Barbells, bumper plates, benches and platforms.",
    meta: "Barbells, bumper and competition plates, fixed bars and lifting platforms — the weightlifting range MasterKraft supplies to commercial floors across Australia.",
    erpGroup: "Weightlifting",
    wcId: 53,
  },
  {
    slug: "rigs-racks",
    label: "Rigs & Racks",
    image: "/category/rigs-racks.jpg",
    blurb: "Power racks, rigs and squat stands engineered to last.",
    meta: "Power racks, half racks, wall-mounted rigs, Smith machines and functional training systems — engineered for commercial floors and sized to your space.",
    erpGroup: "Rigs & Racks",
    wcId: 231,
  },
  {
    slug: "cardio",
    label: "Cardio",
    image: "/category/cardio.jpg",
    blurb: "Air bikes, rowers, ski trainers and curved treadmills.",
    meta: "Air bikes, rowers, ski trainers, curved treadmills and reformers — including the Concept2 range, supplied and installed by MasterKraft.",
    erpGroup: "Cardio",
    wcId: 49,
  },
  {
    slug: "mixed-implements",
    label: "Mixed Implements",
    image: "/category/mixed-implements.jpg",
    blurb: "Kettlebells, slam balls, sleds and conditioning tools.",
    meta: "Kettlebells, dumbbells, wall balls, power bags, battle ropes and group fitness kit — the conditioning implements that fill a functional training floor.",
    erpGroup: "Mixed Implements",
    wcId: 33,
  },
  {
    slug: "body-weight",
    label: "Body Weight",
    image: "/category/body-weight.jpg",
    blurb: "Functional and calisthenics gear for bodyweight training.",
    meta: "Resistance bands, plyo boxes, fitness balls, exercise mats and agility gear — bodyweight and functional training equipment for studios and commercial gyms.",
    erpGroup: "Body Weight",
    wcId: 48,
  },
  {
    slug: "equipment-storage",
    label: "Equipment Storage",
    image: "/category/equipment-storage.jpg",
    blurb: "Racks, shelving and storage to keep your floor tidy.",
    meta: "Dumbbell and barbell racks, modular shelving and wall-mounted storage — keeping a training floor tidy, safe to walk and quick to reset between classes.",
    erpGroup: "Equipment Storage",
    wcId: 51,
  },
  {
    slug: "flooring",
    label: "Flooring",
    image: "/category/flooring.jpg",
    blurb: "Rubber tiles, rolls and platforms built for heavy use.",
    meta: "Commercial rubber tiles, acoustic underlay, artificial turf and sled tracks — gym flooring that protects the slab and takes what a free-weight floor gives it.",
    erpGroup: "Flooring",
    wcId: 50,
  },
  {
    slug: "apparel",
    label: "Apparel",
    blurb: "Training wear and accessories in MasterKraft colours.",
    meta: "MasterKraft training wear — tees, tanks, hoodies, shorts, leggings and accessories, cut for lifting and conditioning rather than for the walk in.",
    erpGroup: "Apparel",
    wcId: 349,
    // The snapshot has no WooCommerce description for this term.
    about:
      "<p>Training wear that has to survive what a gym wardrobe actually puts it through: cut to move through a full range of motion, and built for the wash cycle that follows every session.</p>" +
      "<p>The range runs from tees, tanks and polos through to hoodies, sweatshirts, shorts and leggings, in men's, women's and unisex fits, mostly S to XL. Accessories — caps, socks, sweat towels — round out the front-of-house stock a club sells over the counter.</p>" +
      "<p>Custom-branded apparel is available as part of a fit-out or a club supply arrangement. <a href=\"/contact\">Talk to us</a> about your colours and logo.</p>",
  },
  {
    slug: "lighting",
    label: "Lighting",
    blurb: "Linear LED systems and dimmers built for training floors.",
    meta: "Linear LED lighting systems and dimmers for gym and studio fit-outs — even light across a floor, and class lighting that changes through a session.",
    erpGroup: "Lighting",
    wcId: 348,
    // The snapshot has no WooCommerce description for this term.
    about:
      "<p>Lighting is the part of a fit-out people notice only when it is wrong. Spot fittings drop pools of light between rigs; a continuous linear run lights a floor evenly, which is what makes a rig line read as deliberate rather than as equipment in a room.</p>" +
      "<p>The range is a linear LED system and the dimmer that goes with it. Dimming matters more in a boutique studio than the fitting does — lighting that comes down for a cool-down and up for a working set is standard programming now, and it is a control problem before it is a lighting one.</p>" +
      "<p>Specified as part of a MasterKraft <a href=\"/fitout\">gym fit-out</a>, alongside the floor and the equipment.</p>",
  },
  {
    slug: "packages",
    label: "Packages",
    image: "/category/packages.jpg",
    blurb: "Curated equipment packages for a complete setup.",
    meta: "Complete equipment packages — dumbbell, kettlebell, wall ball, bumper plate and storage sets bought as a full range rather than one increment at a time.",
    erpGroup: "Packages",
    wcId: 275,
  },

  // CLEARANCE IS NOT AN ERP GROUP and is deliberately still listed from the
  // WooCommerce snapshot. It is ex-display and end-of-line stock on A-prefixed
  // codes, which is why it is the one category that runs with the brand-SKU
  // filter OFF. Unleashed has a "Clearance" group holding a single product, and
  // it is not the same thing.
  {
    slug: "clearance",
    label: "Clearance",
    image: "/category/clearance.jpg",
    blurb: "Ex-display and end-of-line equipment at reduced prices.",
    meta: "Ex-display and end-of-line gym equipment at reduced prices — commercial-grade stock, limited to what is on hand and not repeatable once it is gone.",
    wcId: 356,
  },
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
