// The catalogue punch list: every field the ERP is missing, per category page,
// as the customer meets it.
//
//   reports/erp-punchlist.csv   one row per fix, sorted by group
//   reports/erp-punchlist.md    per-group counts and the worst offenders
//
// Run:  npm run report:punchlist
//
// WHY IT IMPORTS THE APP. Since 2 Sep the site's cards ARE the ERP's products
// (lib/erp-catalogue.ts): a category is ProductGroup, a card is a range or a
// single product, and a range's photo is the first size that has one. A report
// that reimplemented any of that would eventually list work that is already
// done, or miss work that is not. So this runs the real erpUnits() over a live
// Products fetch and describes exactly what the rendered page shows.
//
// It fetches Unleashed directly rather than through getUnleashedMap(), which is
// wrapped in next/cache's unstable_cache and throws outside a Next request. The
// normalisation below is deliberately the same handful of lines as buildMap().
//
// TWO KINDS OF MISSING PHOTO, and they are not the same job:
//
//   NO PHOTO ANYWHERE      nobody has an image. Someone has to take or find one.
//   ON THE OLD STORE ONLY  WooCommerce has the photograph and Unleashed does
//                          not. The ERP card renders an empty tile beside an
//                          image sitting in the frozen snapshot. Copying it into
//                          Unleashed fixes it everywhere, including the
//                          franchisee catalogues, which is why it is listed as
//                          ERP work rather than quietly patched in the site.
import { mkdirSync, writeFileSync } from "node:fs";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { it } from "vitest";
import { ERP_GROUPS, erpUnits, slugify, splitUnitName, type ErpUnit } from "@/lib/erp-catalogue";
import { allProducts, variationsFor } from "@/lib/catalogue";
import type { UnleashedMap, UnleashedEntry } from "@/lib/unleashed";

const CSV = "reports/erp-punchlist.csv";
const MD = "reports/erp-punchlist.md";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [
      l.slice(0, l.indexOf("=")).trim(),
      l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, ""),
    ])
);

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
};

// One row of work. `field` names what to change in Unleashed so the list can be
// worked straight down without going back to the site to see what is meant.
type Row = {
  group: string;
  subgroup: string;
  card: string;
  level: "card" | "size";
  code: string;
  product: string;
  problem: string;
  field: string;
  detail: string;
};

const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;

// Names that differ only by spacing, punctuation or a mistyped letter are one
// product wearing two names. Two tests, and the second one is fussy on purpose.
//
// A. SAME SQUASHED FORM. "V Squat"/"V-Squat", "Multi Dead Lift"/"Multi
//    Deadlift". Always a duplicate.
//
// B. ONE MISTYPED WORD. Same number of words, differing in exactly one, and
//    that word pair starts with the same letter and is within two edits:
//    "Thurst"/"Thrust", "Oversized"/"Oversided".
//
// WHY B IS SO NARROW. A plain edit distance of 2 over the whole name called 55
// pairs duplicates and was wrong about 49 of them. Numbers and bracketed
// qualifiers are the whole difference between real products -- "Olympic Power
// Rack 1.0" and "2.0", "(Set of 8)" and "(Set of 10)", "(3 Grip)" and "(4
// Grip)" -- so those have to match exactly before prose is compared at all. The
// same-first-letter rule is what keeps "Incline Chest Press" apart from
// "Decline Chest Press", which are two machines, not a typo.
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Digits and bracketed qualifiers, which must match exactly. */
const qualifiers = (s: string) =>
  (s.match(/\d+(?:\.\d+)?/g) ?? []).join(",") + "|" + (s.match(/\([^)]*\)/g) ?? []).join(",");

const words = (s: string) =>
  s.toLowerCase().replace(/\([^)]*\)/g, " ").split(/[^a-z0-9]+/).filter(Boolean);

function oneMistypedWord(a: string, b: string): string | null {
  if (qualifiers(a) !== qualifiers(b)) return null;
  const wa = words(a);
  const wb = words(b);
  if (wa.length !== wb.length) return null;
  const diff = wa.map((w, i) => [w, wb[i]] as const).filter(([x, y]) => x !== y);
  if (diff.length !== 1) return null;
  const [x, y] = diff[0];
  if (x[0] !== y[0]) return null;
  return editDistance(x, y) <= 2 ? `"${x}" vs "${y}"` : null;
}

function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

it("writes the ERP punch list", async () => {
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
    } satisfies UnleashedEntry;
  }

  const units = [...erpUnits(map).values()];

  // Every photograph the frozen WooCommerce snapshot holds, by SKU. Used only to
  // tell the two kinds of missing photo apart.
  // Variation SKUs count too: a range's ERP codes belong to the hidden variable
  // twin's variations, not to the parent, so keying on the parent alone would
  // say "no photo anywhere" about every range the old store did photograph.
  const wooImage = new Map<string, string>();
  for (const p of allProducts()) {
    const src = p.images?.[0]?.src;
    if (!src) continue;
    for (const sku of [p.sku, ...variationsFor(p.id).map((v) => v.sku)]) {
      const key = sku?.trim().toUpperCase();
      if (key && !wooImage.has(key)) wooImage.set(key, src);
    }
  }

  // A subgroup that lives in two ProductGroups is a filing error in the smaller
  // one: "Squat & Power Racks" is 20 cards under Rigs & Racks and 1 under
  // Strength, and that 1 is the mistake.
  //
  // PACKAGES IS EXEMPT, both as a home and as a suspect. Its sub-groups name
  // what is IN the bundle -- a "Dumbbells" package, a "Wall Balls" package --
  // so it shares every name with Mixed Implements by design. Counting it made
  // the rule point the wrong way and accuse the real dumbbells of being
  // misfiled packages.
  const CROSS_CUTTING = new Set(["Packages"]);
  const subgroupHomes = new Map<string, Map<string, number>>();
  for (const u of units) {
    if (!u.subgroup || CROSS_CUTTING.has(u.group)) continue;
    const homes = subgroupHomes.get(u.subgroup) ?? new Map<string, number>();
    homes.set(u.group, (homes.get(u.group) ?? 0) + 1);
    subgroupHomes.set(u.subgroup, homes);
  }
  const mainHome = new Map<string, string>();
  for (const [sub, homes] of subgroupHomes) {
    if (homes.size < 2) continue;
    mainHome.set(sub, [...homes].sort((a, b) => b[1] - a[1])[0][0]);
  }

  const rows: Row[] = [];
  const push = (u: ErpUnit, r: Omit<Row, "group" | "subgroup" | "card">) =>
    rows.push({ group: u.group, subgroup: u.subgroup ?? "(none)", card: u.name, ...r });

  for (const u of units) {
    const members = u.codes.map((c) => ({ code: c, entry: map[c] })).filter((m) => m.entry);

    // CARD-LEVEL: what a shopper sees on the category grid.
    if (!u.image) {
      const fromWoo = u.codes.map((c) => wooImage.get(c)).find(Boolean);
      push(u, {
        level: "card",
        code: u.codes[0],
        product: map[u.codes[0]]?.name ?? u.name,
        problem: fromWoo ? "NO PHOTO (old store has one)" : "NO PHOTO anywhere",
        field: "Product > Images",
        detail: fromWoo
          ? `Empty tile on /equipment/${u.group.toLowerCase().replace(/[^a-z0-9]+/g, "-")}. The photo exists at ${fromWoo}`
          : `Empty tile on the category grid and on /product/${u.slug}`,
      });
    }
    if (!u.price) {
      push(u, {
        level: "card",
        code: u.codes[0],
        product: map[u.codes[0]]?.name ?? u.name,
        problem: "NO PRICE",
        field: "Product > Default Sell Price",
        detail: `Card and page both read "Contact for pricing"${u.isRange ? ` — no size in this ${members.length}-size range is priced` : ""}`,
      });
    }
    if (!u.subgroup) {
      push(u, {
        level: "card",
        code: u.codes[0],
        product: map[u.codes[0]]?.name ?? u.name,
        problem: "NO SUB-GROUP",
        field: "Product > Product Sub Group",
        detail: `Cannot be reached by any filter chip on the ${u.group} page`,
      });
    }
    if (
      u.subgroup &&
      !CROSS_CUTTING.has(u.group) &&
      mainHome.has(u.subgroup) &&
      mainHome.get(u.subgroup) !== u.group
    ) {
      push(u, {
        level: "card",
        code: u.codes[0],
        product: map[u.codes[0]]?.name ?? u.name,
        problem: "FILED UNDER THE WRONG GROUP",
        field: "Product > Product Group",
        detail: `Sub-group "${u.subgroup}" otherwise lives under ${mainHome.get(u.subgroup)}; this card sits alone under ${u.group}`,
      });
    }

    // SIZE-LEVEL: what a shopper sees after picking a size. Only for ranges, and
    // only where the card itself is fine — a card with no photo at all is
    // already one row above, and repeating all 26 sizes would bury the list.
    if (u.isRange) {
      if (u.image) {
        for (const m of members.filter((m) => !m.entry.image)) {
          push(u, {
            level: "size",
            code: m.code,
            product: m.entry.name ?? "",
            problem: "SIZE HAS NO PHOTO",
            field: "Product > Images",
            detail: `Picking this size on /product/${u.slug} shows the range's other photo, not this one`,
          });
        }
      }
      if (u.price) {
        for (const m of members.filter((m) => !m.entry.price)) {
          push(u, {
            level: "size",
            code: m.code,
            product: m.entry.name ?? "",
            problem: "SIZE HAS NO PRICE",
            field: "Product > Default Sell Price",
            detail: `Card reads "From ${u.price}" but this size cannot be bought — it falls to the quote flow`,
          });
        }
      }
    }
  }

  // NO CARD AT ALL. Two names that slugify the same collide on one URL, and
  // erpUnits keeps only the larger — so the smaller product is not merged into
  // the other card, it simply is not on the site. "V Squat" and "V-Squat" are
  // both /product/v-squat, and one of them does not exist for a customer.
  //
  // Brands are read back off the cards rather than hardcoded, so this cannot
  // drift from BRAND_ORDER. A name dropped because the SAME name exists under a
  // preferred brand is the gap-fill rule working, not a loss, and is invisible
  // here because both share one (group, name) key.
  const ourBrands = new Set(units.map((u) => u.brand).filter(Boolean));
  const carded = new Set(units.map((u) => `${u.group}\u0000${u.name.toLowerCase()}`));
  const bySlug = new Map(units.map((u) => [u.slug, u]));
  const missing = new Map<string, { name: string; group: string; codes: string[] }>();
  for (const [code, entry] of Object.entries(map)) {
    if (entry.sellable === false || !entry.name || !entry.group) continue;
    if (!ourBrands.has(entry.brand)) continue;
    if (!(ERP_GROUPS as readonly string[]).includes(entry.group)) continue;
    const { name } = splitUnitName(entry.name, entry.brand);
    if (!name) continue;
    const key = `${entry.group}\u0000${name.toLowerCase()}`;
    if (carded.has(key)) continue;
    const held = missing.get(key);
    if (held) held.codes.push(code);
    else missing.set(key, { name, group: entry.group, codes: [code] });
  }
  for (const m of [...missing.values()]) {
    const winner = bySlug.get(slugify(m.name));
    rows.push({
      group: m.group,
      subgroup: map[m.codes[0]]?.subgroup ?? "(none)",
      card: m.name,
      level: "card",
      code: m.codes.sort().join(" "),
      product: m.name,
      problem: "NO CARD — NOT ON THE SITE",
      field: "Product > Product Description",
      detail: winner
        ? `${m.codes.length} product${m.codes.length === 1 ? "" : "s"} with no card: this and "${winner.name}" under ${winner.group} both become /product/${winner.slug}, and ${winner.group} wins. Rename one of them.`
        : `${m.codes.length} product${m.codes.length === 1 ? "" : "s"} with no card and no colliding page found — check the name.`,
    });
  }

  // NAMES: two cards that are one product. Compared inside a group, because the
  // same name in two groups is deliberate (erpUnits keys on group for exactly
  // that reason).
  for (const group of ERP_GROUPS) {
    const inGroup = units.filter((u) => u.group === group);
    for (let i = 0; i < inGroup.length; i++) {
      for (let j = i + 1; j < inGroup.length; j++) {
        const a = inGroup[i];
        const b = inGroup[j];
        if (a.name === b.name) continue;
        const sameSquash = squash(a.name) === squash(b.name);
        const typo = sameSquash ? null : oneMistypedWord(a.name, b.name);
        if (!sameSquash && !typo) continue;
        rows.push({
          group,
          subgroup: a.subgroup ?? "(none)",
          card: a.name,
          level: "card",
          code: `${a.codes[0]} / ${b.codes[0]}`,
          product: `${a.name}  vs  ${b.name}`,
          problem: "TWO CARDS, ONE PRODUCT",
          field: "Product > Product Description",
          detail:
            `"${a.name}" (${a.codes.length} size${a.codes.length === 1 ? "" : "s"}) and ` +
            `"${b.name}" (${b.codes.length}) draw separate cards` +
            (typo ? ` — one word apart, ${typo}` : " — the same name punctuated two ways") +
            `. Make the names identical and they merge into one card with one picker.`,
        });
      }
    }
  }

  const order = new Map(ERP_GROUPS.map((g, i) => [g as string, i]));
  rows.sort(
    (a, b) =>
      (order.get(a.group) ?? 99) - (order.get(b.group) ?? 99) ||
      a.problem.localeCompare(b.problem) ||
      a.card.localeCompare(b.card) ||
      a.code.localeCompare(b.code)
  );

  mkdirSync("reports", { recursive: true });
  writeFileSync(
    CSV,
    [
      "Group,Sub-group,Card,Level,Product code,Product name,Problem,Unleashed field,What the customer sees",
      ...rows.map((r) =>
        [r.group, r.subgroup, r.card, r.level, r.code, r.product, r.problem, r.field, r.detail]
          .map(csvCell)
          .join(",")
      ),
    ].join("\n") + "\n"
  );

  // The summary. Card-level rows are counted apart from size-level ones: a card
  // problem is a hole in the grid, a size problem is a hole inside a picker.
  const md: string[] = [];
  md.push("# ERP catalogue punch list", "");
  md.push(
    `Generated ${new Date().toISOString().slice(0, 10)} from ${items.length} Unleashed products.`,
    `${units.length} cards across ${ERP_GROUPS.length} categories. **${rows.length} fixes**, all of them fields in Unleashed.`,
    "",
    "Every row is one field on one product. Nothing here needs a code change or a deploy —",
    "the site rebuilds its cards from the ERP every 15 minutes.",
    ""
  );

  const byProblem = new Map<string, number>();
  for (const r of rows) byProblem.set(r.problem, (byProblem.get(r.problem) ?? 0) + 1);
  md.push("## By problem", "", "| Problem | Rows | Field to fix |", "| --- | ---: | --- |");
  for (const [p, n] of [...byProblem].sort((a, b) => b[1] - a[1])) {
    md.push(`| ${p} | ${n} | ${rows.find((r) => r.problem === p)!.field} |`);
  }
  md.push("");

  md.push(
    "## By category",
    "",
    "| Category | Cards | Card fixes | Size fixes |",
    "| --- | ---: | ---: | ---: |"
  );
  for (const g of ERP_GROUPS) {
    const inGroup = rows.filter((r) => r.group === g);
    md.push(
      `| ${g} | ${units.filter((u) => u.group === g).length} | ` +
        `${inGroup.filter((r) => r.level === "card").length} | ` +
        `${inGroup.filter((r) => r.level === "size").length} |`
    );
  }
  md.push("");

  md.push("## The work, category by category", "");
  for (const g of ERP_GROUPS) {
    const inGroup = rows.filter((r) => r.group === g);
    if (!inGroup.length) {
      md.push(`### ${g}`, "", "Nothing to fix.", "");
      continue;
    }
    md.push(`### ${g} — ${inGroup.length} fixes`, "");
    const seen = new Map<string, Row[]>();
    for (const r of inGroup) seen.set(r.problem, [...(seen.get(r.problem) ?? []), r]);
    for (const [problem, list] of [...seen].sort((a, b) => b[1].length - a[1].length)) {
      md.push(`**${problem}** — ${list.length}`, "");
      for (const r of list.slice(0, 12)) md.push(`- \`${r.code}\` ${r.product || r.card}`);
      if (list.length > 12) md.push(`- …and ${list.length - 12} more, in the CSV.`);
      md.push("");
    }
  }
  writeFileSync(MD, md.join("\n"));

  console.log(`\n${rows.length} fixes over ${units.length} cards -> ${CSV}, ${MD}\n`);
  for (const [p, n] of [...byProblem].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${p}`);
  }
}, 180000);
