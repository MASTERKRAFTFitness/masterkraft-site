// Unleashed ERP integration — the source of truth for correct pricing + stock.
// Auth: HMAC-SHA256 over the query string, keyed by the API key.
// Pagination is PATH-based: /Products/{page}?pageSize=200 (a ?page= param is ignored).
import crypto from "crypto";
import { unstable_cache } from "next/cache";
import {
  formatPrice,
  getPricing,
  getPriceValue,
  getProductVariations,
  type Priceable,
  type WcProduct,
} from "@/lib/woocommerce";
import { skuAliases } from "@/lib/unleashed-aliases";

const BASE = "https://api.unleashedsoftware.com";
const GST = 1.1; // DefaultSellPrice is ex-GST; masterkraft.com shows inc-GST

// `obsolete` is optional so a partially-built entry (or a test fixture) is still
// a valid entry; only an explicit `true` retires a product.
export type UnleashedEntry = { price: number; stock: number; obsolete?: boolean };
type UnleashedMap = Record<string, UnleashedEntry>; // keyed by UPPERCASE ProductCode

function sign(query: string): string {
  return crypto
    .createHmac("sha256", process.env.UNLEASHED_API_KEY ?? "")
    .update(query)
    .digest("base64");
}

async function unleashedGet<T>(path: string, page: number, extraQuery = ""): Promise<T> {
  // NOTE: the query string is what gets HMAC-signed, so it must match the URL exactly.
  const query = `pageSize=200${extraQuery}`;
  const res = await fetch(`${BASE}/${path}/${page}?${query}`, {
    headers: {
      "api-auth-id": process.env.UNLEASHED_API_ID ?? "",
      "api-auth-signature": sign(query),
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0", // Unleashed WAF rejects some default agents
    },
    next: { revalidate: 900 }, // 15 min
  });
  if (!res.ok) throw new Error(`Unleashed ${res.status} on ${path}/${page}`);
  return res.json() as Promise<T>;
}

type Paged<T> = { Items: T[]; Pagination?: { NumberOfPages?: number } };

// maxPages is a runaway guard, not a limit: Products is 10 pages with obsolete
// records included (6 without), so keep clear headroom or prices silently vanish.
async function fetchAllPages<T>(
  path: string,
  onItem: (item: T) => void,
  { maxPages = 16, extraQuery = "" }: { maxPages?: number; extraQuery?: string } = {}
) {
  const first = await unleashedGet<Paged<T>>(path, 1, extraQuery);
  first.Items.forEach(onItem);
  const pages = Math.min(first.Pagination?.NumberOfPages ?? 1, maxPages);
  // Fetch the remaining pages in parallel rather than one-at-a-time.
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pages - 1) }, (_, i) =>
      unleashedGet<Paged<T>>(path, i + 2, extraQuery)
    )
  );
  rest.forEach((d) => d.Items.forEach(onItem));
}

async function buildMap(): Promise<UnleashedMap> {
  const map: UnleashedMap = {};
  // Stock is collected separately rather than written straight into `map`,
  // because the two fetches now run concurrently and StockOnHand could otherwise
  // land first and be overwritten by the Products pass. Merged below instead.
  const stock: Record<string, number> = {};

  // Prices + the obsolescence flags.
  //
  // THE TRAP: GET /Products HIDES OBSOLETE PRODUCTS BY DEFAULT. Without
  // includeObsolete=true it returns 1,092 items every one of which reports
  // Obsolete:false, which reads as "this company doesn't use the flag". With it,
  // 1,892 items of which 800 are obsolete. Any check written without the
  // parameter passes vacuously. The field is `Obsolete`, not `IsObsolete`.
  await Promise.all([
    fetchAllPages<{
    ProductCode?: string;
    DefaultSellPrice?: number | string;
    Obsolete?: boolean;
    IsSellable?: boolean;
  }>(
    "Products",
    (p) => {
      if (!p.ProductCode) return;
      const price = parseFloat(String(p.DefaultSellPrice ?? "0"));
      map[p.ProductCode.toUpperCase()] = {
        price: price > 0 ? Math.round(price * GST * 100) / 100 : 0,
        stock: 0,
        obsolete: p.Obsolete === true || p.IsSellable === false,
      };
    },
      { extraQuery: "&includeObsolete=true" }
    ),

    // Stock on hand. Independent of the price/obsolete pass, so both run at once:
    // this map is what every listing waits on, and Unleashed answers slowly.
    fetchAllPages<{ ProductCode?: string; AvailableQty?: number; QtyOnHand?: number }>(
      "StockOnHand",
      (s) => {
        if (!s.ProductCode) return;
        stock[s.ProductCode.toUpperCase()] = Number(s.AvailableQty ?? s.QtyOnHand ?? 0);
      }
    ).catch(() => {
      /* stock optional - prices still work if this fails */
    }),
  ]);

  for (const [code, qty] of Object.entries(stock)) {
    if (map[code]) map[code].stock = qty;
    else map[code] = { price: 0, stock: qty, obsolete: false };
  }

  return map;
}

// Cache the whole built map in Next's shared Data Cache (persists across
// serverless instances), so cold instances don't rebuild the full catalogue.
const cachedBuildMap = unstable_cache(buildMap, ["unleashed-price-stock-map"], {
  revalidate: 900,
  tags: ["unleashed"],
});

export async function getUnleashedMap(): Promise<UnleashedMap> {
  try {
    return await cachedBuildMap();
  } catch (e) {
    console.error("[unleashed] map build failed", e);
    return {};
  }
}

// Card-level enrichment: for variable products, fetch variations and show the
// lowest variant price as "From $X" instead of the empty parent price.
export async function enrichCard(product: WcProduct, map: UnleashedMap): Promise<EnrichedProduct> {
  if (product.type === "variable") {
    const variations = await getProductVariations(product.id).catch(() => []);
    const enriched = variations.map((v) => enrich(v, map));
    const priced = enriched.filter((e) => e.priceValue > 0);
    if (priced.length > 0) {
      const min = priced.reduce((m, e) => (e.priceValue < m.priceValue ? e : m));
      return {
        priceLabel: `From ${min.priceLabel}`,
        priceValue: min.priceValue,
        inStock: enriched.some((e) => e.inStock),
        source: min.source,
      };
    }
  }
  return enrich(product, map);
}

// OBSOLETE PRODUCTS, the ERP half of the rule. WooCommerce's catalog_visibility
// (see `isObsolete` in woocommerce.ts) catches what WordPress hides; this catches
// what Unleashed has retired while WordPress still shows it, which was 15
// products including the whole discontinued Selectorize strength range.
// Unknown SKUs are NOT obsolete: plenty of catalogue products have no Unleashed
// match at all, and they must keep selling.
export function isObsoleteInUnleashed(map: UnleashedMap, sku?: string): boolean {
  return lookupBySku(map, sku)?.obsolete === true;
}

export function filterUnleashedObsolete<T extends { sku?: string }>(
  items: T[],
  map: UnleashedMap
): T[] {
  return items.filter((i) => !isObsoleteInUnleashed(map, i.sku));
}

export function lookupBySku(map: UnleashedMap, sku?: string): UnleashedEntry | null {
  if (!sku) return null;
  const up = sku.toUpperCase();
  // Direct SKU == ProductCode match first, then the name-validated alias map.
  const direct = map[up];
  if (direct) return direct;
  const alias = skuAliases[up];
  return alias ? map[alias] ?? null : null;
}

export type EnrichedProduct = {
  priceLabel: string;
  priceValue: number; // numeric inc-GST unit price for the cart
  compareAtLabel?: string;
  inStock: boolean;
  stockQty?: number;
  source: "unleashed" | "website";
};

// Prefer Unleashed price + stock; fall back to the WooCommerce RRP the site
// already shows for products with no Unleashed SKU match. Works for both
// products and variations (anything with sku + price fields).
export function enrich(item: Priceable, map: UnleashedMap): EnrichedProduct {
  const regular = parseFloat(item.regular_price || "0");
  const sale = parseFloat(item.sale_price || "0");
  const onSale = sale > 0 && sale < regular;

  // An explicit WooCommerce sale (e.g. Clearance markdowns) wins over the standard
  // Unleashed price, so the crossed-out RRP + reduced price show exactly as the
  // old site does. Unleashed carries no sale concept, so we only defer to it when
  // the item isn't marked down.
  if (!onSale) {
    const u = lookupBySku(map, item.sku);
    if (u && u.price > 0) {
      return {
        priceLabel: formatPrice(u.price),
        priceValue: u.price,
        inStock: u.stock > 0,
        stockQty: u.stock,
        source: "unleashed",
      };
    }
  }
  const wc = getPricing(item);
  return {
    priceLabel: wc.price,
    priceValue: getPriceValue(item),
    compareAtLabel: wc.compareAt,
    inStock: item.stock_status === "instock",
    source: "website",
  };
}
