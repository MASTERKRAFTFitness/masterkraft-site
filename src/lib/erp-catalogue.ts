// THE CATALOGUE, AS UNLEASHED HAS IT.
//
// The site's categories used to be WooCommerce terms. That is why three of them
// were documented as "empty on purpose": Apparel, Lighting and Reformers exist
// in the ERP under MasterKraft codes and were never created in WooCommerce, so
// there was nothing to list. It was the smaller symptom of a bigger one — the
// site showed 157 of the 696 products the ERP sells under MasterKraft codes, and
// 184 cards where the ERP has 350 once a range is counted once.
//
// So the grouping now comes from the ERP, the same way the franchisee catalogues
// have always done it: `ProductGroup` IS the category. Nothing needs mapping.
//
// A UNIT is what earns one card. Either a range — every ERP product sharing a
// name before " - ", collapsed to one card with a size picker (see ranges.ts) —
// or a single product. That is what turns 696 products into 350 cards rather
// than 696, and it is the same rule the product page uses, so a card and the
// page it opens can never disagree about what the range contains.
//
// WOOCOMMERCE IS STILL THE ROUTER. Where the frozen snapshot has a page for a
// unit, the unit keeps that page's slug, so every existing URL, inbound link and
// search result still lands — and keeps its marketing copy, which the ERP does
// not hold. Units with no page get a slug from their name and a page generated
// from ERP data alone.
import { allProducts, variationsFor } from "@/lib/catalogue";
import type { UnleashedEntry, UnleashedMap } from "@/lib/unleashed";
import { anchorCodes, compareSizeLabels, getRange } from "@/lib/ranges";
import { defaultCartonFor } from "@/lib/freight";
import { filterListable, formatPrice, isBrandSku, type WcProduct } from "@/lib/woocommerce";
import type { EnrichedProduct } from "@/lib/unleashed";

export type ErpUnit = {
  slug: string;
  name: string;
  group: string;
  /** ProductSubGroup — "Dumbbells", "Barbells", "Wall Mounted". */
  subgroup?: string;
  brand?: string;
  /** ERP codes in this unit, smallest size first. One entry if not a range. */
  codes: string[];
  isRange: boolean;
  /** Cheapest size, GST-inclusive. 0 means price on application. */
  price: number;
  /**
   * Dearest PRICED size, so a card can show "$40.00 – $300.00" rather than
   * "From $40.00". Equal to `price` when only one size carries a price — which
   * is not the same as every size costing the same, so see unitCard for how the
   * two are told apart.
   */
  priceMax: number;
  /** Size labels in picker order: "6kg" … "75kg", or "S" … "XL". */
  sizes: string[];
  /** How many sizes carry a price. Below `codes.length`, the top of the range is unknown. */
  pricedCount: number;
  inStock: boolean;
  image?: string;
  /** The snapshot page this unit is routed by, when it has one. */
  wooSlug?: string;
  wooId?: number;
};

// The ERP groups that are categories. Everything else in `ProductGroup` is
// either internal or a stub:
//
//   Other Costs (33)  freight, allowances, delivery — never a category
//   Storage (1)       one product mis-filed; belongs in Equipment Storage
//   Clearance (1)     the site's Clearance page is A-prefixed ex-display stock
//                     from WooCommerce, a different thing entirely
//
// Order is the order they appear in the navigation.
export const ERP_GROUPS = [
  "Strength",
  "Weightlifting",
  "Rigs & Racks",
  "Cardio",
  "Mixed Implements",
  "Body Weight",
  "Equipment Storage",
  "Flooring",
  "Apparel",
  "Lighting",
  "Packages",
] as const;

const EXCLUDED_GROUPS = new Set(["Other Costs", "Clearance", "Storage"]);

// Brands the site sells, in preference order. SNAP, REVL, FERNWOOD, AIR LOCKER
// and HYPER HEALTH belong to somebody else and have never been on this site.
//
//   MK          MasterKraft's own.
//   CONCEPT 2   the distributed erg range the SKU rules already keep.
//   NO BRAND    unbranded stock on N-codes. The site's own brand rule is
//               /^(?:[MN]|SC)/ so N has always counted as ours, and it is where
//               Lighting lives (NBLLE2501 Linear LED Lighting System, NBLLE2502
//               LED Dimmer — the two products categories.ts was waiting for) plus
//               11 Flooring lines MK does not carry.
//
// PREFERENCE MATTERS. NO BRAND also holds white-label copies of MK ranges — a
// full 26-weight NBMDBRH dumbbell range beside MK's MMDBRH — so it is used only
// to FILL GAPS: where two brands offer the same name in the same group, the
// earlier brand in this list wins and the other is dropped. Without that the
// dumbbells get two cards at two prices.
const BRAND_ORDER = ["MK", "CONCEPT 2", "NO BRAND"];
const OUR_BRANDS = new Set(BRAND_ORDER);

// HIDE WHAT CANNOT BE SHIPPED (Michael, 2026-09-06).
//
// Freight needs a weight AND all three carton dimensions. Without them
// itemsToParcels returns `incomplete_dimensions` and the WHOLE cart is
// unquotable, not just the line - so one unmeasured product is a tripwire under
// every basket it can join.
//
// THIS HAS TO LIVE HERE, not only in woocommerce.ts. filterListable covers the
// snapshot-backed listings, but product pages and the sitemap resolve through
// erpUnitBySlug and erpUnits, which build from the ERP map. Hiding in one and
// not the other leaves a product absent from every listing and still answering
// 200 on its own URL, which is worse than either.
//
// IT MUST CONSULT BOTH SOURCES. lib/freight-server resolves a carton from the
// snapshot first and falls back to the ERP, and 18 products get theirs only from
// the snapshot. Judging on the ERP alone would hide products that quote
// perfectly well.
const cartonNum = (v: unknown) => {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * The SIZE half of lib/freight's isPlausibleCarton: this is data entry, not
 * carrier limits.
 *
 * It stops at size on purpose. The freight guard also rejects impossible
 * DENSITY, but it is choosing between two candidate cartons and can fall through
 * to the other source; this is asking "can this code be quoted from EITHER
 * source", and it already asks both below. A snapshot carton that fails on
 * density is one the ERP answers for, so failing it here would hide a product
 * that quotes perfectly well. Adding a weight to this signature is what it would
 * take to share the rule, and there is nothing to gain by it.
 */
const plausible = (l: number, w: number, h: number) =>
  l > 0 && w > 0 && h > 0 &&
  [l, w, h].every((x) => x >= 0.5 && x <= 300) &&
  (l * w * h) / 1e6 <= 3;

/** Can this ERP code be freight-quoted, from either source? */
function codeIsShippable(code: string, entry: UnleashedEntry): boolean {
  // Some groups have one honest shape and no measurements at all. Apparel is 95
  // products with zero weights and zero dimensions, and every one goes in the
  // same satchel - lib/freight's defaultCartonFor supplies it to the quote, so
  // the product is genuinely shippable and belongs on the site.
  if (defaultCartonFor(entry.group)) return true;
  const snap = wooPages().get(code.toUpperCase());
  const snapKg = cartonNum(snap?.weight);
  const erpKg = cartonNum(entry.weightKg);
  if (!snapKg && !erpKg) return false;
  if (plausible(cartonNum(snap?.dimensions?.length), cartonNum(snap?.dimensions?.width), cartonNum(snap?.dimensions?.height))) return true;
  // The ERP's own axis order.
  return plausible(cartonNum(entry.widthCm), cartonNum(entry.depthCm), cartonNum(entry.heightCm));
}

const hideUnshippable = () => process.env.HIDE_UNSHIPPABLE === "true";

// AN UNMEASURED PRODUCT IS NOT ALWAYS WORTH HIDING (Michael, 2026-09-06).
//
// Hiding everything unmeasured also hid the flagship equipment - a $9,299
// massage rolling machine, an $8,775 functional training system, $6,485 power
// racks. Those were never going to quote online anyway: they are pallet freight,
// and they sold through the quote flow, where a person prices delivery. Hiding
// them did not protect anyone from a bad quote, it removed a working sales path
// from the most valuable things in the catalogue.
//
// So the rule is about VALUE, not about measurement alone. Above the threshold a
// customer enquires and a human answers, which is the right handling for a
// nine-thousand-dollar machine whether or not anyone has measured its carton.
// Below it, an unmeasured accessory is just a tripwire: it cannot be bought, and
// nobody is going to send an enquiry about a $20 strap.
//
// A PRODUCT WITH NO PRICE IS ALWAYS KEPT. Price 0 means "contact for pricing" -
// it could never reach card checkout, so it was already enquiry-only, and hiding
// it removed the only path it ever had.
const DEFAULT_ENQUIRE_ABOVE = 500;
const enquireAbove = (): number => {
  const v = parseFloat(process.env.HIDE_UNSHIPPABLE_BELOW ?? "");
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_ENQUIRE_ABOVE;
};

/** Worth keeping on the site for an enquiry even though freight cannot be quoted. */
const worthAnEnquiry = (price: number) => price <= 0 || price >= enquireAbove();

const SEP = " - ";

// Garment sizes. Apparel is named "Sweatshirt (Unisex) (L)" rather than
// "Sweatshirt (Unisex) - L", so the " - " rule alone gives 52 cards where there
// are about a dozen products. This whitelist is deliberately tiny: a trailing
// "(Armatex)" or "(Pack of 4)" must NOT be read as a size, because that is how
// two different products end up behind one picker.
const GARMENT_SIZE = /\s*\((XS|S|M|L|XL|XXL|2XL|3XL)\)\s*$/i;

// How a product's name splits into range + size. Three shapes:
//
//   "Rubber Hex Dumbbell - 9kg"     the normal one
//   "Sweatshirt (Unisex) (L)"       apparel
//   "CONCEPT 2 - Ski Erg with PM5"  NOT a range: the part before " - " is the
//                                   BRAND. Four distinct ergs, and reading it as
//                                   a range collapses them into one card whose
//                                   "sizes" are whole products.
export function splitUnitName(full: string, brand?: string): { name: string; size: string } {
  const garment = full.match(GARMENT_SIZE);
  if (garment) return { name: full.replace(GARMENT_SIZE, "").trim(), size: garment[1].toUpperCase() };
  const i = full.indexOf(SEP);
  if (i < 0) return { name: full.trim(), size: "" };
  const head = full.slice(0, i).trim();
  if (brand && head.toUpperCase() === brand.toUpperCase()) return { name: full.trim(), size: "" };
  return { name: head, size: full.slice(i + SEP.length).trim() };
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ERP code -> the listable snapshot page that sells it, if any. Built once.
//
// A range's codes belong to the HIDDEN variable twin, which is not listable, so
// the stem's `-GROUP` bundle has to be tried too — that is the page the range
// has always been reachable at, and keeping it is what stops every range URL
// changing.
let WOO_PAGES: Map<string, WcProduct> | null = null;

function wooPages(): Map<string, WcProduct> {
  if (WOO_PAGES) return WOO_PAGES;
  const listable = new Set(filterListable(allProducts()).map((p) => p.id));
  const m = new Map<string, WcProduct>();
  for (const p of allProducts()) {
    if (!listable.has(p.id)) continue;
    const sku = p.sku?.trim().toUpperCase();
    if (sku && !m.has(sku)) m.set(sku, p);
    for (const v of variationsFor(p.id)) {
      const vs = v.sku?.trim().toUpperCase();
      if (vs && !m.has(vs)) m.set(vs, p);
    }
  }
  WOO_PAGES = m;
  return m;
}

function stemOf(code: string): string {
  return code.toUpperCase().replace(/\d+[A-Z]?$/, "");
}

function wooPageFor(codes: string[]): WcProduct | undefined {
  const pages = wooPages();
  const stem = stemOf(codes[0]);
  for (const key of [`${stem}-GROUP`, `${stem}-1`, stem, ...codes]) {
    const hit = pages.get(key);
    if (hit) return hit;
  }
  return undefined;
}

/**
 * Every unit the site sells, keyed by slug. Empty if the ERP is unreachable,
 * which every caller must treat as "fall back to the snapshot" rather than as
 * "we sell nothing".
 */
export function erpUnits(map: UnleashedMap): Map<string, ErpUnit> {
  // Group on (brand, group, name-before-" - "). Brand is in the key because the
  // same range name exists under five brands; group is in it because a name that
  // repeats across groups is two different things.
  const groups = new Map<string, { entry: UnleashedEntry; code: string; size: string }[]>();


  for (const [code, entry] of Object.entries(map)) {
    if (entry.sellable === false || !entry.name || !entry.group) continue;
    if (!OUR_BRANDS.has(entry.brand ?? "")) continue;
    if (EXCLUDED_GROUPS.has(entry.group)) continue;
    // Drop the individual SIZE, not the whole range: a rack that is measured in
    // three sizes and not in a fourth should still sell the three.
    if (hideUnshippable() && !codeIsShippable(code, entry) && !worthAnEnquiry(entry.price)) continue;
    const { name, size } = splitUnitName(entry.name, entry.brand);
    if (!name) continue;
    // NUL-joined, not space-joined: "Mixed Implements" and "Rubber Hex
    // Dumbbell" both contain spaces, which would split the key wrongly.
    const key = [entry.brand, entry.group, name].join("\u0000");
    const bucket = groups.get(key);
    if (bucket) bucket.push({ entry, code, size });
    else groups.set(key, [{ entry, code, size }]);
  }

  // Build the units, then decide which of them owns each existing page.
  const draft: (ErpUnit & { page?: WcProduct })[] = [];
  for (const [key, members] of groups) {
    const [brand, group, name] = key.split("\u0000");
    members.sort((a, b) => compareSizeLabels(a.size, b.size));

    const priced = members.filter((m) => m.entry.price > 0);
    const page = wooPageFor(members.map((m) => m.code));

    draft.push({
      slug: page?.slug ?? slugify(name),
      name,
      group,
      subgroup: members.find((m) => m.entry.subgroup)?.entry.subgroup,
      brand,
      codes: members.map((m) => m.code),
      isRange: members.length > 1 && members.every((m) => m.size),
      price: priced.length ? Math.min(...priced.map((m) => m.entry.price)) : 0,
      priceMax: priced.length ? Math.max(...priced.map((m) => m.entry.price)) : 0,
      sizes: members.map((m) => m.size).filter(Boolean),
      pricedCount: priced.length,
      inStock: members.some((m) => m.entry.stock > 0),
      image: members.find((m) => m.entry.image)?.entry.image,
      wooSlug: page?.slug,
      wooId: page?.id,
      page,
    });
  }

  // SEVERAL UNITS CAN WANT THE SAME PAGE. `MWBBFUR` is three ranges — a curl
  // barbell (19), a straight barbell (14) and 5 left under an old name — and all
  // three resolve to the one `-GROUP` page the old store had.
  //
  // The winner is decided by the codes that page ALREADY SOLD, which is exactly
  // the rule ranges.ts uses to pick what the picker shows. Sharing it is the
  // point: pick by size instead and the card would say "Fixed PU Curl Barbell"
  // while the page it opens showed the straight one.
  //
  // The losers are NOT dropped. They get a slug from their own name and a
  // generated page, which is how the curl barbell gets listed at all — the old
  // store had no page for it.
  const byPage = new Map<string, typeof draft>();
  for (const u of draft) {
    if (!u.page) continue;
    const list = byPage.get(u.page.slug);
    if (list) list.push(u);
    else byPage.set(u.page.slug, [u]);
  }
  for (const [, contenders] of byPage) {
    if (contenders.length < 2) continue;
    const anchors = new Set(anchorCodes(contenders[0].page!));
    contenders.sort(
      (a, b) =>
        b.codes.filter((c) => anchors.has(c)).length -
          a.codes.filter((c) => anchors.has(c)).length || b.codes.length - a.codes.length
    );
    for (const loser of contenders.slice(1)) {
      loser.slug = slugify(loser.name);
      loser.wooSlug = undefined;
      loser.wooId = undefined;
    }
  }

  const units = new Map<string, ErpUnit>();
  for (const u of draft) {
    const { page: _page, ...unit } = u;
    void _page;
    // Two units can still land on one generated slug if their names slugify the
    // same. Keep the larger, so a collision cannot hide the bigger range.
    const existing = units.get(unit.slug);
    if (!existing || unit.codes.length > existing.codes.length) units.set(unit.slug, unit);
  }

  // Gap-fill, not duplicate: the same product name in the same group from two
  // brands is one product. Keep the one earliest in BRAND_ORDER. See its comment.
  const best = new Map<string, ErpUnit>();
  for (const u of units.values()) {
    const key = `${u.group}\u0000${u.name.toLowerCase()}`;
    const held = best.get(key);
    if (!held || BRAND_ORDER.indexOf(u.brand ?? "") < BRAND_ORDER.indexOf(held.brand ?? "")) {
      best.set(key, u);
    }
  }
  return new Map([...best.values()].map((u) => [u.slug, u]));
}

export function erpUnitsInGroup(map: UnleashedMap, group: string): ErpUnit[] {
  return [...erpUnits(map).values()]
    .filter((u) => u.group === group)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The sub-filters a category offers, with their counts. Empty ones are dropped. */
export function erpSubgroups(
  map: UnleashedMap,
  group: string
): { name: string; slug: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const u of erpUnitsInGroup(map, group)) {
    if (u.subgroup) counts.set(u.subgroup, (counts.get(u.subgroup) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, slug: slugify(name), count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function erpUnitBySlug(map: UnleashedMap, slug: string): ErpUnit | undefined {
  return erpUnits(map).get(slug);
}

/**
 * A unit rendered as the WooCommerce-shaped product the listing components
 * already take, so ProductCard, sorting and the grids are untouched.
 */
export function unitAsProduct(unit: ErpUnit): WcProduct {
  return {
    id: unit.wooId ?? -hash(unit.slug),
    name: unit.name,
    slug: unit.slug,
    // The FIRST code, always — never a derived stem. `stemOf` gives "MAACU" for
    // the apparel codes and a longest-common-prefix gives "MMGFWTB0"; neither is
    // a code anybody can order or look up, and a card that prints a code that
    // does not exist is worse than one printing the cheapest size's. This is
    // also the size the picker opens on, so the card and the page agree.
    sku: unit.codes[0],
    type: unit.isRange ? "variable" : "simple",
    stock_status: unit.inStock ? "instock" : "onbackorder",
    images: unit.image ? [{ src: unit.image, alt: unit.name }] : [],
    categories: [{ id: 0, name: unit.group, slug: slugify(unit.group) }],
  } as WcProduct;
}

/**
 * Search the ERP catalogue. Name and code, both directions, ranked so an exact
 * code wins — someone typing "MMDBRH16" wants that dumbbell, not everything with
 * "dumbbell" in the name. Without this the 165 ERP-only units would be sold on
 * the site and findable nowhere on it.
 */
export function searchErpUnits(map: UnleashedMap, query: string): ErpUnit[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const scored: { unit: ErpUnit; score: number }[] = [];
  for (const unit of erpUnits(map).values()) {
    const name = unit.name.toLowerCase();
    const codes = unit.codes.map((c) => c.toLowerCase());
    const hay = `${name} ${codes.join(" ")} ${unit.group.toLowerCase()}`;
    if (!tokens.every((t) => hay.includes(t))) continue;
    let score = 0;
    if (tokens.some((t) => codes.includes(t))) score += 100;
    if (name.includes(tokens.join(" "))) score += 50;
    if (tokens.every((t) => name.includes(t))) score += 25;
    scored.push({ unit, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.unit.name.localeCompare(b.unit.name))
    .map((s) => s.unit);
}

// A span is only honest when its two ends mean the same thing. "6kg – 75kg" and
// "S – XL" read as a range; "Set of 6 – Set of 10" does not, and neither would
// "6kg (Aluminium) – 40kg".
//
// So a span is built from the MEASUREMENT each label opens with, not from the
// whole label — the competition kettlebells are "6kg (Aluminium)" then eleven
// plain weights, and "6kg – 40kg" is both true and the thing a buyer wants. The
// unit is required, which is what keeps "2 Tier (10 Pair) 1.0" out: a bare
// leading number is a model number as often as a size.
const MEASUREMENT = /^(\d+(?:\.\d+)?\s*(?:kg|g|lb|mm|cm|m|in|"))\b/i;
const GARMENT_SIZES = new Set(["XS", "S", "M", "L", "XL", "XXL", "2XL", "3XL"]);

function sizeSpan(sizes: string[]): string | undefined {
  if (sizes.length < 2) return undefined;
  const first = sizes[0];
  const last = sizes[sizes.length - 1];
  if (sizes.every((s) => GARMENT_SIZES.has(s.toUpperCase()))) return `${first} – ${last}`;
  const measured = sizes.map((s) => s.match(MEASUREMENT)?.[1]);
  if (measured.some((m) => !m)) return undefined;
  return `${measured[0]} – ${measured[measured.length - 1]}`;
}

/**
 * A unit as the `{ product, enriched }` pair every listing surface already
 * takes, so ProductCard, the grids, the sorting and the price filter are all
 * untouched by the change of source.
 */
export function unitCard(unit: ErpUnit): { product: WcProduct; enriched: EnrichedProduct } {
  const span = unit.isRange ? sizeSpan(unit.sizes) : undefined;
  return {
    product: unitAsProduct(unit),
    enriched: {
      // WHAT THE PRICE SAYS, and why there are three shapes rather than one.
      //
      //   $40.00 – $300.00   the sizes cost different amounts. The useful one:
      //                      "From $40.00" hid that the top of the dead balls is
      //                      seven times the bottom.
      //   From $40.00        one size is priced and the rest are not, so the
      //                      real top is unknown and must not be implied.
      //   $65.00             every size costs the same (the apparel ranges).
      //                      "From" on a flat price is just noise.
      //
      // 0 stays "Contact for pricing" exactly as it did off WooCommerce.
      priceLabel:
        unit.price > 0
          ? unit.priceMax > unit.price
            ? `${formatPrice(unit.price)} – ${formatPrice(unit.priceMax)}`
            : unit.isRange && unit.pricedCount < unit.codes.length
              ? `From ${formatPrice(unit.price)}`
              : formatPrice(unit.price)
          : "Contact for pricing",
      priceValue: unit.price,
      // "16 sizes · 6kg – 75kg". What a buyer scanning the grid actually wants
      // to know about a range, and the one thing the old card could not say.
      rangeLabel: unit.isRange
        ? `${unit.codes.length} size${unit.codes.length === 1 ? "" : "s"}${span ? ` · ${span}` : ""}`
        : undefined,
      inStock: unit.inStock,
      source: "unleashed",
    },
  };
}

/**
 * A meta description for a unit the frozen snapshot has no words for. The ERP
 * holds no marketing copy at all, so this is assembled from what it DOES hold,
 * in the same phrasing the unit's card already uses — the sizes and the price,
 * and nothing invented. Without it the 165 ERP-only pages go to search with the
 * site's generic description or none.
 */
export function unitDescription(unit: ErpUnit): string {
  const { priceLabel, rangeLabel } = unitCard(unit).enriched;
  const parts = [`Buy ${unit.name} at MASTERKRAFT`];
  if (rangeLabel) parts.push(rangeLabel);
  parts.push(unit.price > 0 ? `${priceLabel} inc. GST` : priceLabel);
  return `${parts.join(". ")}.`.slice(0, 155);
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}

// WHAT THE CART MAY KEEP, WHICH IS NOT WHAT erpUnits() HOLDS.
//
// erpUnits IS the ERP catalogue, and it is brand-filtered to MK, Concept 2 and
// NO BRAND. Clearance is deliberately built the other way — ex-display
// third-party stock, listed straight from the frozen snapshot with the brand
// filter OFF (see lib/categories.ts). So a clearance product is sold by this
// site and absent from every unit, and anything that asks erpUnits "do we still
// sell this?" gets told no about live stock.
//
// /api/cart/check asked exactly that, and emptied clearance lines out of
// people's baskets on the next page load: production reported AMKBUR01,
// AWWPCP01 and ABCTDR01 unavailable on 2026-09-06 while all three were
// sellable, non-obsolete, and on sale at /equipment/clearance.
//
// So servability is: IN A UNIT, OR OFFERED BY A PAGE WE STILL SERVE.

const isClearancePage = (p: WcProduct) =>
  (p.categories ?? []).some((c) => c.slug === "clearance");

/**
 * The snapshot pages the site still serves: the brand allowlist, plus Clearance,
 * which runs with the brand filter off. The same two rules the listings use —
 * see getAllProductsByCategory's `brandFilter` and lib/categories.
 */
function servedPages(): WcProduct[] {
  return filterListable(allProducts()).filter((p) => isBrandSku(p.sku) || isClearancePage(p));
}

// THE SNAPSHOT'S SKU IS NOT ALWAYS THE ERP'S CODE. Two clearance pages carry a
// hand-typed store SKU that drifted from the code Unleashed holds — `ABPBMS-01`
// against `ABPBMS01`, `ABPBSB-06` against `ABPBSB06`. Only the hyphens differ,
// so removing them matches.
//
// `ABPBMS-01-1` IS NOT RESCUED THIS WAY, AND MUST NOT BE. That trailing `-1` is
// WooCommerce's duplicate-SKU suffix, from someone copying the 30cm box to make
// the 45cm page — squashing it would point a 45cm page at the 30cm box's code,
// which is the wrong price and the wrong thing picked in the warehouse. It
// squashes to ABPBMS011, matches nothing, and stays unresolved until somebody
// corrects it at one end or the other.
//
// SELLABLE ONLY, like getRange above it. Both plyometric box pages sell codes
// Unleashed has since retired (ABPBMS01 and ABPBMS02 are IsObsoleted), and
// resolving one of those would put a retired product back into a basket - the
// exact failure this whole path exists to prevent.
function erpCodeFor(sku: string | undefined, map: UnleashedMap): string | undefined {
  const live = (code: string) => !!map[code] && map[code].sellable !== false;
  const raw = sku?.trim().toUpperCase();
  if (!raw) return undefined;
  if (live(raw)) return raw;
  const squashed = raw.replace(/-/g, "");
  return live(squashed) ? squashed : undefined;
}

/**
 * The ERP codes a snapshot page can put in a cart: its range's sizes when it is
 * a range, otherwise its own code.
 *
 * getRange is used rather than the page's SKU because the SKU of a range page is
 * a WooCommerce CONTAINER — `AMKBUR-GROUP` is a bundle, `AMDBRH` a variable
 * parent — and neither is a product Unleashed has ever held.
 */
export function pageCodes(product: WcProduct, map: UnleashedMap): string[] {
  const range = getRange(product, map);
  if (range) return range.sizes.map((s) => s.code.toUpperCase());
  const own = erpCodeFor(product.sku, map);
  return own ? [own] : [];
}

/** Every ERP code the site can still sell, from either source. */
export function servedCodes(map: UnleashedMap): Set<string> {
  const served = new Set<string>();
  for (const unit of erpUnits(map).values()) {
    for (const code of unit.codes) served.add(code.toUpperCase());
  }
  for (const page of servedPages()) {
    for (const code of pageCodes(page, map)) served.add(code);
  }
  return served;
}
