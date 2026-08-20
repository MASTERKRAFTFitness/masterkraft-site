// Headless WooCommerce client - reads the existing masterkraft.com store via the
// WC REST API (read-only key). Cart/checkout use the public Store API (task 6).

import imageOverrides from "./product-image-overrides.json";
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
  short_description: string;
  description: string;
  images: WcImage[];
  categories: WcTerm[];
  meta_data?: WcMeta[];
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

const metaStr = (meta: WcMeta[] | undefined, key: string): string => {
  const v = meta?.find((m) => m.key === key)?.value;
  return typeof v === "string" ? v.trim() : v != null ? String(v) : "";
};

// Older products keep their whole spec table in one ACF HTML blob
// (`specification_text`) rather than the discrete `assembled_size_*` / `colour`
// / … fields. 78 of the 224 listed products have ONLY the blob, so without this
// their spec table renders empty. The markup is uniform across the catalogue: a
// single "Assembled Size" <strong> heading, then <li> items of "Label: value".
// "34kg" -> "34 kg", "12months" -> "12 months".
//
// The blob template appends "months" to the warranty value whether or not the
// value is written in months, so anything phrased differently comes back with a
// stray unit glued to its last WORD: "2 Years Non-Wearable Partsmonths" (the two
// C2 ergs, Air Rower Pro, Air Cycle Elite), and a value already ending in months
// doubles up: "3 monthsmonths" (the 34kg plyo box, Functional Trainer Pro).
// Only stripped at the END and only after a letter, so a real "3 months" (space
// and digit before it) is never touched.
// Exported for the tests. Fixing the source data in WordPress is still the right
// call; this stops a bad value there reaching customers.
export function normalizeSpecUnits(value: string): string {
  return value
    .replace(/([a-z])months\s*$/i, "$1")
    .replace(/(\d)\s*(kg|months?|years?|weeks?|days?)\b/gi, "$1 $2");
}

const SPEC_BLOB_LABELS: Record<string, string> = {
  colour: "Colour",
  color: "Colour",
  material: "Material",
  warranty: "Warranty",
  "net weight": "Net weight",
  "gross weight": "Gross weight",
};

export function parseSpecBlob(html: string): {
  dims: { l: string; w: string; h: string; d: string };
  rows: { label: string; value: string }[];
} {
  const dims = { l: "", w: "", h: "", d: "" };
  const rows: { label: string; value: string }[] = [];
  if (!html) return { dims, rows };

  for (const li of html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
    const text = li[1]
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .trim();
    const parts = text.match(/^([^:]{1,40}):\s*([\s\S]+)$/);
    if (!parts) continue;
    const key = parts[1].trim().toLowerCase();
    const value = parts[2].replace(/\s+/g, " ").trim();
    if (!value) continue;

    // Dimensions carry their own "mm"; strip it so they format like the
    // discrete fields do (dims() re-adds a single trailing unit).
    const bare = value.replace(/\s*mm\s*$/i, "");
    if (key === "width") dims.w = bare;
    else if (key === "height") dims.h = bare;
    else if (key === "length") dims.l = bare;
    else if (key === "depth") dims.d = bare;
    else {
      const label = SPEC_BLOB_LABELS[key];
      if (label) {
        // Weights are stored as "34kg"; warranties as "12months". Insert the
        // missing space so they read consistently with the discrete fields, and
        // collapse a doubled unit: several warranties were hand-typed as
        // "3 monthsmonths" in WordPress (the 34kg plyo box and the Functional
        // Trainer show it to customers; 3 more carry it behind a correct
        // discrete field). Fixing the source data is still the right call, this
        // just stops a typo there rendering on the site.
        rows.push({ label, value: normalizeSpecUnits(value) });
      }
    }
  }
  return { dims, rows };
}

// Parse the ACF meta bag into the overview / features / specs the product page
// renders. Missing fields simply drop out (unknown is never shown as blank/0).
export function parseProductDetail(p: WcProduct): ProductDetail {
  const m = p.meta_data;
  const features: string[] = [];
  const count = parseInt(metaStr(m, "features"), 10);
  const max = Number.isFinite(count) && count > 0 ? count : 6;
  for (let i = 0; i < max; i++) {
    const t = metaStr(m, `features_${i}_text`);
    if (t) features.push(t);
  }

  const specs: { label: string; value: string }[] = [];
  const push = (label: string, value: string, unit = "") => {
    const v = value.trim();
    if (v) specs.push({ label, value: unit ? `${v}${unit}` : v });
  };
  const dims = (l: string, w: string, h: string, d: string) => {
    const parts = [
      l && `L ${l}`,
      w && `W ${w}`,
      h && `H ${h}`,
      d && `D ${d}`,
    ].filter(Boolean);
    return parts.length ? `${parts.join(" × ")} mm` : "";
  };
  // Discrete ACF fields win; the legacy HTML blob fills whatever they leave empty.
  const blob = parseSpecBlob(metaStr(m, "specification_text"));
  const blobRow = (label: string) => blob.rows.find((r) => r.label === label)?.value ?? "";
  const pushMerged = (label: string, discrete: string, unit = "") => {
    if (discrete.trim()) push(label, discrete, unit);
    else push(label, blobRow(label));
  };

  push(
    "Assembled size",
    dims(
      metaStr(m, "assembled_size_length"),
      metaStr(m, "assembled_size_width"),
      metaStr(m, "assembled_size_height"),
      metaStr(m, "assembled_size_depth"),
    ) || dims(blob.dims.l, blob.dims.w, blob.dims.h, blob.dims.d),
  );
  pushMerged("Colour", metaStr(m, "colour"));
  pushMerged("Material", metaStr(m, "material"));
  pushMerged("Net weight", metaStr(m, "net_weight"), "kg");
  pushMerged("Gross weight", metaStr(m, "gross_weight"), "kg");
  push(
    "Packing size",
    dims(
      metaStr(m, "packing_size_length"),
      metaStr(m, "packing_size_width"),
      metaStr(m, "packing_size_height"),
      "",
    ),
  );
  pushMerged("Warranty", metaStr(m, "warranty"));

  const showPkg = metaStr(m, "show_package_inclusions");
  const pkgText = metaStr(m, "package_inclusion_text");

  return {
    overviewShort: metaStr(m, "product_overview_short") || undefined,
    overviewDescription: metaStr(m, "product_overview_description") || undefined,
    features,
    specs,
    packageInclusions: showPkg === "1" && pkgText ? pkgText : undefined,
  };
}

export type WcVariation = {
  id: number;
  sku: string;
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
  "id,name,slug,sku,type,permalink,price,regular_price,sale_price,on_sale,stock_status,catalog_visibility,bundle_price,short_description,description,images,categories";

export async function getProductsByCategory(
  categoryId: number,
  {
    page = 1,
    perPage = 24,
    orderby = "menu_order",
    order = "asc",
  }: { page?: number; perPage?: number; orderby?: string; order?: "asc" | "desc" } = {}
): Promise<FetchResult<WcProduct[]>> {
  const res = await wcGet<WcProduct[]>("/products", {
    category: categoryId,
    per_page: perPage,
    page,
    status: "publish",
    orderby,
    order,
    _fields: PRODUCT_FIELDS,
  });
  return { ...res, data: filterListable(res.data).map(applyImageOverride) };
}

// Full category fetch (all pages), ordered by menu_order (the store's "featured"
// order). By default filtered to MasterKraft's own M/N SKUs, but Clearance is
// ex-display / end-of-line stock (A-prefixed SKUs), so it passes brandFilter:
// false to show that stock rather than being emptied by the M/N filter.
// WooCommerce answers in 1.5-2.5s per request, so paging through it one `await`
// at a time is what makes a listing feel slow. Page 1 reports the page count in
// x-wp-totalpages, so every remaining page can be fetched at once: wall clock
// becomes one request instead of the sum. maxPages is a runaway guard.
async function fetchAllPages(
  params: Record<string, string | number | undefined>,
  maxPages = 6
): Promise<WcProduct[]> {
  const first = await wcGet<WcProduct[]>("/products", { ...params, per_page: 100, page: 1 });
  const pages = Math.min(first.totalPages || 1, maxPages);
  if (pages <= 1) return first.data;
  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, i) =>
      wcGet<WcProduct[]>("/products", { ...params, per_page: 100, page: i + 2 })
    )
  );
  // Concatenated in page order, so the store's menu_order survives.
  return [...first.data, ...rest.flatMap((r) => r.data)];
}

export async function getAllProductsByCategory(
  categoryId: number,
  opts?: { brandFilter?: boolean }
): Promise<WcProduct[]> {
  const out = await fetchAllPages({
    category: categoryId,
    status: "publish",
    orderby: "menu_order",
    order: "asc",
    _fields: PRODUCT_FIELDS,
  });
  // The obsolete filter is independent of brandFilter: Clearance opts out of the
  // M/N brand filter but must still respect the store's hidden flag.
  const listable = filterListable(out);
  return ((opts?.brandFilter ?? true) ? filterBrandSku(listable) : listable).map(applyImageOverride);
}

// The full catalogue (all categories), ordered by menu_order and filtered to
// MasterKraft's own M/N SKUs. Backs the "All Equipment" all-products landing.
export async function getAllProducts(): Promise<WcProduct[]> {
  const out = (
    await fetchAllPages(
      { status: "publish", orderby: "menu_order", order: "asc", _fields: PRODUCT_FIELDS },
      8
    )
  ).map(normalizeProduct);
  return filterBrandSku(filterListable(out));
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
// old site showed on each category landing page. Empty string if none/failed.
export async function getCategoryDescription(id: number): Promise<string> {
  try {
    const { data } = await wcGet<{ description?: string }>(`/products/categories/${id}`, {
      _fields: "description",
    });
    return data?.description ?? "";
  } catch {
    return "";
  }
}

export async function getCategoryChildren(parentId: number): Promise<WcCategoryChild[]> {
  const { data } = await wcGet<WcCategoryChild[]>("/products/categories", {
    parent: parentId,
    per_page: 100,
    hide_empty: "true",
    orderby: "name",
    order: "asc",
    _fields: "id,slug,name,count",
  });
  return data.map((c) => ({ ...c, name: decodeEntities(c.name) }));
}

// Search fetches the WHOLE result set, then filters, then paginates in memory -
// the same full-fetch approach the category pages use, and for the same reason.
//
// Asking WooCommerce for one 24-row page and filtering afterwards returned an
// EMPTY PAGE for the most common terms in the catalogue. The store holds a
// parallel S-prefixed range with identical product names (`SMDBRH` alongside
// `MMDBRH`), WooCommerce ranks those first, so all 24 rows were filtered away
// and the page reported "0 products found" while dozens matched further down.
// "dumbbell" is 59 raw results of which 22 are ours; "barbell" 95 of which 38.
// Broadest terms run to 2 pages of 100, so 3 is ample headroom.
export async function searchProducts(
  query: string,
  {
    page = 1,
    perPage = 24,
    // The typeahead only needs a handful of suggestions and fires per keystroke,
    // so it caps this at 1: one request, still filtered, instead of paying for
    // pages it will never show.
    maxPages = 3,
  }: { page?: number; perPage?: number; maxPages?: number } = {}
): Promise<FetchResult<WcProduct[]>> {
  const raw = await fetchAllPages(
    { search: query, status: "publish", _fields: PRODUCT_FIELDS },
    maxPages
  );
  const matched = filterBrandSku(filterSearchable(raw)).map(applyImageOverride);
  return {
    data: matched.slice((page - 1) * perPage, page * perPage),
    total: matched.length,
    totalPages: Math.max(1, Math.ceil(matched.length / perPage)),
  };
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

export async function getProductBySlug(slug: string): Promise<WcProduct | null> {
  const { data } = await wcGet<WcProduct[]>("/products", {
    slug,
    // meta_data carries the ACF overview/features/specs the product page renders.
    _fields: `${PRODUCT_FIELDS},meta_data`,
  });
  // Returning null for an obsolete product makes /product/<slug> 404 rather than
  // serve a page with a live add-to-cart button for something we don't sell.
  // getProductById is deliberately NOT filtered - it backs order creation, and
  // an order for an already-bought item must not fail because marketing hid it.
  const p = data[0];
  return p && !isUnservable(p) ? normalizeProduct(p) : null;
}

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
      _fields: "id,sku,price,regular_price,sale_price,stock_status,attributes,image",
    });
    return data;
  } catch {
    return null;
  }
}

export async function getProductVariations(productId: number): Promise<WcVariation[]> {
  const { data } = await wcGet<WcVariation[]>(`/products/${productId}/variations`, {
    per_page: 100,
    _fields: "id,sku,price,regular_price,sale_price,stock_status,attributes,image",
  });
  return data;
}

export async function getAllProductSlugs(): Promise<
  { slug: string; sku?: string; modified?: string }[]
> {
  const out: { slug: string; sku?: string; modified?: string }[] = [];
  for (let page = 1; page <= 6; page++) {
    const { data } = await wcGet<
      { slug: string; sku?: string; date_modified_gmt?: string; catalog_visibility?: string }[]
    >("/products", {
      per_page: 100,
      page,
      status: "publish",
      // sku so the caller can check the product against Unleashed's obsolete flag.
      _fields: "slug,sku,date_modified_gmt,catalog_visibility",
    });
    if (!data.length) break;
    // Obsolete products 404, so keep them out of the sitemap.
    out.push(
      ...data
        .filter((p) => !isUnservable(p))
        .map((p) => ({ slug: p.slug, sku: p.sku, modified: p.date_modified_gmt }))
    );
    if (data.length < 100) break;
  }
  return out;
}

export async function getFeaturedProducts(perPage = 8): Promise<WcProduct[]> {
  const { data } = await wcGet<WcProduct[]>("/products", {
    featured: "true",
    per_page: perPage,
    status: "publish",
    _fields: PRODUCT_FIELDS,
  });
  return filterListable(data).map(applyImageOverride);
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
