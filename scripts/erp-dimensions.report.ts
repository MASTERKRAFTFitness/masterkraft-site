// Carton dimensions the ERP is missing and the old store can supply.
//
//   reports/erp-dimensions.md          what the work is, split by who does it
//   reports/erp-dimensions-import.csv  ready for Unleashed's product import
//   reports/erp-dimensions-review.csv  the rows that need a human first
//
// Run:  npm run report:dimensions
//
// WHY. Freight is quoted from a carton, and the two systems hold half each: the
// snapshot has all four measurements for 201 of 238 servable products, the ERP
// for 47% of what it sells. The site now reads the snapshot first and falls back
// to the ERP (lib/freight-server.ts), which covers the storefront — but the ERP
// is what the warehouse, the franchisee catalogues and every future integration
// read, and it is where this data should live. Copying it across fixes it
// everywhere at once, the same argument the punch list makes about photographs.
//
// NO API WRITE NEEDED. The import CSV is shaped for Unleashed's own bulk product
// import, so this can be done today rather than waiting on write scope for the
// API key.
//
// THE TWO SYSTEMS AGREE ON UNITS AND DISAGREE ON AXES. Measured across the 307
// codes carrying dimensions in both: weight and largest-dimension ratios are
// exactly 1.000, so no conversion. But the ERP orders a carton Width/Height/Depth
// against the snapshot's length/width/height — 77/52/62 in one is 77/62/52 in the
// other. The mapping is length=Width, width=Depth, height=Height, and reading it
// positionally would scramble every box it filled.
//
// IT DOES NOT COPY BAD DATA. The snapshot has its own faults, which carton-gaps
// already names: a side over 3m is millimetres typed into a centimetre field
// (SCRWAR04 records 2440 x 610cm — 24 metres). Those go to review, not to the
// import. So does any code where the two systems already disagree, because that
// is a question about which one is right, not a gap to fill.
import { mkdirSync, writeFileSync } from "node:fs";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { it } from "vitest";
import { allProducts } from "@/lib/catalogue";

const MD = "reports/erp-dimensions.md";
const IMPORT_CSV = "reports/erp-dimensions-import.csv";
const REVIEW_CSV = "reports/erp-dimensions-review.csv";

// A carton side over 3m is not a carton. See the note above.
const IMPLAUSIBLE_CM = 300;
// Nor is one under half a centimetre. SLLE2502 records a height of 0.001cm,
// which is a decimal point in the wrong place or a metre value in a cm field —
// either way it is not something to copy into the ERP.
const IMPLAUSIBLE_MIN_CM = 0.5;
// Two systems measuring the same box will not agree to the millimetre. Anything
// inside this is rounding; outside it, somebody measured a different thing.
const TOLERANCE = 0.02;

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
  ProductDescription?: string;
  Width?: number | null;
  Height?: number | null;
  Depth?: number | null;
  Weight?: number | null;
  IsSellable?: boolean;
  Obsolete?: boolean;
  ProductGroup?: { GroupName?: string } | null;
  ProductBrand?: { BrandName?: string } | null;
};

// The site's own brand rule (lib/woocommerce BRAND_SKU_RE). Split out because
// these are two audiences, NOT because one of them does not matter: the S/F/R
// codes are live products sold through the franchisee portals and the
// catalogues, just never listed on masterkraft.com. Their cartons are worth the
// same as ours to whoever picks them — it is simply a different list, for a
// different channel, and probably a different person.
const OURS = /^(?:[MN]|SC)/i;

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

const num = (v: unknown) => {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** The snapshot's carton, in the ERP's own axis order. */
type Carton = { width: number; height: number; depth: number; weight: number };

const csv = (rows: (string | number)[][]) =>
  rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n") + "\n";

const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(a, b) * TOLERANCE;

it("erp dimensions", { timeout: 300_000 }, async () => {
  // --- the ERP, live -------------------------------------------------------
  let erp: RawProduct[] = [];
  for (let page = 1; ; page++) {
    const j = await productsPage(page);
    erp = erp.concat(j.Items ?? []);
    if (!j.Pagination?.NumberOfPages || page >= j.Pagination.NumberOfPages) break;
  }
  const sellable = erp.filter((p) => p.ProductCode && p.IsSellable && !p.Obsolete);

  // --- the snapshot, by code, mapped into the ERP's axes --------------------
  const fromSnapshot = new Map<string, { carton: Carton; name: string; implausible: boolean }>();
  for (const p of allProducts()) {
    const code = (p.sku ?? "").trim().toUpperCase();
    if (!code) continue;
    const d = (p as { dimensions?: { length?: string; width?: string; height?: string } }).dimensions;
    const carton: Carton = {
      // length -> Width, width -> Depth, height -> Height. See the note above.
      width: num(d?.length),
      depth: num(d?.width),
      height: num(d?.height),
      weight: num((p as { weight?: string }).weight),
    };
    if (!carton.width || !carton.height || !carton.depth || !carton.weight) continue;
    fromSnapshot.set(code, {
      carton,
      name: p.name,
      implausible:
        Math.max(carton.width, carton.height, carton.depth) > IMPLAUSIBLE_CM ||
        Math.min(carton.width, carton.height, carton.depth) < IMPLAUSIBLE_MIN_CM,
    });
  }

  // --- sort every sellable ERP product into one of four piles --------------
  const fill: string[][] = [];
  const conflict: string[][] = [];
  const suspect: string[][] = [];
  const measure: string[][] = [];

  for (const p of sellable) {
    const code = p.ProductCode!.toUpperCase();
    const group = p.ProductGroup?.GroupName ?? "";
    const name = p.ProductDescription ?? "";
    const has = {
      width: num(p.Width),
      height: num(p.Height),
      depth: num(p.Depth),
      weight: num(p.Weight),
    };
    const complete = has.width && has.height && has.depth && has.weight;
    const snap = fromSnapshot.get(code);

    if (complete) {
      // Both hold a carton. Only interesting when they disagree — that is a
      // question about which is right, not a gap to fill.
      if (snap && !snap.implausible) {
        const diffs = (["width", "height", "depth", "weight"] as const).filter(
          (k) => !near(has[k], snap.carton[k])
        );
        if (diffs.length) {
          conflict.push([
            code, name, group, diffs.join(" "),
            has.width, has.height, has.depth, has.weight,
            snap.carton.width, snap.carton.height, snap.carton.depth, snap.carton.weight,
          ].map(String));
        }
      }
      continue;
    }

    if (!snap) {
      measure.push(
        [code, name, group, has.width, has.height, has.depth, has.weight, OURS.test(code) ? "ours" : "other-brand"].map(String)
      );
      continue;
    }
    if (snap.implausible) {
      suspect.push([
        code, name, group,
        snap.carton.width, snap.carton.height, snap.carton.depth, snap.carton.weight,
      ].map(String));
      continue;
    }
    // A gap the old store can close. Send the WHOLE carton, not just the missing
    // field: a box measured as one set of four is coherent, and half from each
    // system is a box that was never measured.
    fill.push([
      code, name, group,
      snap.carton.width, snap.carton.height, snap.carton.depth, snap.carton.weight,
    ].map(String));
  }

  mkdirSync("reports", { recursive: true });

  // Shaped for Unleashed's product import: the code plus the four fields.
  writeFileSync(
    IMPORT_CSV,
    csv([
      ["*Product Code", "Width", "Height", "Depth", "Weight"],
      ...fill.map((r) => [r[0], r[3], r[4], r[5], r[6]]),
    ])
  );

  writeFileSync(
    REVIEW_CSV,
    csv([
      ["Kind", "Product Code", "Name", "Group", "Fields", "ERP W", "ERP H", "ERP D", "ERP kg", "Store W", "Store H", "Store D", "Store kg"],
      ...conflict.map((r) => ["conflict", ...r]),
      ...suspect.map((r) => ["suspect-store-value", r[0], r[1], r[2], "", "", "", "", "", r[3], r[4], r[5], r[6]]),
      ...measure.map((r) => ["needs-measuring", r[0], r[1], r[2], "", r[3], r[4], r[5], r[6], "", "", "", ""]),
    ])
  );

  const ourMeasure = measure.filter((r) => r[7] === "ours");

  const byGroup = (rows: string[][]) => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r[2] || "(none)"] = (c[r[2] || "(none)"] ?? 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  };

  const md = [
    "# ERP carton dimensions",
    "",
    `Generated ${new Date().toISOString().slice(0, 10)} · \`npm run report:dimensions\``,
    "",
    `${sellable.length} sellable, non-obsolete products in Unleashed.`,
    "",
    "| | count | what it is |",
    "|---|---:|---|",
    `| **Ready to import** | ${fill.length} | The ERP has no carton and the old store has a plausible one. \`${IMPORT_CSV}\` |`,
    `| Disagree | ${conflict.length} | Both hold a carton and they differ by more than ${TOLERANCE * 100}%. Someone picks. |`,
    `| Store value suspect | ${suspect.length} | The old store's carton has a side over ${IMPLAUSIBLE_CM}cm — millimetres in a centimetre field. |`,
    `| Needs measuring — OURS | ${ourMeasure.length} | M/N/SC codes. Neither system knows. A tape measure, not a lookup. |`,
    `| Needs measuring — portal brands | ${measure.length - ourMeasure.length} | Snap, REVL, Fernwood. Live products, sold through the portals and catalogues rather than the public site. |`,
    "",
    "## How to import",
    "",
    `\`${IMPORT_CSV}\` carries the product code and the four fields, in the ERP's own`,
    "axis order, ready for Unleashed's product import. No API write access needed.",
    "",
    "**The axes are mapped, not copied.** The old store records length/width/height;",
    "Unleashed records Width/Height/Depth. length becomes Width, width becomes Depth,",
    "height becomes Height. Units are identical — verified across the 307 codes that",
    "carry dimensions in both, where the ratios are exactly 1.000.",
    "",
    "**Whole cartons only.** Where a product is missing one field, all four are sent:",
    "a box measured as one set is coherent, half from each system is a box nobody",
    "measured.",
    "",
    "## Ready to import, by category",
    "",
    "| category | products |",
    "|---|---:|",
    ...byGroup(fill).map(([g, n]) => `| ${g} | ${n} |`),
    "",
    "## Needs measuring, by category",
    "",
    "The M/N/SC codes the public site sells. Nothing can supply these — they have",
    "to be measured. The portal brands need the same treatment on their own list;",
    "they are separated here because it is a different channel, not because it",
    "does not count.",
    "",
    "| category | products |",
    "|---|---:|",
    ...byGroup(ourMeasure).map(([g, n]) => `| ${g} | ${n} |`),
    "",
  ];

  if (conflict.length) {
    md.push(
      "## Where the two disagree",
      "",
      "Both systems hold a carton for these and they do not match. Listed because a",
      "freight quote uses the snapshot first, so today the store's number is the one",
      "being charged on.",
      "",
      "| code | name | fields | ERP W/H/D/kg | store W/H/D/kg |",
      "|---|---|---|---|---|",
      ...conflict
        .slice(0, 40)
        .map((r) => `| ${r[0]} | ${r[1]} | ${r[3]} | ${r[4]}/${r[5]}/${r[6]}/${r[7]} | ${r[8]}/${r[9]}/${r[10]}/${r[11]} |`),
      ""
    );
    if (conflict.length > 40) md.push(`_${conflict.length - 40} more in ${REVIEW_CSV}._`, "");
  }

  writeFileSync(MD, md.join("\n"));

  console.log(
    `dimensions: ${fill.length} importable, ${conflict.length} disagree, ${suspect.length} suspect, ${measure.length} to measure`
  );
});
