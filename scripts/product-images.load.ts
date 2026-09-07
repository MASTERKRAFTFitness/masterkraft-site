// Fill product_images from the snapshot — the photographs the ERP cannot hold.
//
//   npm run load:images         report what WOULD change, write nothing
//   npm run load:images:write   actually write
//
// WHY IT REPORTS BY DEFAULT. Same reason content.load does: every write path in
// this repo is gated, and the Unleashed attribute import that aborted at row 12
// of 328 is the standing argument for it. A loader that says what it will do
// before it does it is worth the extra command.
//
// ------------------------------------------------------------- THE RULE
//
// Two kinds of row, and the difference is whether the ERP has a photograph.
//
//   'sole'     The ERP has NO picture for this page and can never be given one:
//              `-GROUP` bundle containers and `-v` variable parents are
//              WooCommerce constructs, not Unleashed ProductCodes. 12 live pages
//              are in this state. Everything WooCommerce had for them goes in,
//              because it is the only photography that exists.
//   'gallery'  The ERP HAS a photograph, which keeps leading. Only the repainted
//              /product-bg/ files go in behind it.
//
// WHY 'gallery' IS SO NARROW, when 150 photographs came off the live site on
// 7 September and we could put them all back. 140 of those 150 are raw
// /product-images/ mirror files — the original white-box studio shots. The ERP's
// photography is on a grey tile. Putting the raw ones back would stand the two
// backdrops side by side in one gallery, which is the exact inconsistency the
// image swap was made to remove, and it would do it on 136 pages at once.
// normalize-product-bg.py has repainted 83 files so far; those match, so those
// go in. The rest are not refused forever, they are waiting on the repaint
// queue — re-run this after each batch and they arrive.
//
// IT IS IDEMPOTENT. Upsert on the primary key, so running it twice changes
// nothing the second time. Rows a human has since edited are left alone unless
// --force, for the same reason content.load leaves them: the snapshot is frozen,
// so after the first load it is the OLDER answer, and overwriting a curator's
// choice with it is a regression that leaves no trace.
import { createHmac } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { it } from "vitest";
import { createClient } from "@supabase/supabase-js";

const env = new Map<string, string>();
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env.set(m[1], m[2].replace(/^["']|["']$/g, ""));
}
for (const [k, v] of env) if (!process.env[k]) process.env[k] = v;

const WRITE = process.env.IMAGES_LOAD_WRITE === "true";
const FORCE = process.env.IMAGES_LOAD_FORCE === "true";
const LOADER = "product-images.load";
const LOG = "reports/product-images-load.md";
const PUBLIC = join(process.cwd(), "public");

const { allProducts, variationsFor } = await import("@/lib/catalogue");
const { skuAliases } = await import("@/lib/unleashed-aliases");
const { isRetiredSku } = await import("@/lib/obsolete");
const { getRange } = await import("@/lib/ranges");
const imageOverrides = (await import("@/lib/product-image-overrides.json")).default as Record<
  string,
  string[]
>;
type UnleashedMap = Awaited<ReturnType<typeof import("@/lib/unleashed").getUnleashedMap>>;
type WcProduct = Parameters<typeof getRange>[0];

const lines: string[] = [];
const say = (s = "") => {
  lines.push(s);
  console.log(s);
};
const flush = () => {
  mkdirSync("reports", { recursive: true });
  writeFileSync(LOG, lines.join("\n") + "\n");
};

/** The repaints, whose backdrop already matches the ERP's. */
const isRepaint = (src: string) => src.startsWith("/product-bg/");
/** Committed under /public, so a row can never point at the dead WordPress host. */
const onDisk = (src: string) => src.startsWith("/") && existsSync(join(PUBLIC, src.split("?")[0]));

type Row = {
  erp_code: string;
  slug: string | null;
  images: string[];
  kind: "gallery" | "sole";
  updated_by: string;
};

const sign = (q: string) =>
  createHmac("sha256", process.env.UNLEASHED_API_KEY ?? "").update(q).digest("base64");

type ErpProduct = { ProductCode?: string; ProductDescription?: string; ImageUrl?: string;
  Images?: { Url?: string; IsDefault?: boolean }[]; ProductGroup?: { GroupName?: string };
  ProductBrand?: { BrandName?: string }; DefaultSellPrice?: number | string; IsSellable?: boolean };

/** Image counts AND names. The names matter: sizesFromCodes builds a range by
 * splitting "Product - 9kg" on the separator, so a map without them makes
 * getRange return null and every `-GROUP` container look uncovered. */
async function erpProducts(): Promise<ErpProduct[]> {
  const items: ErpProduct[] = [];
  for (let page = 1; page <= 20; page++) {
    const q = "pageSize=200";
    const res = await fetch(`https://api.unleashedsoftware.com/Products/${page}?${q}`, {
      headers: {
        "api-auth-id": process.env.UNLEASHED_API_ID ?? "",
        "api-auth-signature": sign(q),
        Accept: "application/json",
      },
    });
    if (!res.ok) throw new Error(`Unleashed /Products/${page}: ${res.status}`);
    const j = (await res.json()) as { Items?: ErpProduct[]; Pagination?: { NumberOfPages?: number } };
    items.push(...(j.Items ?? []));
    if (page >= (j.Pagination?.NumberOfPages ?? 1)) break;
  }
  return items;
}

it("loads product_images", async () => {
  const erp = await erpProducts();
  const counts = new Map<string, number>();
  const map: UnleashedMap = {};
  for (const p of erp) {
    const c = (p.ProductCode ?? "").trim().toUpperCase();
    if (!c) continue;
    counts.set(c, (p.Images ?? []).filter((i) => i.Url).length || (p.ImageUrl ? 1 : 0));
    // THE MAP HAS TO BE FAITHFUL, not merely present. getRange reads four of
    // these and drops a size if any disagree: it groups by the part of `name`
    // before " - ", it keeps only entries of the SAME `brand` (ranges.ts:231),
    // and it skips anything `sellable === false`. A map missing them forms no
    // range, so every container looks uncovered and falls through to 'sole' —
    // which is what put a raw white-box shot behind acoustic-underlay's ERP
    // photography on the first run of this loader. Build it the way
    // woo-image-gap.report.ts does, and the two agree about what is covered.
    map[c] = {
      price: Math.max(0, parseFloat(String(p.DefaultSellPrice ?? "0")) || 0),
      stock: 0,
      name: p.ProductDescription?.trim() || undefined,
      image: (p.Images?.find((i) => i.IsDefault)?.Url ?? p.Images?.[0]?.Url ?? p.ImageUrl) || undefined,
      brand: p.ProductBrand?.BrandName?.trim() || undefined,
      group: p.ProductGroup?.GroupName?.trim() || undefined,
      sellable: p.IsSellable !== false,
    };
  }
  const has = (sku?: string) => {
    const up = (sku ?? "").trim().toUpperCase();
    if (!up) return 0;
    return counts.get(up) ?? counts.get(skuAliases[up] ?? "") ?? 0;
  };

  let rows: Row[] = [];
  let skippedRaw = 0;

  for (const raw of allProducts() as WcProduct[]) {
    const p = raw as WcProduct & { sku?: string; slug?: string; images?: { src: string }[] };
    const sku = (p.sku ?? "").trim();
    if (!sku || isRetiredSku(sku)) continue;

    const imgs = imageOverrides[sku]?.length
      ? imageOverrides[sku]
      : (p.images ?? []).map((i) => i.src);
    if (!imgs.length) continue;

    // Does the ERP have a picture for this page? Three ways it can, and all
    // three must be asked or this writes a 'sole' row over a product that
    // already has ERP photography and simply reaches it indirectly:
    //   its own code        the simple case
    //   one of its SIZES    how getRange answers a `-GROUP` container
    //   one of its VARIATIONS  54 products resolve only this way — see
    //                       woo-image-gap.report.ts, which counts the same three
    let covered = has(sku);
    if (!covered) {
      for (const s of getRange(raw, map)?.sizes ?? []) {
        if (has(s.code)) {
          covered = 1;
          break;
        }
      }
    }
    if (!covered) {
      for (const v of variationsFor((p as { id: number }).id) ?? []) {
        if (has(v.sku)) {
          covered = 1;
          break;
        }
      }
    }

    const usable = imgs.filter(onDisk);
    if (!usable.length) continue;

    if (!covered) {
      // Everything it has: this page has no other source of photography.
      rows.push({ erp_code: sku.toUpperCase(), slug: p.slug ?? null, images: usable, kind: "sole", updated_by: LOADER });
    } else {
      const repaints = usable.filter(isRepaint);
      skippedRaw += usable.length - repaints.length;
      // The ERP's photograph leads and is already on the page; a row of one
      // repaint that IS that photograph would add nothing. Only rows that add
      // an angle are worth writing.
      if (repaints.length) {
        rows.push({ erp_code: sku.toUpperCase(), slug: p.slug ?? null, images: repaints, kind: "gallery", updated_by: LOADER });
      }
    }
  }

  // ONE CODE, ONE PRODUCT. The snapshot can put the same SKU on two different
  // products — RFRFRR is on both `acoustic-underlay-r-v` and
  // `impact-lock-rubber-tiles-rev-v`, which are not the same thing — and the
  // table is keyed on the code, so there is no honest way to store both. Merging
  // their photographs would put an underlay on a rubber tile page. The upsert
  // also rejects the batch outright ("ON CONFLICT DO UPDATE command cannot
  // affect row a second time"), so this has to be resolved here either way, and
  // the safe resolution is to write neither and say so.
  const byCodeSeen = new Map<string, Row[]>();
  for (const r of rows) byCodeSeen.set(r.erp_code, [...(byCodeSeen.get(r.erp_code) ?? []), r]);
  const contested = [...byCodeSeen.values()].filter((rs) => rs.length > 1);
  const contestedCodes = new Set(contested.map((rs) => rs[0].erp_code));
  if (contestedCodes.size) rows = rows.filter((r) => !contestedCodes.has(r.erp_code));

  const sole = rows.filter((r) => r.kind === "sole");
  const gallery = rows.filter((r) => r.kind === "gallery");
  say(`# product_images load`);
  say(``);
  say(`${WRITE ? "WRITING" : "DRY RUN — nothing written"}. \`npm run load:images:write\` to apply.`);
  say(``);
  say(`| | rows | photographs |`);
  say(`|---|---:|---:|`);
  say(`| \`sole\` — the ERP has no picture and cannot be given one | ${sole.length} | ${sole.reduce((n, r) => n + r.images.length, 0)} |`);
  say(`| \`gallery\` — repainted angles behind the ERP's own | ${gallery.length} | ${gallery.reduce((n, r) => n + r.images.length, 0)} |`);
  say(`| **total** | **${rows.length}** | **${rows.reduce((n, r) => n + r.images.length, 0)}** |`);
  say(``);
  if (contested.length) {
    say(`## Not written — one code, two products`);
    say(``);
    say(`The snapshot puts these SKUs on more than one product. The table is keyed`);
    say(`on the code, so storing both is impossible and merging them would put one`);
    say(`product's photograph on another's page. Fix the duplicate SKU in the ERP or`);
    say(`the snapshot, then re-run.`);
    say(``);
    for (const rs of contested) say(`- \`${rs[0].erp_code}\` — ${rs.map((r) => r.slug ?? "?").join(", ")}`);
    say(``);
  }
  say(`${skippedRaw} raw \`/product-images/\` photographs were NOT written: their white`);
  say(`backdrop does not match the ERP's tile. They become eligible as`);
  say(`normalize-product-bg.py works through them.`);
  say(``);

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    say(`No SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — reporting only.`);
    flush();
    return;
  }
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: existing, error: readErr } = await db
    .from("product_images")
    .select("erp_code, updated_by");
  if (readErr) {
    say(`Could not read product_images: ${readErr.message}`);
    say(`Has supabase/migrations/20260908_product_images.sql been applied?`);
    flush();
    return;
  }
  const byCode = new Map((existing ?? []).map((r) => [String(r.erp_code), String(r.updated_by ?? "")]));
  const edited = rows.filter((r) => byCode.has(r.erp_code) && byCode.get(r.erp_code) !== LOADER);
  const writable = FORCE ? rows : rows.filter((r) => !edited.includes(r));

  say(`  new rows          ${rows.filter((r) => !byCode.has(r.erp_code)).length}`);
  say(`  loader-owned      ${rows.length - edited.length - rows.filter((r) => !byCode.has(r.erp_code)).length}  (safe to refresh)`);
  say(`  edited by a human ${edited.length}${FORCE ? "  — OVERWRITTEN (--force)" : "  — skipped"}`);
  say(``);

  if (!WRITE) {
    say(`Nothing written.`);
    flush();
    return;
  }
  const { error } = await db.from("product_images").upsert(writable, { onConflict: "erp_code" });
  if (error) {
    say(`WRITE FAILED: ${error.message}`);
    flush();
    throw new Error(error.message);
  }

  // PRUNE WHAT THIS LOADER NO LONGER PRODUCES, the way erp-mirror does. An
  // upsert alone cannot unsay something: the first run of this loader wrote 33
  // `sole` rows that a bug had invented — the ERP map it built carried no names,
  // so getRange formed no ranges and every container looked uncovered — and
  // fixing the bug would have left all 33 sitting in the table, putting a raw
  // white-box photograph behind the ERP's on pages that were already correct.
  // Rows a human has edited are never pruned; they are not ours to delete.
  const wanted = new Set(rows.map((r) => r.erp_code));
  const stale = (existing ?? [])
    .filter((r) => String(r.updated_by ?? "") === LOADER && !wanted.has(String(r.erp_code)))
    .map((r) => String(r.erp_code));
  if (stale.length) {
    const { error: delErr } = await db.from("product_images").delete().in("erp_code", stale);
    if (delErr) {
      say(`${writable.length} rows written, but PRUNE FAILED: ${delErr.message}`);
      flush();
      throw new Error(delErr.message);
    }
  }
  say(`${writable.length} rows written, ${stale.length} stale rows pruned.`);
  flush();
}, 300_000);
