// Upload the catalogue's product photography into Supabase Storage.
//
//   npm run upload:images          report what WOULD upload
//   npm run upload:images:write    upload
//
// ONE HOME FOR THE FILES. The images live in masterkraft-catalogues/public,
// which means every other consumer either ships its own copy or hot-links a
// deploy. The portal shipped a copy - a 261-SKU map generated 2026-08-27 with
// zero F codes in it - which is why the Fernwood range has no pictures there.
//
// HOT-LINKING THE DEPLOY WAS CHECKED AND REJECTED. On 2026-09-24
// catalogues.masterkraft.com served FBPB3I101.png at 227KB where the repo holds
// 531KB: the deployed build predates two days of re-livery, so a portal pointed
// at it would show the MASTERKRAFT versions of images we have since replaced.
//
// IDEMPOTENT BY CONTENT. Each file's sha256 is compared with what the bucket
// already holds, so a re-run uploads only what changed. That matters because a
// re-liveried render keeps its filename - FBPB3I101.png is the same path before
// and after the mark came off - and an upload that skipped on name alone would
// leave the old picture in place forever.
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const WRITE = process.env.IMAGES_UPLOAD_WRITE === "true";
const CAT = process.env.HOME + "/Desktop/masterkraft-catalogues";
const ROOT = join(CAT, "public", "brand-images");
const BUCKET = "product-images";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const TYPE = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (TYPE[extname(e.name).toLowerCase()]) out.push(p);
  }
  return out;
}

const files = walk(ROOT);
const total = files.reduce((n, f) => n + statSync(f).size, 0);

// What the bucket already holds, with the hash we recorded at upload time.
const known = new Map();
for (const prefix of readdirSync(ROOT, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)) {
  let page = 0;
  for (;;) {
    const { data, error } = await sb.storage.from(BUCKET).list(prefix, { limit: 1000, offset: page * 1000 });
    if (error) break;
    for (const o of data) known.set(`${prefix}/${o.name}`, o.metadata?.eTag?.replace(/"/g, "") ?? null);
    if (data.length < 1000) break;
    page++;
  }
}

const todo = [];
for (const f of files) {
  const key = relative(ROOT, f);
  const body = readFileSync(f);
  const md5 = createHash("md5").update(body).digest("hex");
  // Storage's eTag is the md5 for a single-part upload, so it doubles as the
  // content check without keeping a manifest of our own.
  if (known.get(key) === md5) continue;
  todo.push({ key, f, body, md5, type: TYPE[extname(f).toLowerCase()] });
}

console.log(`local files     : ${files.length}  (${(total / 1e6).toFixed(0)} MB)`);
console.log(`already in bucket: ${known.size}`);
console.log(`to upload        : ${todo.length}  (${(todo.reduce((n, t) => n + t.body.length, 0) / 1e6).toFixed(0)} MB)`);
console.log(`mode             : ${WRITE ? "WRITE" : "report only"}`);

if (WRITE && todo.length) {
  let done = 0, failed = [];
  for (const t of todo) {
    const { error } = await sb.storage.from(BUCKET).upload(t.key, t.body, {
      contentType: t.type, upsert: true, cacheControl: "31536000",
    });
    if (error) failed.push(`${t.key}: ${error.message}`);
    if (++done % 50 === 0) process.stdout.write(`uploaded ${done}/${todo.length}\r`);
  }
  console.log(`\nuploaded ${done - failed.length}/${todo.length}`);
  if (failed.length) {
    console.error(`FAILED ${failed.length}:`);
    for (const f of failed.slice(0, 10)) console.error("   " + f);
    process.exitCode = 1;
  }
  mkdirSync("reports", { recursive: true });
  writeFileSync("reports/product-images-upload.md",
    `# product-images upload\n\nlocal ${files.length}, uploaded ${done - failed.length}, failed ${failed.length}\n`);
}
