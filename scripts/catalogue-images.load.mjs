// Mirror the catalogue's image seam into this project's catalogue_images.
//
//   npm run load:images         report what WOULD change, write nothing
//   npm run load:images:write   actually write
//
// TWO SOURCES, and the second is the reason this exists:
//
//   1. The Dropbox scan, 1,354 rows, read straight out of the Catalogues
//      project (pmydkwszkgjnolrcnenh) where it was seeded on 2026-09-23.
//   2. IMAGE_OVERRIDES in masterkraft-catalogues/src/lib/catalogue/brands.ts -
//      the locally generated re-livery renders. These are invisible to any
//      Dropbox scan by construction: they are written into
//      public/brand-images/<brand>/ and deliberately kept OUT of Dropbox and
//      out of brand-images.json, because import-brand-images.mjs rebuilds that
//      manifest wholesale from Dropbox and would wipe them.
//
// A PIN WINS, and that is the only overwrite this loader performs. It takes
// is_primary for its (brand, sku) and demotes whatever Dropbox row held it -
// which is correct: the pin exists precisely because the Dropbox file carries
// the wrong livery. Every demotion is listed in the report.
//
// WRITES IN COMPLETE ROWS, NEVER PATCHES. See the note in
// catalogue-details.load.mjs: a PostgREST batch built from objects of differing
// shape nulls every key a given row omits, and it cost 315 overviews on
// 2026-09-23. Every object below is built from the same template.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { basename } from "node:path";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.env.IMAGES_LOAD_WRITE === "true";
const CAT = process.env.HOME + "/Desktop/masterkraft-catalogues";

const readEnv = (p) => Object.fromEntries(
  readFileSync(p, "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }));

const here = readEnv(".env.local");
const there = readEnv(CAT + "/.env.local");
const dst = createClient(here.SUPABASE_URL, here.SUPABASE_SERVICE_ROLE_KEY);
// The catalogues app names its URL NEXT_PUBLIC_SUPABASE_URL; this one does not.
const src = createClient(
  there.SUPABASE_URL ?? there.NEXT_PUBLIC_SUPABASE_URL,
  there.SUPABASE_SERVICE_ROLE_KEY,
);

// --- 1. the Dropbox scan, from the other project ---------------------------
const scan = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await src.from("catalogue_images").select("*").range(from, from + 999);
  if (error) throw error;
  scan.push(...data);
  if (data.length < 1000) break;
}

// --- 2. the pins, and the category each product sits in ---------------------
const ts = readFileSync(CAT + "/src/lib/catalogue/brands.ts", "utf8");
const block = ts.match(/const IMAGE_OVERRIDES[^=]*=\s*\{(.*?)\n\};/s)[1];
const pins = [...block.matchAll(/"([a-z0-9-]+):([A-Z0-9]+)"\s*:\s*"([^"]+)"/g)]
  .map((m) => ({ brand: m[1], sku: m[2], path: m[3] }));

// category comes from the brand's own catalogue JSON, which is where the
// product actually lives; the pin only knows a SKU and a file.
const catOf = new Map();
for (const b of ["fernwood", "fernwood-hq", "golds", "jetts", "jetts-hq", "revo", "snap", "snap-hq", "strong"]) {
  let j; try { j = JSON.parse(readFileSync(`${CAT}/src/data/${b}.json`, "utf8")); } catch { continue; }
  for (const c of j.categories) for (const i of c.items) catOf.set(`${b}:${i.sku.toUpperCase()}`, c.name);
}

const TEMPLATE = {
  brand: null, category: null, file_name: null, dropbox_path: null, public_path: null,
  sku_stem: null, sku: null, view_suffix: null, is_primary: false,
  include_in_catalogue: true, sort_order: null, needs_review: false, notes: null, source: null,
};
const row = (o) => ({ ...TEMPLATE, ...o });

// public_path is set ONLY where the file is really there to be served.
//
// A dropbox_path is not a URL. Measured 2026-09-23: of the 1,354 scanned files
// just 271 have actually been imported into masterkraft-catalogues/public/
// brand-images/ - the other 1,083 exist in Dropbox and nowhere a browser can
// reach. Leaving public_path null for those is the point: it makes "in the
// library" and "renderable today" two different, countable things, so wiring a
// build to this view cannot silently blank a thousand tiles.
const PUBLIC = CAT + "/public";
const servable = (brand, file) => {
  for (const dir of [`/brand-images/${brand}/`, "/brand-images/_shared/"]) {
    if (existsSync(PUBLIC + dir + file)) return dir + file;
  }
  return null;
};

const scanRows = scan.map((r) => row({
  brand: r.brand, category: r.category, file_name: r.file_name,
  dropbox_path: r.dropbox_path, public_path: servable(r.brand, r.file_name),
  sku_stem: r.sku_stem, sku: r.sku, view_suffix: r.view_suffix,
  is_primary: r.is_primary, include_in_catalogue: r.include_in_catalogue,
  sort_order: r.sort_order, needs_review: r.needs_review, notes: r.notes, source: r.source,
}));

const unplaced = [];
const pinRows = [];
for (const p of pins) {
  const category = catOf.get(`${p.brand}:${p.sku}`);
  if (!category) { unplaced.push(`${p.brand}:${p.sku}`); continue; }
  pinRows.push(row({
    brand: p.brand, category, file_name: basename(p.path),
    dropbox_path: null, public_path: p.path,
    sku: p.sku, sku_stem: p.sku, is_primary: true,
    source: "image_override", notes: "Locally generated re-livery render; pinned in IMAGE_OVERRIDES.",
  }));
}

// A pin takes the tile, so any scan row that claimed it for the same
// (brand, sku) has to stand down or the partial unique index rejects the load.
const pinned = new Set(pinRows.map((r) => `${r.brand}:${r.sku}`));
const demoted = [];
for (const r of scanRows) {
  if (r.is_primary && r.sku && pinned.has(`${r.brand}:${r.sku}`)) {
    r.is_primary = false;
    demoted.push(`${r.brand}:${r.sku} (${r.file_name})`);
  }
}

// The scan's unique key is (brand, category, file_name); a pin can collide with
// a scan row of the same name in the same folder. The pin wins outright.
const pinKey = new Set(pinRows.map((r) => `${r.brand}|${r.category}|${r.file_name}`));
const kept = scanRows.filter((r) => !pinKey.has(`${r.brand}|${r.category}|${r.file_name}`));
const displaced = scanRows.length - kept.length;

const all = [...kept, ...pinRows];
const summary = [
  `dropbox scan rows : ${scanRows.length}  (from ${there.SUPABASE_URL ?? there.NEXT_PUBLIC_SUPABASE_URL})`,
  `pins found        : ${pins.length} entries, ${pinRows.length} placed`,
  `  unplaced        : ${unplaced.length}${unplaced.length ? " -> " + unplaced.join(", ") : ""}`,
  `scan tiles demoted: ${demoted.length}`,
  `scan rows replaced: ${displaced} (same brand+category+file_name as a pin)`,
  `TOTAL to write    : ${all.length}`,
  `renderable now    : ${all.filter((r) => r.public_path).length}  (the rest are Dropbox-only)`,
  `mode              : ${WRITE ? "WRITE" : "report only"}`,
].join("\n");
console.log(summary);
if (demoted.length) console.log("  demoted: " + demoted.slice(0, 6).join(", ") + (demoted.length > 6 ? ` … +${demoted.length - 6}` : ""));

mkdirSync("reports", { recursive: true });
writeFileSync("reports/catalogue-images-load.md",
  `# catalogue_images -> masterkraft-site\n\n\`\`\`\n${summary}\n\`\`\`\n\n` +
  `## Tiles a pin took from the Dropbox scan (${demoted.length})\n\n${demoted.map((d) => `- ${d}`).join("\n")}\n` +
  (unplaced.length ? `\n## Pins with no product in any catalogue JSON (${unplaced.length})\n\n${unplaced.map((u) => `- ${u}`).join("\n")}\n` : ""));

if (WRITE) {
  const { error: wipe } = await dst.from("catalogue_images").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (wipe) throw wipe;
  for (let i = 0; i < all.length; i += 250) {
    const { error } = await dst.from("catalogue_images").insert(all.slice(i, i + 250));
    if (error) throw error;
    process.stdout.write(`inserted ${Math.min(i + 250, all.length)}/${all.length}\r`);
  }
  const { count } = await dst.from("catalogue_images").select("*", { count: "exact", head: true });
  console.log(`\ndone. catalogue_images holds ${count} rows`);
}
