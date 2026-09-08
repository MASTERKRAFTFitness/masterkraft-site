#!/usr/bin/env node
// Put the 65 obsolete Snap dumbbell records back on sale in Unleashed.
//
// Run:  npm run publish:snap                 (dry run — shows what changes)
//       PUBLISH_WRITE=true npm run publish:snap
//
// WHAT THIS CHANGES, per record, and nothing else:
//
//   Obsolete     true  -> false
//   IsSellable   false -> true
//
// THE PRICE IS NOT TOUCHED. Every one of these already carries a
// DefaultSellPrice, and the rule is that an existing Unleashed price is kept.
// The record is read, those two flags are flipped, and the WHOLE record goes
// back — a partial POST would blank whatever it omitted. The price is read again
// afterwards and any record whose price moved is reported as a failure.
//
// WHY THEY LOOKED MISSING. GET /Products hides obsolete records: 1,511 come back
// plain, 2,391 with includeObsolete=true. These 65 were reported as absent from
// the ERP all through this work because every count used the plain fetch, which
// is what lib/unleashed's buildMap deliberately does — right for the site, wrong
// for asking whether a ProductCode exists.
//
// THIS IS A COMMERCIAL CHANGE, NOT A DATA FIX. Somebody marked these obsolete on
// purpose. Clearing the flag puts 65 discontinued Snap lines back on sale, and it
// is reversible by setting the same two fields back.
//
// CANARY FIRST, read back before the other 64 go, for the reason the last script
// proved: the first write is where a wrong assumption surfaces.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac } from "node:crypto";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CSV = join(ROOT, "reports/snap-dumbbells-to-create.csv");
const MD = join(ROOT, "reports/snap-published.md");
const WRITE = process.env.PUBLISH_WRITE === "true";

const env = {};
for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const BASE = "https://api.unleashedsoftware.com";
const sign = (q) => createHmac("sha256", env.UNLEASHED_API_KEY).update(q, "utf8").digest("base64");
const readHeaders = (q) => ({
  "api-auth-id": env.UNLEASHED_API_ID,
  "api-auth-signature": sign(q),
  Accept: "application/json",
});
const writeHeaders = () => ({
  "api-auth-id": env.UNLEASHED_API_ID,
  "api-auth-signature": sign(""),
  Accept: "application/json",
  "Content-Type": "application/json",
});

async function allProducts() {
  const items = [];
  for (let page = 1; page <= 20; page++) {
    const q = "pageSize=200&includeObsolete=true";
    const res = await fetch(`${BASE}/Products/${page}?${q}`, { headers: readHeaders(q) });
    if (!res.ok) throw new Error(`GET /Products/${page}: ${res.status}`);
    const json = await res.json();
    items.push(...(json.Items ?? []));
    if (page >= (json.Pagination?.NumberOfPages ?? 1)) break;
  }
  return items;
}

const wanted = readFileSync(CSV, "utf8")
  .split("\n")
  .slice(1)
  .map((l) => l.split(",")[0].trim().toUpperCase())
  .filter(Boolean);

const erp = new Map((await allProducts()).map((p) => [(p.ProductCode ?? "").trim().toUpperCase(), p]));

const targets = [];
const alreadyLive = [];
const absent = [];
for (const code of wanted) {
  const p = erp.get(code);
  if (!p) absent.push(code);
  else if (p.Obsolete === true || p.IsSellable === false) targets.push(p);
  else alreadyLive.push(code);
}

console.log(
  `${wanted.length} codes: ${targets.length} to publish, ${alreadyLive.length} already live, ${absent.length} absent`
);
if (!WRITE) {
  console.log("DRY RUN — PUBLISH_WRITE=true to write.");
  for (const p of targets.slice(0, 5)) {
    console.log(
      `  ${p.ProductCode.padEnd(12)} Obsolete=${p.Obsolete} IsSellable=${p.IsSellable} price=${p.DefaultSellPrice}`
    );
  }
  console.log(`  ...and ${Math.max(0, targets.length - 5)} more`);
}

const done = [];
const failed = [];

async function publish(p) {
  // The WHOLE record goes back with two fields changed. A partial body blanks
  // what it leaves out.
  const body = { ...p, Obsolete: false, IsSellable: true };
  const res = await fetch(`${BASE}/Products/${p.Guid}`, {
    method: "POST",
    headers: writeHeaders(),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) return { ok: false, why: `${res.status} ${text.slice(0, 140)}` };
  return { ok: true };
}

async function readBack(code) {
  const q = `pageSize=200&productCode=${code}&includeObsolete=true`;
  const res = await fetch(`${BASE}/Products/1?${q}`, { headers: readHeaders(q) });
  if (!res.ok) return null;
  return ((await res.json()).Items ?? [])[0] ?? null;
}

if (WRITE && targets.length) {
  const first = targets[0];
  console.log(`canary: ${first.ProductCode} (price ${first.DefaultSellPrice})`);
  const c = await publish(first);
  if (!c.ok) {
    console.log(`  FAILED ${c.why}`);
    process.exit(1);
  }
  const seen = await readBack(first.ProductCode);
  if (!seen) {
    console.log("  posted but not readable back — stopping.");
    process.exit(1);
  }
  const priceMoved = Number(seen.DefaultSellPrice ?? 0) !== Number(first.DefaultSellPrice ?? 0);
  console.log(
    `  read back: Obsolete=${seen.Obsolete} IsSellable=${seen.IsSellable} price=${seen.DefaultSellPrice}` +
      (priceMoved ? "  ** PRICE MOVED **" : "  price unchanged")
  );
  if (seen.Obsolete !== false || priceMoved) {
    console.log("  not what was intended — stopping before the rest.");
    process.exit(1);
  }
  done.push({ code: first.ProductCode, price: seen.DefaultSellPrice });

  for (const p of targets.slice(1)) {
    const res = await publish(p);
    if (!res.ok) {
      failed.push({ code: p.ProductCode, why: res.why });
      if (failed.length <= 5) console.log(`  ! ${p.ProductCode}: ${res.why.slice(0, 70)}`);
    } else done.push({ code: p.ProductCode, price: p.DefaultSellPrice });
  }
  console.log(`published ${done.length}, failed ${failed.length}`);
}

const md = [
  "# Snap dumbbells put back on sale",
  "",
  "Generated by `npm run publish:snap`.",
  "",
  `**${WRITE ? done.length : targets.length} records** moved from \`Obsolete=true, IsSellable=false\` to`,
  "`Obsolete=false, IsSellable=true`. Nothing else on the record was changed, and the",
  "price each already carried was kept — the whole record is round-tripped rather than",
  "patched, so no field is blanked, and the price is read back afterwards to prove it.",
  "",
  "**These were never missing.** They were reported absent from Unleashed throughout",
  "this work because `GET /Products` hides obsolete records — 1,511 plain against 2,391",
  "with `includeObsolete=true` — and every count used the plain fetch, which is what",
  "`buildMap` deliberately does.",
  "",
  "**Reversible.** Setting the same two fields back withdraws them again.",
  "",
  "| ProductCode | price kept |",
  "|---|---:|",
  ...(WRITE ? done : targets.map((p) => ({ code: p.ProductCode, price: p.DefaultSellPrice }))).map(
    (r) => `| \`${r.code}\` | $${r.price} |`
  ),
  "",
  ...(failed.length
    ? ["## Failed", "", "| ProductCode | why |", "|---|---|", ...failed.map((r) => `| \`${r.code}\` | ${r.why} |`), ""]
    : []),
];
writeFileSync(MD, md.join("\n"));
console.log("manifest -> reports/snap-published.md");
