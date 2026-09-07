// Mirror Unleashed's products into Supabase.
//
//   npm run mirror:erp         report what WOULD change, write nothing
//   npm run mirror:erp:write   actually write
//
// A CACHE, NOT A SECOND SOURCE OF TRUTH. Unleashed remains the product database.
// This writes wholesale and unconditionally: there is no "edited by a human"
// concept here, unlike content.load.ts, and that difference is deliberate. An
// edit made in Supabase visibly does not survive the next sync, which is what
// stops this becoming the second system 20260905_product_content.sql warns about.
//
// WHY IT REPORTS BY DEFAULT. Same reason content.load.ts does: every write path
// in this repo is gated, and the week this was written gave the reason twice
// over. A loader that says what it will do before it does it is worth the extra
// command.
//
// RAW ERP VALUES. `price` is DefaultSellPrice, EX GST, exactly as Unleashed holds
// it. lib/unleashed.ts multiplies by GST when it builds the map and that rule
// stays in code — storing the inclusive figure here would put one business rule
// in two places. The axes are the ERP's own Width/Depth/Height for the same
// reason: the remap to the site's order lives once, in lib/freight-server.ts.
//
// IT REFUSES A SHORT READ. build:catalogue refuses below 400 products and
// build:obsolete below 1,500, both because a truncated read that overwrites is
// worse than no read at all. This refuses to shrink the mirror by more than
// MAX_SHRINK against what is already there — an Unleashed hiccup mid-page must
// not empty the catalogue.
import { createHmac } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { createClient } from "@supabase/supabase-js";

const env = new Map<string, string>();
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env.set(m[1], m[2].replace(/^["']|["']$/g, ""));
}
for (const [k, v] of env) if (!process.env[k]) process.env[k] = v;

const REPORT = "reports/erp-mirror.md";
const out = (s: string) => process.stdout.write(`${s}\n`);
const WRITE = process.env.ERP_MIRROR_WRITE === "true";

/** Refuse to shrink the mirror by more than this fraction in one sync. */
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

async function pages<T>(path: string, extra = ""): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; page <= 40; page++) {
    const query = `pageSize=200${extra}`;
    const res = await fetch(`https://api.unleashedsoftware.com/${path}/${page}?${query}`, {
      headers: {
        "api-auth-id": process.env.UNLEASHED_API_ID ?? "",
        "api-auth-signature": sign(query),
        Accept: "application/json",
      },
    });
    if (!res.ok) throw new Error(`Unleashed ${res.status} on ${path}/${page}`);
    const json = (await res.json()) as { Items?: T[]; Pagination?: { NumberOfPages?: number } };
    items.push(...(json.Items ?? []));
    if (page >= (json.Pagination?.NumberOfPages ?? 1)) break;
  }
  return items;
}

const num = (v: unknown) => {
  const n = parseFloat(String(v ?? ""));
  return Number.isFinite(n) && n !== 0 ? n : null;
};

it("mirrors Unleashed products into Supabase", async () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    out("\nSUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. Nothing to do.\n");
    return;
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  // Products and stock concurrently — StockOnHand is a separate endpoint, and
  // it is optional: a price with no stock figure is still a usable catalogue.
  const [products, stockRows] = await Promise.all([
    pages<ErpProduct>("Products"),
    pages<{ ProductCode?: string; AvailableQty?: number; QtyOnHand?: number }>("StockOnHand").catch(
      () => [] as { ProductCode?: string; AvailableQty?: number; QtyOnHand?: number }[]
    ),
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
        // EX GST, as the ERP holds it. See the header.
        price: num(p.DefaultSellPrice),
        stock: stock.get(code) ?? null,
        brand: p.ProductBrand?.BrandName?.trim() || null,
        group_name: p.ProductGroup?.GroupName?.trim() || null,
        subgroup: p.ProductSubGroup?.GroupName?.trim() || null,
        sellable: p.IsSellable !== false,
        obsolete: Boolean(p.Obsolete),
        image: image || null,
        weight_kg: num(p.Weight),
        // The ERP's OWN axes. Do not reorder them here.
        width_cm: num(p.Width),
        depth_cm: num(p.Depth),
        height_cm: num(p.Height),
        synced_at: now,
      };
    });

  const { count: existing } = await db
    .from("erp_products")
    .select("erp_code", { count: "exact", head: true });
  const before = existing ?? 0;

  // The guard. A truncated read that overwrites is worse than no read at all.
  const shrink = before > 0 ? (before - rows.length) / before : 0;
  const refused = before > 0 && shrink > MAX_SHRINK;

  const withCarton = rows.filter((r) => r.width_cm && r.depth_cm && r.height_cm).length;
  const withPrice = rows.filter((r) => r.price).length;

  const summary = [
    `Unleashed products read:  ${rows.length}`,
    `  with a price:           ${withPrice}`,
    `  with a full carton:     ${withCarton}`,
    `  with stock on hand:     ${rows.filter((r) => r.stock !== null).length}`,
    ``,
    `rows already in the mirror: ${before}`,
    refused
      ? `REFUSED: this sync would shrink the mirror by ${(shrink * 100).toFixed(0)}% ` +
        `(limit ${(MAX_SHRINK * 100).toFixed(0)}%). Unleashed may have answered short. Nothing written.`
      : WRITE
        ? `writing ${rows.length} rows...`
        : `DRY RUN. Nothing written. Set ERP_MIRROR_WRITE=true to apply.`,
  ].join("\n");

  let result = "";
  if (WRITE && !refused) {
    // Upsert in chunks — one statement for 1,500 rows is a large request and a
    // single failure loses the lot.
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.from("erp_products").upsert(rows.slice(i, i + 500), {
        onConflict: "erp_code",
      });
      if (error) throw new Error(`upsert failed at row ${i}: ${error.message}`);
    }
    // Anything not seen in this pass is gone from Unleashed. Deleting rather
    // than leaving it: a product that sells after it was retired is worse than
    // one that disappears from a listing.
    const { error: delErr, count: deleted } = await db
      .from("erp_products")
      .delete({ count: "exact" })
      .lt("synced_at", now);
    if (delErr) throw new Error(`prune failed: ${delErr.message}`);
    result = `\n${rows.length} rows written, ${deleted ?? 0} stale rows pruned.`;
  }

  mkdirSync("reports", { recursive: true });
  writeFileSync(REPORT, `# ERP mirror\n\n\`\`\`\n${summary}${result}\n\`\`\`\n`);
  out(`\n${summary}${result}\n`);
}, 900_000);
