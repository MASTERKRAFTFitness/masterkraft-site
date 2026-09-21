// Fill product_content and category_content from the frozen snapshot.
//
//   npm run load:content         report what WOULD change, write nothing
//   npm run load:content:write   actually write
//
// WHY IT REPORTS BY DEFAULT. Every write path in this repo is gated —
// WC_WRITE_ENABLED, UNLEASHED_WRITE_ENABLED, UNLEASHED_QUOTE_ORDERS — and this
// week gave the reason twice over: the Unleashed attribute import aborted at row
// 12 of 328 and left a partial write with nothing in the UI to show it. A loader
// that says what it will do before it does it is worth the extra command.
//
// WHY IT IMPORTS THE APP. The copy is not stored in the snapshot as prose; it is
// spread across ACF meta fields and a legacy HTML blob, and lib/spec.ts resolves
// the two into overview / features / specs at render time. Reimplementing that
// here would drift from what the product page shows. Same argument the punch
// list and the spec-gap report make.
//
// IT IS IDEMPOTENT. Upsert on the primary key, so running it twice changes
// nothing the second time. That matters because the first run will not be the
// last: the copy gets edited in Supabase afterwards, and re-running this must
// not silently overwrite a human's edit with the frozen original — see the
// --force note below.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { allProducts, categoryById } from "@/lib/catalogue";
import { categories } from "@/lib/categories";
import { parseProductDetail, isObsolete, type WcProduct } from "@/lib/woocommerce";

const WRITE = process.env.CONTENT_LOAD_WRITE === "true";
// Re-loading over rows a human has edited since the last run. Off by default:
// the snapshot is frozen, so after the first load it is the OLDER copy, and
// overwriting an edit with it is a regression that leaves no trace.
const FORCE = process.env.CONTENT_LOAD_FORCE === "true";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [
      l.slice(0, l.indexOf("=")).trim(),
      l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, ""),
    ])
);

type ProductRow = {
  erp_code: string;
  slug: string;
  overview_short: string | null;
  overview: string | null;
  features: string[];
  package_inclusions: string | null;
  // The spec table. See 20260921_product_spec_fields.sql for why these live
  // here rather than as Unleashed attributes: the API cannot write them, cannot
  // read them back, and caps a value at 50 characters where 19 warranties are
  // longer. Resolved values — discrete ACF field first, legacy blob second —
  // which is what the page shows today.
  assembled_size: string | null;
  colour: string | null;
  material: string | null;
  net_weight: string | null;
  gross_weight: string | null;
  packing_size: string | null;
  warranty: string | null;
  updated_by: string;
};

// The seven labels lib/spec.ts resolves, mapped to their columns. Keyed by the
// label the parser emits, so a rename there fails loudly here rather than
// silently writing nulls.
const SPEC_COLUMNS = {
  "Assembled size": "assembled_size",
  Colour: "colour",
  Material: "material",
  "Net weight": "net_weight",
  "Gross weight": "gross_weight",
  "Packing size": "packing_size",
  Warranty: "warranty",
} as const satisfies Record<string, keyof ProductRow>;

type CategoryRow = {
  group_name: string;
  slug: string;
  blurb: string | null;
  description: string | null;
  sort_order: number | null;
  updated_by: string;
};

const LOADER = "content.load";
const LOG = "reports/content-load.md";

// vitest captures stdout under this config, so the run writes its account to a
// file the way every other script here does. It is also the more useful shape:
// a dry run is a document you can read before deciding to write.
const lines: string[] = [];
const say = (s = "") => {
  lines.push(s);
  console.log(s);
};
const flush = () => {
  mkdirSync("reports", { recursive: true });
  writeFileSync(LOG, lines.join("\n") + "\n");
};

function productRows(): ProductRow[] {
  const rows: ProductRow[] = [];
  // NOT filterListable: the portal brands' copy is wanted too. They are live
  // products sold through the franchisee portals and the catalogues, just never
  // listed on masterkraft.com — see the allowlist note in lib/woocommerce.
  for (const p of allProducts() as WcProduct[]) {
    const code = (p.sku ?? "").trim().toUpperCase();
    if (!code || isObsolete(p)) continue;
    const d = parseProductDetail(p);
    const features = d.features ?? [];
    const specs = d.specs ?? [];
    // A product with a spec table but no prose is still worth a row — that is
    // most of the ex-display and portal stock. Before the spec columns existed
    // this check was prose-only and skipped them.
    const has =
      d.overviewShort || d.overviewDescription || features.length || d.packageInclusions || specs.length;
    if (!has) continue;
    const spec = (label: keyof typeof SPEC_COLUMNS) =>
      specs.find((sp) => sp.label === label)?.value.trim() || null;
    rows.push({
      erp_code: code,
      slug: p.slug,
      overview_short: d.overviewShort?.trim() || null,
      overview: d.overviewDescription?.trim() || null,
      features,
      package_inclusions:
        d.packageInclusions?.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || null,
      assembled_size: spec("Assembled size"),
      colour: spec("Colour"),
      material: spec("Material"),
      net_weight: spec("Net weight"),
      gross_weight: spec("Gross weight"),
      packing_size: spec("Packing size"),
      warranty: spec("Warranty"),
      updated_by: LOADER,
    });
  }
  return rows;
}

function categoryRows(): CategoryRow[] {
  const rows: CategoryRow[] = [];
  categories.forEach((c, i) => {
    // Clearance has no erpGroup — it is the A-prefixed ex-display carve-out and
    // has no ERP group to key on. Skipped rather than given a fake key.
    if (!c.erpGroup) return;
    rows.push({
      group_name: c.erpGroup,
      // Hand-written, never derived. "Rigs & Racks" lives at rigs-racks.
      slug: c.slug,
      blurb: c.blurb?.trim() || null,
      // The old store's SEO body, which exists nowhere else.
      description: (c.wcId ? categoryById(c.wcId)?.description : "")?.trim() || null,
      sort_order: i,
      updated_by: LOADER,
    });
  });
  return rows;
}

it("load content", { timeout: 300_000 }, async () => {
  const products = productRows();
  const cats = categoryRows();

  const withDescription = cats.filter((c) => c.description).length;
  say(
    `product_content   ${products.length} rows ` +
      `(${products.filter((p) => p.overview).length} with an overview, ` +
      `${products.filter((p) => p.features.length).length} with features)`
  );
  // Per-field spec coverage, because "all of it" is the goal and the gap is the
  // thing worth watching run to run. A field at 0 means the parser stopped
  // resolving that label, not that the catalogue lost it.
  const specCoverage = Object.entries(SPEC_COLUMNS)
    .map(([label, col]) => `${label} ${products.filter((p) => p[col]).length}`)
    .join(", ");
  say(`  spec fields       ${specCoverage}`);
  say(
    `  no spec at all    ${products.filter((p) => !Object.values(SPEC_COLUMNS).some((c) => p[c])).length}`
  );
  say(
    `category_content  ${cats.length} rows (${withDescription} carry the old store's description)`
  );

  const url = env.SUPABASE_URL || process.env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    say("");
    say("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — nothing to write to.");
    flush();
    return;
  }

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // What is already there, so the report can say CHANGE rather than just COUNT,
  // and so an edited row is left alone.
  const existing = new Map<string, string | null>();
  const { data: have, error: readErr } = await db
    .from("product_content")
    .select("erp_code, updated_by");
  if (readErr) {
    say("");
    say(`Could not read product_content: ${readErr.message}`);
    say("If the table does not exist, the migrations have not been applied yet.");
    flush();
    return;
  }
  for (const r of have ?? []) existing.set(r.erp_code as string, r.updated_by as string | null);

  const edited = products.filter(
    (p) => existing.has(p.erp_code) && existing.get(p.erp_code) !== LOADER
  );
  const fresh = products.filter((p) => !existing.has(p.erp_code));
  const mine = products.length - edited.length - fresh.length;

  say("");
  say(`  new rows          ${fresh.length}`);
  say(`  loader-owned      ${mine}  (safe to refresh)`);
  say(`  edited by a human ${edited.length}  ${FORCE ? "— WILL BE OVERWRITTEN (CONTENT_LOAD_FORCE)" : "— skipped"}`);

  const toWrite = FORCE ? products : products.filter((p) => !edited.includes(p));

  if (!WRITE) {
    say("");
    say("DRY RUN. Nothing written. Set CONTENT_LOAD_WRITE=true to apply.");
    flush();
    return;
  }

  // Chunked: a single 335-row upsert is one statement, but the categories and
  // products are separate tables and a failure in one should not be reported as
  // a failure in both.
  const CHUNK = 100;
  let wrote = 0;
  for (let i = 0; i < toWrite.length; i += CHUNK) {
    const slice = toWrite.slice(i, i + CHUNK).map((r) => ({ ...r, updated_at: new Date().toISOString() }));
    const { error } = await db.from("product_content").upsert(slice, { onConflict: "erp_code" });
    if (error) {
      say("");
      say(`product_content failed at row ${i}: ${error.message}`);
      say(`${wrote} rows written before the failure — re-run to continue, it is idempotent.`);
      flush();
      return;
    }
    wrote += slice.length;
  }
  say("");
  say(`product_content   ${wrote} rows written`);

  const { error: catErr } = await db
    .from("category_content")
    .upsert(cats.map((r) => ({ ...r, updated_at: new Date().toISOString() })), {
      onConflict: "group_name",
    });
  if (catErr) {
    say(`category_content failed: ${catErr.message}`);
    flush();
    return;
  }
  say(`category_content  ${cats.length} rows written`);
  flush();
});
