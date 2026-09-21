#!/usr/bin/env node
// Pull the catalogue's WordPress photography off the old box into the archive.
//
// Run:  npm run archive:wooimages            report what WOULD be fetched
//       ARCHIVE_WRITE=true npm run archive:wooimages
//
// Bucket: woo-legacy (private), laid out <year>/<month>/<original filename> —
// the old host's own layout, so a surviving wp-content URL maps to an object by
// string substitution. Report: reports/woo-images-archive.md
//
// WHY THIS IS SEPARATE FROM archive-photography.mjs. That script archives files
// ALREADY ON DISK in reports/foreign-images/ — Snap and Fernwood brand shots
// that recover-foreign-photography.mjs had pulled down earlier. This one goes to
// the source: it fetches from the WordPress host and streams straight into the
// bucket, because there is no local copy of most of this and 11 GiB of free disk
// is not where a rescue should be staged anyway.
//
// WHAT IT CANNOT DO, AND THIS MATTERS. `/wp-json/wp/v2/media` answers 401 — a
// WooCommerce consumer key authenticates the wc/v3 namespace and not WordPress
// core — so THE MEDIA LIBRARY CANNOT BE ENUMERATED. Every URL here comes from
// the committed snapshot, which means this rescues the photography the catalogue
// refers to and nothing else. The rest of the 7.7 GB is invisible from here and
// only a cPanel backup reaches it. Do not read a clean run as "the library is
// safe"; read it as "the pictures the shop knows about are safe".
//
// IT READS THROUGH THE DNS PIN. masterkraft.com is Vercel now; WC_STORE_PIN
// points this process at the old box. The uploads are served without auth, but
// only to a request that arrives under the right hostname — that host serves its
// vhosts by name, so the bare IP 404s.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import "./lib/store-dns-pin.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MD = join(ROOT, "reports/woo-images-archive.md");
const BUCKET = "woo-legacy";
const WRITE = process.env.ARCHIVE_WRITE === "true";

const env = {};
for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const need = (n) => {
  const v = process.env[n] ?? env[n];
  if (!v) throw new Error(`Missing ${n} (environment or .env.local)`);
  return v;
};
const SUPA = need("SUPABASE_URL").replace(/\/$/, "");
const KEY = need("SUPABASE_SERVICE_ROLE_KEY");
const auth = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
};

// ------------------------------------------------------------------ the plan
//
// Every distinct wp-content URL the committed catalogue refers to: product
// images, variation images, and the image overrides' originals. One file is
// often shared by several SKUs, so the map is keyed on the object path and
// carries the SKUs alongside — the same choice archive-photography.mjs made, and
// for the same reason: the path is the old host's, and which product wanted it
// is metadata, not structure.

const read = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const catalogue = read("src/data/catalogue.json");
const variations = read("src/data/variations.json");
const products = Array.isArray(catalogue) ? catalogue : catalogue.products ?? [];

const plan = new Map(); // object key -> { url, skus:Set }

function consider(src, sku) {
  if (!src) return;
  let u;
  try {
    u = new URL(src);
  } catch {
    return;
  }
  const rel = u.pathname.split("/wp-content/uploads/")[1];
  if (!rel) return;
  const original = decodeURIComponent(rel);
  // Storage rejects non-ASCII keys; archive-photography.mjs hit the same thing
  // with filenames carrying `拷贝`. Keep the substitution identical so both
  // scripts land the same file at the same key.
  const key = original.replace(/[^\x20-\x7E]+/g, "copy").replace(/-+copy/g, "-copy");
  const held = plan.get(key);
  if (held) held.skus.add(sku);
  else plan.set(key, { url: u.href, skus: new Set([sku]) });
}

for (const p of products) {
  const sku = (p.sku ?? "").trim() || `#${p.id}`;
  for (const img of p.images ?? []) consider(img.src, sku);
}
for (const [, list] of Object.entries(variations.byProductId ?? {})) {
  for (const v of list ?? []) consider(v.image?.src, v.sku ?? "(variation)");
}

console.log(`${plan.size} distinct files referenced by the snapshot`);

// --------------------------------------------------------- what is there now

async function listBucket() {
  const have = new Set();
  // Storage's list is per-prefix and pages at 100; walk the year/month tree
  // rather than assuming a flat namespace.
  const ls = async (prefix) => {
    const out = [];
    for (let offset = 0; ; offset += 100) {
      const res = await fetch(`${SUPA}/storage/v1/object/list/${BUCKET}`, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ prefix, limit: 100, offset }),
      });
      if (!res.ok) throw new Error(`list ${prefix}: ${res.status} ${await res.text()}`);
      const page = await res.json();
      out.push(...page);
      if (page.length < 100) break;
    }
    return out;
  };
  for (const year of await ls("")) {
    if (year.id) continue; // a file at the root, not a folder
    for (const month of await ls(`${year.name}/`)) {
      if (month.id) continue;
      for (const file of await ls(`${year.name}/${month.name}/`)) {
        if (file.id) have.add(`${year.name}/${month.name}/${file.name}`);
      }
    }
  }
  return have;
}

const have = await listBucket();
const todo = [...plan.entries()].filter(([key]) => !have.has(key));
console.log(`${have.size} already in ${BUCKET}, ${todo.length} to fetch`);

if (!WRITE) {
  console.log("DRY RUN — ARCHIVE_WRITE=true to fetch and upload.");
}

// ------------------------------------------------------------------ transfer
//
// SEQUENTIAL, and gentle. This is a machine that is being retired, reachable
// only by pinned IP, and it is the only copy. A burst that gets us rate-limited
// or tips it over costs far more than the minutes saved — the same lesson the
// ERP deploy gates taught on the same day, for the same reason.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let uploaded = 0,
  bytes = 0,
  missing = 0,
  failed = 0;
const gone = [];

if (WRITE) {
  for (const [key, { url }] of todo) {
    let body = null;
    let lastError = "";
    for (const wait of [0, 2_000, 6_000]) {
      if (wait) await sleep(wait);
      try {
        const res = await fetch(url);
        if (res.ok) {
          body = Buffer.from(await res.arrayBuffer());
          break;
        }
        lastError = `HTTP ${res.status}`;
        // A 404 is an answer, not a failure to be retried: the file is already
        // gone from the host. Worth recording, not worth three attempts.
        if (res.status === 404) break;
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }
    }
    if (!body) {
      if (lastError === "HTTP 404") {
        missing++;
        gone.push(key);
      } else {
        failed++;
        if (failed <= 5) console.log(`  ! ${key}: ${lastError}`);
      }
      continue;
    }
    const up = await fetch(`${SUPA}/storage/v1/object/${BUCKET}/${encodeURI(key)}`, {
      method: "POST",
      headers: {
        ...auth,
        "Content-Type": TYPES[extname(key).toLowerCase()] ?? "application/octet-stream",
        "x-upsert": "false",
      },
      body,
    });
    if (up.ok) {
      uploaded++;
      bytes += body.length;
      if (uploaded % 50 === 0) console.log(`  ${uploaded}/${todo.length} …`);
      continue;
    }
    // Already there comes back as a 400 whose body says 409. See the same note
    // in archive-photography.mjs — reading only res.status reports every
    // existing object as a failure on a second run.
    const text = await up.text();
    if (up.status === 409 || /"statusCode":"409"|Duplicate/.test(text)) continue;
    failed++;
    if (failed <= 5) console.log(`  ! upload ${key}: ${up.status} ${text.slice(0, 80)}`);
  }
  console.log(`\nuploaded ${uploaded}, ${(bytes / 1024 / 1024).toFixed(1)}MB; ${missing} already gone from the host; ${failed} failed`);
}

// ------------------------------------------------------------------- report

const shared = [...plan.values()].filter((v) => v.skus.size > 1).length;

mkdirSync(dirname(MD), { recursive: true });
writeFileSync(
  MD,
  [
    "# The catalogue's WordPress photography, archived",
    "",
    "Generated by `npm run archive:wooimages`.",
    "",
    `**${plan.size} distinct files** referenced by the committed snapshot, fetched from the old`,
    `host and stored in the private Supabase bucket \`${BUCKET}\` as`,
    "`<year>/<month>/<original filename>` — the old host's own layout, so any surviving",
    "`wp-content` URL maps to an object by string substitution.",
    "",
    "| | |",
    "|---|---|",
    `| Referenced by the snapshot | ${plan.size} |`,
    `| Already in the bucket before this run | ${have.size} |`,
    `| Fetched and uploaded this run | ${WRITE ? uploaded : "— (dry run)"} |`,
    `| Bytes uploaded | ${WRITE ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : "—"} |`,
    `| **Already gone from the host (404)** | ${WRITE ? missing : "—"} |`,
    `| Failed | ${WRITE ? failed : "—"} |`,
    `| Files shared by more than one SKU | ${shared} |`,
    "",
    "## The limit of this rescue",
    "",
    "**`/wp-json/wp/v2/media` answers 401.** The WooCommerce consumer key authenticates the",
    "`wc/v3` namespace, not WordPress core, so the media library cannot be enumerated. Every",
    "URL above comes from the committed snapshot.",
    "",
    "That means this covers **the photography the catalogue refers to**, and says nothing",
    "about the rest of the 7.7 GB — page images, post images, plugin assets, anything",
    "referenced only by content this site never imported. A clean run here does not mean the",
    "library is safe. Only a cPanel backup reaches the rest; see `transfer-plan.md` in the",
    "migration folder.",
    ...(gone.length
      ? [
          "",
          "## Referenced but already gone",
          "",
          `${gone.length} file(s) the snapshot points at answered 404 on the host itself, so they`,
          "were lost before this ran. Listed because a missing photograph is worth knowing about",
          "by name:",
          "",
          ...gone.slice(0, 40).map((g) => `- \`${g}\``),
          ...(gone.length > 40 ? [`- …and ${gone.length - 40} more`] : []),
        ]
      : []),
    "",
    `_Last run: ${new Date().toISOString().slice(0, 16).replace("T", " ")}Z, ` +
      `${WRITE ? `${uploaded} uploaded` : "dry run, nothing fetched"}._`,
    "",
  ].join("\n")
);
console.log(`reports/woo-images-archive.md written.`);
