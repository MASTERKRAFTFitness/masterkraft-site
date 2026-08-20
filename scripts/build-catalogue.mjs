#!/usr/bin/env node
// Regenerate the committed catalogue snapshot in src/data/ — the product,
// variation and category data the site serves.
//
// Run:  npm run build:catalogue     (then commit the JSON)
//
// WHY THIS IS A BUILD STEP AND NOT A RUNTIME FETCH. This is the same argument
// build-obsolete-skus.mjs makes about Unleashed, applied to WooCommerce. The
// store answers in 1.5-2.5s per request and refuses bursts, so a cold listing
// render paid for 6 sequential-ish page fetches, and every product page paid for
// its own. Catalogue content changes when someone edits a product in WordPress,
// which is rare, so it belongs in the repo. It also means a WordPress outage,
// or the domain cutover moving the store to a subdomain, cannot take the shop
// down: the site no longer talks to WooCommerce to render anything.
//
// WHAT THIS DELIBERATELY DOES NOT DO: it does not apply the four visibility
// rules (brand SKU, foreign brand, WordPress-hidden, ERP-retired). The snapshot
// is a faithful mirror of what the store published; woocommerce.ts still applies
// every rule at its single chokepoint, still covered by the existing tests. That
// way changing a rule is a code change, not a re-fetch, and the rules cannot
// drift between "what we fetched" and "what we serve".
//
// The checkout path (getProductById / getVariation) still reads WooCommerce
// live, on purpose — see the note on those functions in src/lib/woocommerce.ts.
//
// RE-RUN THIS whenever product content changes in WordPress.
// `npm run check:catalogue` reports drift without writing anything.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "src/data");
const OUT_PRODUCTS = join(OUT_DIR, "catalogue.json");
const OUT_VARIATIONS = join(OUT_DIR, "variations.json");
const OUT_CATEGORIES = join(OUT_DIR, "categories.json");

// A short read would silently empty the shop, the same way a short Unleashed
// read would silently un-retire everything. 512 published at time of writing.
const MIN_PRODUCTS = 400;

const checkOnly = process.argv.includes("--check");

function env(name) {
  if (process.env[name]) return process.env[name];
  const text = readFileSync(join(ROOT, ".env.local"), "utf8");
  for (const line of text.split("\n")) {
    const eq = line.indexOf("=");
    if (eq > 0 && line.slice(0, eq).trim() === name) {
      return line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    }
  }
  throw new Error(`Missing ${name} (environment or .env.local)`);
}

const BASE = env("WC_STORE_URL").replace(/\/$/, "") + "/wp-json/wc/v3";
const AUTH =
  "Basic " +
  Buffer.from(`${env("WC_CONSUMER_KEY")}:${env("WC_CONSUMER_SECRET")}`).toString("base64");

async function wcGet(path, params = {}) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { Authorization: AUTH } });
    if (res.ok) {
      return {
        data: await res.json(),
        totalPages: Number(res.headers.get("x-wp-totalpages") ?? 1),
        total: Number(res.headers.get("x-wp-total") ?? 0),
      };
    }
    // The store refuses bursts under load; back off rather than lose a page and
    // write a short snapshot.
    if (attempt >= 4) throw new Error(`WooCommerce ${res.status} on ${path} after ${attempt} tries`);
    await new Promise((r) => setTimeout(r, attempt * 1500));
  }
}

// Run `jobs` with at most `limit` in flight. The store rejects large bursts
// (20 parallel requests got two thirds refused), so this stays deliberately low.
async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    })
  );
  return out;
}

// Every WooCommerce field the site reads, plus meta_data (whitelisted below),
// date_modified_gmt for the sitemap and menu_order for listing order.
const PRODUCT_FIELDS =
  "id,name,slug,sku,type,permalink,price,regular_price,sale_price,on_sale,stock_status," +
  "catalog_visibility,bundle_price,weight,dimensions,short_description,description,images," +
  "categories,meta_data,date_modified_gmt,menu_order,featured";

const VARIATION_FIELDS =
  "id,sku,price,regular_price,sale_price,stock_status,attributes,image,weight,dimensions";

// WordPress hands back 135 distinct meta keys per product — Yoast, plugin state,
// editor scratch. parseProductDetail() reads exactly these. Keeping only them
// takes the snapshot from 8.5MB to 1.9MB with no loss of rendered content.
// KEEP THIS IN SYNC with parseProductDetail in src/lib/woocommerce.ts.
const META_KEYS = new Set([
  "features",
  "specification_text",
  "colour",
  "material",
  "net_weight",
  "gross_weight",
  "warranty",
  "product_overview_short",
  "product_overview_description",
  "show_package_inclusions",
  "package_inclusion_text",
  "assembled_size_length",
  "assembled_size_width",
  "assembled_size_height",
  "assembled_size_depth",
  "packing_size_length",
  "packing_size_width",
  "packing_size_height",
]);
const META_REPEATER_RE = /^features_\d+_text$/;

function slimMeta(product) {
  const meta = (product.meta_data ?? []).filter(
    (m) => META_KEYS.has(m.key) || META_REPEATER_RE.test(m.key)
  );
  return { ...product, meta_data: meta };
}

async function fetchAllProducts() {
  const first = await wcGet("/products", {
    per_page: 100,
    page: 1,
    status: "publish",
    orderby: "menu_order",
    order: "asc",
    _fields: PRODUCT_FIELDS,
  });
  const pages = first.totalPages || 1;
  const rest = await pool(
    Array.from({ length: pages - 1 }, (_, i) => i + 2),
    3,
    (page) =>
      wcGet("/products", {
        per_page: 100,
        page,
        status: "publish",
        orderby: "menu_order",
        order: "asc",
        _fields: PRODUCT_FIELDS,
      }).then((r) => r.data)
  );
  // Concatenated in page order, so the store's menu_order survives.
  return { products: [...first.data, ...rest.flat()].map(slimMeta), reported: first.total };
}

async function fetchAllCategories() {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const { data } = await wcGet("/products/categories", {
      per_page: 100,
      page,
      orderby: "name",
      order: "asc",
      _fields: "id,slug,name,count,parent,description",
    });
    out.push(...data);
    if (data.length < 100) break;
  }
  return out;
}

async function fetchVariations(variableProducts) {
  const entries = await pool(variableProducts, 3, async (p) => {
    const { data } = await wcGet(`/products/${p.id}/variations`, {
      per_page: 100,
      _fields: VARIATION_FIELDS,
    });
    return [String(p.id), data];
  });
  return Object.fromEntries(entries.filter(([, v]) => v.length));
}

function readPrevious(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

const GENERATED =
  "GENERATED by scripts/build-catalogue.mjs — do not edit by hand. " +
  "Raw WooCommerce data; visibility rules are applied at read time in woocommerce.ts.";

const started = Date.now();
const { products, reported } = await fetchAllProducts();

if (products.length < MIN_PRODUCTS) {
  console.error(
    `REFUSING TO WRITE: only ${products.length} products came back (store reports ${reported}, ` +
      `floor is ${MIN_PRODUCTS}). A short read would empty the shop. Nothing written.`
  );
  process.exit(1);
}

const variable = products.filter((p) => p.type === "variable");
const [categories, variations] = await Promise.all([
  fetchAllCategories(),
  fetchVariations(variable),
]);

const prevProducts = readPrevious(OUT_PRODUCTS);
const prevBySlug = new Map((prevProducts?.products ?? []).map((p) => [p.slug, p]));
const nowBySlug = new Map(products.map((p) => [p.slug, p]));
const added = products.filter((p) => !prevBySlug.has(p.slug));
const removed = (prevProducts?.products ?? []).filter((p) => !nowBySlug.has(p.slug));
const changed = products.filter((p) => {
  const was = prevBySlug.get(p.slug);
  return was && JSON.stringify(was) !== JSON.stringify(p);
});

const elapsed = ((Date.now() - started) / 1000).toFixed(1);
console.log(
  `WooCommerce: ${products.length} published products, ${variable.length} variable ` +
    `(${Object.keys(variations).length} with variations), ${categories.length} categories — ${elapsed}s`
);

if (checkOnly) {
  const drift = added.length + removed.length + changed.length;
  if (!prevProducts) {
    console.error("No snapshot on disk. Run `npm run build:catalogue`.");
    process.exit(1);
  }
  if (drift) {
    console.error(`DRIFT: ${added.length} added, ${removed.length} removed, ${changed.length} changed`);
    for (const p of added.slice(0, 10)) console.error(`  + ${p.sku || "(no sku)"} ${p.slug}`);
    for (const p of removed.slice(0, 10)) console.error(`  - ${p.sku || "(no sku)"} ${p.slug}`);
    for (const p of changed.slice(0, 10)) console.error(`  ~ ${p.sku || "(no sku)"} ${p.slug}`);
    console.error("Run `npm run build:catalogue` and commit the result.");
    process.exit(1);
  }
  console.log("Snapshot matches the store — no drift.");
  process.exit(0);
}

writeFileSync(
  OUT_PRODUCTS,
  JSON.stringify({ _comment: GENERATED, count: products.length, products }, null, 1) + "\n"
);
writeFileSync(
  OUT_VARIATIONS,
  JSON.stringify({ _comment: GENERATED, byProductId: variations }, null, 1) + "\n"
);
writeFileSync(
  OUT_CATEGORIES,
  JSON.stringify({ _comment: GENERATED, terms: categories }, null, 1) + "\n"
);

console.log(`Wrote ${OUT_PRODUCTS}`);
console.log(`Wrote ${OUT_VARIATIONS}`);
console.log(`Wrote ${OUT_CATEGORIES}`);
if (added.length) console.log(`  + ${added.length} added: ${added.slice(0, 8).map((p) => p.slug).join(", ")}`);
if (removed.length) console.log(`  - ${removed.length} removed: ${removed.slice(0, 8).map((p) => p.slug).join(", ")}`);
if (changed.length) console.log(`  ~ ${changed.length} changed: ${changed.slice(0, 8).map((p) => p.slug).join(", ")}`);
if (!added.length && !removed.length && !changed.length && prevProducts) console.log("  no change");
