// The product copy the ERP has never held, extracted for import.
//
//   reports/erp-copy.md               what moves, what does not, and where
//   reports/erp-copy-attributes.csv   the four new attribute fields
//   reports/erp-copy-notes.csv        the prose, flattened
//   reports/erp-copy-cartons.csv      cartons recoverable from "Packing size"
//
// Run:  npm run report:copy
//
// WHY. The ERP holds what is sold — name, code, price, stock, sizes, photos —
// and not one word about any of it. Notes and AttributeSet are empty on all
// 1,425 products. Meanwhile the frozen WooCommerce snapshot carries 271,328
// characters of copy that no other system has, and that nobody can regenerate
// once the old store is gone. This is the one thing the store can give the ERP
// that the ERP does not already have — cartons and photographs turned out to be
// gaps the store could not fill (see reports/erp-dimensions.md).
//
// IT ENRICHES, IT DOES NOT FILL. Every product here already exists in the ERP.
// That is the opposite of the dimensions job and it is why this one is worth
// doing: no measuring, no photography, just data that exists in one place and
// should exist in another.
//
// FOUR NEW FIELDS, THREE OVERLAPS. The site's parser resolves seven spec labels
// (lib/spec.ts), and they are not equal:
//
//   Assembled size, Material, Colour, Warranty   the ERP has nowhere to put
//                                                these. They are the AttributeSet.
//   Gross weight, Net weight                     the ERP has Weight already.
//   Packing size                                 the ERP has Width/Height/Depth.
//
// So the last three do NOT go in as attributes — that would duplicate a native
// field and leave two versions to disagree. They go to erp-copy-cartons.csv, and
// only where the ERP's own field is empty.
//
// TWO CHANNELS, TWO LISTS. The S/F/R codes are live products sold through the
// franchisee portals and the catalogues rather than on masterkraft.com, so their
// copy is worth the same to that channel. Split, not dropped — see the note on
// the allowlist in lib/woocommerce.ts.
//
// WHAT DOES NOT SURVIVE. Notes is a single plain-text field. The overview,
// the feature bullets and the package inclusions arrive as one flattened block;
// the headings, list markup and spec table the product page renders do not.
// The four attributes come through intact, which is why they are separated.
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import crypto from "node:crypto";
import { it } from "vitest";
import { allProducts } from "@/lib/catalogue";
import { parseProductDetail, isPublicSiteSku, isObsolete, type WcProduct } from "@/lib/woocommerce";

const MD = "reports/erp-copy.md";
const ATTRS_CSV = "reports/erp-copy-attributes.csv";
const NOTES_CSV = "reports/erp-copy-notes.csv";
const CARTONS_CSV = "reports/erp-copy-cartons.csv";

// The four the ERP has nowhere else to put.
//
// ORDER AND HEADER ARE NOT OURS TO CHOOSE. Unleashed generates a template per
// attribute set (Inventory > Products > Import/Export > Product Attributes), and
// that template is the contract:
//
//   *Product Code,*Attribute Set,Assembled size,Colour,Material,Warranty
//
// Alphabetical, and led by a REQUIRED *Attribute Set column that names the set
// each row belongs to — so one file both assigns the set and fills the values.
// An earlier version of this report guessed the shape, omitted that column and
// ordered the rest by importance; it would have been rejected.
const ATTRIBUTES = ["Assembled size", "Colour", "Material", "Warranty"] as const;

/** Must match the set created in Unleashed exactly. */
const ATTRIBUTE_SET = process.env.UNLEASHED_ATTRIBUTE_SET || "Product Detail";

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
  IsSellable?: boolean;
  Obsolete?: boolean;
  Width?: number | null;
  Height?: number | null;
  Depth?: number | null;
  Weight?: number | null;
};

async function productsPage(n: number) {
  const q = "pageSize=200";
  const res = await fetch(`https://api.unleashedsoftware.com/Products/${n}?${q}`, {
    headers: {
      "api-auth-id": env.UNLEASHED_API_ID,
      "api-auth-signature": crypto.createHmac("sha256", env.UNLEASHED_API_KEY).update(q).digest("base64"),
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0",
    },
  });
  if (!res.ok) throw new Error(`Unleashed ${res.status} on Products/${n}`);
  return res.json() as Promise<{ Items: RawProduct[]; Pagination?: { NumberOfPages?: number } }>;
}

// MINIMAL QUOTING, and it is not a style choice.
//
// Unleashed's import matches header cells literally, and quoting them broke it:
// with a BOM the first cell arrives as `\ufeff"*Product Code"` — the quote is not
// at position 0, so it is never unquoted, and the import fails with
// "*Product Code. Column is missing from the template." Its own template is
// unquoted, so this now quotes ONLY the fields that need it: a comma, a quote or
// a newline. Warranty is the one that does — "Internal Frame: 12 months, Cover:
// 3 months".
const cell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: (string | number)[][]) =>
  rows.map((r) => r.map(cell).join(",")).join("\n") + "\n";

/** "L 1,665 × W 805 × H 585 mm" -> millimetres, per axis, whichever are present. */
function axesMm(v: string): { l?: number; w?: number; h?: number } {
  const one = (ax: string) => {
    const m = v.match(new RegExp(`\\b${ax}\\s*([0-9][0-9,.]*)`, "i"));
    if (!m) return undefined;
    const n = parseFloat(m[1].replace(/,/g, ""));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  return { l: one("L"), w: one("W"), h: one("H") };
}

/** "1kg", "12.5 kg" -> kilograms. */
function kg(v: string): number | undefined {
  const m = v.match(/([0-9][0-9,.]*)\s*kg/i);
  if (!m) return undefined;
  const n = parseFloat(m[1].replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** The prose, as one plain-text block. Notes holds nothing richer. */
function notesFor(d: ReturnType<typeof parseProductDetail>): string {
  const parts: string[] = [];
  if (d.overviewShort) parts.push(d.overviewShort.trim());
  if (d.overviewDescription) parts.push(d.overviewDescription.trim());
  if (d.features.length) parts.push(d.features.map((f) => `- ${f}`).join("\n"));
  if (d.packageInclusions) {
    parts.push("Package inclusions:\n" + d.packageInclusions.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
  }
  return parts.join("\n\n").trim();
}

it("erp copy", { timeout: 300_000 }, async () => {
  let erp: RawProduct[] = [];
  for (let page = 1; ; page++) {
    const j = await productsPage(page);
    erp = erp.concat(j.Items ?? []);
    if (!j.Pagination?.NumberOfPages || page >= j.Pagination.NumberOfPages) break;
  }
  const live = new Map(
    erp.filter((p) => p.ProductCode && p.IsSellable && !p.Obsolete).map((p) => [p.ProductCode!.toUpperCase(), p])
  );

  // Not filterListable: that applies the public-site allowlist, and the portal
  // brands' copy is wanted here too — as a separate list, for a separate channel.
  const candidates = allProducts().filter((p) => p.sku && !isObsolete(p));

  type Row = {
    code: string;
    name: string;
    channel: "public" | "portal";
    attrs: Record<string, string>;
    notes: string;
    inErp: boolean;
  };

  const rows: Row[] = [];
  const cartons: string[][] = [];
  let partialPacking = 0;

  for (const p of candidates as WcProduct[]) {
    const code = (p.sku ?? "").trim().toUpperCase();
    const d = parseProductDetail(p);
    const attrs: Record<string, string> = {};
    for (const label of ATTRIBUTES) {
      const v = d.specs.find((s) => s.label === label)?.value?.trim();
      if (v) attrs[label] = v;
    }
    const notes = notesFor(d);
    if (!Object.keys(attrs).length && !notes) continue;

    const inErp = live.has(code);
    rows.push({
      code,
      name: p.name,
      channel: isPublicSiteSku(code) ? "public" : "portal",
      attrs,
      notes,
      inErp,
    });

    // Cartons, only where the ERP's own field is empty — never overwrite it.
    if (!inErp) continue;
    const e = live.get(code)!;
    const packing = d.specs.find((s) => s.label === "Packing size")?.value ?? "";
    const gross = kg(d.specs.find((s) => s.label === "Gross weight")?.value ?? "");
    const a = axesMm(packing);
    const needsCarton = !(e.Width && e.Height && e.Depth);
    const needsWeight = !e.Weight;
    if (packing && needsCarton && !(a.l && a.w && a.h)) partialPacking++;
    if ((needsCarton && a.l && a.w && a.h) || (needsWeight && gross)) {
      cartons.push([
        code,
        // mm -> cm, and the store's L/W/H onto the ERP's Width/Depth/Height.
        needsCarton && a.l && a.w && a.h ? String(a.l / 10) : "",
        needsCarton && a.l && a.w && a.h ? String(a.h / 10) : "",
        needsCarton && a.l && a.w && a.h ? String(a.w / 10) : "",
        needsWeight && gross ? String(gross) : "",
      ]);
    }
  }

  const inErp = rows.filter((r) => r.inErp);
  const pub = inErp.filter((r) => r.channel === "public");
  const portal = inErp.filter((r) => r.channel === "portal");
  const orphan = rows.filter((r) => !r.inErp);

  mkdirSync("reports", { recursive: true });

  // IMPORT-READY: the product code and the attribute columns, nothing else.
  // A "Channel" column was useful to read and is not a field Unleashed knows —
  // the per-channel counts live in the summary instead, where they cannot end up
  // in an import file by accident.
  const attrRows = inErp.filter((r) => Object.keys(r.attrs).length);
  const attrHeader = ["*Product Code", "*Attribute Set", ...ATTRIBUTES];
  const attrRow = (r: Row) => [r.code, ATTRIBUTE_SET, ...ATTRIBUTES.map((a) => r.attrs[a] ?? "")];
  // BOM, as Unleashed's own template carries one.
  const withBom = (body: string) => "\ufeff" + body;
  writeFileSync(ATTRS_CSV, withBom(csv([attrHeader, ...attrRows.map(attrRow)])));

  // One row, for proving the import format before committing 300+ of them.
  const probe = attrRows.find((r) => r.code === "MBCTMA01") ?? attrRows[0];
  if (probe) {
    writeFileSync("reports/erp-copy-attributes-one.csv", withBom(csv([attrHeader, attrRow(probe)])));
  }

  writeFileSync(
    NOTES_CSV,
    csv([["*Product Code", "Channel", "Notes"], ...inErp.filter((r) => r.notes).map((r) => [r.code, r.channel, r.notes])])
  );

  writeFileSync(CARTONS_CSV, csv([["*Product Code", "Width", "Height", "Depth", "Weight"], ...cartons]));

  const attrCount = (label: string) => inErp.filter((r) => r.attrs[label]).length;
  const longest = Math.max(0, ...inErp.map((r) => r.notes.length));

  const md = [
    "# Product copy, for the ERP",
    "",
    `Generated ${new Date().toISOString().slice(0, 10)} · \`npm run report:copy\``,
    "",
    `${rows.length} products in the snapshot carry copy. ${inErp.length} of them have a live,`,
    `sellable record in Unleashed — those are the ones that can be enriched today.`,
    "",
    "| | count |",
    "|---|---:|",
    `| **Public site** (M/N/SC/A) | ${pub.length} |`,
    `| **Portal brands** (S/F/R) | ${portal.length} |`,
    `| No ERP record — nothing to attach to | ${orphan.length} |`,
    "",
    "## The four attribute fields",
    "",
    "These have nowhere to live in Unleashed today. Define an Attribute Set with",
    "them first (Settings → System Settings → Attribute Sets), then import",
    `\`${ATTRS_CSV}\` — in Unleashed's own template shape, including the required`,
    `\`*Attribute Set\` column naming **${ATTRIBUTE_SET}**. Import it at Inventory >`,
    "Products > Import/Export > Product Attributes.",
    "",
    "`reports/erp-copy-attributes-one.csv` is the same file with a single row, for",
    "proving the import format before committing the rest.",
    "",
    "| field | products |",
    "|---|---:|",
    ...ATTRIBUTES.map((a) => `| ${a} | ${attrCount(a)} |`),
    "",
    "## The prose",
    "",
    `\`${NOTES_CSV}\` — ${inErp.filter((r) => r.notes).length} products, longest ${longest.toLocaleString()} characters.`,
    "",
    "Overview, feature bullets and package inclusions, flattened into one plain-text",
    "block because Notes holds nothing richer. **Check the field's length limit before",
    "importing** — if it truncates, the overview matters more than the bullets and",
    "the order above already reflects that.",
    "",
    "## Cartons recoverable from Packing size",
    "",
    `\`${CARTONS_CSV}\` — ${cartons.length} products where the spec table knows a carton or a`,
    "weight the ERP does not. Converted mm → cm, and mapped length→Width, width→Depth,",
    "height→Height. Only written where the ERP's own field is EMPTY; nothing here",
    "overwrites a measurement the ERP already has.",
    "",
    `${partialPacking} more carry a Packing size with only two axes (\`L 380 × W 300 mm\`),`,
    "which is not a carton and is left alone.",
    "",
    "## What does not survive",
    "",
    "The four attributes arrive intact. The prose does not: the product page renders",
    "headings, bullets and a spec table, and Notes is one plain-text field. That is a",
    "reason to keep the attributes separate from the prose, not a reason to skip it —",
    "the ERP currently has neither.",
    "",
  ];
  writeFileSync(MD, md.join("\n"));

  console.log(
    `copy: ${inErp.length} enrichable (${pub.length} public, ${portal.length} portal), ${cartons.length} cartons, ${orphan.length} orphaned`
  );
});
