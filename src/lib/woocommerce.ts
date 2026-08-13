// Headless WooCommerce client - reads the existing masterkraft.com store via the
// WC REST API (read-only key). Cart/checkout use the public Store API (task 6).

const BASE = `${process.env.WC_STORE_URL}/wp-json/wc/v3`;

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
  short_description: string;
  description: string;
  images: WcImage[];
  categories: WcTerm[];
  meta_data?: WcMeta[];
};

export type WcMeta = { key: string; value: unknown };

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
export const BRAND_SKU_RE = /^[MN]/i;
export function isBrandSku(sku?: string): boolean {
  return !!sku && BRAND_SKU_RE.test(sku.trim());
}
export function filterBrandSku<T extends { sku?: string }>(items: T[]): T[] {
  return items.filter((i) => isBrandSku(i.sku));
}

const metaStr = (meta: WcMeta[] | undefined, key: string): string => {
  const v = meta?.find((m) => m.key === key)?.value;
  return typeof v === "string" ? v.trim() : v != null ? String(v) : "";
};

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
  push(
    "Assembled size",
    dims(
      metaStr(m, "assembled_size_length"),
      metaStr(m, "assembled_size_width"),
      metaStr(m, "assembled_size_height"),
      metaStr(m, "assembled_size_depth"),
    ),
  );
  push("Colour", metaStr(m, "colour"));
  push("Material", metaStr(m, "material"));
  push("Net weight", metaStr(m, "net_weight"), "kg");
  push("Gross weight", metaStr(m, "gross_weight"), "kg");
  push(
    "Packing size",
    dims(
      metaStr(m, "packing_size_length"),
      metaStr(m, "packing_size_width"),
      metaStr(m, "packing_size_height"),
      "",
    ),
  );
  push("Warranty", metaStr(m, "warranty"));

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
  "id,name,slug,sku,type,permalink,price,regular_price,sale_price,on_sale,stock_status,short_description,description,images,categories";

export async function getProductsByCategory(
  categoryId: number,
  {
    page = 1,
    perPage = 24,
    orderby = "menu_order",
    order = "asc",
  }: { page?: number; perPage?: number; orderby?: string; order?: "asc" | "desc" } = {}
): Promise<FetchResult<WcProduct[]>> {
  return wcGet<WcProduct[]>("/products", {
    category: categoryId,
    per_page: perPage,
    page,
    status: "publish",
    orderby,
    order,
    _fields: PRODUCT_FIELDS,
  });
}

// Full category fetch (all pages), ordered by menu_order (the store's "featured"
// order) and filtered to MasterKraft's own M/N SKUs.
export async function getAllProductsByCategory(categoryId: number): Promise<WcProduct[]> {
  const out: WcProduct[] = [];
  for (let page = 1; page <= 6; page++) {
    const { data } = await wcGet<WcProduct[]>("/products", {
      category: categoryId,
      per_page: 100,
      page,
      status: "publish",
      orderby: "menu_order",
      order: "asc",
      _fields: PRODUCT_FIELDS,
    });
    if (!data.length) break;
    out.push(...data);
    if (data.length < 100) break;
  }
  return filterBrandSku(out);
}

// The full catalogue (all categories), ordered by menu_order and filtered to
// MasterKraft's own M/N SKUs. Backs the "All Equipment" all-products landing.
export async function getAllProducts(): Promise<WcProduct[]> {
  const out: WcProduct[] = [];
  for (let page = 1; page <= 8; page++) {
    const { data } = await wcGet<WcProduct[]>("/products", {
      per_page: 100,
      page,
      status: "publish",
      orderby: "menu_order",
      order: "asc",
      _fields: PRODUCT_FIELDS,
    });
    if (!data.length) break;
    out.push(...data.map(normalizeProduct));
    if (data.length < 100) break;
  }
  return filterBrandSku(out);
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

export async function searchProducts(
  query: string,
  { page = 1, perPage = 24 }: { page?: number; perPage?: number } = {}
): Promise<FetchResult<WcProduct[]>> {
  const res = await wcGet<WcProduct[]>("/products", {
    search: query,
    per_page: perPage,
    page,
    status: "publish",
    _fields: PRODUCT_FIELDS,
  });
  const data = filterBrandSku(res.data);
  return { data, total: data.length, totalPages: res.totalPages };
}

// WooCommerce returns some text fields (notably category names) HTML-encoded.
// Decode name + category names so they don't double-encode when rendered.
function normalizeProduct(p: WcProduct): WcProduct {
  return {
    ...p,
    name: decodeEntities(p.name),
    categories: p.categories?.map((c) => ({ ...c, name: decodeEntities(c.name) })) ?? p.categories,
  };
}

export async function getProductBySlug(slug: string): Promise<WcProduct | null> {
  const { data } = await wcGet<WcProduct[]>("/products", {
    slug,
    // meta_data carries the ACF overview/features/specs the product page renders.
    _fields: `${PRODUCT_FIELDS},meta_data`,
  });
  return data[0] ? normalizeProduct(data[0]) : null;
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

export async function getAllProductSlugs(): Promise<{ slug: string; modified?: string }[]> {
  const out: { slug: string; modified?: string }[] = [];
  for (let page = 1; page <= 6; page++) {
    const { data } = await wcGet<{ slug: string; date_modified_gmt?: string }[]>("/products", {
      per_page: 100,
      page,
      status: "publish",
      _fields: "slug,date_modified_gmt",
    });
    if (!data.length) break;
    out.push(...data.map((p) => ({ slug: p.slug, modified: p.date_modified_gmt })));
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
  return data;
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
export function getPriceValue(p: Priceable): number {
  const regular = parseFloat(p.regular_price || p.price || "0");
  const sale = parseFloat(p.sale_price || "0");
  const base = sale > 0 && sale < regular ? sale : regular;
  return isFinite(base) && base > 0 ? Math.round(base * GST * 100) / 100 : 0;
}
