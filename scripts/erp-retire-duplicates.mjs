// Retire the unpriced half of a duplicate product pair, per Michael's rule of
// 2026-09-11: keep the priced record.
//
//   npm run retire:erp-dupes                       dry run — writes nothing
//   ERP_RETIRE_WRITE=true npm run retire:erp-dupes applies it
//
// RETIRE MEANS Obsolete = true. Nothing is deleted, and the flag is reversible
// from the Unleashed UI. It is also what the site reads: buildMap fetches
// Products deliberately WITHOUT includeObsolete (lib/unleashed.ts), so an
// obsoleted record leaves erpUnits and its product page stops existing. Re-run
// `npm run build:obsolete` afterwards or `check:obsolete` fails at predeploy.
//
// ONLY THE HOODIES ARE HERE, and that is the API's doing rather than a choice.
// POST /Products resolves a product's subgroup BY NAME, so a subgroup name that
// occurs more than once in the 154-entry ProductGroups list cannot be resolved
// and the write is refused - see reports/erp-name-fixes-remaining.md. The four
// lower-body pairs all sit under "Lower Body Machines", which occurs twice, so
// none of them can be written from here at all. They are listed for a manual
// edit in reports/erp-duplicates.md.
//
// THE PRICE GUARD IS THE POINT. The rule is "keep the priced record", so this
// script refuses to obsolete anything with a sell price. Each entry names the
// record it is retiring AND the record that survives, and both are checked
// against the ERP before either is touched: the survivor must still be priced,
// and the record being retired must still be at zero. If a price has moved since
// this was written, nothing is sent.
import crypto from "node:crypto";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [
      l.slice(0, l.indexOf("=")).trim(),
      l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, ""),
    ])
);

const BASE = "https://api.unleashedsoftware.com";
const WRITE = process.env.ERP_RETIRE_WRITE === "true";

// retire -> the record that survives it. Both are verified before either moves.
const PAIRS = [
  { retire: "MAACU02-S", keep: "MAACU02S" },
  { retire: "MAACU02-M", keep: "MAACU02M" },
  { retire: "MAACU02-L", keep: "MAACU02L" },
  { retire: "MAACU02-XL", keep: "MAACU02XL" },
];

function headers(query = "") {
  return {
    "api-auth-id": env.UNLEASHED_API_ID,
    "api-auth-signature": crypto.createHmac("sha256", env.UNLEASHED_API_KEY).update(query).digest("base64"),
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

// includeObsolete MATTERS ON THE WAY BACK. The default Products query excludes
// obsolete records entirely, so re-reading a record you have just obsoleted with
// the same query returns nothing - which the first run of this script reported
// as "written, but reads back Obsolete=undefined" for all four records that had
// in fact been written correctly. Verification has to be able to see the thing
// it just retired.
async function getProduct(code, { includeObsolete = false } = {}) {
  const query =
    `productCode=${encodeURIComponent(code)}` + (includeObsolete ? "&includeObsolete=true" : "");
  const res = await fetch(`${BASE}/Products?${query}`, { headers: headers(query) });
  if (!res.ok) throw new Error(`GET ${code} ${res.status}`);
  return ((await res.json()).Items ?? []).find((p) => p.ProductCode === code) ?? null;
}

// See scripts/erp-name-fixes.mjs — Unleashed serialises dates one way and
// accepts them another, and refuses its own unset price tiers back.
const DOTNET_DATE = /^\/Date\((-?\d+)([+-]\d{4})?\)\/$/;
function normaliseDates(value) {
  if (typeof value === "string") {
    const m = DOTNET_DATE.exec(value);
    return m ? new Date(Number(m[1])).toISOString() : value;
  }
  if (Array.isArray(value)) return value.map(normaliseDates);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normaliseDates(v)]));
  }
  return value;
}
function stripEmptyTiers(product) {
  return Object.fromEntries(
    Object.entries(product).filter(([k, v]) => !(/^SellPriceTier\d+$/.test(k) && v && v.Value === null))
  );
}

const price = (p) => Number(p?.DefaultSellPrice ?? 0);
const results = { retired: [], skipped: [], failed: [] };

for (const { retire, keep } of PAIRS) {
  const [victim, survivor] = await Promise.all([
    getProduct(retire, { includeObsolete: true }),
    getProduct(keep),
  ]);
  if (!victim || !survivor) {
    results.failed.push([retire, `could not read ${!victim ? retire : keep}`]);
    continue;
  }
  if (victim.Obsolete === true) {
    results.skipped.push([retire, "already obsolete"]);
    continue;
  }
  // The rule, enforced rather than trusted.
  if (price(victim) !== 0) {
    results.failed.push([retire, `REFUSED: carries a sell price of $${price(victim)} — the rule keeps priced records`]);
    continue;
  }
  if (price(survivor) <= 0) {
    results.failed.push([retire, `REFUSED: survivor ${keep} is not priced ($${price(survivor)}) — nothing would be kept`]);
    continue;
  }

  const base = stripEmptyTiers(normaliseDates(victim));
  const payload = { ...base, Obsolete: true };
  const diff = Object.keys({ ...base, ...payload }).filter(
    (k) => JSON.stringify(base[k]) !== JSON.stringify(payload[k])
  );
  if (diff.length !== 1 || diff[0] !== "Obsolete") {
    results.failed.push([retire, `payload would change ${diff.join(", ") || "nothing"}`]);
    continue;
  }

  if (!WRITE) {
    results.retired.push([retire, keep, price(survivor), "(dry run)"]);
    continue;
  }
  const res = await fetch(`${BASE}/Products/${victim.Guid}`, {
    method: "POST",
    headers: headers(""),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    results.failed.push([retire, `POST ${res.status}: ${(await res.text()).slice(0, 200)}`]);
    continue;
  }
  // Read back: the payload proves what was sent, not what was stored.
  const after = await getProduct(retire, { includeObsolete: true }).catch(() => null);
  if (after?.Obsolete !== true) {
    results.failed.push([retire, `written, but reads back Obsolete=${after?.Obsolete}`]);
    continue;
  }
  const stillThere = await getProduct(keep).catch(() => null);
  if (!stillThere || price(stillThere) !== price(survivor) || stillThere.Obsolete === true) {
    results.failed.push([retire, `SURVIVOR ${keep} CHANGED — restore from reports/erp-retire-before.json`]);
    continue;
  }
  results.retired.push([retire, keep, price(survivor), "retired, survivor verified"]);
}

console.log("");
console.log(WRITE ? "RETIRE DUPLICATES — WRITING" : "RETIRE DUPLICATES — DRY RUN (nothing sent)");
console.log("");
for (const [r, k, p, how] of results.retired) {
  console.log(`  retire ${r.padEnd(12)} ($0)  ->  keep ${k.padEnd(12)} ($${p})   ${how}`);
}
for (const [c, why] of results.skipped) console.log(`  skip   ${c.padEnd(12)} ${why}`);
if (results.failed.length) {
  console.log("\n  FAILED:");
  for (const [c, why] of results.failed) console.log(`    ${c.padEnd(12)} ${why}`);
}
console.log("");
console.log(
  WRITE
    ? `${results.retired.length} retired, ${results.skipped.length} skipped, ${results.failed.length} failed.` +
        (results.retired.length ? "\nRun `npm run build:obsolete` to resync the committed list." : "")
    : `${results.retired.length} would be retired. Set ERP_RETIRE_WRITE=true to apply.`
);
console.log("");
if (results.failed.length) process.exitCode = 1;
