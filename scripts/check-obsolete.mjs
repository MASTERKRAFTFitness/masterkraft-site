#!/usr/bin/env node
// Report drift between the committed obsolete list and Unleashed. Writes
// nothing; exits 1 if they differ, so it can gate a deploy.
//
// Run:  npm run check:obsolete
//
// The committed list is what the site actually enforces. If the ERP has retired
// something since the list was generated, the site is still selling it.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src/lib/obsolete-skus.json");

const before = readFileSync(OUT, "utf8");
execFileSync("node", [join(ROOT, "scripts/build-obsolete-skus.mjs")], { stdio: "inherit" });
const after = readFileSync(OUT, "utf8");

if (before === after) {
  console.log("\nClean: the committed obsolete list matches Unleashed.");
  process.exit(0);
}

// Put the file back the way it was: this command reports, it does not change things.
execFileSync("git", ["checkout", "--", OUT], { cwd: ROOT });
console.error(
  "\nDRIFT: Unleashed no longer matches src/lib/obsolete-skus.json.\n" +
    "The site is serving products the ERP has retired (or hiding ones it has not).\n" +
    "Fix with:  npm run build:obsolete   then commit the JSON."
);
process.exit(1);
