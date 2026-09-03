// RANGES — one page per family of sizes, with a size picker.
//
// THE RANGE COMES FROM UNLEASHED. Rewritten 2026-09-02: the first cut of this
// built ranges by pairing a WooCommerce `-GROUP` bundle to the hidden `variable`
// twin beside it. Both of those are WooCommerce CONTAINER records that exist
// only to hold variations — which is exactly why 24 of the 27 products the site
// serves with no Unleashed record are those containers. They are the artefacts
// we are dropping, so they are the wrong thing to key on.
//
// In Unleashed a range is not a container at all. It is a set of ordinary
// products whose ProductDescription shares a name:
//
//   MMDBRH01  "Rubber Hex Dumbbell - 1kg"
//   MMDBRH02  "Rubber Hex Dumbbell - 2kg"     ...26 of them, each with a price,
//   MMDBRH26  "Rubber Hex Dumbbell - 45kg"       a photo, and stock.
//
// So: THE NAME BEFORE " - " IS THE RANGE. Nothing else is. In particular the
// product code stem is NOT — `MWBBFUR` holds three different barbells and
// `MCBIAR` holds the Classic, Pro and Elite air bikes. Grouping on the stem puts
// unrelated products in one dropdown.
//
// WHAT STILL COMES FROM WOOCOMMERCE: the URL and the words. The committed
// snapshot in src/data is a frozen text archive now — nothing is fetched from
// the store — and it supplies the slug the page is routed by, the marketing
// copy, the features and the spec table. Unleashed holds no product copy at all
// (`Notes` is empty on all 1,476 sellable records), so until that copy is
// written into the ERP the snapshot is the only place it exists.
import { allProducts, productBySku, variationsFor } from "@/lib/catalogue";
import type { UnleashedEntry, UnleashedMap } from "@/lib/unleashed";
import type { WcProduct } from "@/lib/woocommerce";

export type RangeSize = {
  /** Unleashed ProductCode — the thing the cart and the ERP agree on. */
  code: string;
  /** The bit after " - ": "9kg", "2 Tier (10 Pair) 1.0", "32mm (Black)". */
  label: string;
  price: number; // GST-inclusive, from the ERP
  stock: number;
  image?: string;
  // The WooCommerce ids for this size, when the frozen snapshot still has it.
  // ONLY the card path needs these: resolveOrderLines re-prices a paid order
  // against the store. The ERP carries sizes the old store never listed (28 PU
  // dumbbells against Woo's 17), and those sell through the quote flow, which
  // needs nothing but a code, a name and a price.
  wooProductId?: number;
  wooVariationId?: number;
};

export type ProductRange = {
  /** The shared name before " - ", e.g. "Rubber Hex Dumbbell". */
  name: string;
  /** MK, REVL, AIR LOCKER … the brand the whole range belongs to. */
  brand?: string;
  sizes: RangeSize[];
};

const SEP = " - ";

// ERP code -> the WooCommerce variation that used to sell it. Built once from
// the frozen snapshot; see wooProductId on RangeSize for why it exists at all.
let WOO_BY_CODE: Map<string, { productId: number; variationId: number }> | null = null;

function wooIdsFor(code: string): { productId: number; variationId: number } | undefined {
  if (!WOO_BY_CODE) {
    WOO_BY_CODE = new Map();
    for (const p of allProducts()) {
      for (const v of variationsFor(p.id)) {
        const sku = v.sku?.trim().toUpperCase();
        if (sku && !WOO_BY_CODE.has(sku)) {
          WOO_BY_CODE.set(sku, { productId: p.id, variationId: v.id });
        }
      }
    }
  }
  return WOO_BY_CODE.get(code);
}

function splitName(name?: string): { range: string; size: string } | null {
  if (!name) return null;
  const i = name.indexOf(SEP);
  if (i < 0) return null;
  const range = name.slice(0, i).trim();
  const size = name.slice(i + SEP.length).trim();
  return range && size ? { range, size } : null;
}

// The code stem a page's SKU implies. `-GROUP` (31 pages) and `-1` (RFRFRR-1)
// are WooCommerce bundle suffixes; a `variable` product's SKU is already the stem.
function stemOf(sku: string): string {
  return sku.trim().toUpperCase().replace(/-(?:GROUP|1)$/, "");
}

// The codes this page has historically sold, from the frozen snapshot. They are
// what disambiguates a stem that holds more than one range: MWBBFUR-GROUP sold
// MWBBFUR01-10, which lands in the straight barbell, not the curl barbell that
// shares its stem and has more members.
export function anchorCodes(product: WcProduct): string[] {
  const own = variationsFor(product.id)
    .map((v) => v.sku?.trim().toUpperCase())
    .filter((s): s is string => !!s);
  if (own.length) return own;
  // A `-GROUP` bundle holds no variations of its own; its hidden twin does.
  const twin = productBySku(stemOf(product.sku ?? ""));
  return twin
    ? variationsFor(twin.id)
        .map((v) => v.sku?.trim().toUpperCase())
        .filter((s): s is string => !!s)
    : [];
}

/**
 * The Unleashed range a catalogue page should show, or null if it has none —
 * a single product, or a genuine multi-item package like the REVL Studio Kits.
 */

// Garment sizes have no number in them, so a numeric sort leaves them to
// localeCompare and the picker reads "L, M, S, XL" — which is what shipped, and
// what the Long Sleeve Tee showed until this rank existed. Ranked here rather
// than in the picker so the card, the page and the size line all agree.
const GARMENT_RANK = ["XS", "S", "M", "L", "XL", "XXL", "2XL", "3XL"];

/**
 * How two size labels order: smallest number first, garments in body order, and
 * anything else alphabetically. The ONE ordering, shared by the picker
 * (sizesFromCodes below), the card's "6kg – 75kg" line and erpUnits' members, so
 * a range cannot be listed in one order and pictured in another.
 */
export function compareSizeLabels(a: string, b: string): number {
  const ga = GARMENT_RANK.indexOf(a.toUpperCase());
  const gb = GARMENT_RANK.indexOf(b.toUpperCase());
  if (ga >= 0 && gb >= 0) return ga - gb;
  const n = (t: string) => {
    const m = t.match(/-?\d+(?:\.\d+)?/);
    return m ? parseFloat(m[0]) : Number.POSITIVE_INFINITY;
  };
  const na = n(a);
  const nb = n(b);
  // Written out rather than as `na - nb || localeCompare`, because two
  // unnumbered labels give Infinity - Infinity = NaN, which is not a legal
  // comparator result — it only worked before by NaN happening to be falsy.
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb || a.localeCompare(b);
  if (Number.isFinite(na)) return -1;
  if (Number.isFinite(nb)) return 1;
  return a.localeCompare(b);
}

/**
 * The picker's rows for a set of ERP codes, priced and stocked from the ERP and
 * ordered smallest first. This is the ONE place a size row is built, so the card
 * (lib/erp-catalogue.ts) and the page can never describe a range differently.
 */
export function sizesFromCodes(codes: string[], map: UnleashedMap): RangeSize[] {
  const rows: RangeSize[] = [];
  for (const code of codes) {
    const entry = map[code];
    if (entry) {
      const name = entry.name ?? "";
      const i = name.indexOf(SEP);
      const garment = name.match(/\s*\((XS|S|M|L|XL|XXL|2XL|3XL)\)\s*$/i);
      const woo = wooIdsFor(code);
      rows.push({
        code,
        label: garment
          ? garment[1].toUpperCase()
          : i >= 0
            ? name.slice(i + SEP.length).trim()
            : code,
        price: entry.price,
        stock: entry.stock,
        image: entry.image,
        wooProductId: woo?.productId,
        wooVariationId: woo?.variationId,
      });
    }
  }
  return rows.sort((a, b) => compareSizeLabels(a.label, b.label));
}

export function getRange(product: WcProduct, map: UnleashedMap): ProductRange | null {
  const sku = product.sku?.trim();
  if (!sku) return null;
  const stem = stemOf(sku);

  // Everything in the ERP under this stem that is a sized, sellable product.
  const members: { code: string; entry: UnleashedEntry; range: string; size: string }[] = [];
  for (const [code, entry] of Object.entries(map)) {
    if (!code.startsWith(stem) || entry.sellable === false) continue;
    const parts = splitName(entry.name);
    if (parts) members.push({ code, entry, range: parts.range, size: parts.size });
  }
  if (members.length === 0) return null;

  // ONE BRAND ONLY. The same range exists five times over under five brands —
  // "Rubber Hex Dumbbell" is 26 products on MK and another 26 on SNAP, NO BRAND,
  // Air Locker and Hyper Health — and the code stem already picks the brand out,
  // so this is a guard rather than a filter. Without it a dropdown shows every
  // weight several times at several prices.
  const brand = members[0].entry.brand;
  const sameBrand = members.filter((m) => m.entry.brand === brand);

  // Group by name — the range itself.
  const groups = new Map<string, typeof sameBrand>();
  for (const m of sameBrand) {
    const g = groups.get(m.range);
    if (g) g.push(m);
    else groups.set(m.range, [m]);
  }

  // A stem can hold several ranges, and they are NEVER merged. The name is the
  // range; nothing else is. Two products often share a stem — MWBBFUR holds a
  // curl barbell and a straight barbell that both run 10-40kg, RBRPPO holds the
  // Power Bands and the Micro Bands, MMWAARM holds a kg wall ball and an lb one.
  // Merging any of those puts two products behind one picker.
  //
  // An earlier cut merged groups whose sizes did not collide, to rescue the
  // stragglers left behind by half-finished renames in the ERP (MMDBUR is 28
  // products called "PU Dumbbells (Pair)" and one still called "Urethane Fixed
  // Dumbbells (Pair) - 7.5kg"). It rescued those, and it also put the Micro
  // Bands in the Power Bands dropdown. Disjoint sizes do not mean "same
  // product". Those stragglers are an ERP naming bug and the fix is one field in
  // Unleashed, not a heuristic here — `npm run report:ranges` lists them.
  //
  // Which group is the page's own is decided by the codes it already sold.
  const anchors = new Set(anchorCodes(product));
  const scored = [...groups.entries()].sort(
    (a, b) =>
      b[1].filter((m) => anchors.has(m.code)).length -
        a[1].filter((m) => anchors.has(m.code)).length || b[1].length - a[1].length
  );
  const [rangeName, chosen] = scored[0];

  const sizes = sizesFromCodes(chosen.map((m) => m.code), map);

  if (sizes.length < 2) return null; // not a range, just a product

  return { name: rangeName, brand, sizes };
}
