// Unleashed ERP integration — the source of truth for correct pricing + stock.
// Auth: HMAC-SHA256 over the query string, keyed by the API key.
// Pagination is PATH-based: /Products/{page}?pageSize=200 (a ?page= param is ignored).
import crypto from "crypto";
import { unstable_cache } from "next/cache";
import {
  formatPrice,
  getBundleFromPrice,
  getPricing,
  getPriceValue,
  getProductVariations,
  type Priceable,
  type WcProduct,
} from "@/lib/woocommerce";
import { skuAliases } from "@/lib/unleashed-aliases";
import { getRange } from "@/lib/ranges";

const BASE = "https://api.unleashedsoftware.com";
const GST = 1.1; // DefaultSellPrice is ex-GST; masterkraft.com shows inc-GST

// The ERP record the site actually uses. Price and stock were the whole of it
// until 2026-09-02, when ranges started being built from Unleashed rather than
// from WooCommerce's variable/bundle containers (see lib/ranges.ts): a range
// needs the product's NAME to know which range it belongs to, its IMAGE, and its
// BRAND to keep MasterKraft's range apart from the identical Snap, Air Locker,
// Hyper Health and NO BRAND ranges that sit beside it under the same names.
export type UnleashedEntry = {
  price: number;
  stock: number;
  /** ProductDescription, e.g. "Rubber Hex Dumbbell - 9kg". */
  name?: string;
  /** Default image on Unleashed's own CDN — not the WordPress box. */
  image?: string;
  /** ProductBrand.BrandName: MK, SNAP, REVL, AIR LOCKER, NO BRAND, ... */
  brand?: string;
  /** ProductGroup.GroupName — the site's categories. See lib/erp-catalogue.ts. */
  group?: string;
  /** ProductSubGroup.GroupName — the sub-filter on a category page. */
  subgroup?: string;
  sellable?: boolean;
  /**
   * The ERP's own primary key. Unleashed identifies a product on a sales order
   * line by Guid; ProductCode is the human handle. Carried so an order can be
   * written without a second round trip per line.
   */
  guid?: string;
};
export type UnleashedMap = Record<string, UnleashedEntry>; // keyed by UPPERCASE ProductCode

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

  // Prices. Deliberately WITHOUT includeObsolete=true: obsolescence is resolved
  // from the committed list in `obsolete.ts`, so this fetch stays at 6 pages
  // rather than 10. See that file for why.
  await Promise.all([
    fetchAllPages<{
      ProductCode?: string;
      DefaultSellPrice?: number | string;
      ProductDescription?: string;
      ImageUrl?: string;
      Images?: { Url?: string; IsDefault?: boolean }[];
      ProductBrand?: { BrandName?: string };
      ProductGroup?: { GroupName?: string };
      ProductSubGroup?: { GroupName?: string };
      IsSellable?: boolean;
      Guid?: string;
    }>(
    "Products",
    (p) => {
      if (!p.ProductCode) return;
      const price = parseFloat(String(p.DefaultSellPrice ?? "0"));
      const image =
        p.Images?.find((i) => i.IsDefault)?.Url ?? p.Images?.[0]?.Url ?? p.ImageUrl;
      map[p.ProductCode.toUpperCase()] = {
        price: price > 0 ? Math.round(price * GST * 100) / 100 : 0,
        stock: 0,
        name: p.ProductDescription?.trim() || undefined,
        image: image || undefined,
        brand: p.ProductBrand?.BrandName?.trim() || undefined,
        group: p.ProductGroup?.GroupName?.trim() || undefined,
        subgroup: p.ProductSubGroup?.GroupName?.trim() || undefined,
        sellable: p.IsSellable !== false,
        guid: p.Guid || undefined,
      };
    }
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
    else map[code] = { price: 0, stock: qty };
  }

  return map;
}

// Cache the whole built map in Next's shared Data Cache (persists across
// serverless instances), so cold instances don't rebuild the full catalogue.
// 60 min, raised from 15 (2026-08-20). Rebuilding this map costs ~16s because
// Unleashed answers slowly and throttles concurrency, and every listing page
// waits on it, so a shorter window just means more visitors paying that. The
// trade is that a price or stock change in the ERP can take up to an hour to
// show. Lower it again if stock accuracy starts mattering more than the wait.
// KEY IS VERSIONED. The entry shape changed when name/image/brand were added;
// a warm cache under the old key would return entries with no `name`, and every
// range would silently come back empty. Bump the suffix whenever the shape does.
const cachedBuildMap = unstable_cache(buildMap, ["unleashed-product-map-v5"], {
  revalidate: 3600,
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
  // Bundles carry no price of their own; the plugin's computed minimum becomes a
  // "From $X" label rather than "Contact for pricing". See getBundleFromPrice.
  //
  // priceValue STAYS 0 ON PURPOSE. A bundle is a configurable range, and the
  // site has no bundle configurator, so the minimum is a guide price and not a
  // line price. `canPay` in the checkout requires every item to have a price
  // above zero, so a real value here would let someone card-checkout a whole
  // range at the cost of its cheapest item. Zero keeps bundles on the quote
  // flow, which is where they were before this label existed.
  //
  // A RANGE IS THE EXCEPTION and is priced off its ERP sizes instead. Those
  // pages now carry a size picker (lib/ranges.ts), so the shopper buys one size
  // at its own price and the caveat above does not apply: there is no
  // un-configured range to card-checkout. It also means one source for the
  // figure - the card used to read WooCommerce's bundle minimum ("From $110")
  // while the page read Unleashed ("From $90").
  const range = getRange(product, map);
  if (range) {
    const priced = range.sizes.filter((s) => s.price > 0);
    if (priced.length > 0) {
      const min = Math.min(...priced.map((s) => s.price));
      return {
        priceLabel: `From ${formatPrice(min)}`,
        priceValue: min,
        inStock: range.sizes.some((s) => s.stock > 0),
        source: "unleashed",
      };
    }
  }

  const bundleFrom = getBundleFromPrice(product);
  if (bundleFrom !== null) {
    return {
      priceLabel: `From ${formatPrice(bundleFrom)}`,
      priceValue: 0,
      inStock: product.stock_status === "instock",
      source: "website",
    };
  }
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

export function lookupBySku(map: UnleashedMap, sku?: string): UnleashedEntry | null {
  if (!sku) return null;
  const up = sku.toUpperCase();
  // Direct SKU == ProductCode match first, then the name-validated alias map.
  const direct = map[up];
  if (direct) return direct;
  const alias = skuAliases[up];
  return alias ? map[alias] ?? null : null;
}

// ---------------------------------------------------------------- live reads
//
// getUnleashedMap above is a 60-minute snapshot of the WHOLE catalogue, and that
// is the right trade for listing pages: rebuilding it costs ~16s, every listing
// waits on it, and stale-but-consistent is exactly what a visitor sees anyway.
//
// The support desk carries a different risk. A staff member repeats these
// figures to a customer, so an hour-old "one in stock" is a promise rather than
// a display, and the last unit may already be gone. Unleashed filters
// server-side on productCode and answers a single SKU in 150-600ms, so the admin
// path reads live instead of waiting on, or trusting, the shared snapshot.
//
// Verified 2026-08-25 against MBCTMA01 and MCTMSP02: identical figures to the
// cached map, and fast enough that there is no reason to cache them here.

/** Live reads are per-SKU, so a large list would mean a burst of requests. */
const LIVE_SKU_LIMIT = 10;

async function unleashedLive<T>(path: string, code: string): Promise<T[]> {
  // The signature covers the query string exactly, so the same string must be
  // both signed and sent. Do not rebuild it between the two.
  const query = `pageSize=200&productCode=${encodeURIComponent(code)}`;
  const res = await fetch(`${BASE}/${path}/1?${query}`, {
    headers: {
      "api-auth-id": process.env.UNLEASHED_API_ID ?? "",
      "api-auth-signature": sign(query),
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0",
    },
    cache: "no-store", // the entire point of this path
  });
  if (!res.ok) throw new Error(`Unleashed ${res.status} on live ${path}/${code}`);
  const data = (await res.json()) as { Items?: T[] };
  return data.Items ?? [];
}

// ----------------------------------------------------------------- shipments
//
// Dispatch lives in Unleashed as SalesShipments, keyed on the SAME order number
// the website uses (verified 2026-08-25 against 488906). Kept here rather than in
// its own module so the HMAC-over-the-query-string rule stays in one place: the
// signature covers the query exactly, and a second copy of that would drift.
//
// WHAT THIS DATA IS ACTUALLY LIKE, so callers do not over-promise:
//   923 shipments exist, and only 43 carry a tracking number. 886 have no
//   ShippingCompany at all, because dispatch happens in carrier portals and
//   nothing writes back. "Dispatched with no tracking" is the NORMAL case, not
//   an error, and must be reported as such rather than as "we do not know".
//
// Two shapes that bite: ShippingCompany is an OBJECT ({Guid, Name}), not a
// string, and DispatchDate is Microsoft JSON date format.

export type Shipment = {
  shipmentNumber: string | null;
  status: string | null;
  dispatchedAt: string | null;
  trackingNumber: string | null;
  carrier: string | null;
  packages: number | null;
  weightKg: number | null;
  deliverTo: string | null;
  lineCount: number;
};

type RawShipment = {
  ShipmentNumber?: string;
  ShipmentStatus?: string;
  DispatchDate?: string;
  TrackingNumber?: string | null;
  ShippingCompany?: { Name?: string } | null;
  NumberOfPackages?: number | null;
  ShipmentWeight?: number | null;
  DeliverySuburb?: string;
  DeliveryCity?: string;
  DeliveryRegion?: string;
  DeliveryPostCode?: string;
  SalesShipmentLines?: unknown[];
};

/** Unleashed serialises dates as /Date(1770681600000)/. */
function parseUnleashedDate(value?: string): string | null {
  const m = /\/Date\((-?\d+)/.exec(String(value ?? ""));
  return m ? new Date(Number(m[1])).toISOString() : null;
}

/**
 * Every shipment recorded against one order number, newest first.
 *
 * An empty array means no dispatch record exists, which for a recent order
 * usually means "not shipped yet" rather than "missing". The caller has to make
 * that distinction, because only it knows whether the order itself is real.
 */
export async function getShipmentsForOrder(orderNumber: string): Promise<Shipment[]> {
  const query = `pageSize=200&orderNumber=${encodeURIComponent(orderNumber.trim())}`;
  const res = await fetch(`${BASE}/SalesShipments/1?${query}`, {
    headers: {
      "api-auth-id": process.env.UNLEASHED_API_ID ?? "",
      "api-auth-signature": sign(query),
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0",
    },
    cache: "no-store", // somebody is asking where their delivery is
  });
  if (!res.ok) throw new Error(`Unleashed ${res.status} on SalesShipments/${orderNumber}`);

  const data = (await res.json()) as { Items?: RawShipment[] };
  return (data.Items ?? [])
    // Deleted shipments are cancelled paperwork, not dispatches. 12 of 923.
    .filter((s) => s.ShipmentStatus !== "Deleted")
    .map((s) => ({
      shipmentNumber: s.ShipmentNumber ?? null,
      status: s.ShipmentStatus ?? null,
      dispatchedAt: parseUnleashedDate(s.DispatchDate),
      trackingNumber: s.TrackingNumber || null,
      carrier: s.ShippingCompany?.Name || null,
      packages: s.NumberOfPackages ?? null,
      weightKg: s.ShipmentWeight ?? null,
      deliverTo:
        [s.DeliverySuburb, s.DeliveryCity, s.DeliveryRegion, s.DeliveryPostCode]
          .filter(Boolean)
          .join(", ") || null,
      lineCount: s.SalesShipmentLines?.length ?? 0,
    }))
    .sort((a, b) => (b.dispatchedAt ?? "").localeCompare(a.dispatchedAt ?? ""));
}

export type LiveEntry = UnleashedEntry & { live: boolean };

/**
 * Price and stock read live for a handful of SKUs. Falls back to the cached map
 * per SKU rather than as a whole, so one slow or missing product cannot turn an
 * otherwise live answer into a stale one silently: check `live` on each entry.
 */
export async function getLiveEntries(skus: string[]): Promise<Record<string, LiveEntry>> {
  const codes = [...new Set(skus.map((s) => s.trim().toUpperCase()).filter(Boolean))].slice(
    0,
    LIVE_SKU_LIMIT
  );
  if (!codes.length) return {};

  // Only built if something actually falls back, so the happy path stays fast.
  let fallback: UnleashedMap | null = null;

  const results = await Promise.all(
    codes.map(async (code): Promise<[string, LiveEntry]> => {
      const target = skuAliases[code] ?? code;
      try {
        const [products, stock] = await Promise.all([
          unleashedLive<{ DefaultSellPrice?: number | string }>("Products", target),
          unleashedLive<{ AvailableQty?: number; QtyOnHand?: number }>("StockOnHand", target).catch(
            () => []
          ),
        ]);
        const raw = parseFloat(String(products[0]?.DefaultSellPrice ?? "0"));
        if (!products.length) throw new Error("not in Unleashed");
        return [
          code,
          {
            price: raw > 0 ? Math.round(raw * GST * 100) / 100 : 0,
            stock: Number(stock[0]?.AvailableQty ?? stock[0]?.QtyOnHand ?? 0),
            live: true,
          },
        ];
      } catch (e) {
        console.error(`[unleashed] live read failed for ${code}, falling back`, e);
        fallback ??= await getUnleashedMap();
        const cached = lookupBySku(fallback, code);
        return [code, { price: cached?.price ?? 0, stock: cached?.stock ?? 0, live: false }];
      }
    })
  );

  return Object.fromEntries(results);
}

export type EnrichedProduct = {
  priceLabel: string;
  priceValue: number; // numeric inc-GST unit price for the cart
  compareAtLabel?: string;
  /**
   * "16 sizes · 6kg – 75kg" on a range card. Set only by erp-catalogue's
   * unitCard, so a WooCommerce-sourced card renders exactly as it did.
   */
  rangeLabel?: string;
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
