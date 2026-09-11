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
// ---------------------------------------------------------------------------
// ONLY TWO OF THE TEN CAN BE WRITTEN THROUGH THIS API. Run 2026-09-11:
// MAACU02-XL and MAACU12M went through and verified; the other eight were
// rejected 400 "Product Sub Group is not a valid sub group of the selected
// Product Group" - on records whose group and subgroup are perfectly consistent,
// as served by Unleashed's own GET moments earlier.
//
// The discriminator is not the data. It is whether the SUBGROUP NAME is unique
// in the ProductGroups list, and the correlation over the ten is exact:
//
//   Unisex                    x1 in 154   WROTE
//   Woman                     x1          WROTE
//   Chest & Shoulder Machines x2          rejected (four records)
//   Speed & Agility           x2          rejected
//   Cable Machines            x3          rejected
//   Dumbbells                 x3          rejected (two records)
//
// Unleashed's POST resolves the subgroup by NAME rather than by the Guid the
// record carries, so a name that exists under more than one parent cannot be
// resolved and the write is refused. Every one of these records holds a
// ProductSubGroup whose ParentGroupGuid IS its ProductGroup's Guid - they are
// valid, and the API still will not take them back.
//
// There is no fix available from this side. Renaming the duplicated subgroups to
// be unique would reshape the category taxonomy the whole site reads, which is a
// far larger change than correcting eight spellings. So the remaining eight are
// a manual edit in the Unleashed UI, where renaming a product changes one field
// instead of round-tripping the object. They are listed in
// reports/erp-name-fixes-remaining.md.
// ---------------------------------------------------------------------------
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

// POST, not PUT. Unleashed's ProductsController answers PUT /Products/{guid}
// with 405 "The PUT verb is not allowed for this resource" - it takes the whole
// object on POST to the guid URL, the same shape createUnleashedOrder uses for
// SalesOrders. The first run of this script tried PUT and wrote nothing, which
// is the read-modify-write guard doing its job rather than a near miss.
async function putProduct(product) {
  const res = await fetch(`${BASE}/Products/${product.Guid}`, {
    method: "POST",
    headers: headers(""),
    body: JSON.stringify(product),
  });
  if (!res.ok) throw new Error(`POST ${product.ProductCode} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

// Unleashed SERIALISES DATES ONE WAY AND ACCEPTS THEM ANOTHER. A GET returns
// "/Date(1653288509907)/" (the old .NET format, optionally with a "+1000"
// display offset), and POSTing that same string straight back earns
// 400 "/Date(1653288509907)/ is not a valid value for DateTime". So every date
// on the record has to be rewritten as ISO 8601 before the object can go back.
//
// The millisecond value is epoch-relative UTC and the trailing offset is
// presentation only, so the instant is preserved exactly; only the spelling
// changes. Done recursively because the dates are nested inside ProductGroup,
// ProductBrand and the attribute set as well as on the product itself.
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

// WHOLESALE TIER PRICES ARE THE REASON THIS SCRIPT IS CAREFUL.
//
// A product carries SellPriceTier1..10, each {Name, Value}. Unleashed returns
// the unset ones as {"Name":"T8-AGENT","Value":null} and then rejects that same
// object on POST with 400 "Sell Price Tier values must be decimal" - so the null
// ones have to come out of the payload.
//
// They are dropped ONLY where Value is null, never where it is set. Three of the
// ten records here carry real tier pricing: MSCSPL09 has ten tiers from
// $1,343.21 to $2,513.64, MBSADO03 has ten, and MAACU12M has nine with tier 8
// unset. These are the prices that quote distributors and REVL franchisees.
// Sending 0 in place of a null, or dropping a tier that has a value, would
// silently reprice them - which is precisely the failure the snap dumbbell
// CSV refused to risk. A null tier holds nothing, so omitting it loses nothing.
function stripEmptyTiers(product) {
  const out = {};
  const dropped = [];
  for (const [k, v] of Object.entries(product)) {
    if (/^SellPriceTier\d+$/.test(k) && v && v.Value === null) {
      dropped.push(k);
      continue;
    }
    out[k] = v;
  }
  return { payload: out, dropped };
}

// What a tier map looks like, for comparing before against after.
function tierFingerprint(product) {
  return Object.entries(product)
    .filter(([k]) => /^SellPriceTier\d+$/.test(k))
    .filter(([, v]) => v && v.Value !== null)
    .map(([k, v]) => `${k}=${v.Value}`)
    .sort()
    .join(",");
}

// Every key whose value differs between the fetched record and the payload.
// The only acceptable answer is ["ProductDescription"].
function changedKeys(before, after) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
}

const results = { applied: [], skipped: [], failed: [], alreadyCorrect: [] };

// Optional code arguments restrict the run, so the first live write can be one
// record rather than ten.
const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const planned = Object.entries(FIXES).filter(([code]) => !only.length || only.includes(code));

for (const [code, [expected, corrected]] of planned) {
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

  // The guard compares the payload against the NORMALISED record, not the raw
  // one, so it still means "this request changes exactly the description" - the
  // date rewriting above is not a change to the record, only to its spelling on
  // the wire.
  const { payload: base, dropped } = stripEmptyTiers(normaliseDates(product));
  const payload = { ...base, ProductDescription: corrected };
  const diff = changedKeys(base, payload);
  if (diff.length !== 1 || diff[0] !== "ProductDescription") {
    results.failed.push([code, `payload would change ${diff.join(", ") || "nothing"}`]);
    continue;
  }

  const tiersBefore = tierFingerprint(product);
  if (!WRITE) {
    results.applied.push([code, current, corrected, `(dry run${dropped.length ? `, ${dropped.length} empty tiers omitted` : ""})`]);
    continue;
  }
  try {
    await putProduct(payload);
  } catch (e) {
    results.failed.push([code, String(e.message)]);
    continue;
  }

  // READ IT BACK. The payload guard proves what was SENT; only a re-read proves
  // what was stored. Three of these records carry wholesale tier pricing and the
  // round trip has already surprised us twice - PUT answered 405 and the .NET
  // dates answered 400 - so the description is confirmed changed and the tier
  // prices confirmed identical before this counts as a success.
  const after = await getProduct(code).catch(() => null);
  if (!after) {
    results.failed.push([code, "written, but could not be re-read to verify"]);
    continue;
  }
  if (after.ProductDescription !== corrected) {
    results.failed.push([code, `written, but reads back as ${JSON.stringify(after.ProductDescription)}`]);
    continue;
  }
  const tiersAfter = tierFingerprint(after);
  if (tiersAfter !== tiersBefore) {
    results.failed.push([
      code,
      `TIER PRICES CHANGED. before[${tiersBefore}] after[${tiersAfter}] - restore from reports/erp-name-fixes-before.json`,
    ]);
    continue;
  }
  results.applied.push([code, current, corrected, `written, verified (tiers intact: ${tiersBefore ? tiersBefore.split(",").length : 0})`]);
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
