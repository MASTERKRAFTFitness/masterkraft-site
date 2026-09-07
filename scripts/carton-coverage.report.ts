// What can actually be bought by card, across the WHOLE catalogue.
//
//   npm run report:coverage
//     reports/carton-coverage.md
//     reports/carton-coverage.csv
//
// TWO THINGS ARE REQUIRED AND THEY ARE INDEPENDENT. A cart line needs
//
//   1. a WooCommerce product, or `resolveOrderLines` cannot reprice it and
//      `canPay` refuses the card form (see report:erponly), and
//   2. carton data — weight AND all three dimensions — or `itemsToParcels`
//      returns `incomplete_dimensions`.
//
// AND (2) FAILS THE WHOLE CART, NOT THE LINE. One unmeasured dumbbell makes
// every other item in the basket unquotable too, which is deliberate: quoting
// part of an order and shipping the rest for nothing is worse than quoting none
// of it. So an unmeasured product is not a small gap in the catalogue, it is a
// tripwire under every basket it can be added to.
//
// HOW THIS DIFFERS FROM report:cartons. That one splits the SNAPSHOT's 220
// served products into actionable piles and is the better tool for the people
// doing the measuring. This one asks a different question — of everything the
// shop now sells, how much can complete a card checkout — against the ERP's own
// 1,345, because the catalogue is served from the ERP now and 220 is no longer
// the denominator.
//
// Carton resolution mirrors freight-server.ts: the snapshot leads, the ERP fills
// per axis, and the ERP's Width/Depth/Height map to length/width/height.
//
// Read-only.
import { createHmac } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";

const env = new Map<string, string>();
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env.set(m[1], m[2].replace(/^["']|["']$/g, ""));
}
for (const [k, v] of env) if (!process.env[k]) process.env[k] = v;

const { allProducts, variationsFor } = await import("@/lib/catalogue");
const { isRetiredSku } = await import("@/lib/obsolete");

const MD = "reports/carton-coverage.md";
const CSV = "reports/carton-coverage.csv";
const FIX_CSV = "reports/carton-unit-fix-import.csv";
const out = (s: string) => process.stdout.write(`${s}\n`);

const num = (v: unknown) => {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const q = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;

// Unleashed's import matches header cells LITERALLY, so the header must not be
// quoted - a quoted `"*Product Code"` fails with "Column is missing from the
// template". Quote only cells that need it. Learned in bc12593; do not undo it.
const cell = (v: string | number) => {
  const s2 = String(v);
  return /[",\n]/.test(s2) ? `"${s2.replace(/"/g, '""')}"` : s2;
};
const csvOf = (rows: (string | number)[][]) =>
  rows.map((r) => r.map(cell).join(",")).join("\n") + "\n";

const sign = (s: string) =>
  createHmac("sha256", process.env.UNLEASHED_API_KEY ?? "").update(s).digest("base64");

type ErpProduct = {
  ProductCode?: string;
  ProductDescription?: string;
  DefaultSellPrice?: number;
  ProductGroup?: { GroupName?: string };
  Obsolete?: boolean;
  Weight?: number;
  Width?: number;
  Depth?: number;
  Height?: number;
};

it("measures card-checkout coverage across the whole catalogue", async () => {
  const erp: ErpProduct[] = [];
  for (let page = 1; page <= 20; page++) {
    const query = "pageSize=200";
    const res = await fetch(`https://api.unleashedsoftware.com/Products/${page}?${query}`, {
      headers: {
        "api-auth-id": process.env.UNLEASHED_API_ID ?? "",
        "api-auth-signature": sign(query),
        Accept: "application/json",
      },
    });
    if (!res.ok) break;
    const json = (await res.json()) as { Items?: ErpProduct[]; Pagination?: { NumberOfPages?: number } };
    erp.push(...(json.Items ?? []));
    if (page >= (json.Pagination?.NumberOfPages ?? 1)) break;
  }

  // Snapshot carton data by SKU, variations included.
  type Carton = { kg: number; l: number; w: number; h: number };
  const snap = new Map<string, Carton>();
  const wooIds = new Set<string>();
  const add = (sku: string | undefined, c: Carton) => {
    const s = (sku ?? "").trim().toUpperCase();
    if (!s) return;
    wooIds.add(s);
    if (!snap.has(s)) snap.set(s, c);
  };
  for (const p of allProducts()) {
    add(p.sku, {
      kg: num(p.weight),
      l: num(p.dimensions?.length),
      w: num(p.dimensions?.width),
      h: num(p.dimensions?.height),
    });
    for (const v of variationsFor(p.id)) {
      add(v.sku, {
        kg: num(v.weight),
        l: num(v.dimensions?.length),
        w: num(v.dimensions?.width),
        h: num(v.dimensions?.height),
      });
    }
  }

  type Row = {
    code: string;
    name: string;
    group: string;
    price: number;
    kg: number;
    l: number;
    w: number;
    h: number;
    hasWoo: boolean;
  };

  const rows: Row[] = [];
  for (const p of erp) {
    const code = (p.ProductCode ?? "").trim();
    if (!code || p.Obsolete || isRetiredSku(code)) continue;
    if (num(p.DefaultSellPrice) <= 0) continue;
    const key = code.toUpperCase();
    const s = snap.get(key);
    // Snapshot leads, ERP fills, per axis — exactly as freight-server does it.
    rows.push({
      code,
      name: p.ProductDescription ?? "",
      group: p.ProductGroup?.GroupName ?? "(no group)",
      price: num(p.DefaultSellPrice),
      kg: num(s?.kg) || num(p.Weight),
      l: num(s?.l) || num(p.Width),
      w: num(s?.w) || num(p.Depth),
      h: num(s?.h) || num(p.Height),
      hasWoo: wooIds.has(key),
    });
  }

  // A side over 3m, or over 3 cubic metres, is not a carton — it is a unit
  // error, almost always millimetres typed into a centimetre field. Counting
  // those as "measured" is how the first run of this report overstated the
  // answer: an 8kg kettlebell recorded 220 x 220 x 290 is 18.5 m3 read as cm,
  // which at Easyship's 250kg/m3 divisor is a chargeable weight over four
  // tonnes. The freight cap catches it, but it is not sellable.
  const implausible = (r: Row) => Math.max(r.l, r.w, r.h) > 300 || (r.l * r.w * r.h) / 1e6 > 3;
  // Divide by ten and it becomes an ordinary carton — so the real value is
  // already recorded, in the wrong unit. This is a keyboard fix, not a tape
  // measure, and it is the cheapest carton data available anywhere.
  const looksLikeMm = (r: Row) =>
    implausible(r) && Math.max(r.l, r.w, r.h) / 10 <= 300 && (r.l * r.w * r.h) / 1e9 <= 3;
  const measured = (r: Row) => r.kg > 0 && r.l > 0 && r.w > 0 && r.h > 0 && !implausible(r);
  // NO LONGER REQUIRES A WOOCOMMERCE PRODUCT. canPay gated on productId > 0
  // until 2026-09-06, because resolveOrderLines repriced against WooCommerce.
  // It reprices from the ERP now and orders are written into Unleashed, so the
  // ERP code is the handle and carton data is the only thing left that decides
  // whether a product can be sold and shipped. See lib/cart-eligibility.
  const sellableOnline = (r: Row) => measured(r);

  const total = rows.length;
  const ok = rows.filter(sellableOnline);
  const noCarton = rows.filter((r) => !measured(r));
  const noWoo = rows.filter((r) => !r.hasWoo);
  const neither = rows.filter((r) => !r.hasWoo && !measured(r));
  const wooButNoCarton = rows.filter((r) => r.hasWoo && !measured(r));

  // Split the missing into the piles report:cartons taught us to split them into.
  const weightOnly = noCarton.filter((r) => r.kg > 0 && !(r.l && r.w && r.h));
  const dimsOnly = noCarton.filter((r) => !r.kg && r.l && r.w && r.h);
  const nothing = noCarton.filter((r) => !r.kg && !(r.l && r.w && r.h));
  const unitError = rows.filter((r) => r.l && r.w && r.h && implausible(r));
  // Does the frozen WooCommerce snapshot still hold carton data the ERP lacks?
  // If it does, it is worth extracting before Woo is decommissioned. If it does
  // not, there is nothing there to rescue.
  const erpByCode = new Map(
    erp.map((p) => [(p.ProductCode ?? "").trim().toUpperCase(), p])
  );
  const wooOnlyDims = rows.filter((r) => {
    const e = erpByCode.get(r.code.toUpperCase());
    const s2 = snap.get(r.code.toUpperCase());
    return Boolean(s2?.l && s2?.w && s2?.h) && !(e?.Width && e?.Depth && e?.Height);
  });
  const wooOnlyWeight = rows.filter((r) => {
    const e = erpByCode.get(r.code.toUpperCase());
    const s2 = snap.get(r.code.toUpperCase());
    return Boolean(s2?.kg) && !e?.Weight;
  });
  const mmFix = unitError.filter(looksLikeMm);

  const byGroup = new Map<string, { n: number; ok: number; noCarton: number; noWoo: number }>();
  for (const r of rows) {
    const g = byGroup.get(r.group) ?? { n: 0, ok: 0, noCarton: 0, noWoo: 0 };
    g.n++;
    if (sellableOnline(r)) g.ok++;
    if (!measured(r)) g.noCarton++;
    if (!r.hasWoo) g.noWoo++;
    byGroup.set(r.group, g);
  }
  const groups = [...byGroup.entries()].filter(([, g]) => g.n >= 3).sort((a, b) => b[1].n - a[1].n);

  const pct = (n: number) => (total ? ((n / total) * 100).toFixed(0) : "0");

  // The biggest wins: unmeasured products grouped by name prefix, because
  // 145 dumbbells are one measuring job, not 145.
  const family = new Map<string, number>();
  for (const r of noCarton) {
    const f = r.name.split(" - ")[0].trim() || r.name;
    family.set(f, (family.get(f) ?? 0) + 1);
  }
  const families = [...family.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);

  const md = `# What can actually be bought by card

Generated by \`npm run report:coverage\` over **every sellable Unleashed product**,
not the snapshot's served set. Carton data resolved the way \`freight-server.ts\`
resolves it: snapshot first, ERP filling per axis.

**A card checkout needs two independent things**, and missing either sends the
cart to the quote flow:

1. a WooCommerce product, or \`resolveOrderLines\` cannot reprice the line and
   \`canPay\` refuses the card form;
2. carton data — weight **and** all three dimensions — or \`itemsToParcels\`
   returns \`incomplete_dimensions\`.

**The second fails the WHOLE cart, not the line.** One unmeasured dumbbell makes
every other item in the basket unquotable too. An unmeasured product is not a gap
in the catalogue; it is a tripwire under every basket it can join.

## The headline

| | | |
|---|---|---|
| Sellable products | ${total} | |
| **Can complete a card checkout** | **${ok.length}** | ${pct(ok.length)}% |
| Missing carton data | ${noCarton.length} | ${pct(noCarton.length)}% |
| Missing a WooCommerce product | ${noWoo.length} | ${pct(noWoo.length)}% |
| Missing both | ${neither.length} | ${pct(neither.length)}% |
| Has a product but no carton | ${wooButNoCarton.length} | ${pct(wooButNoCarton.length)}% |

⚠️ Counts every sellable ERP code, including brands the public site does not list
(it is a brand allowlist). Treat these as the ceiling on the problem, not its
size.

## The cheapest carton data available: fix the unit, not the tape

${unitError.length} products carry dimensions that cannot be real — over 3m on a side or
over 3 cubic metres. **${mmFix.length} of them become an ordinary carton when divided by
ten**, which means the measurement was taken and typed into the wrong unit. No
tape measure required.

| code | recorded as | almost certainly | product |
|---|---|---|---|
${mmFix
  .slice(0, 15)
  .map(
    (r) =>
      `| \`${r.code}\` | ${r.l} x ${r.w} x ${r.h} | ${(r.l / 10).toFixed(1)} x ${(r.w / 10).toFixed(1)} x ${(r.h / 10).toFixed(1)} | ${r.name.slice(0, 40)} |`
  )
  .join("\n") || "| _none_ | | | |"}

## Is there carton data left in WooCommerce worth rescuing?

Short answer for the decommissioning question: **almost none.**

| | |
|---|---|
| Dimensions the snapshot has and the ERP does not | **${wooOnlyDims.length}** |
| Weights the snapshot has and the ERP does not | **${wooOnlyWeight.length}** |

The unmeasured products are unmeasured in BOTH systems. Nobody has ever measured
them, so switching WooCommerce off loses nothing here — and no extraction job
will conjure the numbers.

## The carton gap, split by what is actually missing

| pile | products | the job |
|---|---|---|
| Weight but no dimensions | ${weightOnly.length} | measure the carton |
| Dimensions but no weight | ${dimsOnly.length} | weigh it |
| Neither | ${nothing.length} | both |

## Biggest wins first

Unmeasured products collapsed by family, because ${families[0]?.[1] ?? 0} dumbbells are one
measuring job rather than ${families[0]?.[1] ?? 0}.

| family | unmeasured |
|---|---|
${families.map(([f, n]) => `| ${f.slice(0, 60)} | ${n} |`).join("\n")}

## By product group

| group | sellable | card-ready | no carton | no Woo product |
|---|---|---|---|---|
${groups
  .map(([g, s]) => `| ${g} | ${s.n} | ${s.ok} (${((s.ok / s.n) * 100).toFixed(0)}%) | ${s.noCarton} | ${s.noWoo} |`)
  .join("\n")}
`;

  // The unit fix, shaped for Unleashed's own product import.
  //
  // Computed from the ERP's OWN Width/Depth/Height rather than from the merged
  // row above, because the merge takes the snapshot first and the snapshot has
  // its own bad values. This file must only ever correct a number the ERP
  // actually holds.
  //
  // AXIS ORDER IS THE ERP'S, NOT THE SITE'S: the template is Width, Height,
  // Depth. Getting that wrong writes a box of the right size in the wrong shape,
  // which is worse than leaving it broken because nothing would flag it.
  const erpMm = rows
    .map((r) => ({ r, e: erpByCode.get(r.code.toUpperCase()) }))
    .filter(({ e }) => {
      if (!e?.Width || !e?.Depth || !e?.Height) return false;
      const big = Math.max(e.Width, e.Depth, e.Height) > 300 || (e.Width * e.Depth * e.Height) / 1e6 > 3;
      const fixed = Math.max(e.Width, e.Depth, e.Height) / 10 <= 300 && (e.Width * e.Depth * e.Height) / 1e9 <= 3;
      return big && fixed;
    });

  writeFileSync(
    FIX_CSV,
    csvOf([
      ["*Product Code", "Width", "Height", "Depth", "Weight"],
      ...erpMm.map(({ r, e }) => [
        r.code,
        +(e!.Width! / 10).toFixed(2),
        +(e!.Height! / 10).toFixed(2),
        +(e!.Depth! / 10).toFixed(2),
        e!.Weight ?? "",
      ]),
    ])
  );

  writeFileSync(MD, md);
  writeFileSync(
    CSV,
    [
      "code,name,group,price,weight_kg,length_cm,width_cm,height_cm,has_woo_product,measured,card_ready",
      ...rows.map((r) =>
        [
          q(r.code),
          q(r.name),
          q(r.group),
          r.price,
          r.kg,
          r.l,
          r.w,
          r.h,
          r.hasWoo,
          measured(r),
          sellableOnline(r),
        ].join(",")
      ),
    ].join("\n")
  );

  out(`\nsellable products:        ${total}`);
  out(`CAN complete a checkout:  ${ok.length} (${pct(ok.length)}%)`);
  out(`missing carton data:      ${noCarton.length} (${pct(noCarton.length)}%)`);
  out(`missing a Woo product:    ${noWoo.length} (${pct(noWoo.length)}%)`);
  out(`\ncarton gap splits into:  weight-no-dims ${weightOnly.length}, dims-no-weight ${dimsOnly.length}, neither ${nothing.length}`);
  out(`unit errors (impossible cartons): ${unitError.length}, of which ${mmFix.length} look like millimetres`);
  out(`carton data only WooCommerce has: ${wooOnlyDims.length} dimensions, ${wooOnlyWeight.length} weights`);
  out(`\nunit-fix import written for ${erpMm.length} products -> ${FIX_CSV}`);
  out(`\nbiggest unmeasured families:`);
  for (const [f, n] of families.slice(0, 8)) out(`  ${String(n).padStart(4)}  ${f.slice(0, 56)}`);
  out(`\nwritten to ${MD}\n`);
}, 600_000);
