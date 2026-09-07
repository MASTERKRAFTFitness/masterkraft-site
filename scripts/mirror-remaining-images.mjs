#!/usr/bin/env node
// Mirror the product images that mirror-product-images.mjs deliberately skipped.
//
// Run:  npm run mirror:remaining     (then npm run compress:assets, and commit)
//
// WHY THIS EXISTS SEPARATELY. mirror-product-images.mjs only mirrors MasterKraft's
// own brand (BRAND_SKU_RE = /^(?:[MN]|SC)/) and explicitly drops S- and F-prefixed
// SKUs as foreign brands. That was a reasonable line to draw while masterkraft.com
// still resolved to WordPress and the remote images loaded fine. The 27 August
// cutover moved the apex to Vercel, so every image still pointed at
// masterkraft.com/wp-content went dark: 279 of the 512 catalogue products, being
// 174 S-prefixed, 75 REVL (R), 28 M and 2 A. The site serves those product pages
// and they are in the sitemap, so "not our brand" does not mean "not our problem".
//
// TWO THINGS DIFFER FROM THE ORIGINAL SCRIPT.
//
// 1. It reads src/data/catalogue.json rather than the WooCommerce REST API. The
//    API lives at WC_STORE_URL = https://masterkraft.com/wp-json/wc/v3, which now
//    answers from Vercel, so the original script cannot run at all post-cutover.
//    The snapshot holds the same image URLs, so it is a better source anyway.
//
// 2. It fetches over node:http against the server's IP with an explicit Host
//    header, because that host only serves uploads to the exact vhost name:
//      Host: masterkraft.com     -> 200 image/jpeg
//      Host: img.masterkraft.com -> 404
//      no Host / bare IP         -> 404
//    plain fetch() cannot do this: undici ignores a `host` header and sends the
//    URL's own authority, which lands on the 404 vhost. Hence the raw http module.
//
// FETCHES ONE AT A TIME ON PURPOSE, same as the original: the host refuses bursts.
// Do not "optimise" this into Promise.all.
//
// IDEMPOTENT. Skips any file already on disk at non-zero size, and NEVER touches a
// SKU that already has an override, so re-running it cannot clobber the
// colour-normalised /product-bg images.

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "public/product-images");
const OVERRIDES = join(ROOT, "src/lib/product-image-overrides.json");
const CATALOGUE = join(ROOT, "src/data/catalogue.json");

// The old WordPress box. Overridable so that this keeps working when the store
// moves to its own subdomain and stops needing the IP-plus-Host dance.
const ORIGIN_IP = process.env.LEGACY_MEDIA_IP ?? "103.26.237.235";
const ORIGIN_HOST = process.env.LEGACY_MEDIA_HOST ?? "masterkraft.com";

// Fetch one file, following the single redirect WordPress sometimes issues for
// uploads. Resolves to a Buffer, or throws with something legible.
function download(pathname, redirectsLeft = 2) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: ORIGIN_IP, port: 80, path: pathname, method: "GET", headers: { Host: ORIGIN_HOST } },
      (res) => {
        const { statusCode: code, headers } = res;
        if (code >= 300 && code < 400 && headers.location && redirectsLeft > 0) {
          res.resume();
          const next = new URL(headers.location, `http://${ORIGIN_HOST}`);
          resolve(download(next.pathname + next.search, redirectsLeft - 1));
          return;
        }
        if (code !== 200) {
          res.resume();
          reject(new Error(`HTTP ${code}`));
          return;
        }
        // Guard against the 404 vhost, which answers 200 with an HTML body on
        // some paths. An HTML "image" would be committed and look fine in git.
        const type = headers["content-type"] ?? "";
        if (!type.startsWith("image/")) {
          res.resume();
          reject(new Error(`not an image (${type})`));
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.setTimeout(30_000, () => req.destroy(new Error("timeout")));
    req.end();
  });
}

const catalogue = JSON.parse(readFileSync(CATALOGUE, "utf8"));
const products = Array.isArray(catalogue) ? catalogue : catalogue.products ?? [];
const overrides = JSON.parse(readFileSync(OVERRIDES, "utf8"));
const preExisting = new Set(Object.keys(overrides));

// OTHER COMPANIES' BRANDS ARE NOT OURS TO MIRROR. S = Snap, F = Fernwood, and
// woocommerce.ts (isForeignBrandSku) keeps them off the site entirely: their
// product pages 404 by design, after an incident where all 149 of them answered
// 200 on a direct URL. Mirroring their photography into this repo would pull
// another company's brand assets into MasterKraft's git history to serve pages
// that cannot render. SC is exempt because that is the Concept2 range, which
// MasterKraft distributes and the site does list.
const FOREIGN_BRAND_SKU_RE = /^(?:S(?!C)|F)/i;

const missing = products.filter((p) => {
  const sku = (p.sku ?? "").trim();
  if (!sku || preExisting.has(sku) || !(p.images ?? []).length) return false;
  return !FOREIGN_BRAND_SKU_RE.test(sku);
});

console.log(
  `${products.length} catalogue products, ${preExisting.size} already local, ${missing.length} to mirror`
);

mkdirSync(OUT_DIR, { recursive: true });

let downloaded = 0,
  skipped = 0,
  failed = 0,
  bytes = 0,
  productsMirrored = 0;

for (const p of missing) {
  const sku = p.sku.trim();
  const images = (p.images ?? []).map((i) => i.src ?? i).filter(Boolean);
  const paths = [];

  for (let i = 0; i < images.length; i++) {
    const src = images[i];
    let pathname;
    try {
      pathname = new URL(src).pathname;
    } catch {
      failed++;
      console.error(`  FAILED ${sku} image ${i + 1}: unparseable URL  ${src}`);
      continue;
    }
    const ext = (extname(pathname) || ".jpg").toLowerCase();
    const safe = sku.replace(/[^A-Za-z0-9._-]/g, "_");
    const name = `${safe}-${i + 1}${ext}`;
    const dest = join(OUT_DIR, name);

    try {
      if (existsSync(dest) && statSync(dest).size > 0) {
        skipped++;
      } else {
        const buf = await download(pathname);
        if (buf.length === 0) throw new Error("empty");
        writeFileSync(dest, buf);
        bytes += buf.length;
        downloaded++;
      }
      paths.push(`/product-images/${name}`);
    } catch (e) {
      failed++;
      console.error(`  FAILED ${sku} image ${i + 1}: ${e.message}  ${pathname}`);
    }
  }

  // All-or-nothing per SKU, matching the original: a partial set would silently
  // drop images from the gallery, which is harder to notice than a broken one.
  if (paths.length && paths.length === images.length) {
    overrides[sku] = paths;
    productsMirrored++;
  } else if (paths.length) {
    console.error(`  SKIPPED ${sku}: ${paths.length}/${images.length} images, leaving it remote`);
  }

  if (productsMirrored && productsMirrored % 25 === 0 && paths.length) {
    process.stdout.write(`  ${productsMirrored} products, ${downloaded} files downloaded…\n`);
  }
}

writeFileSync(OVERRIDES, JSON.stringify(overrides, null, 2) + "\n");

console.log(`\nDownloaded ${downloaded} files (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
console.log(`Already present: ${skipped}`);
console.log(`Failed: ${failed}`);
console.log(`Products newly mirrored: ${productsMirrored}`);
console.log(`Override entries now: ${Object.keys(overrides).length}`);
if (failed) console.log(`\nRe-run to retry the ${failed} failures; it is idempotent.`);
