// Push masterkraft-catalogues' product-details.json into product_content.
//
//   npm run load:details         report what WOULD change, write nothing
//   npm run load:details:write   actually write
//
// WHY THIS EXISTS. The copy lives in two places and neither is a superset of
// the other in the way you would guess. Measured 2026-09-23:
//   product_content        1,302 codes
//   product-details.json   1,078 codes, a STRICT SUBSET - nothing is only in
//                          the file
// so on codes the mirror is ahead by 224 (70 N, 49 M, 44 F, 28 G, 26 J, 6 S,
// 1 O). But on the 1,078 they share the FILE is richer for 961 of them, for one
// reason: it carries Width / Height / Depth / Length as open label/value pairs
// and product_content had no column for any of them. 20260923_product_content_
// dimensions.sql adds those four, plus specs_extra for anything unmapped, which
// is what makes this load lossless rather than lossy in a way nobody would see.
//
// REPORTS BY DEFAULT, like every other write path in this repo. content.load.ts
// gives the reason: the Unleashed attribute import aborted at row 12 of 328 and
// left a partial write with nothing in the UI to show it.
//
// IT DOES NOT OVERWRITE A NON-EMPTY FIELD unless --force. The mirror is edited
// by hand and by the site; the file is a different lineage. Filling a blank is
// additive and safe, replacing prose someone wrote is not, so by default this
// only fills blanks and reports every collision it declined to make.
//
// CASE VARIANTS ARE REAL. The file carries both "Net weight" (733) and "Net
// Weight" (277), likewise Gross. Labels are matched case-insensitively; a
// literal match would have silently routed a third of the weights to overflow.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.env.DETAILS_LOAD_WRITE === "true";
const FORCE = process.env.DETAILS_LOAD_FORCE === "true";
const SRC = process.env.HOME + "/Desktop/masterkraft-catalogues/src/data/product-details.json";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// label (lower-cased) -> product_content column
const COLUMN = {
  "colour": "colour", "color": "colour",
  "material": "material",
  "warranty": "warranty",
  "assembled size": "assembled_size",
  "net weight": "net_weight",
  "gross weight": "gross_weight",
  "packing size": "packing_size",
  "width": "width", "height": "height", "depth": "depth", "length": "length",
};

const local = JSON.parse(readFileSync(SRC, "utf8"));

const rows = [];
let from = 0;
for (;;) {
  const { data, error } = await sb.from("product_content").select("*").range(from, from + 999);
  if (error) throw error;
  rows.push(...data);
  if (data.length < 1000) break;
  from += 1000;
}
const db = new Map(rows.map((r) => [r.erp_code.toUpperCase(), r]));

const fills = [];     // blank in the mirror, present in the file
const clashes = [];   // both present and different
const inserts = [];   // not in the mirror at all
let unmapped = 0;

for (const [rawCode, v] of Object.entries(local)) {
  const code = rawCode.toUpperCase();
  const cur = db.get(code);
  const next = {};
  const extra = {};

  if ((v.overview || "").trim()) next.overview = v.overview.trim();
  if ((v.features || []).length) next.features = v.features;
  for (const s of v.specs || []) {
    const col = COLUMN[(s.label || "").trim().toLowerCase()];
    const val = (s.value ?? "").toString().trim();
    if (!val) continue;
    if (col) next[col] = val;
    else { extra[s.label.trim()] = val; unmapped++; }
  }
  if (Object.keys(extra).length) next.specs_extra = extra;

  // A code the mirror has never seen. Measured 2026-09-23 this is zero - the
  // file is a strict subset - but if it ever fires it must be an INSERT of a
  // complete row, not a patch, for the reason in the write block below.
  if (!cur) { inserts.push({ erp_code: code, features: next.features ?? [], ...next, __insert: true }); continue; }

  const patch = {};
  for (const [k, val] of Object.entries(next)) {
    const has = Array.isArray(cur[k]) ? cur[k].length > 0 : cur[k] !== null && cur[k] !== undefined && String(cur[k]).trim() !== "";
    const same = JSON.stringify(cur[k]) === JSON.stringify(val);
    if (same) continue;
    if (!has) { patch[k] = val; fills.push(`${code}.${k}`); }
    else { clashes.push(`${code}.${k}`); if (FORCE) patch[k] = val; }
  }
  if (Object.keys(patch).length) patch.erp_code = code;
  if (Object.keys(patch).length > 1) inserts.push(patch);
}

const summary = [
  `source          : ${SRC}`,
  `file codes      : ${Object.keys(local).length}`,
  `mirror codes    : ${db.size}`,
  `rows to write   : ${inserts.length}`,
  `  blank fills   : ${fills.length}`,
  `  collisions    : ${clashes.length} ${FORCE ? "(OVERWRITTEN - force)" : "(left alone; --force to take the file's)"}`,
  `unmapped specs  : ${unmapped} -> specs_extra`,
  `mode            : ${WRITE ? "WRITE" : "report only"}`,
].join("\n");
console.log(summary);
if (clashes.length) console.log(`  first collisions: ${clashes.slice(0, 8).join(", ")}`);

// PER-ROW UPDATE, NEVER A BATCH UPSERT. This cost 315 overviews on 2026-09-23
// before it was caught and restored.
//
// supabase-js .upsert(rows) hands PostgREST an array, and PostgREST builds ONE
// insert statement from the UNION of every key across that array. A row that
// omits a key is not "left alone": the key is in the column list, so the row
// serialises it as NULL, and ON CONFLICT DO UPDATE writes that NULL over a
// perfectly good value. Sending patches of different shapes in one call - which
// is exactly what "only write the fields that changed" produces - therefore
// wipes every field a given row did not happen to mention.
//
// It was compounded by skipping fields that already MATCHED: those were left
// out of the patch too, so identical values were nulled along with the rest.
//
// An UPDATE per row names only that row's columns and cannot do this. It is
// slower and worth it. If a batch is ever needed, send COMPLETE row objects
// with every column present, never patches.
if (WRITE && inserts.length) {
  let n = 0;
  for (const patch of inserts) {
    const { erp_code, ...fields } = patch;
    if (!Object.keys(fields).length) continue;
    const { error } = await sb.from("product_content").update(fields).eq("erp_code", erp_code);
    if (error) throw error;
    if (++n % 100 === 0) process.stdout.write(`updated ${n}/${inserts.length}\r`);
  }
  const { count } = await sb.from("product_content").select("*", { count: "exact", head: true });
  console.log(`\ndone. ${n} rows updated; product_content holds ${count} rows`);
}

mkdirSync("reports", { recursive: true });
writeFileSync("reports/catalogue-details-load.md",
  `# catalogue details -> product_content\n\n\`\`\`\n${summary}\n\`\`\`\n\n` +
  `## Collisions left alone (${clashes.length})\n\n${clashes.map((c) => `- ${c}`).join("\n")}\n`);
