#!/usr/bin/env node
// Create the Snap dumbbell codes that exist in WooCommerce and not in Unleashed.
//
// Run:  npm run create:snap                  (dry run — prints the payloads)
//       CREATE_WRITE=true npm run create:snap
//
// TWO CODES, NOT THE 67 IT WAS WRITTEN FOR. Premium Rubber Hex (24), Rubber Hex
// (26) and Virgin Rubber Fixed (17) are sold under S codes in the frozen
// WooCommerce snapshot and appear to be missing from Unleashed. 65 of the 67 are
// not missing at all: they are there, Obsolete=true and IsSellable=false, each
// already carrying a price. Only SMDBPRH03 and SMDBPRH09 had no record.
//
// THE PRICING RULE IS THE USER'S. Where Unleashed already holds a price it is
// kept and nothing here touches it; where there is no record at all, the
// snapshot's price comes across with the rest of the product, because it is then
// the only figure that exists.
//
// That was decided knowing the two systems disagree on price for two-thirds of
// the codes they share: 100 of 149 S codes and 133 of 204 M/N codes, at no
// constant ratio — MFRFRR06 is $227.27 in Unleashed and $21.00 in the snapshot.
//
// WHETHER THE OTHER 65 SHOULD BE UN-OBSOLETED IS NOT A DATA QUESTION and nothing
// here does it. Somebody set that flag on purpose; clearing it puts 65
// discontinued Snap lines back on sale.
//
// IMAGES STILL CANNOT COME THIS WAY. `Images` is GET-only on Products and
// Unleashed's support says CSV cannot carry them either. The Products endpoint
// itself does accept POST, which is why the RECORDS can be created here and the
// photographs cannot. Run `npm run stage:uploads` afterwards and the photographs
// for these codes stage themselves, named by ProductCode, for the browser.
//
// IT WRITES NOTHING BY DEFAULT, and the first write is a single canary record
// that is read back before the other 66 go. A 403 on a POST usually means the
// signature: a POST signs the QUERY STRING, which is empty here, and never the
// body — the same rule lib/unleashed-orders.ts documents for sales orders.
//
// EXISTENCE IS CHECKED WITH includeObsolete=true, AND THAT IS THE WHOLE TRICK.
// GET /Products hides obsolete records by default - 1,511 come back plain and
// 2,391 with the flag, so 880 are invisible without it. lib/unleashed's buildMap
// omits it deliberately (obsolescence is resolved from the committed list in
// obsolete.ts), which is right for the site and wrong for asking "does this code
// exist". Checked plainly, 65 of these 67 look absent; they are all there,
// Obsolete=true, IsSellable=false, and already carrying a price. Creating them
// fails with "already exists but with a different Guid" - which is what the
// canary hit on its first write.
//
// IDEMPOTENT. A code already in Unleashed is skipped, so a re-run after a
// partial failure finishes the job instead of duplicating it.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac, randomUUID } from "node:crypto";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MD = join(ROOT, "reports/snap-products-created.md");
const WRITE = process.env.CREATE_WRITE === "true";
const PARENTS = ["SMDBPRH", "SMDBRH", "SMDBVR"];

const env = {};
for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const BASE = "https://api.unleashedsoftware.com";
const sign = (q) => createHmac("sha256", env.UNLEASHED_API_KEY).update(q, "utf8").digest("base64");
const readHeaders = (q) => ({
  "api-auth-id": env.UNLEASHED_API_ID,
  "api-auth-signature": sign(q),
  Accept: "application/json",
});
// A POST signs the empty query string; the body is not part of the signature.
const writeHeaders = () => ({
  "api-auth-id": env.UNLEASHED_API_ID,
  "api-auth-signature": sign(""),
  Accept: "application/json",
  "Content-Type": "application/json",
});

async function allProducts() {
  const items = [];
  for (let page = 1; page <= 20; page++) {
    // includeObsolete: an obsolete record still owns its ProductCode.
    const q = "pageSize=200&includeObsolete=true";
    const res = await fetch(`${BASE}/Products/${page}?${q}`, { headers: readHeaders(q) });
    if (!res.ok) throw new Error(`GET /Products/${page}: ${res.status}`);
    const json = await res.json();
    items.push(...(json.Items ?? []));
    if (page >= (json.Pagination?.NumberOfPages ?? 1)) break;
  }
  return items;
}

const erpItems = await allProducts();
const erp = new Map(erpItems.map((p) => [(p.ProductCode ?? "").trim().toUpperCase(), p]));

// Reference the existing group, subgroup, brand and unit by Guid rather than by
// name: Unleashed matches on the Guid, and inventing a name creates a duplicate.
const guidFor = (pick, name) => {
  for (const p of erpItems) {
    const o = pick(p);
    if (o && (o.GroupName ?? o.BrandName ?? o.Name) === name) return o.Guid;
  }
  return undefined;
};
const BRAND_SNAP = guidFor((p) => p.ProductBrand, "SNAP");
const UOM_KG = guidFor((p) => p.UnitOfMeasure, "KG");
if (!BRAND_SNAP || !UOM_KG) throw new Error("could not resolve the SNAP brand or KG unit Guid");

const catalogue = JSON.parse(readFileSync(join(ROOT, "src/data/catalogue.json"), "utf8"));
const products = Array.isArray(catalogue) ? catalogue : catalogue.products ?? [];
const variations = JSON.parse(readFileSync(join(ROOT, "src/data/variations.json"), "utf8")).byProductId ?? {};
const bySku = new Map(products.map((p) => [(p.sku ?? "").trim().toUpperCase(), p]));

const planned = [];
for (const parent of PARENTS) {
  const p = bySku.get(parent);
  if (!p) continue;
  for (const v of variations[String(p.id)] ?? []) {
    const code = (v.sku ?? "").trim().toUpperCase();
    if (!code || erp.has(code)) continue;
    const size = (v.attributes ?? []).find((a) => (a.name ?? "").toLowerCase() === "size")?.option ?? "";
    const price = Number(v.price ?? 0) || 0;
    // The MK twin is the model for how this product is filed, not for its price.
    const twin = erp.get("M" + code.slice(1));
    planned.push({
      code,
      description: size ? `${p.name} - ${size}` : p.name,
      price,
      groupGuid: twin?.ProductGroup?.Guid ?? guidFor((x) => x.ProductGroup, "Mixed Implements"),
      subGroupGuid: twin?.ProductSubGroup?.Guid ?? guidFor((x) => x.ProductSubGroup, "Dumbbells"),
      twin: twin ? twin.ProductCode : "",
    });
  }
}
planned.sort((a, b) => a.code.localeCompare(b.code));

const payloadFor = (r) => ({
  Guid: randomUUID(),
  ProductCode: r.code,
  ProductDescription: r.description,
  ProductGroup: r.groupGuid ? { Guid: r.groupGuid } : undefined,
  ProductSubGroup: r.subGroupGuid ? { Guid: r.subGroupGuid } : undefined,
  ProductBrand: { Guid: BRAND_SNAP },
  UnitOfMeasure: { Guid: UOM_KG },
  IsSellable: true,
  IsAssembledProduct: false,
  NeverDiminishing: false,
  DefaultSellPrice: r.price || undefined,
});

console.log(`${planned.length} codes to create (${erp.size} already in Unleashed)`);
if (!WRITE) {
  console.log("DRY RUN — CREATE_WRITE=true to write.\nfirst payload:");
  console.log(JSON.stringify(payloadFor(planned[0]), null, 2));
  console.log(`...and ${planned.length - 1} more, ${planned.filter((r) => r.price).length} carrying a price.`);
}

const created = [];
const failed = [];

async function post(r) {
  const body = payloadFor(r);
  const res = await fetch(`${BASE}/Products/${body.Guid}`, {
    method: "POST",
    headers: writeHeaders(),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) return { ok: false, status: res.status, text: text.slice(0, 200) };
  return { ok: true, guid: body.Guid };
}

if (WRITE) {
  // ONE CANARY FIRST, read back before the rest. 67 wrong records is a mess to
  // undo; one is not.
  const first = planned[0];
  console.log(`canary: ${first.code}`);
  const c = await post(first);
  if (!c.ok) {
    console.log(`  FAILED ${c.status} ${c.text}`);
    process.exit(1);
  }
  const q = `pageSize=200&productCode=${first.code}`;
  const back = await fetch(`${BASE}/Products/1?${q}`, { headers: readHeaders(q) });
  const seen = back.ok ? ((await back.json()).Items ?? [])[0] : null;
  if (!seen) {
    console.log("  posted but not readable back — stopping before the rest.");
    process.exit(1);
  }
  console.log(
    `  read back: ${seen.ProductCode} ${JSON.stringify(seen.ProductDescription)} ` +
      `price=${seen.DefaultSellPrice} brand=${seen.ProductBrand?.BrandName} group=${seen.ProductGroup?.GroupName}`
  );
  created.push(first);

  for (const r of planned.slice(1)) {
    const res = await post(r);
    if (res.ok) created.push(r);
    else {
      failed.push({ ...r, why: `${res.status} ${res.text}` });
      if (failed.length <= 5) console.log(`  ! ${r.code}: ${res.status} ${res.text.slice(0, 80)}`);
    }
  }
  console.log(`created ${created.length}, failed ${failed.length}`);
}

const md = [
  "# Snap dumbbells created in Unleashed",
  "",
  "Generated by `npm run create:snap`.",
  "",
  `**${WRITE ? created.length : planned.length} product records** across three ranges that existed in`,
  "WooCommerce and had no Unleashed record at all: Premium Rubber Hex, Rubber Hex and",
  "Virgin Rubber Fixed Dumbbells.",
  "",
  "**Pricing.** Where Unleashed already holds a price it is untouched. These 67 had no",
  "Unleashed record and therefore no price, so the snapshot's own price came across",
  "with the rest of the product — the only figure that exists for them. Note that for",
  "codes the two systems SHARE, they disagree two-thirds of the time at no constant",
  "ratio, so a snapshot price is worth a look before it is quoted.",
  "",
  "**Photographs are not part of this.** `Images` is GET-only on the Products endpoint",
  "and cannot be bulk-loaded by CSV either, though the endpoint accepts POST for the",
  "record itself — which is why these exist and their pictures do not. Run",
  "`npm run stage:uploads` and the photographs stage themselves, named by ProductCode,",
  "for the browser upload.",
  "",
  "| ProductCode | product | price | filed as MK's |",
  "|---|---|---:|---|",
  ...(WRITE ? created : planned).map(
    (r) => `| \`${r.code}\` | ${r.description} | ${r.price ? `$${r.price}` : "—"} | ${r.twin ? `\`${r.twin}\`` : "—"} |`
  ),
  "",
  ...(failed.length
    ? [
        `## Failed (${failed.length})`,
        "",
        "| ProductCode | why |",
        "|---|---|",
        ...failed.map((r) => `| \`${r.code}\` | ${r.why} |`),
        "",
      ]
    : []),
];
writeFileSync(MD, md.join("\n"));
console.log(`manifest -> reports/snap-products-created.md`);
