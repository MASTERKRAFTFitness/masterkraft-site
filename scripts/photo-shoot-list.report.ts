// The ERP codes with no photograph, collapsed into the PRODUCTS behind them.
//
//   npm run report:shootlist
//     reports/photo-shoot-list.csv   the rows, one per product
//     reports/photo-shoot-list.md    the same thing to read
//
// WHY THIS EXISTS. 346 sellable, non-obsolete codes have no image in Unleashed
// and 197 of them are the public site's own (`/^(?:[MN]|SC)/`). Nobody can plan
// a photo shoot from 197 SKUs: 48 of them are twelve garments in four sizes, and
// the barbells are two products wearing 25 codes. The question a shoot needs
// answered is "how many THINGS have to go in front of a camera", and that is
// what this counts.
//
// HOW A CODE IS COLLAPSED INTO A PRODUCT: erp-catalogue's own splitUnitName,
// imported rather than restated, because a shoot list that groups differently
// from the size picker would send somebody to photograph a product the site does
// not believe exists. It knows three shapes and this report needs all three:
//
//   "Fixed PU Curl Barbell - 7.5kg"   the normal one — the name before " - "
//   "Sweatshirt (Unisex) (L)"         apparel, which carries NO " - " at all, so
//                                     a split on the separator alone collapses
//                                     none of the 52 Apparel codes
//   "CONCEPT 2 - Ski Erg with PM5"    NOT a range: the head is the BRAND, and
//                                     splitting it makes four ergs one product
//
// THE CODE STEM IS NOT THE KEY, and this is the trap worth naming. `MWBBFUR`
// holds BOTH the Fixed PU Straight Barbell (7 codes here) and the Fixed PU Curl
// Barbell (18) — grouping on the stem reports one product where there are two
// and sends back one photograph for two different barbells. ranges.ts says the
// same thing at more length and it is right.
//
// BRAND IS PART OF THE KEY. "Rubber Hex Dumbbell" exists five times over under
// five brands at five prices; without the brand the NO BRAND white-label range
// merges into MK's. Same guard as getRange's.
//
// WHERE THIS DELIBERATELY DIFFERS FROM getRange. getRange scopes its search to
// one code stem, so it would report "Rubber EZ Fixed Barbells" twice — once for
// MWBBFR and once for MWBBFRZ. Here the key is global, because those three codes
// are one product and photographing it twice is waste. A shoot list is not a
// size picker.
//
// THE SECOND COLUMN IS THE ONE THAT MATTERS. A product where some sibling size
// IS already photographed is NOT invisible: the listing card and the product
// page both show that sibling's picture, so the gap is only inside the size
// picker. A product where nothing in the family has ever been photographed shows
// a blank card. Those are the ones a shoot should start with, and they are 63 of
// the 92 rather than all of them.
//
// OTHER COSTS AND STORAGE ARE EXCLUDED. Freight lines and delivery allowances
// are not photographable objects, and erp-catalogue.ts already refuses both
// groups as categories. That is 17 of the 197 gone before the collapse starts.
//
// It fetches Unleashed directly rather than through getUnleashedMap(), which is
// wrapped in next/cache's unstable_cache and returns {} outside a Next request.
//
// Read-only. It measures; it changes nothing.
import { createHmac } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { it } from "vitest";

const env = new Map<string, string>();
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env.set(m[1], m[2].replace(/^["']|["']$/g, ""));
}
for (const [k, v] of env) if (!process.env[k]) process.env[k] = v;

const { isBrandSku } = await import("@/lib/woocommerce");
const { compareSizeLabels } = await import("@/lib/ranges");
// The site's brand preference, imported rather than copied: a NO BRAND product
// whose name and group an MK product already occupies is DROPPED by erpUnits and
// can never appear on a page, so photographing it is waste. See the shadowed
// bucket below.
const { BRAND_ORDER, splitUnitName } = await import("@/lib/erp-catalogue");

const CSV = "reports/photo-shoot-list.csv";
const MD = "reports/photo-shoot-list.md";

type ErpProduct = {
  ProductCode?: string;
  ProductDescription?: string;
  ImageUrl?: string;
  Images?: { Url?: string; IsDefault?: boolean }[];
  ProductBrand?: { BrandName?: string };
  ProductGroup?: { GroupName?: string };
  IsSellable?: boolean;
  Obsolete?: boolean;
};

const sign = (q: string) =>
  createHmac("sha256", process.env.UNLEASHED_API_KEY ?? "").update(q).digest("base64");

async function allErpProducts(): Promise<ErpProduct[]> {
  const items: ErpProduct[] = [];
  for (let page = 1; page <= 20; page++) {
    const q = `pageSize=200`;
    const res = await fetch(`https://api.unleashedsoftware.com/Products/${page}?${q}`, {
      headers: {
        "api-auth-id": process.env.UNLEASHED_API_ID ?? "",
        "api-auth-signature": sign(q),
        Accept: "application/json",
      },
    });
    if (!res.ok) throw new Error(`Unleashed /Products/${page}: ${res.status}`);
    const json = (await res.json()) as { Items?: ErpProduct[]; Pagination?: { NumberOfPages?: number } };
    items.push(...(json.Items ?? []));
    if (page >= (json.Pagination?.NumberOfPages ?? 1)) break;
  }
  return items;
}

// erp-catalogue.ts's EXCLUDED_GROUPS. Nothing in either is a photographable object.
const NEVER_PHOTOGRAPHED = new Set(["Other Costs", "Storage"]);

const imageOf = (p: ErpProduct) =>
  p.Images?.find((i) => i.IsDefault)?.Url ?? p.Images?.[0]?.Url ?? p.ImageUrl;

/**
 * The product name behind a code, and the size it contributes.
 *
 * splitUnitName IS THE RULE, imported rather than restated. The first cut of
 * this file hand-rolled the same two steps and got a third case wrong that
 * splitUnitName already handles: "CONCEPT 2 - Ski Erg with PM5" is a BRAND
 * before the separator, not a range, and splitting it collapses four distinct
 * ergs into one product called "CONCEPT 2". Nothing in today's gap set is
 * brand-headed — every Concept 2 code is photographed — so the hand-rolled
 * version produced the right answer by luck, which is the worst way to be right.
 */
const nameAndSize = (p: ErpProduct) =>
  splitUnitName((p.ProductDescription ?? "").trim(), p.ProductBrand?.BrandName?.trim());

it("collapses the unphotographed codes into products to shoot", async () => {
  const erp = await allErpProducts();
  const live = erp.filter((p) => p.IsSellable !== false && !p.Obsolete);

  const brandOf = (p: ErpProduct) => p.ProductBrand?.BrandName?.trim() ?? "";
  const groupOf = (p: ErpProduct) => p.ProductGroup?.GroupName?.trim() ?? "";
  const keyOf = (p: ErpProduct) => {
    const name = nameAndSize(p).name;
    // A code with no usable name is its own product rather than joining an
    // empty-named bucket with every other unnamed code.
    return name ? `${brandOf(p)}|${name}` : `${brandOf(p)}|CODE:${p.ProductCode ?? "?"}`;
  };

  // THE WHOLE FAMILY, photographed or not. The second column is read off this,
  // not off the gap set — a product is only invisible if NOTHING in it has a
  // picture, and the gap set by construction cannot tell you that.
  const family = new Map<string, ErpProduct[]>();
  for (const p of live) {
    const k = keyOf(p);
    const g = family.get(k);
    if (g) g.push(p);
    else family.set(k, [p]);
  }

  const noImage = live.filter((p) => !imageOf(p));
  const site = noImage.filter((p) => isBrandSku(p.ProductCode));
  const portal = noImage.length - site.length;
  const excluded = site.filter((p) => NEVER_PHOTOGRAPHED.has(groupOf(p)));
  const shootable = site.filter((p) => !NEVER_PHOTOGRAPHED.has(groupOf(p)));

  type Row = {
    product: string;
    brand: string;
    group: string;
    /** Codes in this product that have no photograph. */
    codes: string[];
    sizes: string[];
    /** How many of the whole family carry a photograph, and how big it is. */
    shot: number;
    familySize: number;
    bucket: "unphotographed" | "sizes-only" | "shadowed";
  };

  const byKey = new Map<string, ErpProduct[]>();
  for (const p of shootable) {
    const k = keyOf(p);
    const g = byKey.get(k);
    if (g) g.push(p);
    else byKey.set(k, [p]);
  }

  // WHICH BRAND OWNS A NAME. erpUnits keys on group + lowercased name and keeps
  // the brand earliest in BRAND_ORDER, so anything else with that key is not on
  // the site at all. Computed over every live product, not just the gap set —
  // the MK twin that shadows a NO BRAND row usually HAS its photograph, which is
  // exactly why the row would otherwise look like work.
  const rank = (brand: string) => {
    const i = BRAND_ORDER.indexOf(brand);
    return i < 0 ? Number.POSITIVE_INFINITY : i;
  };
  const owner = new Map<string, string>();
  for (const p of live) {
    const name = nameAndSize(p).name;
    if (!name) continue;
    const nameKey = `${groupOf(p)}\u0000${name.toLowerCase()}`;
    const held = owner.get(nameKey);
    if (held === undefined || rank(brandOf(p)) < rank(held)) owner.set(nameKey, brandOf(p));
  }

  const rows: Row[] = [];
  for (const [k, members] of byKey) {
    const fam = family.get(k) ?? members;
    const shot = fam.filter((p) => imageOf(p)).length;
    const name = nameAndSize(members[0]).name;
    const nameKey = `${groupOf(members[0])}\u0000${name.toLowerCase()}`;
    const shadowed = !!name && owner.get(nameKey) !== brandOf(members[0]);
    rows.push({
      product: nameAndSize(members[0]).name || (members[0].ProductCode ?? "?"),
      brand: brandOf(members[0]),
      group: groupOf(members[0]) || "(no group)",
      codes: members.map((p) => (p.ProductCode ?? "").trim()).sort(),
      sizes: members
        .map((p) => nameAndSize(p).size)
        .filter(Boolean)
        .sort(compareSizeLabels),
      shot,
      familySize: fam.length,
      bucket: shadowed ? "shadowed" : shot ? "sizes-only" : "unphotographed",
    });
  }

  // Blank cards first, then the biggest jobs, then alphabetically so two runs
  // of the same data produce the same file.
  const order = { unphotographed: 0, "sizes-only": 1, shadowed: 2 } as const;
  rows.sort(
    (a, b) =>
      order[a.bucket] - order[b.bucket] ||
      b.codes.length - a.codes.length ||
      a.group.localeCompare(b.group) ||
      a.product.localeCompare(b.product)
  );

  const unphotographed = rows.filter((r) => r.bucket === "unphotographed");
  const sizesOnly = rows.filter((r) => r.bucket === "sizes-only");
  const shadowedRows = rows.filter((r) => r.bucket === "shadowed");

  mkdirSync("reports", { recursive: true });

  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  writeFileSync(
    CSV,
    [
      "bucket,product,brand,group,codes_without_image,codes,sizes,family_photographed,family_size",
      ...rows.map((r) =>
        [
          r.bucket,
          r.product,
          r.brand,
          r.group,
          String(r.codes.length),
          r.codes.join(" "),
          r.sizes.join(" "),
          String(r.shot),
          String(r.familySize),
        ]
          .map(esc)
          .join(",")
      ),
    ].join("\n") + "\n"
  );

  const byGroup = (list: Row[]) => {
    const m = new Map<string, Row[]>();
    for (const r of list) {
      const g = m.get(r.group);
      if (g) g.push(r);
      else m.set(r.group, [r]);
    }
    return [...m].sort((a, b) => b[1].length - a[1].length);
  };

  const table = (list: Row[]) => [
    "| product | brand | codes | sizes |",
    "|---|---|---:|---|",
    ...list.map(
      (r) =>
        `| ${r.product} | ${r.brand} | ${r.codes.length} | ${
          r.sizes.length ? r.sizes.join(", ") : "—"
        } |`
    ),
    "",
  ];

  const md = [
    "# What to photograph",
    "",
    `Generated by \`npm run report:shootlist\`. Every row is in \`${CSV}\`.`,
    "",
    `**${shootable.length} ERP codes have no photograph. They are ${rows.length} products,`,
    `and only ${unphotographed.length} of those need a camera.**`,
    "",
    "| | |",
    "|---|---:|",
    `| Sellable, non-obsolete codes with no image | ${noImage.length} |`,
    `| …on portal brands and cost lines (out of scope) | ${portal} |`,
    `| …on the public site (\`M\`/\`N\`/\`SC\`) | ${site.length} |`,
    `| …less Other Costs and Storage, which are not objects | −${excluded.length} |`,
    `| **Codes to account for** | **${shootable.length}** |`,
    `| **Distinct products behind them** | **${rows.length}** |`,
    `| …showing a blank card — nothing in the family is photographed | **${unphotographed.length}** |`,
    `| …whose card is already covered by a photographed size | ${sizesOnly.length} |`,
    `| …shadowed by another brand, so never shown at all | ${shadowedRows.length} |`,
    "",
    "## Read the two buckets differently",
    "",
    `**${unphotographed.length} products have no photograph anywhere in the family.** The listing`,
    "card, the product page and every related strip show nothing. This is the shoot.",
    "",
    `**${sizesOnly.length} products already have a photographed size.** The card is not blank —`,
    "it shows that sibling — so the gap is only inside the size picker, where some rows",
    "carry a picture and some do not. Worth closing, not worth a shoot day.",
    "",
    `**${shadowedRows.length} products are shadowed and are not work at all.** A NO BRAND product`,
    "whose name and group an MK product already occupies is dropped by `erpUnits`, so it",
    "has no page to be blank on. Listed at the bottom so the number is accounted for",
    "rather than silently removed.",
    "",
    `## The shoot — ${unphotographed.length} products with no photograph at all`,
    "",
    ...byGroup(unphotographed).flatMap(([group, list]) => [
      `### ${group} (${list.length})`,
      "",
      ...table(list),
    ]),
    `## Already covered by a sibling — ${sizesOnly.length} products, picker rows only`,
    "",
    "`family` is how many of the whole range carry a photograph.",
    "",
    "| product | brand | group | missing | family |",
    "|---|---|---|---:|---:|",
    ...sizesOnly.map(
      (r) => `| ${r.product} | ${r.brand} | ${r.group} | ${r.codes.length} | ${r.shot}/${r.familySize} |`
    ),
    "",
    `## Shadowed by another brand — ${shadowedRows.length} products, not work`,
    "",
    "`erpUnits` keeps the brand earliest in `BRAND_ORDER` for a given group and name.",
    "These lost that contest, so nothing links to them.",
    "",
    "| product | brand | group | codes | shadowed by |",
    "|---|---|---|---:|---|",
    ...shadowedRows.map(
      (r) => `| ${r.product} | ${r.brand} | ${r.group} | ${r.codes.length} | ${
        owner.get(`${r.group}\u0000${r.product.toLowerCase()}`) ?? "—"
      } |`
    ),
    "",
    "## How a code became a product",
    "",
    "Trailing garment size stripped first (`Sweatshirt (Unisex) (L)` → `Sweatshirt",
    "(Unisex)`), then the name before ` - ` (`Fixed PU Curl Barbell - 7.5kg` → `Fixed PU",
    "Curl Barbell`), keyed with the brand. **Not the code stem** — `MWBBFUR` holds both",
    "the straight and the curl barbell, and stem-grouping would report one product where",
    "there are two. See the header of `scripts/photo-shoot-list.report.ts`.",
    "",
    "Uploading is manual: the Unleashed API cannot write images, so these go on the",
    "product record in the UI by hand. `npm run report:photoupload` stages the ones that",
    "already have a file to move.",
    "",
  ];
  writeFileSync(MD, md.join("\n"));

  console.log(`shoot list: ${shootable.length} codes -> ${rows.length} products`);
  console.log(`  unphotographed  ${unphotographed.length}`);
  console.log(`  sizes-only      ${sizesOnly.length}`);
  console.log(`  shadowed        ${shadowedRows.length}`);
}, 180000);
