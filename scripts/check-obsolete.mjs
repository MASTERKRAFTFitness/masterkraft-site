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

// Compare the CODES, not the whole file. The file also carries a `generatedFrom`
// counter of how many products Unleashed held at the time, and that moves
// whenever the ERP gains or loses any product at all -- which is not drift in
// anything the site enforces. Diffing the raw text failed a deploy because the
// catalogue grew from 1,892 to 1,942 products while all 804 retired codes were
// identical. The retirement list is the thing that decides what we serve.
const codesOf = (text) => {
  try {
    return JSON.stringify((JSON.parse(text).codes ?? []).slice().sort());
  } catch {
    return null;
  }
};
const wasCodes = codesOf(before);
const nowCodes = codesOf(after);

if (wasCodes !== null && wasCodes === nowCodes) {
  execFileSync("git", ["checkout", "--", OUT], { cwd: ROOT });
  console.log("\nClean: the committed obsolete list matches Unleashed.");
  if (before !== after) {
    console.log(
      "(The ERP's total product count has moved since this list was generated.\n" +
        " Harmless -- no retirement changed. `npm run build:obsolete` refreshes the note.)"
    );
  }
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
