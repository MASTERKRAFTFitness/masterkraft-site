// Ten misspelled ProductDescriptions in Unleashed, corrected.
//
//   npm run fix:erp-names                      dry run — prints the diff, writes nothing
//   ERP_NAMES_WRITE=true npm run fix:erp-names applies it
//
// WHY THIS IS A SCRIPT AND NOT A SPREADSHEET. ProductDescription is what the
// site renders as the product's <h1> and <title>, what the catalogue groups
// ranges by, and what appears on a quote. Ten of them are misspelled, and the
// correct spelling is not in question for any of the ten - "Multi-sation" is
// not a word, MAACU12M is the medium and its description says (S). These are
// mechanical corrections, which is exactly what a script should do and a person
// should not have to do ten times.
//
// WHAT IS NOT HERE: the duplicates. See reports/erp-duplicates.md. Those need
// someone who knows the catalogue, because at least one apparent duplicate is
// not one, and the rest carry prices on records that quote and invoice.
//
// IT WRITES NOTHING BY DEFAULT, following archive-photography.mjs and the
// *_WRITE=true convention the other loaders use. The default run prints the
// before and after for every record and stops.
//
// READ-MODIFY-WRITE, WHOLE OBJECT. Unleashed's PUT replaces the product, so a
// partial body blanks every field it omits - on records that carry prices,
// groups, brands and units of measure. Each record is fetched first, one field
// is changed on the object that comes back, and that object goes back. The dry
// run asserts the payload differs from the fetched record in exactly one field
// before anything is sent.
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
const WRITE = process.env.ERP_NAMES_WRITE === "true";

// code -> [expected current description, corrected description]
//
// The EXPECTED value is a guard, not documentation. If somebody has already
// fixed one of these in Unleashed, or renamed the product for another reason,
// this script must not overwrite their work with a stale correction - so a
// record whose description no longer matches is skipped and reported.
const FIXES = {
  // "Multi-sation" is not a word. Three records.
  MSCMSE02: ["4 Stack Multi-sation", "4 Stack Multi-station"],
  MSCMSE04: ["5 Stack Multi-sation", "5 Stack Multi-station"],
  MSCMSE03: ["8 Stack Multi-sation", "8 Stack Multi-station"],
  // Markers, not markets. They mark out a circuit.
  MBSADO03: ["Station Markets (Set of 20)", "Station Markers (Set of 20)"],
  // "Dummbell" -> "Dumbbell", mid-string.
  MMPAUR01: [
    "Urethane Fixed Dumbbells Set (1-10kg Pairs) & Vertical Dummbell Rack - 10 Pair (Single Sided) 1.0",
    "Urethane Fixed Dumbbells Set (1-10kg Pairs) & Vertical Dumbbell Rack - 10 Pair (Single Sided) 1.0",
  ],
  // Double space between "Chrome" and "Dumbbell".
  MMDBCE01: ["Chrome  Dumbbell Set (1kg-10kg Pairs)", "Chrome Dumbbell Set (1kg-10kg Pairs)"],
  // Title case, to match every other machine in the group.
  MSCSPL09: ["Shoulder press", "Shoulder Press"],
  OSCMDU01: ["Functional trainer", "Functional Trainer"],
  // "Oversided" -> "Oversized".
  "MAACU02-XL": ["Oversided Hoodie (XL)", "Oversized Hoodie (XL)"],
  // THE ONE THAT IS A BUG RATHER THAN A TYPO. MAACU12M is the medium - the code
  // says so, and it sits between MAACU12S and MAACU12L at the same price - but
  // its description reads (S). So the range renders sizes ["S","S","L","XL"]:
  // the medium is unbuyable under its own name and one of the two S entries is
  // unreachable in the picker. This is the only fix here that changes what a
  // customer can order.
  MAACU12M: ["Sports Bra (Woman) (S)", "Sports Bra (Woman) (M)"],
};

function signed(query) {
  return crypto.createHmac("sha256", env.UNLEASHED_API_KEY).update(query).digest("base64");
}

function headers(query = "") {
  return {
    "api-auth-id": env.UNLEASHED_API_ID,
    "api-auth-signature": signed(query),
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function getProduct(code) {
  const query = `productCode=${encodeURIComponent(code)}`;
  const res = await fetch(`${BASE}/Products?${query}`, { headers: headers(query) });
  if (!res.ok) throw new Error(`GET ${code} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data.Items ?? []).find((p) => p.ProductCode === code) ?? null;
}

async function putProduct(product) {
  const res = await fetch(`${BASE}/Products/${product.Guid}`, {
    method: "PUT",
    headers: headers(""),
    body: JSON.stringify(product),
  });
  if (!res.ok) throw new Error(`PUT ${product.ProductCode} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

// Every key whose value differs between the fetched record and the payload.
// The only acceptable answer is ["ProductDescription"].
function changedKeys(before, after) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
}

const results = { applied: [], skipped: [], failed: [], alreadyCorrect: [] };

for (const [code, [expected, corrected]] of Object.entries(FIXES)) {
  let product;
  try {
    product = await getProduct(code);
  } catch (e) {
    results.failed.push([code, String(e.message)]);
    continue;
  }
  if (!product) {
    results.failed.push([code, "not found in Unleashed"]);
    continue;
  }

  const current = product.ProductDescription;
  if (current === corrected) {
    results.alreadyCorrect.push([code, current]);
    continue;
  }
  if (current !== expected) {
    results.skipped.push([code, current, expected]);
    continue;
  }

  const payload = { ...product, ProductDescription: corrected };
  const diff = changedKeys(product, payload);
  if (diff.length !== 1 || diff[0] !== "ProductDescription") {
    results.failed.push([code, `payload would change ${diff.join(", ") || "nothing"}`]);
    continue;
  }

  if (!WRITE) {
    results.applied.push([code, current, corrected, "(dry run)"]);
    continue;
  }
  try {
    await putProduct(payload);
    results.applied.push([code, current, corrected, "written"]);
  } catch (e) {
    results.failed.push([code, String(e.message)]);
  }
}

const line = (s) => console.log(s);
line("");
line(WRITE ? "ERP NAME FIXES — WRITING" : "ERP NAME FIXES — DRY RUN (nothing sent)");
line("");
for (const [code, from, to, how] of results.applied) {
  line(`  ${code.padEnd(12)} ${how}`);
  line(`      - ${from}`);
  line(`      + ${to}`);
}
if (results.alreadyCorrect.length) {
  line("\n  already correct (no action):");
  for (const [code, cur] of results.alreadyCorrect) line(`    ${code.padEnd(12)} ${cur}`);
}
if (results.skipped.length) {
  line("\n  SKIPPED — description no longer matches what this script expected:");
  for (const [code, cur, exp] of results.skipped) {
    line(`    ${code.padEnd(12)} found ${JSON.stringify(cur)}, expected ${JSON.stringify(exp)}`);
  }
}
if (results.failed.length) {
  line("\n  FAILED:");
  for (const [code, why] of results.failed) line(`    ${code.padEnd(12)} ${why}`);
}
line("");
line(
  WRITE
    ? `${results.applied.length} written, ${results.skipped.length} skipped, ${results.failed.length} failed.`
    : `${results.applied.length} would change. Set ERP_NAMES_WRITE=true to apply.`
);
line("");
if (results.failed.length) process.exitCode = 1;
