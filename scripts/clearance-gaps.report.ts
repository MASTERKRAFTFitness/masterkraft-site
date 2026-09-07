// Where /equipment/clearance and Unleashed disagree.
//
//   npm run report:clearance
//     reports/clearance-gaps.csv   the rows, and what the workbook reads
//     reports/clearance-gaps.md    the same thing to read
//
// WHY THIS CANNOT BE A DIFF OF TWO LISTS. Unleashed has a `Clearance`
// ProductGroup and it is not the site's clearance page: it holds 6 products, all
// unpriced, none of them on the site, while the 35 pages the site clears sit in
// the ERP under Body Weight, Weightlifting and the rest. Nothing in the ERP marks
// a product as ex-display. So "do they match" has no yes/no answer, and what is
// worth reporting is the four ways the two disagree that somebody can act on:
//
//   not-listed        ex-display stock sitting in the ERP with no page selling it
//   phantom-size      a size the picker offers that the ERP has never held
//   no-erp-price      a page priced only by the frozen snapshot
//   dearer-than-erp   a "markdown" above the current ERP price
//   erp-group-unused  the ERP's own Clearance group, which nothing reads
//
// A-PREFIXED IS THE ONLY MARKER THERE IS. Clearance is third-party ex-display
// stock on A codes — the site's own brand rule is /^(?:[MN]|SC)/ — which is why
// this is the one category listing with the brand filter off (lib/categories.ts).
// So `not-listed` looks at A codes, and would miss ex-display stock filed under
// any other prefix. There is nothing better to look at until the ERP carries a
// flag of its own.
//
// It fetches Unleashed directly rather than through getUnleashedMap(), which is
// wrapped in next/cache's unstable_cache and returns {} outside a Next request.
// The normalisation below is deliberately the same handful of lines as buildMap().
//
// Read-only. It measures; it changes nothing.
import crypto from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";

const env = new Map<string, string>();
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env.set(m[1], m[2].replace(/^["']|["']$/g, ""));
}
for (const [k, v] of env) if (!process.env[k]) process.env[k] = v;

const { getAllProductsByCategory, decodeEntities } = await import("@/lib/woocommerce");
const { variationsFor } = await import("@/lib/catalogue");
const { pageCodes, servedCodes } = await import("@/lib/erp-catalogue");
const { enrichCard } = await import("@/lib/unleashed");
const { getCategory } = await import("@/lib/categories");
type UnleashedMap = import("@/lib/unleashed").UnleashedMap;

const CSV = "reports/clearance-gaps.csv";
const MD = "reports/clearance-gaps.md";
const GST = 1.1;

type Raw = {
  ProductCode?: string;
  DefaultSellPrice?: number | string;
  ProductDescription?: string;
  ProductBrand?: { BrandName?: string };
  ProductGroup?: { GroupName?: string };
  ProductSubGroup?: { GroupName?: string };
  IsSellable?: boolean;
};

function sign(q: string) {
  return crypto.createHmac("sha256", env.get("UNLEASHED_API_KEY") ?? "").update(q).digest("base64");
}

async function erpPages<T>(path: string): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; page <= 30; page++) {
    const q = "pageSize=200";
    const res = await fetch(`https://api.unleashedsoftware.com/${path}/${page}?${q}`, {
      headers: {
        "api-auth-id": env.get("UNLEASHED_API_ID") ?? "",
        "api-auth-signature": sign(q),
        Accept: "application/json",
        "User-Agent": "Mozilla/5.0",
      },
    });
    if (!res.ok) throw new Error(`Unleashed ${res.status} on ${path}/${page}`);
    const j = (await res.json()) as { Items?: T[]; Pagination?: { NumberOfPages?: number } };
    items.push(...(j.Items ?? []));
    if (page >= (j.Pagination?.NumberOfPages ?? 1)) break;
  }
  return items;
}

type Row = {
  issue: string;
  code: string;
  product: string;
  sitePrice: string;
  erpPrice: string;
  stock: number | "";
  erpGroup: string;
  detail: string;
};

const money = (n: number) => (n > 0 ? n.toFixed(2) : "");

it("reports where clearance and the ERP disagree", async () => {
  const [products, soh] = await Promise.all([
    erpPages<Raw>("Products"),
    erpPages<{ ProductCode?: string; AvailableQty?: number; QtyOnHand?: number }>("StockOnHand"),
  ]);

  const map: UnleashedMap = {};
  for (const p of products) {
    if (!p.ProductCode) continue;
    const price = parseFloat(String(p.DefaultSellPrice ?? "0"));
    map[p.ProductCode.toUpperCase()] = {
      price: price > 0 ? Math.round(price * GST * 100) / 100 : 0,
      stock: 0,
      name: p.ProductDescription?.trim() || undefined,
      brand: p.ProductBrand?.BrandName?.trim() || undefined,
      group: p.ProductGroup?.GroupName?.trim() || undefined,
      subgroup: p.ProductSubGroup?.GroupName?.trim() || undefined,
      sellable: p.IsSellable !== false,
    };
  }
  for (const s of soh) {
    const code = (s.ProductCode ?? "").toUpperCase();
    if (!code) continue;
    const qty = Number(s.AvailableQty ?? s.QtyOnHand ?? 0);
    if (map[code]) map[code].stock = qty;
    else map[code] = { price: 0, stock: qty };
  }

  const wcId = getCategory("clearance")?.wcId;
  if (!wcId) throw new Error("no Woo term for clearance");
  const pages = await getAllProductsByCategory(wcId, { brandFilter: false });

  // Everything the site can actually sell, by the app's own rule — a range page
  // sells its ERP sizes, so AMKBUR01..06 count as listed even though the page
  // itself is a bundle container carrying no ERP code of its own.
  const served = servedCodes(map);
  const rows: Row[] = [];

  for (const p of pages) {
    const name = decodeEntities(p.name);
    const card = await enrichCard(p, map);
    const codes = pageCodes(p, map);

    // Sizes the picker offers that the ERP has never held. Read off the
    // snapshot's variations rather than pageCodes, which only returns codes the
    // ERP answers to and so cannot show what is missing.
    for (const v of variationsFor(p.id)) {
      const code = (v.sku ?? "").trim().toUpperCase();
      if (!code || map[code]) continue;
      rows.push({
        issue: "phantom-size",
        code,
        product: name,
        sitePrice: "",
        erpPrice: "",
        stock: "",
        erpGroup: "",
        detail: `Size listed under ${p.sku} but no such code in Unleashed`,
      });
    }

    for (const code of codes) {
      const e = map[code];
      if (!e) continue;
      if (e.price === 0 && card.priceValue > 0) {
        rows.push({
          issue: "no-erp-price",
          code,
          product: name,
          sitePrice: money(card.priceValue),
          erpPrice: "",
          stock: e.stock,
          erpGroup: e.group ?? "",
          detail: "Selling at the frozen snapshot price; Unleashed has no sell price",
        });
      } else if (e.price > 0 && card.priceValue > e.price + 0.01) {
        rows.push({
          issue: "dearer-than-erp",
          code,
          product: name,
          sitePrice: money(card.priceValue),
          erpPrice: money(e.price),
          stock: e.stock,
          erpGroup: e.group ?? "",
          detail: `Clearance price is $${(card.priceValue - e.price).toFixed(2)} ABOVE the current ERP price`,
        });
      }
    }
  }

  // Ex-display stock with nowhere to buy it. `served` is every code any page on
  // the site can put in a basket, so this is stock that is genuinely unsellable
  // online rather than merely absent from the clearance category.
  for (const [code, e] of Object.entries(map)) {
    if (!/^A/.test(code)) continue;
    if (e.sellable === false || e.stock <= 0 || served.has(code)) continue;
    rows.push({
      issue: "not-listed",
      code,
      product: e.name ?? "",
      sitePrice: "",
      erpPrice: money(e.price),
      stock: e.stock,
      erpGroup: e.group ?? "",
      detail: "In stock in Unleashed, on no page of the site",
    });
  }

  // The ERP's own Clearance group, for anything in it the site still cannot
  // sell. The group became listable on 2026-09-07 (see CLEARANCE_GROUP in
  // erp-catalogue), so a member that now has a page is not a gap and does not
  // belong on Steve's sheet — this reports what is left.
  for (const [code, e] of Object.entries(map)) {
    if (e.group !== "Clearance" || served.has(code)) continue;
    rows.push({
      issue: "erp-group-unused",
      code,
      product: e.name ?? "",
      sitePrice: "",
      erpPrice: money(e.price),
      stock: e.stock,
      erpGroup: "Clearance",
      detail: e.stock > 0
        ? `In Unleashed's Clearance group with ${e.stock} in stock, and still on no page of the site`
        : "In Unleashed's Clearance group: unpriced, unstocked, and on no page",
    });
  }

  const ORDER = ["not-listed", "dearer-than-erp", "no-erp-price", "phantom-size", "erp-group-unused"];
  rows.sort(
    (a, b) =>
      ORDER.indexOf(a.issue) - ORDER.indexOf(b.issue) ||
      Number(b.stock || 0) - Number(a.stock || 0) ||
      a.code.localeCompare(b.code)
  );

  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["issue", "code", "product", "site_price", "erp_price_inc_gst", "stock", "erp_group", "detail"];
  const csv = [
    header.join(","),
    ...rows.map((r) =>
      [r.issue, r.code, r.product, r.sitePrice, r.erpPrice, r.stock, r.erpGroup, r.detail].map(esc).join(",")
    ),
  ].join("\n");
  writeFileSync(CSV, `${csv}\n`);

  const count = (i: string) => rows.filter((r) => r.issue === i).length;
  const groupStocked = rows.filter((r) => r.issue === "erp-group-unused" && Number(r.stock) > 0).length;
  const table = (issue: string, cols: string[], pick: (r: Row) => string[]) => {
    const set = rows.filter((r) => r.issue === issue);
    if (!set.length) return ["_None._", ""];
    return [
      `| ${cols.join(" | ")} |`,
      `|${cols.map(() => "---").join("|")}|`,
      ...set.map((r) => `| ${pick(r).join(" | ")} |`),
      "",
    ];
  };

  const md = [
    "# Clearance: where the site and the ERP disagree",
    "",
    `Generated by \`npm run report:clearance\`. ${pages.length} clearance pages checked against Unleashed.`,
    "",
    "Unleashed has no flag for ex-display stock: its `Clearance` ProductGroup holds",
    "six products, and every product the site actually clears sits in the ERP under",
    "its ordinary group instead. Those six are now listed too (CLEARANCE_GROUP in",
    "lib/erp-catalogue), but the two sets stay distinct, so the lists cannot be",
    "reconciled row for row. These are the disagreements that can be acted on.",
    "",
    `## Ex-display stock nothing sells (${count("not-listed")})`,
    "",
    "A-prefixed, in stock, and on no page of the site.",
    "",
    ...table("not-listed", ["code", "product", "stock", "ERP price inc GST", "ERP group"], (r) => [
      `\`${r.code}\``,
      r.product,
      String(r.stock),
      r.erpPrice ? `$${r.erpPrice}` : "**no price**",
      r.erpGroup,
    ]),
    `## Clearance prices above the ERP price (${count("dearer-than-erp")})`,
    "",
    "The snapshot markdown wins over the ERP price by design (see `enrich` in",
    "lib/unleashed.ts), so these are markdowns that have been overtaken.",
    "",
    ...table("dearer-than-erp", ["code", "product", "site", "ERP inc GST", "difference"], (r) => [
      `\`${r.code}\``,
      r.product,
      `$${r.sitePrice}`,
      `$${r.erpPrice}`,
      `**+$${(Number(r.sitePrice) - Number(r.erpPrice)).toFixed(2)}**`,
    ]),
    `## Priced only by the frozen snapshot (${count("no-erp-price")})`,
    "",
    ...table("no-erp-price", ["code", "product", "site", "stock"], (r) => [
      `\`${r.code}\``,
      r.product,
      `$${r.sitePrice}`,
      String(r.stock),
    ]),
    `## Sizes the ERP has never held (${count("phantom-size")})`,
    "",
    ...table("phantom-size", ["code", "product", "detail"], (r) => [`\`${r.code}\``, r.product, r.detail]),
    `## Unleashed's Clearance group, still unsellable (${count("erp-group-unused")})`,
    "",
    "The group is listed on /equipment/clearance since 2026-09-07, so this counts",
    `only what still has no page.${
      groupStocked ? ` ${groupStocked} of them hold stock.` : ""
    }`,
    "",
    ...table("erp-group-unused", ["code", "product", "stock"], (r) => [
      `\`${r.code}\``,
      r.product,
      String(r.stock),
    ]),
    `Every row is in \`${CSV}\`, which is what the workbook's Clearance sheet reads.`,
    "",
  ];
  writeFileSync(MD, md.join("\n"));

  console.log(`clearance gaps: ${rows.length} rows`);
  for (const i of ORDER) console.log(`  ${i.padEnd(18)} ${count(i)}`);
}, 180000);
