#!/usr/bin/env node
// Refuse to deploy production from anywhere but a clean, current `main`.
//
// Run:  automatically, as the first link in `predeploy`
//
// WHY THIS EXISTS. `vercel deploy --prod` uploads the WORKING TREE, not a git
// ref. It does not care what branch is checked out, whether the tree is dirty,
// or whether the commit exists anywhere but this laptop. On 2026-09-04 a
// production deploy run from a feature branch shipped two unmerged commits that
// rewrote how a cart is priced — live, alongside real Stripe keys, fifteen
// seconds after an unrelated commit. Nothing failed and nothing said anything.
// The only reason it was caught was `git push` reporting "Everything
// up-to-date" on a branch that was not the one being worked on.
//
// The existing predeploy checks all ask "is the committed data correct?". None
// of them asks "is this the code we think we are shipping?". That is this file.
//
// THE DIRTY-TREE CHECK IS NOT PEDANTRY. Because the upload is the tree and not
// the commit, an uncommitted edit goes live while `git log` on the deployed SHA
// shows something else entirely. That is the hardest version of this bug to
// diagnose after the fact, so it is a hard failure rather than a warning.
//
// Deliberate override, for the rare case where you do mean it:
//
//   ALLOW_BRANCH_DEPLOY=1 npm run deploy
//
// This guards `npm run deploy`. It cannot guard a bare `npx vercel deploy
// --prod`, which bypasses npm scripts entirely — that remains the sharp edge.
import { execSync } from "node:child_process";

const git = (args) => execSync(`git ${args}`, { encoding: "utf8" }).trim();
const fail = (lines) => {
  console.error(`\n  Refusing to deploy.\n\n${lines.map((l) => `  ${l}`).join("\n")}\n`);
  process.exit(1);
};

if (process.env.ALLOW_BRANCH_DEPLOY === "1") {
  console.log("check-deploy-branch: ALLOW_BRANCH_DEPLOY=1, override accepted.");
  process.exit(0);
}

const branch = git("rev-parse --abbrev-ref HEAD");
if (branch !== "main") {
  fail([
    `On branch "${branch}", not main.`,
    "",
    "A production deploy uploads the working tree, so this would ship",
    "whatever is checked out here — including commits that are on no",
    "other machine and have been through no review.",
    "",
    "  git switch main        then deploy",
    "  ALLOW_BRANCH_DEPLOY=1  if you genuinely mean to ship this branch",
  ]);
}

const dirty = git("status --porcelain");
if (dirty) {
  const files = dirty.split("\n").slice(0, 10);
  fail([
    "The working tree has uncommitted changes:",
    "",
    ...files,
    ...(dirty.split("\n").length > 10 ? [`  ...and ${dirty.split("\n").length - 10} more`] : []),
    "",
    "These would go live, while the deployed commit says otherwise.",
    "Commit them or stash them first.",
  ]);
}

// Unpushed commits are a softer problem than the two above: the code is at
// least committed and reviewable locally. Worth saying out loud, not worth
// blocking on — plenty of legitimate deploys are a fix that has not been pushed
// yet, and a hard failure here would just teach people to reach for the
// override, which is how a guard stops being read.
let ahead = "0";
try {
  ahead = git("rev-list --count origin/main..HEAD");
} catch {
  console.warn("check-deploy-branch: no origin/main to compare against, skipping.");
}
if (ahead !== "0") {
  console.warn(
    `\n  check-deploy-branch: ${ahead} commit(s) on main are not pushed to origin.\n` +
      "  They will go live. Push them so the deployed code exists somewhere else too.\n"
  );
}

console.log(`check-deploy-branch: main, clean, ${ahead} unpushed. OK.`);
