// The page inventory for equipment subcategories: what would exist, how much is
// on each, and where the taxonomy fights itself.
//
//   reports/subgroup-pages.md   the inventory, and every conflict in it
//   reports/subgroup-pages.csv  one row per candidate page
//
// Run:  npm run report:subgroups
//
// WHY. The site expresses a ProductSubGroup as `?sub=` on the category page, and
// that page canonicalises every facet away (see its generateMetadata) — so the
// subgroup a customer searches for, "plyometric boxes" or "squat racks", has no
// URL at all. The old WordPress store nested them as /equipment/<category>/<sub>
// and Google still ranks those: /equipment/body-weight/gymnastics sits at 44-45
// for two rings keywords while answering a redirect to a facet.
//
// COUNTS ARE CARDS, NOT CODES, because a card is what a visitor sees. The ERP
// files 275 sellable products under Dumbbells; erpUnits collapses a range's
// sizes into one card, and a page listing three cards is thin however many codes
// sit behind them. So this runs the real erpSubgroups() — the same function the
// facet is built from — rather than counting ProductCodes.
//
// Fetches Unleashed directly rather than through getUnleashedMap(), which is
// wrapped in next/cache and throws outside a Next request. The normalisation is
// deliberately the same handful of lines as buildMap() and the punch list's.
//
// Read-only.
import { mkdirSync, writeFileSync } from "node:fs";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { it } from "vitest";
import { erpSubgroups, erpUnitsInGroup } from "@/lib/erp-catalogue";
import { categories } from "@/lib/categories";
import type { UnleashedMap, UnleashedEntry } from "@/lib/unleashed";

const CSV = "reports/subgroup-pages.csv";
const MD = "reports/subgroup-pages.md";

// A page has to be worth crawling. Below this it is a handful of cards the
// category page already lists, and fifty of those read as doorway pages.
const MIN_CARDS = 3;

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [
      l.slice(0, l.indexOf("=")).trim(),
      l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, ""),
    ])
);

type RawProduct = {
  ProductCode?: string;
  DefaultSellPrice?: number | string;
  ProductDescription?: string;
  ImageUrl?: string;
  Images?: { Url?: string; IsDefault?: boolean }[];
  ProductBrand?: { BrandName?: string };
  ProductGroup?: { GroupName?: string };
  ProductSubGroup?: { GroupName?: string };
  IsSellable?: boolean;
  Width?: number;
  Height?: number;
  Depth?: number;
  Weight?: number;
};

async function productsPage(n: number) {
  const q = "pageSize=200";
  const res = await fetch(`https://api.unleashedsoftware.com/Products/${n}?${q}`, {
    headers: {
      "api-auth-id": env.UNLEASHED_API_ID,
      "api-auth-signature": crypto
        .createHmac("sha256", env.UNLEASHED_API_KEY)
        .update(q)
        .digest("base64"),
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0",
    },
  });
  if (!res.ok) throw new Error(`Unleashed ${res.status} on Products/${n}`);
  return res.json() as Promise<{ Items: RawProduct[]; Pagination?: { NumberOfPages?: number } }>;
}

type Row = {
  category: string;
  categorySlug: string;
  subgroup: string;
  slug: string;
  cards: number;
  url: string;
  qualifies: boolean;
};

it("inventories the subcategory pages", async () => {
  const first = await productsPage(1);
  const items = [...first.Items];
  for (let n = 2; n <= (first.Pagination?.NumberOfPages ?? 1); n++) {
    items.push(...(await productsPage(n)).Items);
  }

  const map: UnleashedMap = {};
  for (const p of items) {
    if (!p.ProductCode) continue;
    const price = parseFloat(String(p.DefaultSellPrice ?? "0"));
    const image = p.Images?.find((i) => i.IsDefault)?.Url ?? p.Images?.[0]?.Url ?? p.ImageUrl;
    map[p.ProductCode.toUpperCase()] = {
      price: price > 0 ? Math.round(price * 1.1 * 100) / 100 : 0,
      stock: 0,
      name: p.ProductDescription?.trim() || undefined,
      image: image || undefined,
      brand: p.ProductBrand?.BrandName?.trim() || undefined,
      group: p.ProductGroup?.GroupName?.trim() || undefined,
      subgroup: p.ProductSubGroup?.GroupName?.trim() || undefined,
      sellable: p.IsSellable !== false,
      widthCm: p.Width || undefined,
      heightCm: p.Height || undefined,
      depthCm: p.Depth || undefined,
      weightKg: p.Weight || undefined,
    } satisfies UnleashedEntry;
  }

  const rows: Row[] = [];
  const unfiled = new Map<string, number>();
  for (const c of categories) {
    if (!c.erpGroup) continue;
    const total = erpUnitsInGroup(map, c.erpGroup).length;
    const subs = erpSubgroups(map, c.erpGroup);
    const filed = subs.reduce((n, s) => n + s.count, 0);
    if (total > filed) unfiled.set(c.label, total - filed);
    for (const s of subs) {
      rows.push({
        category: c.label,
        categorySlug: c.slug,
        subgroup: s.name,
        slug: s.slug,
        cards: s.count,
        url: `/equipment/${c.slug}/${s.slug}`,
        qualifies: s.count >= MIN_CARDS,
      });
    }
  }

  // A SUBGROUP NAME UNDER TWO CATEGORIES IS ONE TOPIC ON TWO URLS. "Squat &
  // Power Racks" sits under both Rigs & Racks and Strength, so the ERP would
  // produce /equipment/rigs-racks/squat-power-racks AND
  // /equipment/strength/squat-power-racks — two pages competing for one query,
  // which is the duplication these pages exist to avoid. The punch list already
  // calls those rows FILED UNDER THE WRONG GROUP; this is what they cost.
  const byName = new Map<string, Row[]>();
  for (const r of rows) byName.set(r.subgroup, [...(byName.get(r.subgroup) ?? []), r]);
  const split = [...byName.values()].filter((list) => list.length > 1);

  // A subgroup slug equal to its own category's slug would be /equipment/x/x.
  const echo = rows.filter((r) => r.slug === r.categorySlug);

  mkdirSync("reports", { recursive: true });
  const esc = (v: string | number | boolean) => `"${String(v).replace(/"/g, '""')}"`;
  writeFileSync(
    CSV,
    [
      ["Category", "Category slug", "Subgroup", "Slug", "Cards", "URL", "Qualifies"].join(","),
      ...rows
        .slice()
        .sort((a, b) => b.cards - a.cards)
        .map((r) =>
          [r.category, r.categorySlug, r.subgroup, r.slug, r.cards, r.url, r.qualifies].map(esc).join(",")
        ),
    ].join("\n")
  );

  const qualifying = rows.filter((r) => r.qualifies);
  const md: string[] = [];
  md.push("# Equipment subcategory pages — the inventory", "");
  md.push(
    `Generated ${new Date().toISOString().slice(0, 10)} from ${items.length} Unleashed products.`,
    "",
    `**${rows.length} subgroups across ${new Set(rows.map((r) => r.category)).size} categories; ` +
      `${qualifying.length} carry ${MIN_CARDS} cards or more.** Counts are CARDS as the category page ` +
      "renders them, not product codes — a range's sizes are one card.",
    ""
  );
  md.push("| Cards | Category | Subgroup | URL it would have |", "| ---: | --- | --- | --- |");
  for (const r of qualifying.slice().sort((a, b) => b.cards - a.cards)) {
    md.push(`| ${r.cards} | ${r.category} | ${r.subgroup} | \`${r.url}\` |`);
  }
  md.push("");

  const thin = rows.filter((r) => !r.qualifies);
  md.push(`## Too thin for a page of their own — ${thin.length}`, "");
  md.push(
    `Under ${MIN_CARDS} cards. They stay as \`?sub=\` filters on the category page, which is what a ` +
      "filter is for.",
    ""
  );
  for (const r of thin.sort((a, b) => b.cards - a.cards)) {
    md.push(`- **${r.cards}** — ${r.category} › ${r.subgroup}`);
  }
  md.push("");

  md.push("## One subgroup, two categories", "");
  if (!split.length) {
    md.push("None. Every subgroup name sits under exactly one category.", "");
  } else {
    md.push(
      "Each of these would produce two URLs competing for one query. Fix the ERP's Product Group " +
        "before the pages exist, not after — a page that has been indexed and then removed is a " +
        "worse outcome than one that was never built.",
      ""
    );
    for (const list of split) {
      md.push(`**${list[0].subgroup}**`);
      for (const r of list) md.push(`- ${r.category} — ${r.cards} cards — \`${r.url}\``);
      md.push("");
    }
  }

  if (echo.length) {
    md.push("## Subgroup slug equal to its category slug", "");
    for (const r of echo) md.push(`- ${r.category} › ${r.subgroup} — \`${r.url}\``);
    md.push("");
  }

  if (unfiled.size) {
    md.push("## Cards with no subgroup at all", "");
    md.push(
      "These sit on the category page and on no subcategory page. Not a fault — a category is " +
        "allowed unfiled cards — but it is the gap between the two counts.",
      ""
    );
    for (const [cat, n] of [...unfiled].sort((a, b) => b[1] - a[1])) md.push(`- ${cat} — ${n}`);
    md.push("");
  }

  writeFileSync(MD, md.join("\n"));
  console.log(
    `\n${rows.length} subgroups, ${qualifying.length} qualify at ${MIN_CARDS}+ cards, ` +
      `${split.length} split across categories -> ${CSV}, ${MD}\n`
  );
}, 180000);
