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
// A MATCH ACROSS BRANDS IS ALMOST ALWAYS THE WRONG PICTURE, and this is the
// rule that matters. The twin and name matches reach ANOTHER COMPANY'S SKU by
// construction, and that company's photograph shows that company's logo:
//
//   MAAAU01  MK "Trucker Hat"        <- SAAAU01, a cap reading `snap fitness 24/7`
//   MAAAU02  MK "Train Cap"          <- SAAAU02, another Snap-branded cap
//   MWWPCNB07 MK "Pro Bumper Plates" <- SWWPCNB07, a plate moulded `REVL`
//
// So the check is a BRAND COMPARISON, not a filename one. The first cut of this
// script scanned source filenames for competitor names and flagged 1 of the 14
// cross-brand matches - it caught the Trucker Hat only because its file is
// misleadingly called `fernwood-FITNESS-cool-greyred-1-拷贝.png` (the picture is
// a Snap cap; the name is a leftover mockup), and it missed the Train Cap and
// every REVL-moulded plate because those filenames are clean. Filenames do not
// know what is in the photograph. The brands do.
//
// TWO CODES CLAIMING ONE FILE MEANS THE DATA IS WRONG, NOT THAT THEY MATCH.
// WooCommerce variation data is not trustworthy per size: `SWWPOU01` is the
// 1.5kg plate and its variation points at `SWWPOU02-1S.jpg`, the 2.5kg plate's
// photograph, while `MWWPOU01` (also 1.5kg) points at `MWWPOU03-1S-3.jpg`, the
// third size's. Commit cc38cf1 detached exactly that photograph from exactly
// that code, and the first cut of this script staged it straight back. So a
// source claimed by more than one target is QUARANTINED rather than guessed at,
// which is the rule report:photoupload already follows.
//
// COST LINES ARE NOT PHOTOGRAPHABLE. `RFDAAS` is a freight allowance and its
// snapshot image is a logistics clip-art; erp-catalogue already refuses the
// Other Costs and Storage groups as categories, and they are refused here too.
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
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, readdirSync, unlinkSync } from "node:fs";
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
// Where a SKU has no ERP record to read a brand from, the prefix is the brand.
// Same letters lib/woocommerce and lib/erp-catalogue already use.
const BRAND_BY_PREFIX = [
  [/^SC/, "CONCEPT 2"],
  [/^[MN]/, "MK"],
  [/^S/, "SNAP"],
  [/^F/, "FERNWOOD"],
  [/^R/, "REVL"],
];

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
const byNameSku = new Map();
for (const p of products) {
  const imgs = (p.images ?? []).map((i) => i.src).filter(Boolean);
  if (!imgs.length) continue;
  const sku = (p.sku ?? "").trim().toUpperCase();
  if (sku && !bySku.has(sku)) bySku.set(sku, imgs);
  const n = norm(p.name);
  if (n && !byName.has(n)) {
    byName.set(n, imgs);
    byNameSku.set(n, sku);
  }
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
const byCode = new Map(erp.map((p) => [(p.ProductCode ?? "").trim().toUpperCase(), p]));
const brandOf = (code) => {
  const rec = byCode.get(code);
  const named = rec?.ProductBrand?.BrandName?.trim();
  if (named) return named.toUpperCase();
  return BRAND_BY_PREFIX.find(([re]) => re.test(code))?.[1] ?? "";
};
const live = erp.filter((p) => p.IsSellable !== false && !p.Obsolete);
// erp-catalogue's EXCLUDED_GROUPS. A freight allowance has nothing to photograph.
const NOT_PHOTOGRAPHABLE = new Set(["Other Costs", "Storage"]);
const missing = live.filter(
  (p) => !imageOf(p) && !NOT_PHOTOGRAPHABLE.has((p.ProductGroup?.GroupName ?? "").trim())
);
console.log(`${live.length} live ERP codes, ${missing.length} with no photograph`);

// HOW MANY SKUS IN THE SNAPSHOT POINT AT EACH FILE. Counted across the WHOLE
// snapshot, not just the codes missing a photograph - the contest that matters
// is with a code that ALREADY has the picture. `SWWPOU02-1S.jpg` is claimed by
// SWWPOU01 (1.5kg, no image) and by SWWPOU02 (2.5kg, which owns it), and only
// the second is outside the missing set. Counting within the missing set alone
// finds no contest at all, which is how the first version of this check passed
// the very case it was written for.
const claim = new Map();
for (const [, urls] of bySku) {
  for (const u of urls) claim.set(u, (claim.get(u) ?? 0) + 1);
}

mkdirSync(OUT_DIR, { recursive: true });

const quarantined = [];
const crossBrand = [];
const staged = [];
const unsourced = [];
let got = 0,
  already = 0,
  failed = 0;

for (const p of missing) {
  const code = (p.ProductCode ?? "").trim().toUpperCase();
  let urls, how, sourceSku;
  for (const t of twinsOf(code)) {
    if (bySku.has(t)) {
      urls = bySku.get(t);
      sourceSku = t;
      how = t === code ? "exact code" : `twin ${t}`;
      break;
    }
  }
  if (!urls) {
    const n = norm(p.ProductDescription);
    if (byName.has(n)) {
      urls = byName.get(n);
      sourceSku = byNameSku.get(n) ?? "";
      how = sourceSku && sourceSku !== code ? `name (${sourceSku})` : "name";
    }
  }
  if (!urls) {
    unsourced.push({ code, name: p.ProductDescription ?? "" });
    continue;
  }
  if ((claim.get(urls[0]) ?? 0) > 1) {
    quarantined.push({
      code,
      name: p.ProductDescription ?? "",
      source: decodeURIComponent(urls[0].split("/").pop() ?? ""),
    });
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
    sourceSku: sourceSku ?? "",
    targetBrand: brandOf(code),
    sourceBrand: sourceSku ? brandOf(sourceSku) : "",
    flagged: false,
  };
  row.flagged = !!row.sourceBrand && row.sourceBrand !== row.targetBrand;

  // A CROSS-BRAND MATCH IS NEVER STAGED. It was, at first, on the reasoning that
  // a few might be right for an unbranded accessory and a human could judge them
  // with the image open. That put 26 files carrying another company's logo into a
  // directory whose whole purpose is "drag these into Unleashed". A queue is an
  // instruction, and one needing 26 exceptions is a trap. They are reported and
  // not written.
  if (row.flagged) {
    crossBrand.push(row);
    continue;
  }

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

// Anything left from an earlier run that today's guards retire. A stale file in
// an upload directory is an instruction to upload it.
const keep = new Set(staged.map((r) => r.file));
const pruned = [];
for (const f of existsSync(OUT_DIR) ? readdirSync(OUT_DIR) : []) {
  if (keep.has(f)) continue;
  unlinkSync(join(OUT_DIR, f));
  pruned.push(f);
}
if (pruned.length) console.log(`  pruned ${pruned.length} file(s) today's rules no longer stage`);

const flagged = crossBrand;
const clean = staged;

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
  `| …exists but is another brand's, NOT staged | ${crossBrand.length} |`,
  `| Stale files pruned from the directory this run | ${pruned.length} |`,
  `| …quarantined, two codes claim one file | ${quarantined.length} |`,
  `| …nothing anywhere | ${unsourced.length} |`,
  "",
  `## Not staged — the photograph is another brand's (${flagged.length})`,
  "",
  "**Deliberately absent from the upload directory.** The match reached a different",
  "company's SKU, so the picture carries a different company's logo. Verified by eye:",
  "`MAAAU01` and `MAAAU02` are caps reading `snap fitness 24/7`, and `MWWPCNB07` is a",
  "plate moulded `REVL`.",
  "",
  "This is a brand comparison, not a filename judgement. An earlier version scanned",
  "source filenames for competitor names and caught 1 of these 26 — it spotted",
  "`fernwood-FITNESS-...png` and missed every clean-named REVL plate. A filename does",
  "not know what is in the picture.",
  "",
  "| ProductCode | product | brand | photo is | matched by |",
  "|---|---|---|---|---|",
  ...flagged.map(
    (r) => `| \`${r.code}\` | ${r.name} | ${r.targetBrand} | **${r.sourceBrand}** | ${r.how} |`
  ),
  "",
  `## Ready to upload — same brand (${clean.length})`,
  "",
  "Every file in `reports/unleashed-upload-images/` is one of these. The photograph",
  "came from a SKU of the same brand, so it shows the right product with the right",
  "logo, and the filename is the ProductCode it belongs to.",
  "",
  "| ProductCode | product | brand | matched by | file |",
  "|---|---|---|---|---|",
  ...clean.map(
    (r) => `| \`${r.code}\` | ${r.name} | ${r.targetBrand} | ${r.how} | \`${r.file}\` |`
  ),
  "",
  `## Quarantined — two codes claim one photograph (${quarantined.length})`,
    "",
    "Not staged, deliberately. WooCommerce variation data is not reliable per size:",
    "`SWWPOU01` is the 1.5kg plate and points at the 2.5kg plate's photograph. Commit",
    "`cc38cf1` detached exactly that picture from exactly that code. Guessing which of",
    "the claimants is right re-introduces the bug, so neither is written.",
    "",
    "| ProductCode | product | contested file |",
    "|---|---|---|",
    ...quarantined.map((r) => `| \`${r.code}\` | ${r.name} | \`${r.source}\` |`),
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
console.log(
  `  cross-brand ${flagged.length} (not staged), ready ${clean.length}, quarantined ${quarantined.length}, no source ${unsourced.length}`
);
console.log(`-> reports/unleashed-upload-images/  (manifest: reports/unleashed-uploads.md)`);
