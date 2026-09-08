#!/usr/bin/env node
// Put the recovered WooCommerce photography somewhere that is not one laptop.
//
// Run:  npm run archive:photography           (dry run — lists what would go)
//       ARCHIVE_WRITE=true npm run archive:photography
//
//   Supabase Storage bucket `woo-legacy`, private
//   reports/photography-archive.md            what is in it
//
// WHY. `recover-foreign-photography.mjs` pulled 622 photographs off the old
// WordPress box into reports/foreign-images/, which `.gitignore` excludes. That
// was right — they are another company's brand assets and do not belong in this
// repo's history — but it leaves them in exactly two places: a server with no DNS
// name reachable only by pinned IP, and an untracked folder on one machine.
//
// THE CATALOGUES APP IS NOT THE SECOND COPY IT LOOKS LIKE. It serves this
// photography at catalogues.masterkraft.com/woo-images/<year>/<month>/<file>, and
// a five-file sample all returned 200, which is how it came to be described as a
// mirror. Checked across all 460 distinct container photographs, 95 are there and
// 365 are 404. It holds a fifth of them.
//
// So for 365 photographs the only copies are a box that lost its name and a
// gitignored directory. The precedent is in mirror-product-images.mjs: 24 product
// manuals went from wp-content/uploads/2021/03 with no Wayback copy and came back
// only from somebody's Dropbox.
//
// THE LAYOUT IS THE OLD HOST'S, DELIBERATELY. Objects are stored at
// <year>/<month>/<original filename>, which is what wp-content used and what the
// catalogues app already mirrors. Any surviving wp-content URL maps to an object
// by string substitution, and the archive can fill the catalogues app's gaps
// without a rename step. The SKU each file belongs to is in the manifest rather
// than in the path, because one file is often shared by several SKUs.
//
// PRIVATE, NOT PUBLIC. These are Snap's and Fernwood's brand photographs. The
// bucket is a safe place to keep them, not a place to serve them from, and
// nothing about this makes them reachable from masterkraft.com.
//
// SUPABASE STORAGE KEYS MUST BE ASCII. 15 of these filenames carry `拷贝` —
// Chinese for "copy", left by whatever exported them — and the API answers
// `InvalidKey` on the raw name. Those keys have the non-ASCII run replaced with
// `-copy`, and BOTH names go in the manifest so the substitution from a
// wp-content URL is still mechanical rather than guesswork.
//
// IT WRITES NOTHING BY DEFAULT. ARCHIVE_WRITE=true to upload. Idempotent: an
// object already present is left alone, so a re-run after a partial failure
// finishes the job rather than repeating it.
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = join(ROOT, "reports/foreign-images");
const MD = join(ROOT, "reports/photography-archive.md");
const BUCKET = "woo-legacy";
const WRITE = process.env.ARCHIVE_WRITE === "true";

const env = {};
for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const URL_BASE = (env.SUPABASE_URL ?? "").replace(/\/$/, "");
const KEY = env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!URL_BASE || !KEY) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env.local");

const auth = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const TYPES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

// Rebuild the mapping the recovery script flattened: it wrote <SKU>-<n>.<ext>,
// and the snapshot still holds the original URL each of those came from.
const catalogue = JSON.parse(readFileSync(join(ROOT, "src/data/catalogue.json"), "utf8"));
const products = Array.isArray(catalogue) ? catalogue : catalogue.products ?? [];
const overrides = JSON.parse(readFileSync(join(ROOT, "src/lib/product-image-overrides.json"), "utf8"));

const onDisk = new Set(existsSync(SRC_DIR) ? readdirSync(SRC_DIR) : []);
const plan = new Map(); // object path -> { local, skus[] }

for (const p of products) {
  const sku = (p.sku ?? "").trim();
  if (!sku || overrides[sku]) continue;
  if (!/^S/i.test(sku) || /^SC/i.test(sku)) continue;
  const urls = (p.images ?? []).map((i) => i.src).filter(Boolean);
  urls.forEach((src, i) => {
    let u;
    try {
      u = new URL(src);
    } catch {
      return;
    }
    const rel = u.pathname.split("/wp-content/uploads/")[1];
    if (!rel) return;
    const local = `${sku.replace(/[^A-Za-z0-9._-]/g, "_")}-${i + 1}${extname(u.pathname) || ".jpg"}`;
    if (!onDisk.has(local)) return;
    const original = decodeURIComponent(rel);
    // Storage rejects a non-ASCII key; `拷贝` is "copy", so say that.
    const key = original.replace(/[^\x20-\x7E]+/g, "copy").replace(/-+copy/g, "-copy");
    const held = plan.get(key);
    if (held) held.skus.push(sku);
    else plan.set(key, { local, skus: [sku], original });
  });
}

console.log(`${onDisk.size} files on disk, ${plan.size} distinct objects to archive`);
if (!WRITE) {
  console.log("DRY RUN — ARCHIVE_WRITE=true to upload.");
}

async function ensureBucket() {
  const res = await fetch(`${URL_BASE}/storage/v1/bucket`, { headers: auth });
  const buckets = res.ok ? await res.json() : [];
  if (buckets.some((b) => b.name === BUCKET)) return "exists";
  const made = await fetch(`${URL_BASE}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ name: BUCKET, id: BUCKET, public: false }),
  });
  if (!made.ok) throw new Error(`create bucket: ${made.status} ${await made.text()}`);
  return "created";
}

let uploaded = 0,
  already = 0,
  failed = 0;

if (WRITE) {
  console.log(`bucket ${BUCKET}: ${await ensureBucket()}`);
  for (const [key, { local }] of plan) {
    const body = readFileSync(join(SRC_DIR, local));
    const res = await fetch(`${URL_BASE}/storage/v1/object/${BUCKET}/${encodeURI(key)}`, {
      method: "POST",
      headers: {
        ...auth,
        "Content-Type": TYPES[extname(key).toLowerCase()] ?? "application/octet-stream",
        "x-upsert": "false",
      },
      body,
    });
    if (res.ok) {
      uploaded++;
      continue;
    }
    // ALREADY THERE COMES BACK AS AN HTTP 400. Storage answers 400 with a body
    // whose own statusCode is 409 Duplicate, so `res.status === 409` never fires
    // and a second run reports every existing object as a failure. Read the body.
    const text = await res.text();
    if (res.status === 409 || /"statusCode":"409"|Duplicate/.test(text)) already++;
    else {
      failed++;
      if (failed <= 5) console.log(`  ! ${key}: ${res.status} ${text.slice(0, 70)}`);
    }
  }
}

const bytes = [...plan.values()].reduce(
  (n, v) => n + (existsSync(join(SRC_DIR, v.local)) ? readFileSync(join(SRC_DIR, v.local)).length : 0),
  0
);
const shared = [...plan.values()].filter((v) => v.skus.length > 1).length;
const renamed = [...plan.entries()].filter(([k, v]) => v.original !== k).length;

const md = [
  "# The recovered photography, archived",
  "",
  "Generated by `npm run archive:photography`.",
  "",
  `**${plan.size} objects, ${(bytes / 1024 / 1024).toFixed(1)}MB**, in the private Supabase Storage`,
  `bucket \`${BUCKET}\`, laid out as \`<year>/<month>/<original filename>\` — the old host's`,
  "own layout, and the one `catalogues.masterkraft.com/woo-images/` already uses, so a",
  "surviving `wp-content` URL maps to an object by string substitution.",
  "",
  "**Why it exists.** `recover:foreign` pulled these off a WordPress box that lost its",
  "DNS name at the 27 August cutover and answers only on a pinned IP. They land in",
  "`reports/foreign-images/`, which `.gitignore` excludes — correctly, since they are",
  "another company's brand assets — so before this the only copies were that server",
  "and one untracked folder on one machine.",
  "",
  "**The catalogues app is not the second copy it appears to be.** Across all 460",
  "distinct container photographs, 95 are on that host and **365 return 404**. A",
  "five-file sample happened to land entirely inside the covered fifth, which is how",
  "it came to be described as a mirror.",
  "",
  "**Private, not public.** This is somewhere to keep Snap's and Fernwood's",
  "photography, not somewhere to serve it from. Nothing here makes it reachable from",
  "masterkraft.com, and no `product_images` row or page changed.",
  "",
  "| | |",
  "|---|---:|",
  `| Objects archived | ${plan.size} |`,
  `| Size | ${(bytes / 1024 / 1024).toFixed(1)}MB |`,
  `| Files shared by more than one SKU | ${shared} |`,
  `| Keys renamed for Storage (non-ASCII filename) | ${renamed} |`,
  "",
  "## What each object belongs to",
  "",
  "| object | SKUs |",
  "|---|---|",
  ...[...plan.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([key, v]) =>
        `| \`${key}\`${v.original !== key ? ` <br>*was* \`${v.original}\`` : ""} | ${v.skus
          .map((s) => `\`${s}\``)
          .join(", ")} |`
    ),
  "",
];
writeFileSync(MD, md.join("\n"));

if (WRITE) console.log(`uploaded ${uploaded}, already present ${already}, failed ${failed}`);
console.log(`manifest -> reports/photography-archive.md`);
