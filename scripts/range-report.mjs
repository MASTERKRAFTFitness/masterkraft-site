#!/usr/bin/env node
// What the ranges look like in the ERP, and what is wrong with them.
//
//   npm run report:ranges
//
// Ranges are grouped on the name before " - " and nothing else (see
// lib/ranges.ts). That rule is only as good as the naming, so this prints two
// things the catalogue team can act on:
//
//   ORPHANS   a name-group of one or two sitting under a stem dominated by
//             another name, sharing none of its sizes. Often a rename that was
//             not finished, in which case a size is missing from the picker on
//             the live site and the fix is one field in Unleashed. Sometimes it
//             is simply a small product that shares a stem. ADVISORY - read each
//             one, do not bulk-apply.
//
//   SPLITS    a stem holding several substantial ranges. Usually correct (a curl
//             barbell and a straight barbell really are two products), but only
//             ONE of them can have a page while pages are still routed by the
//             old WooCommerce slugs. Listed so the ones with no page are known.
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(fileURLToPath(import.meta.url)) + "/..";
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(root, ".env.local"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [
      l.slice(0, l.indexOf("=")).trim(),
      l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, ""),
    ])
);

const sign = (q) => crypto.createHmac("sha256", env.UNLEASHED_API_KEY).update(q).digest("base64");

async function fetchPage(n) {
  const q = "pageSize=200";
  const r = await fetch(`https://api.unleashedsoftware.com/Products/${n}?${q}`, {
    headers: {
      "api-auth-id": env.UNLEASHED_API_ID,
      "api-auth-signature": sign(q),
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0",
    },
  });
  if (!r.ok) throw new Error(`Unleashed ${r.status} on page ${n}`);
  return r.json();
}

const first = await fetchPage(1);
const items = [...first.Items];
for (let i = 2; i <= (first.Pagination?.NumberOfPages ?? 1); i++) {
  items.push(...(await fetchPage(i)).Items);
}

const sized = items.filter(
  (p) => p.IsSellable && !p.Obsolete && (p.ProductDescription ?? "").includes(" - ")
);
const nameOf = (p) => p.ProductDescription.slice(0, p.ProductDescription.indexOf(" - ")).trim();
const sizeOf = (p) => p.ProductDescription.slice(p.ProductDescription.indexOf(" - ") + 3).trim();
const stemOf = (c) => c.toUpperCase().replace(/[0-9]+[A-Z]?$/, "");

const byStem = new Map();
for (const p of sized) {
  const key = `${p.ProductBrand?.BrandName ?? "?"}|${stemOf(p.ProductCode)}`;
  if (!byStem.has(key)) byStem.set(key, []);
  byStem.get(key).push(p);
}

const orphans = [];
const splits = [];
for (const [key, ps] of byStem) {
  const [brand, stem] = key.split("|");
  const groups = new Map();
  for (const p of ps) {
    const n = nameOf(p);
    if (!groups.has(n)) groups.set(n, []);
    groups.get(n).push(p);
  }
  if (groups.size < 2) continue;
  const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  const [mainName, main] = sorted[0];
  for (const [n, g] of sorted.slice(1)) {
    // A tiny group beside a big one, sharing no size with it, is a straggler
    // rather than a second product.
    const clash = g.some((p) => main.some((m) => sizeOf(m) === sizeOf(p)));
    if (!clash && g.length <= 2 && main.length >= 5) {
      orphans.push({
        brand,
        stem,
        mainName,
        mainCount: main.length,
        name: n,
        codes: g.map((p) => `${p.ProductCode} (${sizeOf(p)})`),
      });
    } else {
      splits.push({ brand, stem, mainName, mainCount: main.length, name: n, count: g.length });
    }
  }
}

console.log(`\n${sized.length} sized products across ${byStem.size} brand+stem families.\n`);
console.log(
  `ORPHANS - possibly a size missing from its picker (${orphans.length}). Check each, then fix the name in Unleashed:\n`
);
for (const o of orphans) {
  console.log(`  ${o.brand} / ${o.stem}`);
  console.log(`    ${o.codes.join(", ")}`);
  console.log(`    is called   "${o.name}"`);
  console.log(`    sits under  "${o.mainName}" (${o.mainCount} sizes) - same product renamed, or its own?\n`);
}
console.log(`SPLITS - a stem holding more than one real range (${splits.length}):\n`);
for (const s of splits) {
  console.log(`  ${s.brand} / ${s.stem}: "${s.mainName}" (${s.mainCount}) vs "${s.name}" (${s.count})`);
}

// ---------------------------------------------------------------------------
// What the CATEGORY PAGES show, and what is wrong with it. The site lists from
// ProductGroup now (lib/erp-catalogue.ts), so a product with no group, no price
// or no photograph is a hole on a live page rather than an internal detail.
const ours = items.filter(
  (p) => p.IsSellable && !p.Obsolete && ["MK", "CONCEPT 2", "NO BRAND"].includes(p.ProductBrand?.BrandName ?? "")
);
const INTERNAL = new Set(["Other Costs", "Clearance", "Storage"]);
const listed = ours.filter((p) => p.ProductGroup?.GroupName && !INTERNAL.has(p.ProductGroup.GroupName));

const noGroup = ours.filter((p) => !p.ProductGroup?.GroupName);
const noPrice = listed.filter((p) => !(p.DefaultSellPrice > 0));
const noImage = listed.filter((p) => !p.ImageUrl && !(p.Images ?? []).length);

// Near-duplicate names within a group: almost always one product entered twice
// under two code schemes, which is two cards on the same category page.
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const seen = new Map();
const dupes = [];
for (const p of listed) {
  const base = nameOf2(p);
  const k = `${p.ProductGroup.GroupName}|${norm(base)}`;
  if (seen.has(k) && seen.get(k).base !== base) dupes.push([seen.get(k).base, base, p.ProductCode]);
  else if (!seen.has(k)) seen.set(k, { base, code: p.ProductCode });
}

function nameOf2(p) {
  const d = p.ProductDescription ?? "";
  const g = d.match(/\s*\((XS|S|M|L|XL|XXL|2XL|3XL)\)\s*$/i);
  if (g) return d.replace(/\s*\((XS|S|M|L|XL|XXL|2XL|3XL)\)\s*$/i, "").trim();
  const i = d.indexOf(" - ");
  return i < 0 ? d.trim() : d.slice(0, i).trim();
}

console.log(`\n\nWHAT THE CATEGORY PAGES ARE MISSING\n`);
console.log(`  ${listed.length} products listed across ${new Set(listed.map((p) => p.ProductGroup.GroupName)).size} groups.\n`);
console.log(`  NO GROUP  ${noGroup.length} - invisible on the site, they belong to no category:`);
for (const p of noGroup.slice(0, 10)) console.log(`      ${p.ProductCode.padEnd(14)} ${p.ProductDescription}`);
console.log(`\n  NO PRICE  ${noPrice.length} - these render "Contact for pricing":`);
for (const p of noPrice.slice(0, 10)) console.log(`      ${p.ProductCode.padEnd(14)} ${p.ProductDescription}`);
console.log(`\n  NO PHOTO  ${noImage.length} - these render an empty tile:`);
for (const p of noImage.slice(0, 10)) console.log(`      ${p.ProductCode.padEnd(14)} ${p.ProductDescription}`);
console.log(`\n  NEAR-DUPLICATE NAMES  ${dupes.length} - two cards for one product, usually a typo`);
console.log(`  or a second code scheme. Fix the name and the two merge by themselves:`);
for (const [a, b, code] of dupes.slice(0, 10)) console.log(`      "${a}"  vs  "${b}"  (${code})`);
console.log("");
