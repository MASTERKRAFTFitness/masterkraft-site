#!/usr/bin/env node
// Offline pre-build guard: refuse to build if the committed catalogue snapshot
// is missing or short.
//
// Runs as `prebuild`, so it fires on every build including Vercel's. It is
// deliberately OFFLINE. The whole point of the snapshot is that rendering no
// longer depends on WooCommerce being up, so the build must not reintroduce that
// dependency — `npm run check:catalogue` is the networked check, and it belongs
// on the deploy path (`npm run deploy`), not in the build.
//
// What this catches: src/data/ not committed, a truncated write, or a snapshot
// emptied by a bad merge. Any of those would otherwise ship a working site with
// an empty shop, which looks like a content problem rather than a build problem.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Same floor as build-catalogue.mjs. 512 published at time of writing.
const MIN_PRODUCTS = 400;

function fail(msg) {
  console.error(`\nSNAPSHOT CHECK FAILED: ${msg}`);
  console.error("Run `npm run build:catalogue` and commit src/data/.\n");
  process.exit(1);
}

function load(name) {
  const path = join(ROOT, "src/data", name);
  if (!existsSync(path)) fail(`src/data/${name} is missing`);
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    fail(`src/data/${name} is not valid JSON (${e.message})`);
  }
}

const catalogue = load("catalogue.json");
const variations = load("variations.json");
const categories = load("categories.json");

const products = catalogue.products;
if (!Array.isArray(products)) fail("catalogue.json has no products array");
if (products.length < MIN_PRODUCTS) {
  fail(`only ${products.length} products in the snapshot, floor is ${MIN_PRODUCTS}`);
}
if (catalogue.count !== products.length) {
  fail(`catalogue.json count (${catalogue.count}) disagrees with its products array (${products.length})`);
}
if (!Array.isArray(categories.terms) || !categories.terms.length) {
  fail("categories.json has no terms");
}

// A variable product with no variations renders a product page with no buyable
// option, so catch a half-written variations file here rather than in the wild.
const missing = products
  .filter((p) => p.type === "variable")
  .filter((p) => !variations.byProductId?.[String(p.id)]?.length);
if (missing.length) {
  fail(
    `${missing.length} variable products have no variations ` +
      `(e.g. ${missing.slice(0, 5).map((p) => p.sku || p.slug).join(", ")})`
  );
}

console.log(
  `Snapshot ok: ${products.length} products, ` +
    `${Object.keys(variations.byProductId).length} variation sets, ${categories.terms.length} categories`
);
