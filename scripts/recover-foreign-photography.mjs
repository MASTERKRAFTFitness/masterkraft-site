#!/usr/bin/env node
// Get the S- and F-branded photography off the old WordPress box before it goes.
//
// Run:  npm run recover:foreign          (S = Snap, the default)
//       BRANDS=SF npm run recover:foreign
//
//   reports/foreign-images/<SKU>-<n>.<ext>   the files, named by SKU
//   reports/foreign-photography.md           what was recovered, and where it goes
//
// WHY THIS IS NOT mirror:remaining. That script deliberately REFUSES these:
//
//   "OTHER COMPANIES' BRANDS ARE NOT OURS TO MIRROR ... Mirroring their
//    photography into this repo would pull another company's brand assets into
//    MasterKraft's git history to serve pages that cannot render."
//
// That reasoning is still right and nothing here overrides it. The difference is
// the DESTINATION. mirror:remaining writes to public/product-images, which is
// committed and served from masterkraft.com. This writes to reports/, which
// `.gitignore` excludes via `reports/*-images/`, and it does NOT touch
// product-image-overrides.json — so nothing enters git history, nothing is
// served from this domain, and no page changes. The files are staged for
// Unleashed (by hand, in the browser — the API cannot write images), for the
// Snap portal, and for the catalogues app.
//
// WHY IT IS URGENT RATHER THAN TIDY. That box lost its DNS name at the 27 August
// cutover and is reachable only by pinned IP. It holds the only surviving copy
// of this photography. The precedent is in mirror-product-images.mjs: 24 product
// manuals were deleted from wp-content/uploads/2021/03 with no Wayback copy and
// came back only from a Dropbox. Recovery is cheap; a second incident is not.
//
// FETCHES ONE AT A TIME ON PURPOSE, like both mirror scripts: the host refuses
// bursts. 20 parallel HEADs got 40 of 62 rejected. Do not make this concurrent.
//
// IT SPEAKS TO AN IP WITH AN EXPLICIT Host HEADER, because that vhost serves
// uploads only to its exact name and `fetch()` cannot do this — undici ignores a
// `host` header and sends the URL's own authority, landing on the 404 vhost.
//
// NON-ASCII FILENAMES EXIST AND ARE ALREADY ENCODED. The Trucker Hat original is
// `fernwood-FITNESS-cool-greyred-1-拷贝.png`, and node:http throws on a raw
// non-ASCII path. `new URL(...).pathname` hands back a percent-encoded path, so
// it is passed through UNTOUCHED. Do not wrap it in encodeURI: that re-encodes
// the `%` of every existing escape into `%25` and the request 404s. It is a
// no-op on ASCII paths, so the bug hides until a filename carries a Chinese
// character - which 15 of these do.
//
// IDEMPOTENT. Skips any file already on disk at non-zero size.
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "reports/foreign-images");
const MD = join(ROOT, "reports/foreign-photography.md");
const CATALOGUE = join(ROOT, "src/data/catalogue.json");
const OVERRIDES = join(ROOT, "src/lib/product-image-overrides.json");

const ORIGIN_IP = process.env.LEGACY_MEDIA_IP ?? "103.26.237.235";
const ORIGIN_HOST = process.env.LEGACY_MEDIA_HOST ?? "masterkraft.com";

// S = Snap, F = Fernwood. SC is Concept 2, which MasterKraft distributes and the
// site lists, so it is never foreign and never in scope here.
const BRANDS = (process.env.BRANDS ?? "S").toUpperCase();
const IN_SCOPE = new RegExp(`^(?:${BRANDS.split("").map((b) => (b === "S" ? "S(?!C)" : b)).join("|")})`, "i");

function download(pathname, redirectsLeft = 2) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: ORIGIN_IP, port: 80, path: pathname, method: "GET", headers: { Host: ORIGIN_HOST } },
      (res) => {
        const { statusCode: code, headers } = res;
        if (code >= 300 && code < 400 && headers.location && redirectsLeft > 0) {
          res.resume();
          let next;
          try {
            next = new URL(headers.location, `http://${ORIGIN_HOST}`);
          } catch {
            reject(new Error(`bad redirect target ${headers.location}`));
            return;
          }
          resolve(download(next.pathname + next.search, redirectsLeft - 1));
          return;
        }
        if (code !== 200) {
          res.resume();
          reject(new Error(`HTTP ${code}`));
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
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

const targets = products.filter((p) => {
  const sku = (p.sku ?? "").trim();
  if (!sku || !IN_SCOPE.test(sku)) return false;
  // A SKU with an override is already mirrored locally; its pixels are safe.
  if (overrides[sku]) return false;
  return (p.images ?? []).some((i) => (i.src ?? i));
});

console.log(
  `${products.length} catalogue products, ${targets.length} in scope for /^${BRANDS}/ with no local copy`
);

mkdirSync(OUT_DIR, { recursive: true });

let got = 0,
  already = 0,
  failed = 0;
const rows = [];

for (const p of targets) {
  const sku = (p.sku ?? "").trim();
  const urls = (p.images ?? []).map((i) => i.src ?? i).filter(Boolean);
  const files = [];
  for (let i = 0; i < urls.length; i++) {
    let u;
    try {
      u = new URL(urls[i]);
    } catch {
      failed++;
      continue;
    }
    const ext = extname(u.pathname) || ".jpg";
    const name = `${sku.replace(/[^A-Za-z0-9._-]/g, "_")}-${i + 1}${ext}`;
    const dest = join(OUT_DIR, name);
    if (existsSync(dest) && statSync(dest).size > 0) {
      already++;
      files.push(name);
      continue;
    }
    try {
      const buf = await download(u.pathname + u.search);
      writeFileSync(dest, buf);
      files.push(name);
      got++;
    } catch (e) {
      console.log(`  ! ${sku} [${i + 1}] ${String(e.message).slice(0, 48)}  ${u.pathname.slice(-52)}`);
      failed++;
    }
  }
  if (files.length) rows.push({ sku, name: p.name ?? "", files });
}

const md = [
  "# Foreign-brand photography, recovered off the old host",
  "",
  `Generated by \`npm run recover:foreign\` (BRANDS=${BRANDS}).`,
  "",
  `**${got + already} photographs across ${rows.length} SKUs**, in \`reports/foreign-images/\`.`,
  "",
  "These are **not** in git and **not** served from masterkraft.com. `.gitignore`",
  "excludes `reports/*-images/`, and this script does not touch",
  "`product-image-overrides.json`, so no page changes and no other company's brand",
  "assets enter this repo — the reasoning `mirror-remaining-images.mjs` gives for",
  "refusing them still stands. They are staged to go somewhere else:",
  "",
  "| destination | how |",
  "|---|---|",
  "| Unleashed | by hand, in the browser — `Images` is GET-only on the API and Unleashed's support confirms CSV cannot bulk-load them either |",
  "| The Snap portal | whatever route that uses; the files are named by SKU |",
  "| The catalogues app | it already mirrors this photography at `catalogues.masterkraft.com/woo-images/` |",
  "",
  "**Why the hurry.** The box these came off lost its DNS name at the 27 August",
  "cutover and answers only on a pinned IP. It is the only surviving copy. 24",
  "product manuals were already lost from `wp-content/uploads/2021/03` with no",
  "Wayback copy and came back only from a Dropbox.",
  "",
  "| SKU | product | files |",
  "|---|---|---|",
  ...rows.map((r) => `| \`${r.sku}\` | ${r.name} | ${r.files.length} |`),
  "",
];
writeFileSync(MD, md.join("\n"));

console.log(`\ndownloaded ${got}, already present ${already}, failed ${failed}`);
console.log(`${rows.length} SKUs -> reports/foreign-images/  (manifest: reports/foreign-photography.md)`);
