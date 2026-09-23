// Export product_content into the catalogue's own copy file.
//
//   npm run export:copy          report, write nothing
//   npm run export:copy:write    write src/data/product-copy.json
//
// THE MIRROR IS THE RICHER SOURCE, which is the whole reason this runs. The
// catalogue renders copy from src/data/product-details.json, 1,078 codes; the
// mirror holds 1,302 and reaches further still through each code's M twin.
// Measured 2026-09-23: 1,739 listed products across the nine catalogues show no
// copy at all today, and 984 of them have copy sitting in product_content.
//
// IT WRITES A SEPARATE FILE, NEVER product-details.json. That file is written by
// hand and by another session; overwriting it would put a generated export on
// top of someone's work. getProductDetails reads it FIRST and falls back here,
// so hand-written copy always wins and this only fills blanks.
//
// Specs are rebuilt in the catalogue's own label/value shape from the mirror's
// named columns, in a fixed order so the file diffs cleanly between runs.
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.argv.includes("--write");
const CAT = process.env.HOME + "/Desktop/masterkraft-catalogues";
const OUT = CAT + "/src/data/product-copy.json";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const rows = [];
for (let f = 0; ; f += 1000) {
  const { data, error } = await sb.from("product_content").select("*").range(f, f + 999);
  if (error) throw error;
  rows.push(...data);
  if (data.length < 1000) break;
}

// Order matters: this is what a product page lists top to bottom.
const SPEC = [
  ["assembled_size", "Assembled size"], ["width", "Width"], ["height", "Height"],
  ["depth", "Depth"], ["length", "Length"], ["colour", "Colour"], ["material", "Material"],
  ["net_weight", "Net weight"], ["gross_weight", "Gross weight"],
  ["packing_size", "Packing size"], ["warranty", "Warranty"],
];

const out = {};
let withOverview = 0, withFeatures = 0, withSpecs = 0;
for (const r of rows) {
  const specs = [];
  for (const [col, label] of SPEC) {
    const v = r[col];
    if (v !== null && v !== undefined && String(v).trim() !== "") specs.push({ label, value: String(v).trim() });
  }
  for (const [label, v] of Object.entries(r.specs_extra ?? {})) {
    if (v) specs.push({ label, value: String(v) });
  }
  const overview = (r.overview ?? "").trim();
  const features = (r.features ?? []).filter(Boolean);
  if (!overview && !features.length && !specs.length) continue;
  if (overview) withOverview++;
  if (features.length) withFeatures++;
  if (specs.length) withSpecs++;
  out[r.erp_code.toUpperCase()] = { overview, features, specs };
}

const keys = Object.keys(out).sort();
const sorted = Object.fromEntries(keys.map((k) => [k, out[k]]));
console.log(`product_content rows : ${rows.length}`);
console.log(`exported codes       : ${keys.length}`);
console.log(`  with an overview   : ${withOverview}`);
console.log(`  with features      : ${withFeatures}`);
console.log(`  with specs         : ${withSpecs}`);
console.log(`target               : ${OUT}`);
console.log(`mode                 : ${WRITE ? "WRITE" : "report only"}`);
if (WRITE) {
  writeFileSync(OUT, JSON.stringify(sorted, null, 1) + "\n");
  console.log("written.");
}
