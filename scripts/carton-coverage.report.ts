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
const out = (s: string) => process.stdout.write(`${s}\n`);

const num = (v: unknown) => {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const q = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;

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

  const measured = (r: Row) => r.kg > 0 && r.l > 0 && r.w > 0 && r.h > 0;
  const sellableOnline = (r: Row) => r.hasWoo && measured(r);

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
  out(`\nbiggest unmeasured families:`);
  for (const [f, n] of families.slice(0, 8)) out(`  ${String(n).padStart(4)}  ${f.slice(0, 56)}`);
  out(`\nwritten to ${MD}\n`);
}, 600_000);
