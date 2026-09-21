// Unleashed ERP integration — the source of truth for correct pricing + stock.
// Auth: HMAC-SHA256 over the query string, keyed by the API key.
// Pagination is PATH-based: /Products/{page}?pageSize=200 (a ?page= param is ignored).
import crypto from "crypto";
import { unstable_cache } from "next/cache";
import type { Gallery } from "@/lib/product-gallery";
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
import erpImageOverrides from "@/lib/erp-image-overrides.json";
import { adminDb } from "@/lib/admin-db";

const BASE = "https://api.unleashedsoftware.com";
const GST = 1.1; // DefaultSellPrice is ex-GST; masterkraft.com shows inc-GST

// 214 ERP photos were shot on white (or an off-shade grey) rather than on the
// #e6e6e6 the shop's product tiles are painted, so `object-contain` rendered
// them as a white box floating inside a grey tile. scripts/normalize-erp-bg.py
// repaints those backdrops into /public/erp-bg/ and records the local path
// here; the rest keep their Unleashed CDN URL. Keyed by UPPERCASE ProductCode,
// which is how `map` is keyed, so the swap happens as the map is built and
// every consumer of `entry.image` — the grid, ranges.ts, the variant picker —
// gets the corrected file without knowing this exists.
const IMAGE_OVERRIDES = erpImageOverrides as Record<string, string>;

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
  /**
   * Carton, as the ERP holds it. SAME UNITS as the WooCommerce snapshot —
   * verified across the 307 codes carrying dimensions in both, where weight and
   * largest-dimension ratios are exactly 1.000.
   *
   * THE AXES ARE NOT IN THE SAME ORDER, which is the part that bites. The
   * snapshot's length/width/height map to Width/Depth/Height here, not to
   * Width/Height/Depth: 77/52/62 in the snapshot is 77/62/52 in the ERP. See
   * lib/freight-server.ts, which is the only place that translates.
   */
  widthCm?: number;
  heightCm?: number;
  depthCm?: number;
  weightKg?: number;
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
      Width?: number;
      Height?: number;
      Depth?: number;
      Weight?: number;
    }>(
    "Products",
    (p) => {
      if (!p.ProductCode) return;
      const price = parseFloat(String(p.DefaultSellPrice ?? "0"));
      const code = p.ProductCode.toUpperCase();
      const image =
        IMAGE_OVERRIDES[code] ??
        p.Images?.find((i) => i.IsDefault)?.Url ??
        p.Images?.[0]?.Url ??
        p.ImageUrl;
      map[code] = {
        price: price > 0 ? Math.round(price * GST * 100) / 100 : 0,
        stock: 0,
        name: p.ProductDescription?.trim() || undefined,
        image: image || undefined,
        brand: p.ProductBrand?.BrandName?.trim() || undefined,
        group: p.ProductGroup?.GroupName?.trim() || undefined,
        subgroup: p.ProductSubGroup?.GroupName?.trim() || undefined,
        sellable: p.IsSellable !== false,
        guid: p.Guid || undefined,
        widthCm: p.Width || undefined,
        heightCm: p.Height || undefined,
        depthCm: p.Depth || undefined,
        weightKg: p.Weight || undefined,
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
// range would silently come back empty. Bump the suffix whenever the shape does
// — or whenever a FIELD'S VALUE is rewritten at build time, as v7 did when the
// repainted /erp-bg images started overriding `image`: the entries are shaped
// the same, so nothing breaks, but a warm v6 cache keeps serving the white
// backdrops for the full hour and the fix looks like it did not deploy.
// v8 (2026-09-15): eleven products were renamed or retired in Unleashed, which
// moved seven SLUGS. A warm v7 cache keeps serving the old names for up to an
// hour, and that hour was not cosmetic - next.config.ts redirects those old
// URLs to the new ones, so a stale map meant a permanent redirect pointing at a
// 404 until the cache expired. Bumping the key rebuilds on the first request
// after deploy and closed that window.
//
// v9 (2026-09-15): OSCMDU01 renamed to "Functional Trainer (Clearance)", so it
// stops sharing a <title> with MSCMS02. NOTHING MOVED - the slug stays
// functional-trainer-clearance, because the clearance dedupe below would have
// appended exactly that suffix anyway - so unlike v8 this bump buys nothing but
// speed: the title would have corrected itself within the hour regardless.
// Bumped on request, and recorded as such so the next person does not read it
// as a correctness fix and assume a rename always needs one. It does not. A
// bump costs every instance a ~16s catalogue rebuild on its first request, so
// it is worth it when a stale map would be WRONG, not merely old.
// v10 (2026-09-15): the 5kg-50kg urethane barbell range was held under two
// names and is now under one, merging two units into a single 19-size unit.
// That RETIRES the /product/urethane-fixed-barbells slug, and next.config.ts
// redirects it - so this is the v8 case again, not the v9 one: a warm map keeps
// that page alive while the redirect in front of it sends visitors elsewhere,
// and the two disagree until the cache expires.
const cachedBuildMap = unstable_cache(buildMap, ["unleashed-product-map-v10"], {
  revalidate: 3600,
  tags: ["unleashed"],
});

// ---------------------------------------------------------------------------
// THE MIRROR READ PATH — docs/erp-mirror-scope.md, step 4. Added 2026-09-18.
//
// `erp_products` in Supabase holds the same catalogue this function pages out of
// Unleashed, refreshed wholesale by scripts/erp-mirror.load.ts. Reading it turns
// a ~16s cold start into one query, and it is the seam the whole site already
// goes through, so it is the only place that has to change.
//
// THE MIRROR IS A CACHE. Unleashed stays the product database. Nothing here
// writes, and if the mirror and the ERP disagree the mirror is stale and gets
// overwritten — there is nothing to adjudicate. The moment somebody edits a
// price in Supabase this stops being true and becomes the two-sources problem
// that 20260905_product_content.sql warns about.
//
// THE TRANSFORMS LIVE HERE, NOT IN THE TABLE. The mirror stores what the ERP
// holds: price EX GST, the raw CDN image. This applies the GST multiplication
// and the /erp-bg repaint overrides exactly as buildMap does, so a business rule
// exists in one place and a mirror row means the same thing as an API response.
//
// IT FALLS BACK, IT NEVER FAILS. Supabase unreachable, unconfigured, empty,
// short or stale all return null and the caller pages Unleashed as before. That
// is what makes this deployable without a cutover.
// ---------------------------------------------------------------------------

/**
 * OFF unless explicitly enabled. The mirror can be populated and inspected in
 * production for as long as you like before anything reads it.
 */
const mirrorEnabled = () => process.env.ERP_MIRROR_ENABLED === "true";

/**
 * Below this the mirror is assumed truncated and is not used.
 *
 * The loader refuses to SHRINK the table by more than 10%, but that guard cannot
 * help a read: a table half-written by an interrupted first run has no previous
 * size to be measured against. Same floor reasoning as build:catalogue's
 * MIN_PRODUCTS — a short catalogue empties the shop, and 16 slow seconds is a
 * far better outcome than a shop missing a third of its products.
 */
const MIRROR_MIN_ROWS = 1_000;

/**
 * Past this the mirror is ignored in favour of live Unleashed.
 *
 * `docs/erp-mirror-scope.md` says stale beats empty, and for an hourly refresh
 * that is right. THERE IS NO SCHEDULED REFRESH YET — `npm run mirror:erp:write`
 * is run by hand — so without a ceiling, enabling the flag would serve whatever
 * the catalogue looked like the last time somebody remembered. That is not a
 * cache, it is a second frozen snapshot, and this codebase already has one of
 * those.
 *
 * So the ceiling is a SAFETY PROPERTY, not a tuning knob: it makes the flag safe
 * to turn on by accident. Raise it once a cron actually refreshes the table.
 */
const MIRROR_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours

type MirrorRow = {
  erp_code: string | null;
  guid: string | null;
  name: string | null;
  price: number | string | null;
  stock: number | string | null;
  brand: string | null;
  group_name: string | null;
  subgroup: string | null;
  sellable: boolean | null;
  image: string | null;
  weight_kg: number | string | null;
  width_cm: number | string | null;
  depth_cm: number | string | null;
  height_cm: number | string | null;
  synced_at: string | null;
};

const n = (v: number | string | null): number | undefined => {
  if (v === null || v === "") return undefined;
  const parsed = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/**
 * The catalogue map, built from Supabase. Null means "could not, use Unleashed".
 *
 * Never throws: every failure is a reason to fall back, and a mirror that makes
 * the site worse than no mirror would defeat the point.
 */
export async function buildMapFromMirror(): Promise<UnleashedMap | null> {
  try {
    const db = adminDb();
    // Unconfigured is not an error. Report scripts and local checkouts run
    // without Supabase credentials and must behave exactly as they did.
    if (!db) return null;

    // PAGED, BECAUSE POSTGREST CAPS A SELECT AT 1,000 ROWS and does not say so:
    // it returns exactly 1,000 and a 200. The catalogue is 1,648, so the
    // unpaged version of this silently built a map missing a third of the shop
    // — and 1,000 happens to clear MIRROR_MIN_ROWS by a single row, so the floor
    // would not have caught it either. Found by scripts/erp-mirror-parity.report.ts
    // on the first run, which is the entire reason docs/erp-mirror-scope.md
    // insists the comparison happens before anything reads this.
    const PAGE = 1_000;
    const rows: MirrorRow[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db
        .from("erp_products")
        .select(
          "erp_code, guid, name, price, stock, brand, group_name, subgroup, sellable, image, weight_kg, width_cm, depth_cm, height_cm, synced_at"
        )
        // OBSOLETE ROWS ARE EXCLUDED TO MATCH buildMap, which fetches Products
        // without includeObsolete=true on purpose. Carrying them here would put
        // codes in the map that the live path has never had in it, and "the cache
        // returns more than the source" is the kind of difference that surfaces
        // months later as a retired product on a page.
        .or("obsolete.is.null,obsolete.eq.false")
        // Ordered so the pages partition the table. Without it PostgREST gives
        // no stability guarantee across requests and a row can be fetched twice
        // or not at all.
        .order("erp_code", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) {
        console.error("[unleashed] mirror read failed", error.message);
        return null;
      }
      const page = (data ?? []) as MirrorRow[];
      rows.push(...page);
      if (page.length < PAGE) break;
    }

    if (rows.length < MIRROR_MIN_ROWS) {
      console.error(
        `[unleashed] mirror has ${rows.length} rows, floor is ${MIRROR_MIN_ROWS} — using live Unleashed.`
      );
      return null;
    }

    // Freshness is the OLDEST row, not the newest. The loader writes wholesale,
    // so a single fresh row beside a thousand old ones means a partial write,
    // and taking the newest would read that as healthy.
    let oldest = Infinity;
    for (const r of rows) {
      const t = r.synced_at ? Date.parse(r.synced_at) : NaN;
      if (Number.isFinite(t)) oldest = Math.min(oldest, t);
      else oldest = -Infinity; // a row with no stamp cannot be vouched for
    }
    const age = Date.now() - oldest;
    if (!Number.isFinite(oldest) || age > MIRROR_MAX_AGE_MS) {
      console.error(
        `[unleashed] mirror is ${Number.isFinite(oldest) ? `${Math.round(age / 3_600_000)}h old` : "unstamped"}, ` +
          `ceiling is ${MIRROR_MAX_AGE_MS / 3_600_000}h — using live Unleashed. Has the refresh run?`
      );
      return null;
    }

    const map: UnleashedMap = {};
    for (const r of rows) {
      const code = (r.erp_code ?? "").trim().toUpperCase();
      if (!code) continue;
      const price = n(r.price) ?? 0;
      map[code] = {
        // Identical to buildMap, deliberately: ex-GST in the table, inc-GST in
        // the map, rounded the same way, and 0 stays 0 rather than becoming 0.00
        // of nothing.
        price: price > 0 ? Math.round(price * GST * 100) / 100 : 0,
        stock: n(r.stock) ?? 0,
        name: r.name?.trim() || undefined,
        image: IMAGE_OVERRIDES[code] ?? r.image ?? undefined,
        brand: r.brand?.trim() || undefined,
        group: r.group_name?.trim() || undefined,
        subgroup: r.subgroup?.trim() || undefined,
        sellable: r.sellable !== false,
        guid: r.guid || undefined,
        widthCm: n(r.width_cm),
        heightCm: n(r.height_cm),
        depthCm: n(r.depth_cm),
        weightKg: n(r.weight_kg),
      };
    }
    return map;
  } catch (e) {
    console.error("[unleashed] mirror read threw", e);
    return null;
  }
}

const cachedMirrorMap = unstable_cache(buildMapFromMirror, ["erp-mirror-map-v1"], {
  // Shorter than the live map's hour: this read costs one query rather than 16
  // seconds, so there is no reason to hold a stale answer as long.
  revalidate: 600,
  tags: ["unleashed"],
});

export async function getUnleashedMap(): Promise<UnleashedMap> {
  if (mirrorEnabled()) {
    const mirrored = await cachedMirrorMap();
    if (mirrored) return mirrored;
    // Falling through is the designed behaviour, not an error path.
  }
  try {
    return await cachedBuildMap();
  } catch (e) {
    console.error("[unleashed] map build failed", e);
    return {};
  }
}

/**
 * The catalogue map, always from Unleashed itself, never the mirror.
 *
 * THIS EXISTS FOR THE MONEY PATH, and `docs/erp-mirror-scope.md` calls for it by
 * name: `payment-intent` reprices a cart from this map at charge time, so a
 * stale price here is CHARGED, not merely displayed. A listing that is an hour
 * behind is cosmetic; taking $2,499 for something that now costs $2,799 is not.
 *
 * It still goes through the same 60-minute cache the site has always used, so
 * this is not "live to the second" — it is "no worse than before the mirror
 * existed", which is the property that matters.
 */
export async function getUnleashedMapLive(): Promise<UnleashedMap> {
  try {
    return await cachedBuildMap();
  } catch (e) {
    console.error("[unleashed] live map build failed", e);
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
  //
  // AND THE MARKDOWN TRAVELS WITH IT. The size that sets the "From" figure also
  // carries the store's RRP for that same size (RangeSize.compareAt), so the
  // card reads "From $2.50" with "$5.00" struck through and earns its SALE
  // badge. Both halves describe one size — the cheapest — rather than pairing a
  // range-wide RRP with a single price.
  const range = getRange(product, map);
  if (range) {
    const priced = range.sizes.filter((s) => s.price > 0);
    if (priced.length > 0) {
      const cheapest = priced.reduce((a, b) => (b.price < a.price ? b : a));
      return {
        priceLabel: `From ${formatPrice(cheapest.price)}`,
        priceValue: cheapest.price,
        compareAtLabel: cheapest.compareAt ? formatPrice(cheapest.compareAt) : undefined,
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

// ------------------------------------------------------- WordPress -> the ERP
//
// THE PHOTOGRAPHY COMES FROM UNLEASHED NOW. The listing grids already read it,
// because they are built from ErpUnits (see erp-catalogue.ts). Every other
// surface still renders a SNAPSHOT product where WooCommerce has a page for it,
// and the snapshot carries the old WordPress URLs — so the product page's
// gallery, its og:image and JSON-LD image, the related strip and the typeahead
// all still pointed at masterkraft.com/wp-content/uploads while the card that
// opened them showed the ERP's picture. 512 snapshot products were doing that.
//
// THE RULE IS "ONLY WHERE THE ERP HAS ONE". 26 live products have a WordPress
// photograph and no ERP photograph at all — mostly the S-prefixed SNAP twins of
// MasterKraft ranges — and a blanket swap would leave those pages with no
// picture, which is worse than an off-shade backdrop. They keep what they have
// until the ERP is given a photograph for them; `npm run report:wooimages`
// lists them and is how that set is re-measured.
//
// THE DEFAULT IMAGE ONLY, NEVER the ERP's Images[] array. Around 125 products
// were converted to a matched backdrop by hand, and each KEPT ITS ORIGINAL as a
// second attachment so the change reverts in one click. Rendering the array
// would put every one of those originals — the white boxes the conversion
// removed — back into the gallery beside the corrected file.
const isWordPressImage = (src?: string) => !!src && /\/wp-content\/uploads\//.test(src);

// WooCommerce photography served out of /public, which is most of it now.
// product-image-overrides.json swaps both of these in BEFORE this runs, so by
// the time a snapshot product gets here its wp-content URLs are already local
// paths — matching the WordPress host alone would let nearly all of it through.
//
//   /product-images/  scripts/mirror-product-images.mjs. The same photographs,
//                     rehosted to get the catalogue off the dead WordPress host.
//   /product-bg/      scripts/normalize-product-bg.py. The same photographs
//                     again, recoloured onto a matched backdrop.
//
// Rehosting and recolouring change where a picture is served from and what
// colour sits behind it. Neither makes it the ERP's photograph, so both are
// snapshot photography and an ERP photograph replaces them on the same terms.
// Leaving either behind shows one product twice, once from each source — which
// is what 142 live pages were doing, gallery and og:image disagreeing.
const isSnapshotImage = (src?: string) =>
  isWordPressImage(src) ||
  (!!src && (src.startsWith("/product-bg/") || src.startsWith("/product-images/")));

/**
 * A snapshot product's WordPress photography, replaced by the ERP's own.
 *
 * Returns the product UNTOUCHED when the ERP has no photograph for it, so this
 * can be applied at every surface without auditing which products it will hit.
 */
/**
 * The extra angles held for a code in Supabase, if any.
 *
 * Resolved the same way lookupBySku resolves a price, so a product whose SKU
 * the ERP knows under an alias finds its gallery too. A `-GROUP` container has
 * no ERP code at all and is keyed on the WooCommerce SKU itself — that is the
 * case the table mainly exists for.
 */
function galleryFor(gallery: Gallery, sku?: string): string[] {
  const up = (sku ?? "").trim().toUpperCase();
  if (!up) return [];
  return gallery[up] ?? gallery[skuAliases[up] ?? ""] ?? [];
}

export function withErpImages<T extends WcProduct>(
  product: T,
  map: UnleashedMap,
  gallery: Gallery = {}
): T {
  // Supabase holds what the ERP structurally cannot: a SECOND photograph for a
  // code, and any photograph at all for a `-GROUP` container. It never leads —
  // these sit behind the ERP's own picture — so they are resolved first but
  // placed last. See supabase/migrations/20260908_product_images.sql.
  const extra = galleryFor(gallery, product.sku);

  // A product carrying no snapshot photography has nothing to swap: an ErpUnit
  // from unitAsProduct is ERP-sourced already. It can still gain extra angles,
  // though, so this returns early only when there is genuinely nothing to add —
  // and returns the SAME OBJECT when so, which is what lets the callers apply
  // this blind at every surface.
  if (!(product.images ?? []).some((i) => isSnapshotImage(i.src))) {
    if (!extra.length) return product;
    const already = new Set((product.images ?? []).map((i) => i.src));
    const add = extra.filter((src) => !already.has(src));
    if (!add.length) return product;
    return {
      ...product,
      images: [...(product.images ?? []), ...add.map((src) => ({ src, alt: product.name }))],
    };
  }

  const erp: string[] = [];
  const push = (src?: string) => {
    if (src && !erp.includes(src)) erp.push(src);
  };

  // The product's own code first — for a single product that is the whole
  // answer, and for a range it is the size the card and the picker open on.
  push(lookupBySku(map, product.sku)?.image);

  // Then every size, in the picker's order. A `-GROUP` SKU is a WooCommerce
  // bundle container and is not an ERP code at all, so this is the ONLY thing
  // that resolves it — and it resolves it the same way the size picker on that
  // page already does, so a gallery cannot show a photograph the dropdown
  // disagrees with. It is also what turns one parent photo into one per size.
  for (const size of getRange(product, map)?.sizes ?? []) push(size.image);

  // NOTHING FROM EITHER SOURCE MEANS KEEP WHAT IT HAS. 12 live pages are in
  // this state — `-GROUP` containers the ERP has no record of — and a blank
  // tile is worse than an off-shade backdrop. Supabase is how those get a
  // picture, so once a row exists for one it stops falling through here.
  if (erp.length === 0 && extra.length === 0) return product;

  // Anything that was never WordPress photography stays, and stays behind the
  // ERP's. Today that is nothing on the snapshot path; it is here so a future
  // hand-added image is not silently dropped.
  const kept = (product.images ?? []).filter((i) => !isSnapshotImage(i.src));
  const seen = new Set(erp);
  return {
    ...product,
    images: [
      ...erp.map((src) => ({ src, alt: product.name })),
      // Deduplicated against the ERP's, so a curated row that happens to repeat
      // the default photograph does not show it twice.
      ...extra.filter((src) => !seen.has(src)).map((src) => ({ src, alt: product.name })),
      ...kept,
    ],
  };
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

export type SalesOrder = {
  orderNumber: string;
  status: string | null;
  orderedAt: string | null;
  total: number | null;
  lines: { name: string | null; code: string | null; qty: number }[];
  /**
   * Every email address recorded against this order, lowercased.
   *
   * Only the labelled `Email:` line that `buildComments` writes is accepted,
   * plus a structured customer email if Unleashed carries one. A loose scan for
   * anything @-shaped is deliberately NOT done: Comments also carries staff
   * notes, and an address that leaked in there would become a way to unlock
   * somebody else's order.
   */
  emails: string[];
  /**
   * The Stripe PaymentIntent id, or null when the order carries none.
   *
   * `buildComments` writes it as a labelled "Stripe: pi_…" line, the same way it
   * writes the email, and this is the ONLY place an order number can be joined
   * to its payment now that the WooCommerce order records are unreachable —
   * `transaction_id` on the Woo order used to carry it.
   *
   * Null is a real answer, not a failure: a quote or a manually entered order
   * was never paid by card through the site.
   */
  stripeRef: string | null;
};

type RawSalesOrder = {
  OrderNumber?: string;
  OrderStatus?: string;
  OrderDate?: string;
  Total?: number | null;
  Comments?: string | null;
  Customer?: { Email?: string | null; CustomerName?: string | null } | null;
  SalesOrderLines?: {
    Product?: { ProductCode?: string | null; ProductDescription?: string | null } | null;
    OrderQuantity?: number | null;
  }[];
};

function emailsOn(raw: RawSalesOrder): string[] {
  const found = new Set<string>();
  // buildComments writes "Email: someone@example.com" on its own line. Match
  // that shape and nothing else.
  const labelled = /^Email:[ \t]*(\S+@\S+?)[ \t]*$/gim;
  const comments = String(raw.Comments ?? "");
  for (const m of comments.matchAll(labelled)) found.add(m[1].toLowerCase());
  const structured = raw.Customer?.Email?.trim().toLowerCase();
  // A shared "website customer" account would put the same address on every
  // order, so it is only useful when the account is per-order or match-email.
  if (structured) found.add(structured);
  return [...found];
}

/**
 * The Stripe PaymentIntent id `buildComments` recorded, if any.
 *
 * Anchored to its own labelled line for the same reason emailsOn is: Comments
 * also carries staff notes, and a loose scan for anything `pi_`-shaped would
 * happily return a reference somebody pasted in from another order.
 */
function stripeRefOn(raw: RawSalesOrder): string | null {
  const m = /^Stripe:[ \t]*(pi_[A-Za-z0-9]+)[ \t]*$/im.exec(String(raw.Comments ?? ""));
  return m ? m[1] : null;
}

/**
 * One sales order, by the number the customer quotes.
 *
 * Orders have been written into Unleashed rather than WooCommerce since
 * 2026-09-06, and WC_STORE_URL points at a host with no WooCommerce behind it,
 * so this is the only place an order can be read from.
 *
 * Returns null when nothing matches EXACTLY. Unleashed's orderNumber filter is
 * a prefix-ish search, so 490118 can return 4901180: the caller must never be
 * handed a near miss.
 */
export async function getSalesOrder(orderNumber: string): Promise<SalesOrder | null> {
  const wanted = orderNumber.trim();
  if (!wanted) return null;

  const query = `pageSize=200&orderNumber=${encodeURIComponent(wanted)}`;
  const res = await fetch(`${BASE}/SalesOrders/1?${query}`, {
    headers: {
      "api-auth-id": process.env.UNLEASHED_API_ID ?? "",
      "api-auth-signature": sign(query),
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0",
    },
    cache: "no-store", // an order status is the one thing that must never be stale
  });
  if (!res.ok) throw new Error(`Unleashed ${res.status} on SalesOrders/${wanted}`);

  const data = (await res.json()) as { Items?: RawSalesOrder[] };
  const exact = (data.Items ?? []).find((o) => String(o.OrderNumber ?? "").trim() === wanted);
  if (!exact) return null;

  return {
    orderNumber: String(exact.OrderNumber),
    status: exact.OrderStatus ?? null,
    orderedAt: parseUnleashedDate(exact.OrderDate),
    total: typeof exact.Total === "number" ? exact.Total : null,
    lines: (exact.SalesOrderLines ?? []).map((l) => ({
      name: l.Product?.ProductDescription ?? null,
      code: l.Product?.ProductCode ?? null,
      qty: l.OrderQuantity ?? 0,
    })),
    emails: emailsOn(exact),
    stripeRef: stripeRefOn(exact),
  };
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
