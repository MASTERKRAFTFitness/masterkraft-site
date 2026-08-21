#!/usr/bin/env node
// Fixes the 89 products whose Warranty renders as a bare number ("12" instead
// of "12 months"), by writing the full value into the discrete ACF `warranty`
// field in WooCommerce.
//
//   node scripts/fix-warranty-units.mjs            dry run, writes nothing
//   node scripts/fix-warranty-units.mjs --apply    writes to the LIVE store
//
// SCOPE. Only the `unit_missing` rows from reports/wc-spec-gaps.csv. Those are
// unambiguous: the legacy blob already spells the unit out and its number
// matches the discrete field, so the correct value is known rather than guessed.
// The 28 `conflict` rows are deliberately NOT touched -- there the two sources
// disagree on the value itself (MCTMSP02 is either 480kg or 180kg) and only a
// person can say which is right.
//
// SAFETY. Every product is re-read from the live store immediately before it is
// written, and skipped unless its warranty is still exactly the bare number the
// report saw. That means an edit made in WordPress since the snapshot was built
// is never silently clobbered. Previous values are written to a rollback file
// before anything changes.

import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CSV = join(ROOT, "reports/wc-spec-gaps.csv");
const SNAPSHOT = join(ROOT, "src/data/catalogue.json");
const ROLLBACK = join(ROOT, "reports/warranty-fix-rollback.json");

const APPLY = process.argv.includes("--apply");

function env(name) {
  if (process.env[name]) return process.env[name];
  for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
    const eq = line.indexOf("=");
    if (eq > 0 && line.slice(0, eq).trim() === name) {
      return line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    }
  }
  throw new Error(`Missing ${name}`);
}

const BASE = env("WC_STORE_URL").replace(/\/$/, "") + "/wp-json/wc/v3";
const AUTH = "Basic " + Buffer.from(`${env("WC_CONSUMER_KEY")}:${env("WC_CONSUMER_SECRET")}`).toString("base64");

async function wc(path, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { Authorization: AUTH, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`WooCommerce ${res.status} on ${path}: ${JSON.stringify(body).slice(0, 200)}`);
  return body;
}

// Minimal RFC4180 reader -- the report quotes any field containing a comma.
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift();
  return rows.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

const metaOf = (p, key) => {
  const v = (p.meta_data ?? []).find((m) => m.key === key)?.value;
  return typeof v === "string" ? v.trim() : v != null ? String(v) : "";
};

const products = JSON.parse(readFileSync(SNAPSHOT, "utf8")).products;
const idBySku = new Map(products.filter((p) => p.sku).map((p) => [p.sku, p.id]));

const targets = parseCsv(readFileSync(CSV, "utf8"))
  .filter((r) => r.issue === "unit_missing" && r.field === "Warranty")
  .map((r) => ({ sku: r.sku, product: r.product, id: idBySku.get(r.sku), was: r.discrete_value, to: r.blob_value }));

const unresolved = targets.filter((t) => !t.id);
if (unresolved.length) {
  console.error(`Cannot resolve ${unresolved.length} SKUs to product ids: ${unresolved.map((t) => t.sku).join(", ")}`);
  process.exit(1);
}

console.log(`${targets.length} products to fix. Mode: ${APPLY ? "APPLY (writes to the live store)" : "DRY RUN (writes nothing)"}\n`);

const rollback = [];
let changed = 0, skipped = 0, failed = 0;

for (const [i, t] of targets.entries()) {
  const n = `[${String(i + 1).padStart(3)}/${targets.length}]`;
  let live;
  try {
    live = await wc(`/products/${t.id}?_fields=id,sku,meta_data`);
  } catch (e) {
    console.log(`${n} ${t.sku.padEnd(12)} READ FAILED  ${e.message.slice(0, 80)}`);
    failed++;
    continue;
  }
  const current = metaOf(live, "warranty");

  // The report saw a bare number. If the store no longer holds exactly that,
  // someone has edited it since -- leave it alone rather than overwrite them.
  if (current !== t.was) {
    console.log(`${n} ${t.sku.padEnd(12)} SKIP  store now has "${current}", report saw "${t.was}"`);
    skipped++;
    continue;
  }
  if (!APPLY) {
    console.log(`${n} ${t.sku.padEnd(12)} "${current}" -> "${t.to}"   ${t.product.slice(0, 40)}`);
    changed++;
    continue;
  }
  try {
    // Recorded BEFORE the write so a crash mid-run is still recoverable, but
    // marked pending and pruned below if the write did not land -- a rollback
    // file listing changes that never happened is worse than none at all.
    const entry = { id: t.id, sku: t.sku, key: "warranty", previous: current, applied: t.to, status: "pending" };
    rollback.push(entry);
    writeFileSync(ROLLBACK, JSON.stringify({ generated: "fix-warranty-units", entries: rollback }, null, 2) + "\n");
    await wc(`/products/${t.id}`, { method: "PUT", body: JSON.stringify({ meta_data: [{ key: "warranty", value: t.to }] }) });
    const after = metaOf(await wc(`/products/${t.id}?_fields=id,meta_data`), "warranty");
    if (after !== t.to) throw new Error(`verify failed, store now reads "${after}"`);
    entry.status = "applied";
    console.log(`${n} ${t.sku.padEnd(12)} OK    "${current}" -> "${after}"`);
    changed++;
  } catch (e) {
    console.log(`${n} ${t.sku.padEnd(12)} FAILED  ${e.message.slice(0, 110)}`);
    failed++;
  }
}

console.log(`\n${APPLY ? "Applied" : "Would change"}: ${changed}   Skipped: ${skipped}   Failed: ${failed}`);
if (APPLY) {
  const landed = rollback.filter((e) => e.status === "applied");
  if (landed.length) {
    writeFileSync(ROLLBACK, JSON.stringify({ generated: "fix-warranty-units", entries: landed }, null, 2) + "\n");
    console.log(`Rollback written to ${ROLLBACK} (${landed.length} entries).`);
  } else {
    rmSync(ROLLBACK, { force: true });
    console.log("Nothing landed, so no rollback file was kept.");
  }
  if (landed.length) {
    console.log("Re-run `npm run build:catalogue` to pull the changes into the snapshot, then redeploy.");
  }
  if (failed) {
    console.log(
      `\n${failed} write(s) failed. A 401 "does not have write permissions" means the\n` +
        "WooCommerce key is read-only: create one with Read/Write under WP Admin ->\n" +
        "WooCommerce -> Settings -> Advanced -> REST API, then update WC_CONSUMER_KEY\n" +
        "and WC_CONSUMER_SECRET. Nothing was changed in the store."
    );
  }
} else {
  console.log("Nothing was written. Re-run with --apply to write to the live store.");
}
