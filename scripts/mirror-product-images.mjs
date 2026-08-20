#!/usr/bin/env node
// Copy every product image the site serves into /public, and point the catalogue
// at the local copies.
//
// Run:  npm run mirror:images      (then commit /public/product-images + the JSON)
//
// WHY. The site reads the catalogue from WooCommerce over the REST API, but the
// image FILES still live in that WordPress install's wp-content. 203 of the 221
// products the site serves load their images straight off masterkraft.com, so
// the domain cutover (apex points at Vercel, WordPress moves to a subdomain)
// breaks every one of them. That is exactly how the 24 product manuals broke:
// they were deleted from wp-content/uploads/2021/03 with no Wayback copy, and
// only Michael's Dropbox got them back. Mirroring removes that dependency.
//
// FETCHES ONE AT A TIME ON PURPOSE. The host refuses bursts: 20 parallel HEADs
// got 40 of 62 rejected, while serial GETs returned 206 in ~20ms each. Do not
// "optimise" this into Promise.all.
//
// IDEMPOTENT. Re-run it when the catalogue gains products. It skips a file that
// is already downloaded at the same size, and it NEVER touches a SKU that
// already has an override: those are the colour-normalised /product-bg images
// from normalize-product-bg.py, and overwriting them with the raw WordPress
// original would undo that work.

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "public/product-images");
const OVERRIDES = join(ROOT, "src/lib/product-image-overrides.json");

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

const BASE = `${env("WC_STORE_URL")}/wp-json/wc/v3`;
const auth =
  "Basic " + Buffer.from(`${env("WC_CONSUMER_KEY")}:${env("WC_CONSUMER_SECRET")}`).toString("base64");

async function wc(params) {
  const url = new URL(`${BASE}/products`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const res = await fetch(url, { headers: { Authorization: auth } });
  if (!res.ok) throw new Error(`WooCommerce ${res.status}`);
  return { data: await res.json(), pages: Number(res.headers.get("x-wp-totalpages") || 1) };
}

// The same rule the site applies, kept in step with woocommerce.ts / obsolete.ts.
const BRAND_SKU_RE = /^(?:[MN]|SC)/i;
const FOREIGN_BRAND_SKU_RE = /^(?:S(?!C)|F)/i;
const CLEARANCE_CATEGORY = 356;
const retired = new Set(
  JSON.parse(readFileSync(join(ROOT, "src/lib/obsolete-skus.json"), "utf8")).codes.map((c) =>
    c.toUpperCase()
  )
);

const FIELDS = "sku,name,slug,catalog_visibility,images,categories";
const first = await wc({ per_page: 100, page: 1, status: "publish", _fields: FIELDS });
const all = [...first.data];
for (let page = 2; page <= first.pages; page++) {
  all.push(...(await wc({ per_page: 100, page, status: "publish", _fields: FIELDS })).data);
}

const served = all.filter((p) => {
  const sku = (p.sku ?? "").trim();
  if (!sku) return false;
  if (p.catalog_visibility === "hidden" || p.catalog_visibility === "search") return false;
  if (retired.has(sku.toUpperCase())) return false;
  if (FOREIGN_BRAND_SKU_RE.test(sku)) return false;
  // Clearance opts out of the brand filter (A-prefixed ex-display stock).
  return p.categories?.some((c) => c.id === CLEARANCE_CATEGORY) || BRAND_SKU_RE.test(sku);
});

console.log(`${all.length} published products, ${served.length} served by the site`);

const overrides = JSON.parse(readFileSync(OVERRIDES, "utf8"));
const preExisting = new Set(Object.keys(overrides));
mkdirSync(OUT_DIR, { recursive: true });

let downloaded = 0,
  skipped = 0,
  failed = 0,
  bytes = 0,
  productsMirrored = 0;

for (const p of served) {
  const sku = p.sku.trim();
  if (preExisting.has(sku)) {
    // Colour-normalised /product-bg images: leave them alone.
    skipped += (p.images ?? []).length;
    continue;
  }
  const images = (p.images ?? []).map((i) => i.src).filter(Boolean);
  if (!images.length) continue;

  const paths = [];
  for (let i = 0; i < images.length; i++) {
    const src = images[i];
    const ext = (extname(new URL(src).pathname) || ".jpg").toLowerCase();
    const safe = sku.replace(/[^A-Za-z0-9._-]/g, "_");
    const name = `${safe}-${i + 1}${ext}`;
    const dest = join(OUT_DIR, name);
    try {
      if (existsSync(dest) && statSync(dest).size > 0) {
        skipped++;
      } else {
        const res = await fetch(src);
        if (!res.ok) throw new Error(String(res.status));
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length === 0) throw new Error("empty");
        writeFileSync(dest, buf);
        bytes += buf.length;
        downloaded++;
      }
      paths.push(`/product-images/${name}`);
    } catch (e) {
      failed++;
      console.error(`  FAILED ${sku} image ${i + 1}: ${e.message}  ${src}`);
    }
  }
  // Only claim the SKU if every one of its images came down: a partial set would
  // silently drop images from the gallery.
  if (paths.length === images.length) {
    overrides[sku] = paths;
    productsMirrored++;
  } else if (paths.length) {
    console.error(`  SKIPPED ${sku}: ${paths.length}/${images.length} images, leaving it remote`);
  }
  if ((downloaded + skipped) % 50 === 0 && downloaded) {
    process.stdout.write(`  ${downloaded} downloaded, ${skipped} already present…\n`);
  }
}

writeFileSync(OVERRIDES, JSON.stringify(overrides, null, 2) + "\n");

console.log(`\nDownloaded ${downloaded} files (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
console.log(`Already present: ${skipped}`);
console.log(`Failed: ${failed}`);
console.log(`Products now served locally: ${productsMirrored} newly + ${preExisting.size} already`);
console.log(`Override entries: ${Object.keys(overrides).length}`);
