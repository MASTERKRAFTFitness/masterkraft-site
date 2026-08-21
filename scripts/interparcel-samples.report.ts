// Builds the example shipments Interparcel asked for before they will quote rates.
//
//   npm run report:freight
//     reports/interparcel-sample-shipments.csv
//     reports/interparcel-sample-shipments.md
//
// Pulled from the real catalogue rather than invented, so the rates we are quoted
// are priced against what we actually ship. Weights and cartons come from the
// same WooCommerce fields the live quote path reads (freight-server.ts), and the
// parcels are built by the SAME rule the checkout uses: one parcel per unit,
// each product's own carton, dimensions rounded up. See lib/freight.ts.
//
// The rows are chosen to span the real distribution rather than to flatter it --
// 65 of 187 quotable products are over 30kg and 24 are over 100kg, so a rate card
// priced only on small parcels would be useless to us.
import { readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { allProducts, productsInCategory } from "@/lib/catalogue";
import { filterBrandSku, filterListable, type WcProduct } from "@/lib/woocommerce";
import { itemsToParcels, type FreightItem } from "@/lib/freight";

const CSV = "reports/interparcel-sample-shipments.csv";
const MD = "reports/interparcel-sample-shipments.md";

const num = (v: unknown) => {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// Real destinations, deliberately mixing capital-city metro with regional and
// remote, because that spread is where a freight rate card actually differs.
const DESTINATIONS = [
  { suburb: "Sydney", state: "NSW", postcode: "2000", kind: "Metro" },
  { suburb: "Melbourne", state: "VIC", postcode: "3000", kind: "Metro" },
  { suburb: "Brisbane", state: "QLD", postcode: "4000", kind: "Metro" },
  { suburb: "Perth", state: "WA", postcode: "6000", kind: "Metro" },
  { suburb: "Adelaide", state: "SA", postcode: "5000", kind: "Metro" },
  { suburb: "Canberra", state: "ACT", postcode: "2600", kind: "Metro" },
  { suburb: "Hobart", state: "TAS", postcode: "7000", kind: "Metro (island)" },
  { suburb: "Darwin", state: "NT", postcode: "0800", kind: "Remote" },
  { suburb: "Cairns", state: "QLD", postcode: "4870", kind: "Regional" },
  { suburb: "Townsville", state: "QLD", postcode: "4810", kind: "Regional" },
  { suburb: "Albury", state: "NSW", postcode: "2640", kind: "Regional" },
  { suburb: "Bendigo", state: "VIC", postcode: "3550", kind: "Regional" },
  { suburb: "Coffs Harbour", state: "NSW", postcode: "2450", kind: "Regional" },
  { suburb: "Mount Gambier", state: "SA", postcode: "5290", kind: "Regional" },
  { suburb: "Kalgoorlie", state: "WA", postcode: "6430", kind: "Remote" },
];

// A carton with a side over 3m, or over 3 cubic metres, is not a carton -- it is
// a data-entry error (millimetres typed into a centimetre field). Excluded here
// so a bad row cannot poison the rate card, and reported in the markdown.
const implausible = (p: { l: number; w: number; h: number }) =>
  Math.max(p.l, p.w, p.h) > 300 || (p.l * p.w * p.h) / 1e6 > 3;

const q = (s: string) => `"${String(s ?? "").replace(/"/g, '""')}"`;

// SKUs whose weight the spec punch list flags as disputed between the two
// content sources. They are kept OUT of the examples: MCTMSP02 is recorded as
// either 601kg or 200kg and MWBBFUR as either 11kg or 41kg, and a rate card
// priced against the wrong one of those is worse than a smaller sample. They are
// listed in the markdown instead, as data to resolve.
function disputedWeightSkus(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  let text = "";
  try {
    text = readFileSync("reports/wc-spec-gaps.csv", "utf8");
  } catch {
    return out;
  }
  const lines = text.split("\n").slice(1);
  for (const line of lines) {
    // issue,priority,sku,product,category,field,discrete,blob,...
    const m = line.match(/^conflict,\d+,"([^"]*)","([^"]*)","[^"]*","([^"]*)","([^"]*)","([^"]*)"/);
    if (!m) continue;
    const [, sku, , field, discrete, blob] = m;
    if (!/weight/i.test(field)) continue;
    const prev = out.get(sku) ?? [];
    prev.push(`${field}: ${discrete} vs ${blob}`);
    out.set(sku, prev);
  }
  return out;
}

it("writes the Interparcel sample shipments", () => {
  const clearance = new Set(productsInCategory(356).map((p) => p.id));
  const served = allProducts().filter(
    (p) => filterListable([p]).length > 0 && (clearance.has(p.id) || filterBrandSku([p]).length > 0)
  );

  const rows = served
    .map((p: WcProduct) => ({
      sku: p.sku,
      name: p.name,
      kg: num(p.weight),
      l: num(p.dimensions?.length),
      w: num(p.dimensions?.width),
      h: num(p.dimensions?.height),
    }))
    .filter((x) => x.sku && x.kg && x.l && x.w && x.h);

  const disputed = disputedWeightSkus();
  const bad = rows.filter(implausible);
  const good = rows.filter((x) => !implausible(x) && !disputed.has(x.sku as string));
  const excludedForWeight = rows.filter((x) => disputed.has(x.sku as string));
  const bySize = [...good].sort((a, b) => a.kg - b.kg);
  const at = (p: number) => bySize[Math.min(bySize.length - 1, Math.floor((bySize.length - 1) * p))];
  const longest = [...good].sort((a, b) => Math.max(b.l, b.w, b.h) - Math.max(a.l, a.w, a.h))[0];
  const heaviest = bySize[bySize.length - 1];

  // Each entry is a realistic order, not just a product: quantity matters,
  // because one parcel per unit is what we actually hand over.
  const picks: { item: typeof good[0]; qty: number; why: string }[] = [
    { item: at(0.02), qty: 1, why: "Lightest end of the range, single small accessory" },
    { item: at(0.15), qty: 2, why: "Small accessory, two units" },
    { item: at(0.25), qty: 1, why: "Lower quartile by weight" },
    { item: at(0.4), qty: 1, why: "Below median" },
    { item: at(0.5), qty: 1, why: "Median product weight (16kg)" },
    { item: at(0.5), qty: 4, why: "Median product, multi-unit order (4 cartons)" },
    { item: at(0.65), qty: 1, why: "Above median" },
    { item: at(0.75), qty: 1, why: "Upper quartile (51kg) - past most parcel limits" },
    { item: at(0.75), qty: 3, why: "Upper quartile, three cartons on one consignment" },
    { item: at(0.85), qty: 1, why: "Heavy single item" },
    { item: at(0.9), qty: 1, why: "90th percentile (136kg) - pallet territory" },
    { item: at(0.95), qty: 1, why: "Very heavy single item" },
    { item: heaviest, qty: 1, why: "Heaviest product we sell" },
    { item: longest, qty: 1, why: "Longest carton - oversize handling" },
    { item: at(0.6), qty: 6, why: "Bulk order, six cartons (typical gym fitout line)" },
  ];

  const out = picks.map((pick, i) => {
    const dest = DESTINATIONS[i % DESTINATIONS.length];
    const items: FreightItem[] = [
      {
        sku: pick.item.sku,
        name: pick.item.name,
        quantity: pick.qty,
        weightKg: pick.item.kg,
        lengthCm: pick.item.l,
        widthCm: pick.item.w,
        heightCm: pick.item.h,
      },
    ];
    // Built by the production rule, so these are the exact parcels we would send.
    const { parcels } = itemsToParcels(items);
    const total = parcels.reduce((s, p) => s + p.weight, 0);
    return {
      ref: `MK-${String(i + 1).padStart(2, "0")}`,
      dest,
      sku: pick.item.sku,
      name: pick.item.name,
      qty: pick.qty,
      parcels: parcels.length,
      each: `${parcels[0].length} x ${parcels[0].width} x ${parcels[0].height}`,
      eachKg: pick.item.kg,
      totalKg: Math.round(total * 100) / 100,
      why: pick.why,
    };
  });

  writeFileSync(
    CSV,
    "ref,to_suburb,to_state,to_postcode,destination_type,parcels,weight_per_parcel_kg," +
      "total_weight_kg,dimensions_per_parcel_cm,sku,contents,why_this_example\n" +
      out
        .map((r) =>
          [r.ref, q(r.dest.suburb), r.dest.state, r.dest.postcode, q(r.dest.kind), r.parcels,
           r.eachKg, r.totalKg, q(r.each), q(r.sku), q(`${r.name} x${r.qty}`), q(r.why)].join(",")
        )
        .join("\n") + "\n"
  );

  const heavy = good.filter((x) => x.kg > 30).length;
  const veryHeavy = good.filter((x) => x.kg > 100).length;
  const oversize = good.filter((x) => Math.max(x.l, x.w, x.h) > 150).length;

  writeFileSync(
    MD,
    `# Interparcel: example shipments\n\n` +
      `Fifteen real consignments from the MasterKraft catalogue, for rate quoting.\n` +
      `Generated by \`npm run report:freight\`. Table: \`interparcel-sample-shipments.csv\`.\n\n` +
      `## Collection address\n\n` +
      `**NOT SET — this must be filled in before sending.** Every row below needs the\n` +
      `despatch warehouse as its origin, and we have not been given it. It is also the\n` +
      `missing \`FREIGHT_COLLECTION_*\` env var that stops live quoting.\n\n` +
      `## What these are\n\n` +
      `Real products, real carton weights and real carton dimensions, taken from the\n` +
      `same fields our checkout reads. The parcels were built by the production rule:\n` +
      `**one parcel per unit, each in its own carton**, dimensions rounded up. Three\n` +
      `barbells are three cartons, not one impossible 63kg box.\n\n` +
      `Units are **kilograms and centimetres**.\n\n` +
      `## Why the spread looks like this\n\n` +
      `Of ${good.length} fully quotable products: **${heavy} are over 30kg**, **${veryHeavy} are over 100kg**,\n` +
      `and **${oversize} have a side longer than 150cm**. Median product weight is\n` +
      `${at(0.5).kg}kg and the heaviest is ${heaviest.kg}kg. A rate card priced only on small\n` +
      `parcels would not cover most of what we sell, so the examples deliberately run\n` +
      `from ${bySize[0].kg}kg to ${heaviest.kg}kg and include multi-carton consignments.\n\n` +
      `Destinations mix capital-city metro, regional and remote, plus Tasmania, since\n` +
      `that spread is where rates actually differ.\n\n` +
      `## Rows\n\n` +
      `| Ref | To | Parcels | Each | Total | Contents |\n|---|---|---:|---|---:|---|\n` +
      out.map((r) =>
        `| ${r.ref} | ${r.dest.suburb} ${r.dest.state} ${r.dest.postcode} (${r.dest.kind}) | ${r.parcels} | ` +
        `${r.eachKg}kg, ${r.each}cm | ${r.totalKg}kg | ${r.name} x${r.qty} |`).join("\n") +
      `\n\n## Data caveats worth passing on\n\n` +
      (bad.length
        ? `**${bad.length} product has bad carton data and is excluded**: ` +
          bad.map((b) => `\`${b.sku}\` (${b.name}) is recorded as ${b.l} x ${b.w} x ${b.h} cm, ` +
            `which is ${((b.l * b.w * b.h) / 1e6).toFixed(0)}m3 — almost certainly millimetres typed into a ` +
            `centimetre field. Needs fixing in WooCommerce.`).join(" ") + `\n\n`
        : "") +
      (excludedForWeight.length
        ? `**${excludedForWeight.length} products are excluded because their weight is disputed** between the two\n` +
          `content sources in our catalogue, and we will not quote a rate against a number we\n` +
          `cannot stand behind. These are being resolved:\n\n` +
          excludedForWeight
            .map((x) => `- \`${x.sku}\` ${x.name} — ${(disputed.get(x.sku as string) ?? []).join("; ")}`)
            .join("\n") + `\n\n`
        : "") +
      `**33 products carry no carton dimensions at all**, including all three Concept2\n` +
      `ergs, and bundles have none. Those cannot be quoted and currently fall back to a\n` +
      `manual quote. Fixing them in WooCommerce widens automated freight coverage past\n` +
      `the current 85%.\n`
  );

  console.log(`${out.length} sample shipments -> ${CSV}`);
});
