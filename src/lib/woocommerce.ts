// The catalogue read layer.
//
// Product data comes from the COMMITTED SNAPSHOT in src/data (see lib/catalogue.ts).
//
// NOTHING IN THIS FILE TALKS TO WORDPRESS ANY MORE. The last two live readers,
// getProductById and getVariation, were deleted on 2026-09-18. They existed for
// the checkout repricing fallback, which came off the order path on 15 Sep, and
// with WC_STORE_URL pointing at this storefront every call they made 404'd
// anyway. The snapshot is now the whole of this module's input — and
// `npm run build:catalogue` can no longer rebuild it, because the store it read
// is gone. Treat src/data/catalogue.json as frozen until something replaces it.
//
// This file owns the four visibility rules (brand SKU, foreign brand,
// WordPress-hidden, ERP-retired) and applies them at one chokepoint, so the
// snapshot stays a faithful mirror and cannot drift from what we serve.

import imageOverrides from "./product-image-overrides.json";
import erpCartonData from "./erp-cartons.json";
import {
  allProducts,
  categoryById,
  categoryChildren,
  productBySku,
  productBySlug,
  productsInCategory,
  searchCatalogue,
  variationsFor,
} from "@/lib/catalogue";
import { isRetiredSku } from "./obsolete";
import { skuAliases } from "./unleashed-aliases";

// A few product lines were shot on an off-shade studio-grey background rather
// than the shop tile grey. scripts/normalize-product-bg.py recolours those to
// #e6e6e6 (into /public/product-bg/) and records sku -> local paths here; we swap
// the WooCommerce image URLs for the normalized local copies at fetch time.
const IMAGE_OVERRIDES = imageOverrides as Record<string, string[]>;

function applyImageOverride(p: WcProduct): WcProduct {
  const sku = (p.sku ?? "").trim();
  const paths = sku ? IMAGE_OVERRIDES[sku] : undefined;
  if (!paths?.length) return p;
  return { ...p, images: paths.map((src, i) => ({ src, alt: p.images?.[i]?.alt ?? p.name })) };
}

export type WcImage = { src: string; alt: string };
export type WcTerm = { id: number; name: string; slug: string };

export type WcProduct = {
  id: number;
  name: string;
  slug: string;
  sku: string;
  type: string; // "simple" | "variable" | ...
  permalink: string;
  price: string;
  regular_price: string;
  sale_price: string;
  on_sale: boolean;
  stock_status: string;
  catalog_visibility?: string; // "visible" | "catalog" | "search" | "hidden"
  bundle_price?: WcBundlePrice; // present on type: "bundle" only
  // Shipping carton, NOT assembled size - verified against the spec blob. In cm
  // and kg, which is what the freight API wants. See lib/freight.ts.
  weight?: string;
  dimensions?: { length?: string; width?: string; height?: string };
  short_description: string;
  description: string;
  images: WcImage[];
  categories: WcTerm[];
  meta_data?: WcMeta[];
  // Snapshot-only fields (see lib/catalogue.ts). The live checkout-path fetches
  // don't request them, so both are optional.
  date_modified_gmt?: string; // sitemap lastmod
  featured?: boolean; // the store's own "featured" flag
  menu_order?: number; // the store's listing order
};

export type WcMeta = { key: string; value: unknown };

// WooCommerce Product Bundles publishes a computed range on each bundle. Both
// figures are already GST-inclusive.
export type WcBundlePrice = {
  price?: { min?: { incl_tax?: string }; max?: { incl_tax?: string } };
  regular_price?: { min?: { incl_tax?: string }; max?: { incl_tax?: string } };
};

// Structured product detail pulled from the store's ACF meta fields (the same
// data the old site rendered: full overview, features, and a real spec table).
export type ProductDetail = {
  overviewShort?: string;
  overviewDescription?: string;
  features: string[];
  specs: { label: string; value: string }[];
  packageInclusions?: string;
};

// Only M/N-prefixed SKUs are MasterKraft's own products; the store also holds
// other brands (REVL "R", "S", "A" …) that the site must not list.
// Exception: the Concept2 ("C2") range is stocked and must show. Those products
// are named "C2 …" but their SKUs use an "SC" prefix (SCRWAR04, SCSTAR03,
// SCSTACC04) - "SC" is used by nothing else in the catalogue.
export const BRAND_SKU_RE = /^(?:[MN]|SC)/i;
export function isBrandSku(sku?: string): boolean {
  return !!sku && BRAND_SKU_RE.test(sku.trim());
}
export function filterBrandSku<T extends { sku?: string }>(items: T[]): T[] {
  return items.filter((i) => isBrandSku(i.sku));
}

// WHAT MAY HAVE A PAGE ON THE PUBLIC SITE. An ALLOWLIST, deliberately.
//
//   M, N   MasterKraft's own, and unbranded stock on N-codes.
//   SC     the Concept2 ergs MasterKraft distributes under its own name. Named
//          "C2", SKU'd SC, and they stay (confirmed 2026-08-20). Unleashed codes
//          the same range C2*, a different scheme again.
//   A      third-party ex-display clearance, listed only on /clearance, which
//          runs with brandFilter: false.
//
// EVERYTHING ELSE IS A CHANNEL DECISION, NOT A "WE DO NOT SELL IT". S = Snap,
// F = Fernwood, R = REVL are live products MasterKraft supplies to those brands;
// they belong in the franchisee portals and the catalogues, and they are absent
// HERE because masterkraft.com is the public storefront. Their data is worth
// maintaining in the ERP for exactly the same reasons ours is — see
// reports/erp-dimensions.md, which counts them separately rather than off.
//
// THIS USED TO BE A DENYLIST, AND THAT IS THE BUG IT CAUSED. The rule named
// S and F, the comment beside it also named REVL, and R was never added — so 63
// R-SKU products answered 200 on a direct URL and sat in the sitemap for months.
// Only 15 were named "REVL ..."; the rest were REVL-branded builds of lines we
// sell publicly, under the SAME names as ours, competing with our own pages.
//
// Inverting it makes the default safe. Gold's and Jetts are coming and will be
// the same arrangement: with a denylist their codes are public from the day they
// land until somebody remembers this file. With an allowlist they are portal-only
// until somebody decides otherwise, which is the way round the business rule
// actually runs. Adding a brand to the PUBLIC site is now the deliberate act.
//
// A product with no SKU gets no page, for the same reason.
const PUBLIC_SITE_SKU_RE = /^(?:[MN]|SC|A)/i;

/** May this product have a page on masterkraft.com at all? */
export function isPublicSiteSku(sku?: string): boolean {
  return !!sku && PUBLIC_SITE_SKU_RE.test(sku.trim());
}

// The KNOWN client brands, named explicitly. Not the complement of the
// allowlist: a code with an unrecognised prefix is not public, but that does not
// make it a portal brand — it makes it unknown. Reporting and the admin agent
// want the difference, and the serving rule above wants neither.
//
// Gold's and Jetts go here when their prefixes are known. Nothing on the public
// site depends on this list being complete, which is the whole point of the
// allowlist above.
const PORTAL_BRAND_RE = /^(?:S(?!C)|F|R)/i;

/** Snap, Fernwood, REVL: live products, sold through the portals and catalogues. */
export function isPortalOnlyBrand(sku?: string): boolean {
  return !!sku && PORTAL_BRAND_RE.test(sku.trim());
}

// OBSOLETE PRODUCTS. Two systems retire products independently and the site
// honours both, here, so no listing surface can miss one:
//
//  1. WORDPRESS hides it. `catalog_visibility: "hidden"` is the store's own "do
//     not list this" switch, used both for withdrawn lines (Wall Balls, Acoustic
//     Underlay) and for an old single listing superseded by its `-GROUP`
//     variable product (MMDBRH -> the visible MMDBRH-GROUP). To a shopper both
//     mean the same thing.
//  2. UNLEASHED retires it. See `obsolete.ts` - a committed list, because
//     reading it live cost ~6s on every cold listing render.
//
// Either way the product is never listed, never searchable, absent from the
// sitemap, and 404s on its own URL.
//
// A MISSING `catalog_visibility` counts as visible: it has to be asked for in
// `_fields`, so a caller that forgets it must not silently empty the page.
type Retirable = {
  catalog_visibility?: string;
  sku?: string;
  weight?: string;
  dimensions?: { length?: string; width?: string; height?: string };
  /** Present on products, absent on variations; a container is found by it. */
  id?: number;
};

export function isObsolete(p: Retirable): boolean {
  return p.catalog_visibility === "hidden" || isRetiredSku(p.sku);
}

// Never served, for any reason: retired, hidden, or another company's brand.
function isUnservable(p: Retirable): boolean {
  return isObsolete(p) || !isPublicSiteSku(p.sku);
}

// UNSHIPPABLE PRODUCTS, hidden on request (Michael, 2026-09-06).
//
// Freight needs a weight AND all three carton dimensions; without them
// itemsToParcels returns `incomplete_dimensions` and the WHOLE cart becomes
// unquotable, not just the line. So an unmeasured product is a tripwire under
// every basket it can join, and 34 of the 220 served products are one.
//
// OFF BY DEFAULT, and that is deliberate. Hiding a product also removes it from
// the quote flow, which is a working sales path - these are not broken listings,
// they are listings a human has to price freight for. The 34 include the C2
// rower and ski erg at $1,250 and $1,200. Set HIDE_UNSHIPPABLE=true to hide them,
// and expect to be asked where the ergs went.
//
// THE FIX IS A TAPE MEASURE, NOT THIS FLAG. 32 products is an afternoon, and
// every one measured turns the flag back off for that product automatically.
// `npm run report:unshippable` writes the list, derived by asking this rule
// rather than typed out - four of the 32 need a single number, three of those
// being the C2 ergs at $2,770 between them.
const hideUnshippable = () => process.env.HIDE_UNSHIPPABLE === "true";

const num = (v: unknown) => {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** The SIZE bounds of lib/freight's isPlausibleCarton, duplicated here rather
 * than imported to keep this module free of the freight domain - it is the one
 * chokepoint every visibility rule already lives at.
 *
 * NOT the density bound, and that divergence is deliberate. This sees only what
 * WooCommerce recorded, and 42 snapshot cartons are impossible by density while
 * the ERP holds a good one for every single of them. Rejecting here would take a
 * product off the listings for a fault the quote never suffers - HIDE_UNSHIPPABLE
 * would hide barbells the checkout prices correctly. Deciding what to QUOTE FROM
 * gets the stricter rule; deciding what to SHOW does not. */
const plausibleSides = (a: number, b: number, c: number) =>
  a > 0 && b > 0 && c > 0 &&
  [a, b, c].every((s) => s >= 0.5 && s <= 300) &&
  (a * b * c) / 1e6 <= 3;

// The ERP's cartons, committed by scripts/build-erp-cartons.mjs so this module
// can consult them without awaiting getUnleashedMap(). Keyed by UPPERCASE
// ProductCode; the value is [weightKg, widthCm, depthCm, heightCm] in the ERP's
// own axis order, which is fine here because plausibleSides does not care which
// side is which. See the script header before using it for anything else.
const ERP_CARTONS = (erpCartonData as { cartons: Record<string, number[]> }).cartons;

function erpCarton(sku?: string): number[] | undefined {
  if (!sku) return undefined;
  const up = sku.trim().toUpperCase();
  return ERP_CARTONS[up] ?? ERP_CARTONS[(skuAliases[up] ?? "").toUpperCase()];
}

/**
 * The variations a container stands for, or none if it is not a container.
 *
 * TWO SHAPES, and missing the second is what kept the Competition Kettlebells
 * hidden after the first attempt at this. A bare `variable` product holds its
 * own variations, but a `-GROUP` bundle holds NONE - the sizes belong to the
 * hidden `variable` twin beside it, and the bundle is the visible page. So
 * MMKBPGC-GROUP looks childless and MMKBPGC, which has the twelve, is not
 * listable in the first place. lib/ranges' anchorCodes resolves the same pair
 * the same way; it is not imported because ranges imports THIS module.
 */
function containerKids(p: Retirable): WcVariation[] {
  if (p.id !== undefined) {
    const own = variationsFor(p.id);
    if (own.length) return own;
  }
  const sku = (p.sku ?? "").trim().toUpperCase();
  const stem = sku.replace(/-(?:GROUP|1)$/, "");
  if (!stem || stem === sku) return [];
  const twin = productBySku(stem);
  return twin ? variationsFor(twin.id) : [];
}

/**
 * Can this product be freight-quoted - from EITHER source, the way freight
 * actually resolves a carton?
 *
 * ASKING THE SNAPSHOT ALONE HID PRODUCTS THE CHECKOUT PRICES CORRECTLY. This is
 * the rule lib/erp-catalogue's codeIsShippable already applies to product pages
 * and the sitemap, and the two disagreeing is what left ABPBSB04 - the 12" foam
 * plyo box - off every listing: its snapshot carton is 850 x 1000 x 305, which
 * is millimetres in a file written in centimetres, so it measures 259 cubic
 * metres. The ERP holds the same box at 85 x 100 x 30.5. The unit error was
 * corrected in Unleashed and never flowed back into the frozen snapshot, and
 * nothing here could see the correction.
 *
 * A CONTAINER HAS NO CARTON OF ITS OWN, and judging it by one is a category
 * error. `MMKBPGC-GROUP` is the Competition Kettlebells range: WooCommerce holds
 * it only to group twelve sizes, every one of which carries a complete carton,
 * and it was hidden for having no measurements of its own. A container ships when
 * something inside it does, so it is judged by its variations - and only when it
 * has some, which is what keeps an ordinary unmeasured product from sneaking
 * through this branch.
 */
function isShippable(p: Retirable): boolean {
  const kids = containerKids(p);
  if (kids.length) return kids.some(isShippable);
  const l = num(p.dimensions?.length);
  const w = num(p.dimensions?.width);
  const h = num(p.dimensions?.height);
  const erp = erpCarton(p.sku);
  // A weight from either source. Freight needs one, and a carton with sides but
  // no mass cannot be consigned.
  if (!num(p.weight) && !erp?.[0]) return false;
  if (plausibleSides(l, w, h)) return true;
  return !!erp && plausibleSides(erp[1], erp[2], erp[3]);
}

// "search" means search-only (excluded from catalogue listings); "catalog"
// means catalogue-only (excluded from search). Nothing in the store uses either
// today, but honouring them keeps us faithful to WooCommerce's own semantics.
export function filterListable<T extends Retirable>(items: T[]): T[] {
  return items.filter(
    (i) =>
      !isUnservable(i) &&
      i.catalog_visibility !== "search" &&
      (!hideUnshippable() || isShippable(i))
  );
}

export function filterSearchable<T extends Retirable>(items: T[]): T[] {
  return items.filter((i) => !isUnservable(i) && i.catalog_visibility !== "catalog");
}

// Spec/detail parsing lives in lib/spec.ts (pure, no data imports) so the
// reporting scripts can use the same parser the product page does.
export { normalizeSpecUnits, parseSpecBlob, parseProductDetail } from "@/lib/spec";

export type WcVariation = {
  id: number;
  sku: string;
  weight?: string;
  dimensions?: { length?: string; width?: string; height?: string };
  price: string;
  regular_price: string;
  sale_price: string;
  stock_status: string;
  attributes: { name: string; option: string }[];
  image?: WcImage;
};

// Minimal shape the pricing/enrichment helpers need — satisfied by both.
export type Priceable = {
  sku?: string;
  price?: string;
  regular_price?: string;
  sale_price?: string;
  stock_status?: string;
};

type FetchResult<T> = { data: T; total: number; totalPages: number };

export async function getProductsByCategory(
  categoryId: number,
  { page = 1, perPage = 24 }: { page?: number; perPage?: number } = {}
): Promise<FetchResult<WcProduct[]>> {
  // Filter first, then paginate. The old version asked WooCommerce for one page
  // and filtered afterwards, so a page could come back mostly empty while its
  // `total` still reported the unfiltered count - the same fault that made site
  // search return nothing. Off the snapshot there is no reason to page at all.
  const all = filterListable(productsInCategory(categoryId)).map(applyImageOverride);
  const start = (page - 1) * perPage;
  return {
    data: all.slice(start, start + perPage),
    total: all.length,
    totalPages: Math.max(1, Math.ceil(all.length / perPage)),
  };
}

// A category's products in the store's menu_order. By default filtered to
// MasterKraft's own M/N SKUs, but Clearance is ex-display / end-of-line stock
// (A-prefixed SKUs), so it passes brandFilter: false to show that stock rather
// than being emptied by the M/N filter.
export async function getAllProductsByCategory(
  categoryId: number,
  opts?: { brandFilter?: boolean }
): Promise<WcProduct[]> {
  // The obsolete filter is independent of brandFilter: Clearance opts out of the
  // M/N brand filter but must still respect the store's hidden flag.
  const listable = filterListable(productsInCategory(categoryId));
  return ((opts?.brandFilter ?? true) ? filterBrandSku(listable) : listable).map(applyImageOverride);
}

// The full catalogue (all categories), ordered by menu_order and filtered to
// MasterKraft's own M/N SKUs. Backs the "All Equipment" all-products landing.
export async function getAllProducts(): Promise<WcProduct[]> {
  return filterBrandSku(filterListable(allProducts().map(normalizeProduct)));
}

export type WcCategoryChild = { id: number; slug: string; name: string; count: number };

// WooCommerce returns category names HTML-encoded (e.g. "Chest &amp; Shoulder").
// Rendering them directly double-encodes in React (shows a literal "&amp;"), so
// decode the entities WC emits back to their characters first.
//
// NUMERIC ENTITIES ARE DECODED GENERICALLY, not from a list. The list version
// covered the four entities the category names happened to use, and the product
// copy uses more: across the snapshot's descriptions there are 113 &#8211;,
// 34 &#8217;, 32 &amp;, 7 &#8243; (the inch mark, in dimensions), 5 &#038;,
// 4 &#8230; and 1 &nbsp;. The three it missed shipped straight into meta
// descriptions and Product JSON-LD, where a raw "&#8243;" is what a search
// result shows a person. A codepoint range cannot fall behind the copy the way
// a list of seven can.
//
// &amp; is decoded LAST, so "&amp;#8211;" resolves to the literal text
// "&#8211;" rather than being turned into an en dash by the numeric pass. No
// double-encoded text exists in the snapshot today; the ordering is what keeps
// that true if any arrives.
export function decodeEntities(s: string): string {
  return (
    s
      // The original list, UNCHANGED and still first, because these mappings are
      // what the site already renders. &#8211; folds to an ASCII hyphen and
      // &#8217; to a straight apostrophe; decoding them faithfully instead would
      // silently re-typeset every product and category name on the site, which
      // is not this function's job to decide.
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;|&#x27;|&apos;/g, "'")
      .replace(/&#8211;|&ndash;/g, "-")
      .replace(/&#8217;|&rsquo;/g, "'")
      .replace(/&nbsp;/g, " ")
      // ANYTHING ELSE NUMERIC, decoded generically rather than added to the list
      // above one at a time. The list covered the four entities the category
      // names happened to use; the product copy uses more. Across the snapshot's
      // descriptions: 7 &#8243; (the inch mark, in dimensions), 5 &#038; and
      // 4 &#8230;. All three reached production intact inside meta descriptions
      // and Product JSON-LD, where a raw "&#8243;" is what a search result shows
      // a person. A codepoint range cannot fall behind the copy the way a list
      // of seven can.
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
      // LAST, so "&amp;#8211;" resolves to the literal text "&#8211;" rather
      // than being turned into a dash by the passes above. No double-encoded
      // text exists in the snapshot today; this ordering is what keeps that
      // true if any arrives.
      .replace(/&amp;/g, "&")
  );
}

/**
 * WooCommerce rich-text (short_description / description) as plain text, for
 * the places that need words rather than markup: meta descriptions and the
 * `description` field of Product structured data.
 *
 * THE DECODE IS THE POINT. Both callers used to strip tags and stop, which left
 * every entity in the copy intact - production served
 * `<meta name="description" content="...Modular Storage Rack Dual Pipe &#8211;
 * the versatile solution...">` and the same string inside the JSON-LD. 163 of
 * the snapshot's 512 descriptions carry at least one entity, so this was most
 * of the product copy the site has, rendered wrong in exactly the two places
 * only a search engine reads.
 *
 * Order matters: strip first, then decode, so an encoded "&lt;b&gt;" in the
 * copy becomes visible text instead of being decoded into a tag and then
 * stripped. Whitespace is collapsed last because stripping block tags leaves
 * behind the newlines that separated them.
 */
export function plainText(html: string | undefined | null): string {
  if (!html) return "";
  return decodeEntities(html.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

// The category's own description (rich HTML) from WooCommerce — the SEO copy the
// old site showed on each category landing page. Empty string if none.
export async function getCategoryDescription(id: number): Promise<string> {
  return categoryById(id)?.description ?? "";
}

export async function getCategoryChildren(parentId: number): Promise<WcCategoryChild[]> {
  // hide_empty on the live call dropped childless terms; `count` is the store's
  // own product count, so the same rule applies here.
  return categoryChildren(parentId)
    .filter((c) => c.count > 0)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({ id: c.id, slug: c.slug, name: decodeEntities(c.name), count: c.count }));
}

// WooCommerce returns some text fields (notably category names) HTML-encoded.
// Decode name + category names so they don't double-encode when rendered.
function normalizeProduct(p: WcProduct): WcProduct {
  return applyImageOverride({
    ...p,
    name: decodeEntities(p.name),
    categories: p.categories?.map((c) => ({ ...c, name: decodeEntities(c.name) })) ?? p.categories,
  });
}

// Search runs over the whole snapshot, then filters, then paginates in memory.
//
// Asking WooCommerce for one 24-row page and filtering afterwards returned an
// EMPTY PAGE for the most common terms in the catalogue. The store holds a
// parallel S-prefixed range with identical product names (`SMDBRH` alongside
// `MMDBRH`), WooCommerce ranks those first, so all 24 rows were filtered away
// and the page reported "0 products found" while dozens matched further down.
// searchCatalogue reproduces WordPress's matching rules against the snapshot.
export async function searchProducts(
  query: string,
  { page = 1, perPage = 24 }: { page?: number; perPage?: number; maxPages?: number } = {}
): Promise<FetchResult<WcProduct[]>> {
  const matched = filterBrandSku(filterSearchable(searchCatalogue(query))).map(applyImageOverride);
  return {
    data: matched.slice((page - 1) * perPage, page * perPage),
    total: matched.length,
    totalPages: Math.max(1, Math.ceil(matched.length / perPage)),
  };
}

export async function getProductBySlug(slug: string): Promise<WcProduct | null> {
  // Returning null for an obsolete product makes /product/<slug> 404 rather than
  // serve a page with a live add-to-cart button for something we don't sell.
  const p = productBySlug(slug);
  return p && !isUnservable(p) ? normalizeProduct(p) : null;
}

// ---------------------------------------------------------------------------
// THE CHECKOUT PATH USED TO READ WOOCOMMERCE LIVE FROM HERE. It no longer does.
//
// getProductById and getVariation priced an order line the cart carried without
// an ERP code. That fallback was removed from lib/order-lines.ts on 15 Sep —
// CartProvider drops codeless lines at hydration, so it was already unreachable,
// and it pointed at WC_STORE_URL, which is this storefront, so it 404'd when it
// did run. A codeless line now fails immediately, naming the missing code.
//
// If a live product read is ever needed again, it reads the ERP. Do not
// reintroduce a WordPress call here: there is no WordPress behind that hostname.
// ---------------------------------------------------------------------------

// Read path (the product page's variant selector and the "From" price on cards),
// so this one comes off the snapshot.
export async function getProductVariations(productId: number): Promise<WcVariation[]> {
  return variationsFor(productId);
}

export async function getAllProductSlugs(): Promise<
  { slug: string; sku?: string; modified?: string }[]
> {
  // Obsolete products 404, so keep them out of the sitemap.
  return allProducts()
    .filter((p) => !isUnservable(p))
    .map((p) => ({ slug: p.slug, sku: p.sku, modified: p.date_modified_gmt }));
}

export async function getFeaturedProducts(perPage = 8): Promise<WcProduct[]> {
  return filterListable(allProducts().filter((p) => p.featured))
    .slice(0, perPage)
    .map(applyImageOverride);
}

const audFormatter = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
});

const GST = 1.1; // store prices are ex-GST; masterkraft.com displays inc-GST

export function formatPrice(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (!isFinite(n) || n === 0) return "Contact for pricing";
  return audFormatter.format(n);
}

// The live store's `price` field is distorted by a wholesale-pricing plugin, so
// derive display pricing from `regular_price` (the true RRP) and `sale_price`,
// converted to GST-inclusive to match masterkraft.com.
export function getPricing(p: Priceable): { price: string; compareAt?: string } {
  const regular = parseFloat(p.regular_price || p.price || "0");
  const sale = parseFloat(p.sale_price || "0");
  if (sale > 0 && sale < regular) {
    return { price: formatPrice(sale * GST), compareAt: formatPrice(regular * GST) };
  }
  return { price: formatPrice(regular * GST) };
}

// Numeric GST-inclusive unit price used by the cart (0 = price on application).
// BUNDLES ("-GROUP" products). They carry no price of their own - 20 of the 23
// the site serves have `regular_price: 0` - so they rendered "Contact for
// pricing" on every listing. The bundle plugin publishes a computed range in
// `bundle_price`; the MINIMUM becomes a "From $X", the same shape variable
// products already use.
//
// USE regular_price, NOT price. `price` is the field the wholesale plugin
// distorts (see getPricing above) and reads lower: $78.38 against $110 on the
// Urethane Fixed Barbells. Both are already GST-inclusive, so NO x1.1 here.
//
// The MAX is unusable and deliberately ignored: the plugin multiplies out a
// per-component quantity cap of 100, returning figures like $585,003. Only a
// "From" price is honest.
//
// NOTE this is WooCommerce-derived, so where a bundle duplicates a variable
// product it will disagree with the Unleashed price shown on the twin (From $110
// vs From $90). The fix for those five is to hide one of each pair in WordPress,
// not to reconcile two different sources.
export function getBundleFromPrice(p: {
  type?: string;
  bundle_price?: WcBundlePrice;
}): number | null {
  if (p.type !== "bundle") return null;
  const v = parseFloat(p.bundle_price?.regular_price?.min?.incl_tax ?? "");
  return Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * The RRP to strike through, GST-inclusive, or 0 when there is nothing honest to
 * strike out. Split from getPricing because a range card prices off the ERP and
 * so needs the compare-at as a NUMBER, to check it actually sits above what we
 * are charging before it is shown.
 *
 * ONLY A RECORDED MARKDOWN COUNTS: `regular_price` above a real `sale_price`.
 * NOT `price`, which the wholesale plugin distorts downwards (see getPricing) —
 * reading that as an RRP would paint a discount onto full-price products. The
 * Drop In Core Trainer is the worked example: regular $63.64, no sale_price at
 * all, and a `price` of $41.80 that is the plugin talking, not a markdown.
 */
export function getCompareAtValue(p: Priceable): number {
  const regular = parseFloat(p.regular_price || "0");
  const sale = parseFloat(p.sale_price || "0");
  if (!(sale > 0 && sale < regular)) return 0;
  return Math.round(regular * GST * 100) / 100;
}

export function getPriceValue(p: Priceable): number {
  const regular = parseFloat(p.regular_price || p.price || "0");
  const sale = parseFloat(p.sale_price || "0");
  const base = sale > 0 && sale < regular ? sale : regular;
  return isFinite(base) && base > 0 ? Math.round(base * GST * 100) / 100 : 0;
}
