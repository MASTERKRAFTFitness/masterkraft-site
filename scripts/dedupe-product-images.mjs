#!/usr/bin/env node
// Collapse byte-identical product images down to one copy each.
//
// Run:  npm run dedupe:images        (after mirroring, before committing)
//
// WHY. Both mirror scripts name files after the SKU that references them
// (MBPB3I101-1.jpg), which is readable and keeps the override map obvious. The
// cost is that one photo shared by several SKUs gets written once per SKU:
// REVL-POTONG-PASIR.jpg came down eight times, and about a third of the mirrored
// files are copies of a file already on disk. That is ~36 MB of the 113 MB, and
// because git keeps every blob forever it is worth paying once, here, rather
// than carrying it in history for the life of the repo.
//
// Content-addressed by SHA-256, so this only ever merges files that are byte
// identical. It cannot merge two different photos that happen to share a SKU
// prefix, and it cannot change how any product looks.
//
// CANONICAL COPY. The winner is the alphabetically-first filename in the group,
// purely so the result is deterministic and a re-run is a no-op.
//
// IDEMPOTENT. Re-running after a clean run finds no duplicate groups and exits
// without writing anything.

import { readFileSync, writeFileSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "public/product-images");
const OVERRIDES = join(ROOT, "src/lib/product-image-overrides.json");
const DRY = process.argv.includes("--check");

const files = readdirSync(DIR).filter((f) => !f.startsWith("."));

// hash -> [filenames]
const groups = new Map();
let totalBytes = 0;
for (const f of files) {
  const full = join(DIR, f);
  if (!statSync(full).isFile()) continue;
  const buf = readFileSync(full);
  totalBytes += buf.length;
  const h = createHash("sha256").update(buf).digest("hex");
  if (!groups.has(h)) groups.set(h, []);
  groups.get(h).push(f);
}

// canonical name -> the names it replaces
const rename = new Map();
let freed = 0,
  removed = 0;
for (const names of groups.values()) {
  if (names.length < 2) continue;
  names.sort();
  const keep = names[0];
  for (const drop of names.slice(1)) {
    rename.set(drop, keep);
    freed += statSync(join(DIR, drop)).size;
    removed++;
  }
}

console.log(`${files.length} files, ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);
console.log(`${groups.size} distinct images, ${removed} redundant copies`);
console.log(`Reclaimable: ${(freed / 1024 / 1024).toFixed(1)} MB`);

if (!removed) {
  console.log("\nNothing to do.");
  process.exit(0);
}
if (DRY) {
  console.log("\n--check given, nothing written.");
  process.exit(0);
}

// Repoint the override map first. If this throws, no file has been deleted yet
// and the tree is still consistent.
const overrides = JSON.parse(readFileSync(OVERRIDES, "utf8"));
let repointed = 0;
for (const [sku, paths] of Object.entries(overrides)) {
  overrides[sku] = paths.map((p) => {
    const name = p.replace(/^\/product-images\//, "");
    const to = rename.get(name);
    if (!to || name === p) return p;
    repointed++;
    return `/product-images/${to}`;
  });
}
writeFileSync(OVERRIDES, JSON.stringify(overrides, null, 2) + "\n");

// Only now remove the duplicates.
for (const drop of rename.keys()) unlinkSync(join(DIR, drop));

console.log(`\nRepointed ${repointed} override paths`);
console.log(`Deleted ${removed} files, freed ${(freed / 1024 / 1024).toFixed(1)} MB`);
console.log(`Now: ${files.length - removed} files, ${((totalBytes - freed) / 1024 / 1024).toFixed(1)} MB`);
