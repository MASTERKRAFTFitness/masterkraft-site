// Refreshing the Supabase mirror of Unleashed's product catalogue.
//
// SERVER ONLY. Uses the service role key through adminDb().
//
// This was the body of scripts/erp-mirror.load.ts until 2026-09-18, when the
// scheduled refresh arrived and needed the same work from an API route. It moved
// here rather than being copied, because a cron and a hand-run script that
// disagree about what a refresh means is how the mirror ends up holding
// something neither of them would have written.
//
// A CACHE, NOT A SECOND SOURCE OF TRUTH. Unleashed remains the product database.
// This writes wholesale and unconditionally: there is no "edited by a human"
// concept, deliberately, so an edit made in Supabase visibly does not survive
// the next sync. See 20260905_product_content.sql for why that matters.
import { createHmac } from "node:crypto";
import { adminDb } from "@/lib/admin-db";

/**
 * Refuse a sync that would shrink the mirror by more than this.
 *
 * A truncated read that overwrites is worse than no read at all — the same
 * reasoning behind build:catalogue's product floor and build:obsolete's. An
 * Unleashed hiccup mid-page must not empty the catalogue.
 */
const MAX_SHRINK = 0.1;

const sign = (q: string) =>
  createHmac("sha256", process.env.UNLEASHED_API_KEY ?? "").update(q).digest("base64");

type ErpProduct = {
  ProductCode?: string;
  Guid?: string;
  ProductDescription?: string;
  DefaultSellPrice?: number | string;
  ProductBrand?: { BrandName?: string };
  ProductGroup?: { GroupName?: string };
  ProductSubGroup?: { GroupName?: string };
  IsSellable?: boolean;
  Obsolete?: boolean;
  ImageUrl?: string;
  Images?: { Url?: string; IsDefault?: boolean }[];
  Weight?: number;
  Width?: number;
  Depth?: number;
  Height?: number;
};

type StockRow = { ProductCode?: string; AvailableQty?: number; QtyOnHand?: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

/**
 * Every page of an Unleashed collection, one at a time, with retries.
 *
 * SEQUENTIAL AND PATIENT, for the reason 18 September made expensive: Unleashed
 * answers slowly and throttles concurrency, and on a bad afternoon it 502s a
 * page that answers fine on its own a second later. A cron that gives up on the
 * first blip leaves the mirror stale, and stale past the read path's ceiling
 * means the site quietly goes back to paying the 16-second cold start.
 */
async function pages<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; page <= 40; page++) {
    const query = "pageSize=200";
    let body: { Items?: T[]; Pagination?: { NumberOfPages?: number } } | null = null;
    let lastError = "";

    for (const wait of [0, 2_000, 6_000, 15_000]) {
      if (wait) await sleep(wait);
      try {
        const res = await fetch(`https://api.unleashedsoftware.com/${path}/${page}?${query}`, {
          headers: {
            "api-auth-id": process.env.UNLEASHED_API_ID ?? "",
            "api-auth-signature": sign(query),
            Accept: "application/json",
          },
          cache: "no-store",
        });
        if (res.ok) {
          body = await res.json();
          break;
        }
        lastError = `Unleashed ${res.status}`;
        // A 401 does not get better by being asked four times.
        if (!RETRYABLE.has(res.status)) throw new Error(`${lastError} on ${path}/${page}`);
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("Unleashed 4")) throw e;
        lastError = e instanceof Error ? e.message : String(e);
      }
    }
    if (!body) throw new Error(`Unleashed failed on ${path}/${page} after 4 attempts (${lastError})`);

    items.push(...(body.Items ?? []));
    if (page >= (body.Pagination?.NumberOfPages ?? 1)) break;
  }
  return items;
}

const num = (v: unknown) => {
  const n = parseFloat(String(v ?? ""));
  return Number.isFinite(n) && n !== 0 ? n : null;
};

export type MirrorRefresh = {
  ok: boolean;
  /** Why, when ok is false. */
  reason?: string;
  read: number;
  withPrice: number;
  withCarton: number;
  withStock: number;
  before: number;
  written: number;
  pruned: number;
  refused: boolean;
  shrinkPct: number;
  dryRun: boolean;
  ms: number;
};

/**
 * Read Unleashed, write erp_products.
 *
 * `write` defaults to FALSE. Every write path in this repo is gated and this is
 * no exception: a loader that says what it will do before it does it is worth
 * the extra argument.
 */
export async function refreshErpMirror({ write = false } = {}): Promise<MirrorRefresh> {
  const started = Date.now();
  const empty = {
    read: 0,
    withPrice: 0,
    withCarton: 0,
    withStock: 0,
    before: 0,
    written: 0,
    pruned: 0,
    refused: false,
    shrinkPct: 0,
    dryRun: !write,
  };

  const db = adminDb();
  if (!db) {
    return { ok: false, reason: "Supabase is not configured", ...empty, ms: Date.now() - started };
  }
  if (!process.env.UNLEASHED_API_ID || !process.env.UNLEASHED_API_KEY) {
    return { ok: false, reason: "Unleashed is not configured", ...empty, ms: Date.now() - started };
  }

  // Products and stock concurrently — StockOnHand is a separate endpoint, and it
  // is optional: a price with no stock figure is still a usable catalogue.
  const [products, stockRows] = await Promise.all([
    pages<ErpProduct>("Products"),
    pages<StockRow>("StockOnHand").catch(() => [] as StockRow[]),
  ]);

  const stock = new Map<string, number>();
  for (const s of stockRows) {
    if (s.ProductCode) stock.set(s.ProductCode.toUpperCase(), Number(s.AvailableQty ?? s.QtyOnHand ?? 0));
  }

  const now = new Date().toISOString();
  const rows = products
    .filter((p) => p.ProductCode)
    .map((p) => {
      const code = p.ProductCode!.trim().toUpperCase();
      const image = p.Images?.find((i) => i.IsDefault)?.Url ?? p.Images?.[0]?.Url ?? p.ImageUrl;
      return {
        erp_code: code,
        guid: p.Guid || null,
        name: p.ProductDescription?.trim() || null,
        // EX GST, as the ERP holds it. lib/unleashed applies GST when it builds
        // the map, so the rule lives in one place.
        price: num(p.DefaultSellPrice),
        stock: stock.get(code) ?? null,
        brand: p.ProductBrand?.BrandName?.trim() || null,
        group_name: p.ProductGroup?.GroupName?.trim() || null,
        subgroup: p.ProductSubGroup?.GroupName?.trim() || null,
        sellable: p.IsSellable !== false,
        obsolete: Boolean(p.Obsolete),
        image: image || null,
        weight_kg: num(p.Weight),
        // The ERP's OWN axes. Do not reorder them here; lib/freight-server is
        // the only place that remaps.
        width_cm: num(p.Width),
        depth_cm: num(p.Depth),
        height_cm: num(p.Height),
        synced_at: now,
      };
    });

  const { count } = await db.from("erp_products").select("erp_code", { count: "exact", head: true });
  const before = count ?? 0;
  const shrink = before > 0 ? (before - rows.length) / before : 0;
  const refused = before > 0 && shrink > MAX_SHRINK;

  const stats = {
    read: rows.length,
    withPrice: rows.filter((r) => r.price).length,
    withCarton: rows.filter((r) => r.width_cm && r.depth_cm && r.height_cm).length,
    withStock: rows.filter((r) => r.stock !== null).length,
    before,
    shrinkPct: Math.round(shrink * 1000) / 10,
    dryRun: !write,
  };

  if (refused) {
    return {
      ok: false,
      reason:
        `refused: this sync would shrink the mirror by ${stats.shrinkPct}% ` +
        `(limit ${MAX_SHRINK * 100}%). Unleashed may have answered short. Nothing written.`,
      ...stats,
      written: 0,
      pruned: 0,
      refused: true,
      ms: Date.now() - started,
    };
  }

  if (!write) {
    return { ok: true, ...stats, written: 0, pruned: 0, refused: false, ms: Date.now() - started };
  }

  // Chunked: one statement for 1,600 rows is a large request, and a single
  // failure would lose the lot.
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db
      .from("erp_products")
      .upsert(rows.slice(i, i + 500), { onConflict: "erp_code" });
    if (error) throw new Error(`upsert failed at row ${i}: ${error.message}`);
  }

  // Anything not seen in this pass is gone from Unleashed. Deleted rather than
  // left: a product that sells after it was retired is worse than one that
  // disappears from a listing.
  const { error: delErr, count: deleted } = await db
    .from("erp_products")
    .delete({ count: "exact" })
    .lt("synced_at", now);
  if (delErr) throw new Error(`prune failed: ${delErr.message}`);

  return {
    ok: true,
    ...stats,
    written: rows.length,
    pruned: deleted ?? 0,
    refused: false,
    ms: Date.now() - started,
  };
}
