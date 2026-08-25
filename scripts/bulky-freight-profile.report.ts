// Profiles the part of the catalogue Australia Post CANNOT carry, so a bulky
// freight brief quotes real volumes instead of adjectives.
//
//   npm run report:bulky
//     reports/bulky-freight-profile.md
//     reports/bulky-freight-profile.csv
//
// The parcel/bulky split uses the SAME thresholds the live checkout applies
// (lib/freight.ts), so "bulky" here means exactly the consignments the site
// already refuses to price online and pushes to a manual quote. Anything else
// would be a different number to the one customers actually hit.
import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { allProducts, productsInCategory } from "@/lib/catalogue";
import { filterBrandSku, filterListable, type WcProduct } from "@/lib/woocommerce";
import {
  MAX_PARCEL_DIMENSION_CM,
  MAX_PARCEL_VOLUME_M3,
  MAX_PARCEL_WEIGHT_KG,
} from "@/lib/freight";

const MD = "reports/bulky-freight-profile.md";
const CSV = "reports/bulky-freight-profile.csv";

const num = (v: unknown) => {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// A side over 3m, or over 3 cubic metres, is a data-entry error rather than a
// carton (millimetres typed into a centimetre field). Counted separately: these
// cannot be quoted by anyone until the record is fixed.
const implausible = (r: Row) => Math.max(r.l, r.w, r.h) > 300 || r.m3 > 3;

type Row = {
  sku: string;
  name: string;
  kg: number;
  l: number;
  w: number;
  h: number;
  m3: number;
};

const q = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;

function band(rows: Row[], label: string, test: (r: Row) => boolean, total: number) {
  const n = rows.filter(test).length;
  return `| ${label} | ${n} | ${((n / total) * 100).toFixed(0)}% |`;
}

it("writes the bulky freight profile", () => {
  const clearance = new Set(productsInCategory(356).map((p) => p.id));
  const served = allProducts().filter(
    (p) => filterListable([p]).length > 0 && (clearance.has(p.id) || filterBrandSku([p]).length > 0)
  );

  const all: Row[] = served.map((p: WcProduct) => {
    const l = num(p.dimensions?.length);
    const w = num(p.dimensions?.width);
    const h = num(p.dimensions?.height);
    return {
      sku: p.sku ?? "",
      name: p.name,
      kg: num(p.weight),
      l,
      w,
      h,
      m3: (l * w * h) / 1e6,
    };
  });

  const noData = all.filter((r) => !r.kg || !r.l || !r.w || !r.h);
  const measured = all.filter((r) => r.kg && r.l && r.w && r.h);
  const broken = measured.filter(implausible);
  const usable = measured.filter((r) => !implausible(r));

  const isParcel = (r: Row) =>
    r.kg <= MAX_PARCEL_WEIGHT_KG &&
    Math.max(r.l, r.w, r.h) <= MAX_PARCEL_DIMENSION_CM &&
    r.m3 <= MAX_PARCEL_VOLUME_M3;

  const parcel = usable.filter(isParcel);
  const bulky = usable.filter((r) => !isParcel(r));
  const byWeight = [...bulky].sort((a, b) => a.kg - b.kg);
  const median = byWeight[Math.floor(byWeight.length / 2)];
  const heaviest = byWeight[byWeight.length - 1];
  const longest = [...bulky].sort((a, b) => Math.max(b.l, b.w, b.h) - Math.max(a.l, a.w, a.h))[0];
  const totalM3 = bulky.reduce((s, r) => s + r.m3, 0);

  const why = (r: Row) =>
    [
      r.kg > MAX_PARCEL_WEIGHT_KG ? "weight" : null,
      Math.max(r.l, r.w, r.h) > MAX_PARCEL_DIMENSION_CM ? "length" : null,
      r.m3 > MAX_PARCEL_VOLUME_M3 ? "volume" : null,
    ]
      .filter(Boolean)
      .join(" + ");

  const n = bulky.length;
  const md = `# Bulky freight profile

Generated from the committed catalogue snapshot by \`npm run report:bulky\`.
Thresholds are the ones the live checkout enforces (\`lib/freight.ts\`):
**over ${MAX_PARCEL_WEIGHT_KG}kg, over ${MAX_PARCEL_DIMENSION_CM}cm on any side, or over ${MAX_PARCEL_VOLUME_M3}m3** is not a parcel.

## The split

| segment | products | share |
|---|---|---|
| Parcel, carried today by Australia Post | ${parcel.length} | ${((parcel.length / usable.length) * 100).toFixed(0)}% |
| **Bulky, no carrier** | **${n}** | **${((n / usable.length) * 100).toFixed(0)}%** |
| Carton data missing, cannot be quoted by anyone | ${noData.length} | - |
| Carton data implausible, needs fixing before quoting | ${broken.length} | - |

${usable.length} of ${all.length} listed products carry usable carton data.

## What the bulky segment looks like

| measure | value |
|---|---|
| Median weight | ${median?.kg ?? 0}kg |
| Heaviest | ${heaviest?.kg ?? 0}kg (${heaviest?.sku}, ${heaviest?.name}) |
| Longest side | ${longest ? Math.max(longest.l, longest.w, longest.h) : 0}cm (${longest?.sku}, ${longest?.name}) |
| Total cubic if one of everything | ${totalM3.toFixed(1)}m3 |
| Average cubic per item | ${(totalM3 / Math.max(1, n)).toFixed(2)}m3 |

### Weight bands

| band | products | share |
|---|---|---|
${band(bulky, `${MAX_PARCEL_WEIGHT_KG}kg to 50kg`, (r) => r.kg <= 50, n)}
${band(bulky, "50kg to 100kg", (r) => r.kg > 50 && r.kg <= 100, n)}
${band(bulky, "100kg to 200kg", (r) => r.kg > 100 && r.kg <= 200, n)}
${band(bulky, "200kg to 500kg", (r) => r.kg > 200 && r.kg <= 500, n)}
${band(bulky, "Over 500kg", (r) => r.kg > 500, n)}

### Why each falls out of parcel

| reason | products | share |
|---|---|---|
${band(bulky, "Weight only", (r) => why(r) === "weight", n)}
${band(bulky, "Length only", (r) => why(r) === "length", n)}
${band(bulky, "Volume only", (r) => why(r) === "volume", n)}
${band(bulky, "More than one reason", (r) => why(r).includes("+"), n)}

### Handling flags

| flag | products | share |
|---|---|---|
${band(bulky, "Over 100kg, needs mechanical handling", (r) => r.kg > 100, n)}
${band(bulky, "Over 2m on a side, may not fit a standard pallet", (r) => Math.max(r.l, r.w, r.h) > 200, n)}
${band(bulky, "Over 1m3, cubes out before it weighs out", (r) => r.m3 > 1, n)}

## Ten representative consignments

Spread across the range on purpose, so a rate card priced off these is priced off
what actually ships.

| sku | product | kg | carton cm | m3 | out of parcel because |
|---|---|---|---|---|---|
${Array.from({ length: 10 }, (_, i) => byWeight[Math.floor((byWeight.length - 1) * (i / 9))])
  .map((r) => `| ${r.sku} | ${r.name} | ${r.kg} | ${r.l} x ${r.w} x ${r.h} | ${r.m3.toFixed(2)} | ${why(r)} |`)
  .join("\n")}

## Records that block a quote

${broken.length} products carry carton dimensions that cannot be real, so no carrier
can price them until the source record is corrected:

${broken
  .slice(0, 15)
  .map((r) => `- \`${r.sku}\` ${r.name}: ${r.l} x ${r.w} x ${r.h}cm, ${r.m3.toFixed(1)}m3`)
  .join("\n")}

${noData.length} more carry no carton data at all.
`;

  writeFileSync(MD, md);
  writeFileSync(
    CSV,
    [
      "segment,sku,product,weight_kg,length_cm,width_cm,height_cm,cubic_m3,out_of_parcel_because",
      ...bulky.map((r) =>
        ["bulky", q(r.sku), q(r.name), r.kg, r.l, r.w, r.h, r.m3.toFixed(3), q(why(r))].join(",")
      ),
      ...broken.map((r) =>
        ["implausible", q(r.sku), q(r.name), r.kg, r.l, r.w, r.h, r.m3.toFixed(3), q("data error")].join(",")
      ),
    ].join("\n")
  );

  console.log(
    `bulky ${n} / parcel ${parcel.length} / no data ${noData.length} / implausible ${broken.length}`
  );
});
