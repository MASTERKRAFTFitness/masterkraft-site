#!/usr/bin/env node
// Every ERP code with no photograph that a photograph nevertheless exists for,
// staged as <ProductCode>.<ext> for the browser upload.
//
// Run:  npm run stage:uploads
//
//   reports/unleashed-upload-images/<ProductCode>.<ext>   the files
//   reports/unleashed-uploads.md                          what to upload, and what cannot be
//
// THE UPLOAD IS MANUAL AND CANNOT BE AUTOMATED. `Images` is a GET-only field on
// Unleashed's Products endpoint - it appears in no POST body - and their support
// says images cannot be bulk-loaded by CSV either. So every mechanical part is
// done here and the drag-and-drop is left: the file is named after the
// ProductCode it belongs to, so the browser upload is a search and a drop.
//
// HOW A CODE IS MATCHED TO A PHOTOGRAPH, in order, because the obvious join is
// wrong and quietly under-reports:
//
//   1. the exact ProductCode, in the snapshot's products or its variations;
//   2. THE S/M TWIN. The snapshot's Trucker Hat is `SAAAU01` and the ERP's is
//      `MAAAU01` - one product, two codes, differing only in the brand letter.
//      Matching on the exact code alone misses these, which is how the
//      photography handover came to say the number of recoverable codes was
//      ZERO. It is not zero;
//   3. the product name, normalised.
//
// CHECK THE BRANDING BEFORE YOU UPLOAD. Some of these originals carry another
// company's brand - the Trucker Hat's is literally
// `fernwood-FITNESS-cool-greyred-1-拷贝.png` - and putting that on a MasterKraft
// record would publish a competitor's garment as ours. Any source filename
// naming another brand is flagged in the manifest. A human decides.
//
// IT COMPLEMENTS report:photoupload RATHER THAN REPLACING IT. That one stages
// per-SIZE photographs recovered from variation data, quarantining any source
// two codes claim. This one asks the wider question - every code with no
// picture, from any source - and writes to its own directory so the two can
// never fight over a filename. Consolidating them into one queue is worth doing
// and is not done here.
//
// FETCHES ONE AT A TIME, and speaks to an IP with an explicit Host header, for
// the reasons recover-foreign-photography.mjs sets out. Pathnames from
// `new URL()` are ALREADY percent-encoded and must not be re-encoded.
//
// Read-only against Unleashed. It stages files; it changes no record.
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac } from "node:crypto";
import http from "node:http";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "reports/unleashed-upload-images");
const MD = join(ROOT, "reports/unleashed-uploads.md");

const env = {};
for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const ORIGIN_IP = process.env.LEGACY_MEDIA_IP ?? "103.26.237.235";
const ORIGIN_HOST = process.env.LEGACY_MEDIA_HOST ?? "masterkraft.com";
const OTHER_BRANDS = /fernwood|snap|revl|gold[s']?|hyper|airlocker|air-locker/i;

const sign = (q) => createHmac("sha256", env.UNLEASHED_API_KEY).update(q).digest("base64");

async function unleashedProducts() {
  const items = [];
  for (let page = 1; page <= 20; page++) {
    const q = "pageSize=200";
    const res = await fetch(`https://api.unleashedsoftware.com/Products/${page}?${q}`, {
      headers: {
        "api-auth-id": env.UNLEASHED_API_ID,
        "api-auth-signature": sign(q),
        Accept: "application/json",
      },
    });
    if (!res.ok) throw new Error(`Unleashed /Products/${page}: ${res.status}`);
    const json = await res.json();
    items.push(...(json.Items ?? []));
    if (page >= (json.Pagination?.NumberOfPages ?? 1)) break;
  }
  return items;
}

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
            reject(new Error(`bad redirect ${headers.location}`));
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

const norm = (s) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const imageOf = (p) => {
  const ims = p.Images ?? [];
  return ims.find((i) => i.IsDefault)?.Url ?? ims[0]?.Url ?? p.ImageUrl;
};

const catalogue = JSON.parse(readFileSync(join(ROOT, "src/data/catalogue.json"), "utf8"));
const products = Array.isArray(catalogue) ? catalogue : catalogue.products ?? [];
const variations = JSON.parse(readFileSync(join(ROOT, "src/data/variations.json"), "utf8"));

const bySku = new Map();
const byName = new Map();
for (const p of products) {
  const imgs = (p.images ?? []).map((i) => i.src).filter(Boolean);
  if (!imgs.length) continue;
  const sku = (p.sku ?? "").trim().toUpperCase();
  if (sku && !bySku.has(sku)) bySku.set(sku, imgs);
  const n = norm(p.name);
  if (n && !byName.has(n)) byName.set(n, imgs);
}
for (const rows of Object.values(variations.byProductId ?? {})) {
  for (const v of rows) {
    const sku = (v.sku ?? "").trim().toUpperCase();
    const src = v.image?.src;
    if (sku && src && !bySku.has(sku)) bySku.set(sku, [src]);
  }
}

// The S/M twin: one product, two codes, differing only in the brand letter.
const twinsOf = (code) => {
  const out = [code];
  if (/^[MN]/.test(code)) out.push("S" + code.slice(1));
  if (/^S/.test(code) && !/^SC/.test(code)) out.push("M" + code.slice(1));
  return out;
};

const erp = await unleashedProducts();
const live = erp.filter((p) => p.IsSellable !== false && !p.Obsolete);
const missing = live.filter((p) => !imageOf(p));
console.log(`${live.length} live ERP codes, ${missing.length} with no photograph`);

mkdirSync(OUT_DIR, { recursive: true });

const staged = [];
const unsourced = [];
let got = 0,
  already = 0,
  failed = 0;

for (const p of missing) {
  const code = (p.ProductCode ?? "").trim().toUpperCase();
  let urls, how;
  for (const t of twinsOf(code)) {
    if (bySku.has(t)) {
      urls = bySku.get(t);
      how = t === code ? "exact code" : `twin ${t}`;
      break;
    }
  }
  if (!urls) {
    const n = norm(p.ProductDescription);
    if (byName.has(n)) {
      urls = byName.get(n);
      how = "name";
    }
  }
  if (!urls) {
    unsourced.push({ code, name: p.ProductDescription ?? "" });
    continue;
  }

  let u;
  try {
    u = new URL(urls[0]);
  } catch {
    failed++;
    continue;
  }
  const file = u.pathname.split("/").pop() ?? "";
  const name = `${code.replace(/[^A-Za-z0-9._-]/g, "_")}${extname(u.pathname) || ".jpg"}`;
  const dest = join(OUT_DIR, name);
  const row = {
    code,
    name: p.ProductDescription ?? "",
    how,
    file: name,
    source: decodeURIComponent(file),
    flagged: OTHER_BRANDS.test(decodeURIComponent(file)),
  };

  if (existsSync(dest) && statSync(dest).size > 0) {
    already++;
    staged.push(row);
    continue;
  }
  try {
    writeFileSync(dest, await download(u.pathname + u.search));
    got++;
    staged.push(row);
  } catch (e) {
    console.log(`  ! ${code} ${String(e.message).slice(0, 40)}`);
    failed++;
  }
}

const flagged = staged.filter((r) => r.flagged);
const clean = staged.filter((r) => !r.flagged);

const md = [
  "# Photographs to upload into Unleashed",
  "",
  "Generated by `npm run stage:uploads`. Read-only against Unleashed.",
  "",
  `**${staged.length} files are staged in \`reports/unleashed-upload-images/\`**, each named`,
  "after the ProductCode it belongs to. Gitignored via `reports/*-images/`.",
  "",
  "**The API cannot do this part.** `Images` is a GET-only field on Products and",
  "Unleashed's support says CSV cannot bulk-load images either, so each one goes on",
  "the product record by hand, in the browser. Naming the file after the code is",
  "everything a machine can contribute.",
  "",
  "| | |",
  "|---|---:|",
  `| ERP codes with no photograph | ${missing.length} |`,
  `| …a photograph exists and is staged | **${staged.length}** |`,
  `| …nothing anywhere | ${unsourced.length} |`,
  "",
  `## Check the branding first (${flagged.length})`,
  "",
  "The source filename names another company. Putting one of these on a MasterKraft",
  "record would publish a competitor's product as ours. **Look before uploading.**",
  "",
  "| ProductCode | product | matched by | source file |",
  "|---|---|---|---|",
  ...flagged.map((r) => `| \`${r.code}\` | ${r.name} | ${r.how} | \`${r.source}\` |`),
  "",
  `## Ready to upload (${clean.length})`,
  "",
  "| ProductCode | product | matched by | file |",
  "|---|---|---|---|",
  ...clean.map((r) => `| \`${r.code}\` | ${r.name} | ${r.how} | \`${r.file}\` |`),
  "",
  `## No photograph anywhere (${unsourced.length})`,
  "",
  "Neither Unleashed nor WooCommerce has one. These need a camera, not a search —",
  "`npm run report:shootlist` collapses the MasterKraft half into the products behind",
  "them, which is far fewer things than codes.",
  "",
  "| ProductCode | product |",
  "|---|---|",
  ...unsourced.slice(0, 120).map((r) => `| \`${r.code}\` | ${r.name} |`),
  ...(unsourced.length > 120 ? ["", `…and ${unsourced.length - 120} more.`] : []),
  "",
];
writeFileSync(MD, md.join("\n"));

console.log(`\nstaged ${staged.length} (downloaded ${got}, already present ${already}, failed ${failed})`);
console.log(`  branding to check ${flagged.length}, ready ${clean.length}, no source ${unsourced.length}`);
console.log(`-> reports/unleashed-upload-images/  (manifest: reports/unleashed-uploads.md)`);
