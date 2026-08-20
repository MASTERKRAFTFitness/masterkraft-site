// The catalogue read layer.
//
// Product data comes from the COMMITTED SNAPSHOT in src/data (see lib/catalogue.ts),
// not from a request-time call to WooCommerce. Only the checkout path -
// getProductById and getVariation - still talks to the live store; everything a
// visitor browses is served from the repo. Re-run `npm run build:catalogue`
// after a content edit in WordPress.
//
// This file owns the four visibility rules (brand SKU, foreign brand,
// WordPress-hidden, ERP-retired) and applies them at one chokepoint, so the
// snapshot stays a faithful mirror and cannot drift from what we serve.

import imageOverrides from "./product-image-overrides.json";
import {
  allProducts,
  categoryById,
  categoryChildren,
  productBySlug,
  productsInCategory,
  searchCatalogue,
  variationsFor,
} from "@/lib/catalogue";
import { isRetiredSku } from "./obsolete";

const BASE = `${process.env.WC_STORE_URL}/wp-json/wc/v3`;

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

function authHeader() {
  const ck = process.env.WC_CONSUMER_KEY ?? "";
  const cs = process.env.WC_CONSUMER_SECRET ?? "";
  return "Basic " + Buffer.from(`${ck}:${cs}`).toString("base64");
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

// OTHER COMPANIES' BRANDED RANGES must never appear on masterkraft.com:
// S = Snap, F = Fernwood. The M/N brand filter already keeps them out of the
// listings, but two routes bypassed it:
//   1. Clearance runs with `brandFilter: false` to show A-prefixed ex-display
//      stock, so a Snap or Fernwood item filed there would have been listed.
//   2. `getProductBySlug` applied no brand filter at all, so all 149 of their
//      product pages answered 200 on a direct URL even though nothing linked to
//      them. Unlisted is not the same as not on the website.
// Excluded explicitly so the rule holds however a product is categorised.
//
// SC IS DELIBERATELY EXEMPT: those are the Concept2 ergs (C2 Rower, C2 Ski Erg,
// C2 Ski Erg Floor Stand), a range MasterKraft distributes. They are named "C2"
// but carry SC SKUs, and they stay on the site (confirmed 2026-08-20). Note
// UNLEASHED codes that same range C2*, which is a different scheme again.
const FOREIGN_BRAND_SKU_RE = /^(?:S(?!C)|F)/i;
export function isForeignBrandSku(sku?: string): boolean {
  return !!sku && FOREIGN_BRAND_SKU_RE.test(sku.trim());
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
type Retirable = { catalog_visibility?: string; sku?: string };

export function isObsolete(p: Retirable): boolean {
  return p.catalog_visibility === "hidden" || isRetiredSku(p.sku);
}

// Never served, for any reason: retired, hidden, or another company's brand.
function isUnservable(p: Retirable): boolean {
  return isObsolete(p) || isForeignBrandSku(p.sku);
}

// "search" means search-only (excluded from catalogue listings); "catalog"
// means catalogue-only (excluded from search). Nothing in the store uses either
// today, but honouring them keeps us faithful to WooCommerce's own semantics.
export function filterListable<T extends Retirable>(items: T[]): T[] {
  return items.filter((i) => !isUnservable(i) && i.catalog_visibility !== "search");
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

async function wcGet<T>(
  path: string,
  params: Record<string, string | number | undefined> = {}
): Promise<FetchResult<T>> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    headers: { Authorization: authHeader() },
    next: { revalidate: 600 }, // cache product data for 10 minutes
  });
  if (!res.ok) throw new Error(`WooCommerce ${res.status} on ${path}`);
  return {
    data: (await res.json()) as T,
    total: Number(res.headers.get("x-wp-total") ?? 0),
    totalPages: Number(res.headers.get("x-wp-totalpages") ?? 1),
  };
}

const PRODUCT_FIELDS =
  "id,name,slug,sku,type,permalink,price,regular_price,sale_price,on_sale,stock_status,catalog_visibility,bundle_price,weight,dimensions,short_description,description,images,categories";

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
// decode the handful of entities WC emits back to their characters first.
export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#x27;|&apos;/g, "'")
    .replace(/&#8211;|&ndash;/g, "-")
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&nbsp;/g, " ");
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
// The checkout path still reads WooCommerce LIVE, on purpose.
//
// getProductById and getVariation back freight quoting and order creation. They
// run once per checkout, so the 1.5-2.5s is affordable, and they must never be
// answered from a snapshot that could be a content edit behind the store: an
// order priced off stale data is a real loss, where a stale listing is cosmetic.
// getProductById is also deliberately NOT filtered — an order for an
// already-bought item must not fail because marketing hid it.
// ---------------------------------------------------------------------------

export async function getProductById(id: number): Promise<WcProduct | null> {
  try {
    const { data } = await wcGet<WcProduct>(`/products/${id}`, { _fields: PRODUCT_FIELDS });
    return normalizeProduct(data);
  } catch {
    return null;
  }
}

export async function getVariation(
  productId: number,
  variationId: number
): Promise<WcVariation | null> {
  try {
    const { data } = await wcGet<WcVariation>(`/products/${productId}/variations/${variationId}`, {
      _fields: "id,sku,price,regular_price,sale_price,stock_status,attributes,image,weight,dimensions",
    });
    return data;
  } catch {
    return null;
  }
}

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

export function getPriceValue(p: Priceable): number {
  const regular = parseFloat(p.regular_price || p.price || "0");
  const sale = parseFloat(p.sale_price || "0");
  const base = sale > 0 && sale < regular ? sale : regular;
  return isFinite(base) && base > 0 ? Math.round(base * GST * 100) / 100 : 0;
}
