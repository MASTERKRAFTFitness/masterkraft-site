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

// Literal "brand:SKU": "/path" pairs.
const pins = [...block.matchAll(/"([a-z0-9-]+):([A-Z0-9]+)"\s*:\s*"([^"]+)"/g)]
  .map((m) => ({ brand: m[1], sku: m[2], path: m[3] }));

// AND THE SPREADS. IMAGE_OVERRIDES is not a flat literal: it spreads
// M_KETTLEBELL_PINS and FERNWOOD_KETTLEBELL_PINS, each built as a cross product
// of a <NAME>_BRANDS array with a <NAME>_PHOTOS map. Reading only the literal
// pairs missed all 18 Fernwood kettlebell entries - nine re-liveried renders
// across two brands - and the loader reported a confident 117 while being
// wrong. Resolve each spread from those two constants.
const spreads = [...block.matchAll(/\.\.\.([A-Z_][A-Z0-9_]*)/g)].map((m) => m[1]);
for (const name of spreads) {
  const stem = name.replace(/_PINS$/, "");
  const brandsSrc = ts.match(new RegExp(`const ${stem}_BRANDS\\s*=\\s*\\[(.*?)\\]`, "s"));
  const photosSrc = ts.match(new RegExp(`const ${stem}_PHOTOS[^=]*=\\s*\\{(.*?)\\n\\};`, "s"));
  // Loud, not silent: an unrecognised spread means pins are being missed, and a
  // quietly short count is exactly the failure this replaces.
  if (!brandsSrc || !photosSrc) {
    throw new Error(`IMAGE_OVERRIDES spreads ...${name}, which this loader cannot resolve. ` +
      `Expected ${stem}_BRANDS and ${stem}_PHOTOS in brands.ts. Fix the loader before trusting its counts.`);
  }
  const brands = [...brandsSrc[1].matchAll(/"([a-z0-9-]+)"/g)].map((m) => m[1]);
  const photos = [...photosSrc[1].matchAll(/([A-Z0-9]+)\s*:\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]);
  for (const b of brands) for (const [sku, path] of photos) pins.push({ brand: b, sku, path });
}

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

// --- 3. brand-images.json, the manifest brandImage() actually resolves -------
//
// The third and largest source, and the one whose absence made the first run of
// this loader wrong. A file reaches a catalogue by one of three routes, not one:
// a pin, this manifest, or the Dropbox scan. Loading only pins and the scan left
// 77 files sitting in public/brand-images/fernwood/ with no row at all -
// FWBBFUR01-08, the MMDBUR dumbbells, the MAACU apparel mockups - several of
// them Fernwood artwork filed under M-coded names, which is precisely the trap
// that makes a filename-driven guess unsafe.
//
// These rows carry public_path and no dropbox_path: the manifest records what
// has been imported into the repo, not what Dropbox holds.
const manifest = JSON.parse(readFileSync(CAT + "/src/data/brand-images.json", "utf8"));
const claimed = new Set([...pinRows, ...kept.filter((r) => r.is_primary)]
  .filter((r) => r.sku).map((r) => `${r.brand}:${r.sku}`));
const seen = new Set([...kept, ...pinRows].map((r) => `${r.brand}|${r.category}|${r.file_name}`));

const manifestRows = [];
let unfiled = 0;
for (const [key, entries] of Object.entries(manifest)) {
  const brand = key === "_shared" ? "shared" : key;
  for (const [sku, path] of Object.entries(entries)) {
    const file = basename(path);
    // The manifest has no category; take the product's own where the catalogue
    // lists it. "Unfiled" is honest for a shared shot or a SKU this brand does
    // not stock - it is a real state, not a placeholder to tidy away later.
    const category = catOf.get(`${brand}:${sku}`) ?? catOf.get(`${key}:${sku}`) ?? "Unfiled";
    if (category === "Unfiled") unfiled++;
    const k = `${brand}|${category}|${file}`;
    if (seen.has(k)) continue;
    seen.add(k);
    manifestRows.push(row({
      brand, category, file_name: file,
      // brand-images.json MIXES TWO KINDS OF VALUE. Most entries are repo paths
      // like /brand-images/fernwood/X.png, but the Unleashed image harvest put
      // absolute https://unlappcdn.unleashedsoftware.com/... URLs in the same
      // map. Checking the filesystem for those called 890 perfectly renderable
      // images "absent". public_path is where a browser gets the file, remote
      // or local; only a repo path that is genuinely not on disk is null.
      dropbox_path: null,
      public_path: /^https?:\/\//.test(path) ? path : (existsSync(PUBLIC + path) ? path : null),
      sku, sku_stem: sku,
      is_primary: !claimed.has(`${brand}:${sku}`),
      source: "brand_images_manifest",
      notes: "SKU to file mapping resolved by brandImage().",
    }));
    if (!claimed.has(`${brand}:${sku}`)) claimed.add(`${brand}:${sku}`);
  }
}
const manifestMissing = manifestRows.filter((r) => !r.public_path).length;
const manifestRemote = manifestRows.filter((r) => r.public_path && /^https?:/.test(r.public_path)).length;

// --- 4. WHAT EACH TILE ACTUALLY RESOLVES TO -------------------------------
//
// The authoritative source, and the only one that is not a reconstruction.
// /api/internal/image-map in the catalogues app answers with the output of the
// very code that decides what renders, for all nine catalogues, cards and rungs
// alike.
//
// It exists because reimplementing that chain here was wrong in a way the other
// three sources cannot reveal. Per-SKU resolution is easy to mirror; a GROUPED
// CARD is not. A ladder's tile takes its photo from a pin, or from whichever
// rung first has one, so FMDEHG01 shows MMDEHG06.png and FWWPOU08 shows
// MWWPOU14.jpg. A spot check put 7 of 18 group cards wrong.
//
// These rows take is_primary for their (brand, sku) and everything else stands
// down, so catalogue_selection_v answers "what does this tile show" with the
// app's own answer rather than this loader's opinion of it.
const MAP_URL = process.env.IMAGE_MAP_URL ?? "http://localhost:3200/api/internal/image-map";
let resolvedRows = [];
try {
  const r = await fetch(MAP_URL);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  const { rows: live } = await r.json();
  for (const it of live) {
    const url = it.imageUrl;
    resolvedRows.push(row({
      brand: it.brand, category: it.category,
      file_name: url ? basename(url.split("?")[0]) : "(none)",
      dropbox_path: null, public_path: url,
      sku: it.sku, sku_stem: it.sku, is_primary: true,
      source: "resolved",
      notes: (it.grouped ? "Grouped card. " : "Ladder rung, absorbed into a card. ")
        + (url ? "" : "No image resolves; renders Photography pending."),
    }));
  }
} catch (e) {
  throw new Error(`Could not read ${MAP_URL} (${e.message}). Start the catalogues dev ` +
    `server, or set IMAGE_MAP_URL. Refusing to write a mirror rebuilt from ` +
    `reconstruction alone - that is what got grouped cards wrong.`);
}

// Everything else stands down for any (brand, sku) the app has answered for,
// and loses any duplicate of a resolved row's exact identity.
const resolvedSku = new Set(resolvedRows.map((r) => `${r.brand}:${r.sku}`));
const resolvedKey = new Set(resolvedRows.map((r) => `${r.brand}|${r.category}|${r.file_name}`));
const standDown = (rs) => rs.filter((r) => !resolvedKey.has(`${r.brand}|${r.category}|${r.file_name}`))
  .map((r) => (r.sku && resolvedSku.has(`${r.brand}:${r.sku}`) ? { ...r, is_primary: false } : r));

const all = [...standDown(kept), ...standDown(pinRows), ...standDown(manifestRows), ...resolvedRows];
const summary = [
  `dropbox scan rows : ${scanRows.length}  (from ${there.SUPABASE_URL ?? there.NEXT_PUBLIC_SUPABASE_URL})`,
  `pins found        : ${pins.length} entries (${spreads.length} spreads resolved), ${pinRows.length} placed`,
  `  unplaced        : ${unplaced.length}${unplaced.length ? " -> " + unplaced.join(", ") : ""}`,
  `scan tiles demoted: ${demoted.length}`,
  `scan rows replaced: ${displaced} (same brand+category+file_name as a pin)`,
  `manifest rows     : ${manifestRows.length}  (${unfiled} with no category in any catalogue JSON)`,
  `  remote (ERP CDN) : ${manifestRemote}`,
  `  file absent      : ${manifestMissing}`,
  `resolved rows     : ${resolvedRows.length}  (${resolvedRows.filter((r) => !r.public_path).length} render blank)`,
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
