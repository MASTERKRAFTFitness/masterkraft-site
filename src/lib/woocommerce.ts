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
};

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

// Full category fetch (all pages) — used for price sorting on corrected prices.
export async function getAllProductsByCategory(categoryId: number): Promise<WcProduct[]> {
  const out: WcProduct[] = [];
  for (let page = 1; page <= 6; page++) {
    const { data } = await wcGet<WcProduct[]>("/products", {
      category: categoryId,
      per_page: 100,
      page,
      status: "publish",
      _fields: PRODUCT_FIELDS,
    });
    if (!data.length) break;
    out.push(...data);
    if (data.length < 100) break;
  }
  return out;
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

export async function getCategoryChildren(parentId: number): Promise<WcCategoryChild[]> {
  const { data } = await wcGet<WcCategoryChild[]>("/products/categories", {
    parent: parentId,
    per_page: 100,
    hide_empty: "true",
    orderby: "count",
    order: "desc",
    _fields: "id,slug,name,count",
  });
  return data.map((c) => ({ ...c, name: decodeEntities(c.name) }));
}

export async function searchProducts(
  query: string,
  { page = 1, perPage = 24 }: { page?: number; perPage?: number } = {}
): Promise<FetchResult<WcProduct[]>> {
  return wcGet<WcProduct[]>("/products", {
    search: query,
    per_page: perPage,
    page,
    status: "publish",
    _fields: PRODUCT_FIELDS,
  });
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
    _fields: PRODUCT_FIELDS,
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
