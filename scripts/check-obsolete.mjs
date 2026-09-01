#!/usr/bin/env node
// Report drift between the COMMITTED obsolete list and Unleashed. Writes
// nothing; exits 1 if they differ, so it can gate a deploy.
//
// Run:  npm run check:obsolete
//
// The committed list is what the site actually enforces. If the ERP has retired
// something since the list was committed, the site is still selling it.
//
// TWO BUGS LIVED HERE, and both let a stale list ship while the log said "Clean".
//
// 1. It compared the WORKING COPY against Unleashed, not the committed file.
//    With a freshly regenerated but uncommitted list on disk, working copy and
//    Unleashed agreed, so the gate passed -- while HEAD, the thing that actually
//    gets built and deployed, was still stale. Read HEAD explicitly.
//
// 2. It restored the file with `git checkout -- OUT`, which restores from the
//    INDEX, not from what was on disk a moment earlier. Any uncommitted
//    regeneration was silently destroyed by running the check. On 2 Sep this
//    reverted a pending 814-code list back to the committed 804, dropping 10
//    retired products that were still being served. Put back the exact bytes we
//    read, and never let a reporting command touch git state.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src/lib/obsolete-skus.json");
const REL = relative(ROOT, OUT);

// Compare the CODES, not the whole file. The file also carries a `generatedFrom`
// counter of how many products Unleashed held at the time, and that moves
// whenever the ERP gains or loses any product at all -- which is not drift in
// anything the site enforces. Diffing the raw text failed a deploy because the
// catalogue grew from 1,892 to 1,942 products while all 804 retired codes were
// identical. The retirement list is the thing that decides what we serve.
const codesOf = (text) => {
  try {
    return JSON.parse(text).codes ?? null;
  } catch {
    return null;
  }
};

const committedText = (() => {
  try {
    return execFileSync("git", ["show", `HEAD:${REL}`], { cwd: ROOT, encoding: "utf8" });
  } catch {
    return null; // not committed yet -- treated as drift below
  }
})();

// Regenerate over the top, read the truth, then put the working copy back byte
// for byte. build-obsolete-skus.mjs only writes OUT, so this is the whole of it.
const before = readFileSync(OUT, "utf8");
let after;
try {
  execFileSync("node", [join(ROOT, "scripts/build-obsolete-skus.mjs")], { stdio: "inherit" });
  after = readFileSync(OUT, "utf8");
} finally {
  writeFileSync(OUT, before);
}

const live = codesOf(after);
const committed = codesOf(committedText ?? "");
const working = codesOf(before);

if (live === null) {
  console.error(`\nCould not read regenerated codes from ${REL}.`);
  process.exit(1);
}

const same = (a, b) =>
  a !== null && b !== null && JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

// The working copy is ahead of HEAD and already correct: the fix exists, it just
// is not committed. Say so plainly rather than passing, or the commit gets lost.
if (!same(committed, live) && same(working, live)) {
  console.error(
    `\nUNCOMMITTED FIX: ${REL} on disk matches Unleashed, but HEAD does not.\n` +
      `A deploy builds from the commit, so the retired products would still be served.\n` +
      `Fix with:  git add ${REL} && git commit\n`
  );
  process.exit(1);
}

if (same(committed, live)) {
  console.log("\nClean: the committed obsolete list matches Unleashed.");
  if (!same(working, committed)) {
    console.log(`(Heads up: your working copy of ${REL} differs from HEAD.)`);
  }
  if (before !== after) {
    console.log(
      "(The ERP's total product count has moved since this list was generated.\n" +
        " Harmless -- no retirement changed. `npm run build:obsolete` refreshes the note.)"
    );
  }
  process.exit(0);
}

const added = live.filter((c) => !(committed ?? []).includes(c));
const removed = (committed ?? []).filter((c) => !live.includes(c));
console.error(
  `\nDRIFT: Unleashed no longer matches the committed ${REL}.\n` +
    "The site is serving products the ERP has retired (or hiding ones it has not)." +
    (added.length ? `\n  + ${added.length} retired since the commit: ${added.slice(0, 10).join(", ")}` : "") +
    (removed.length ? `\n  - ${removed.length} no longer retired: ${removed.slice(0, 10).join(", ")}` : "") +
    "\nFix with:  npm run build:obsolete   then commit the JSON."
);
process.exit(1);
