// What HIDE_UNSHIPPABLE takes off the site, and what each one needs.
//
//   reports/unshippable.csv   every hidden product, with the missing fields
//   reports/unshippable.md    the punchlist, cheapest win first
//
// Run:  npm run report:unshippable
//
// WHY. Freight needs a weight AND all three carton dimensions; without them
// itemsToParcels returns `incomplete_dimensions` and the WHOLE cart is
// unquotable, not just the line. So HIDE_UNSHIPPABLE=true - which is what
// production runs - drops those products from every listing and from the
// sitemap. Their URLs still answer 200, so nothing 404s and nothing complains:
// the products are simply unfindable, and the only way to know which ones is to
// ask the same rule the site asks.
//
// THE LIST IS DERIVED, NEVER TYPED. It is filterListable with the flag off minus
// filterListable with it on. That is the definition of "hidden by this flag", so
// the report cannot drift from the behaviour the way the hand-made
// reports/unshippable-products.xlsx did - it still lists the plyo box and the
// kettlebell range that lib/woocommerce stopped hiding on 2026-09-07.
//
// A MEASUREMENT IS THE FIX, not a code change. Every product measured in
// WooCommerce leaves this list on the next snapshot build with nothing else
// touched. The ERP column says whether Unleashed already knows part of the
// answer - where it holds a complete carton the site now uses it, so anything
// still here needs a tape measure somewhere.
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import crypto from "node:crypto";
import { it } from "vitest";
import { allProducts } from "@/lib/catalogue";
import { filterListable, type WcProduct } from "@/lib/woocommerce";
import { skuAliases } from "@/lib/unleashed-aliases";

const CSV = "reports/unshippable.csv";
const MD = "reports/unshippable.md";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [
      l.slice(0, l.indexOf("=")).trim(),
      l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, ""),
    ])
);

type Raw = { ProductCode?: string; Weight?: unknown; Width?: unknown; Depth?: unknown; Height?: unknown };

async function productsPage(n: number) {
  const q = "pageSize=200&includeObsolete=true";
  const res = await fetch(`https://api.unleashedsoftware.com/Products/${n}?${q}`, {
    headers: {
      "api-auth-id": env.UNLEASHED_API_ID,
      "api-auth-signature": crypto.createHmac("sha256", env.UNLEASHED_API_KEY).update(q).digest("base64"),
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0",
    },
  });
  if (!res.ok) throw new Error(`Unleashed ${res.status} on Products/${n}`);
  return res.json() as Promise<{ Items: Raw[]; Pagination?: { NumberOfPages?: number } }>;
}

const num = (v: unknown) => {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const csvCell = (v: string | number | boolean) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: (string | number | boolean)[][]) =>
  rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
const money = (n: number) => `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

it("unshippable", { timeout: 300_000 }, async () => {
  let erpItems: Raw[] = [];
  for (let page = 1; ; page++) {
    const j = await productsPage(page);
    erpItems = erpItems.concat(j.Items ?? []);
    if (!j.Pagination?.NumberOfPages || page >= j.Pagination.NumberOfPages) break;
  }
  const erp = new Map(erpItems.filter((p) => p.ProductCode).map((p) => [p.ProductCode!.toUpperCase(), p]));
  const erpFor = (sku: string) => erp.get(sku) ?? erp.get((skuAliases[sku] ?? "").toUpperCase());

  const all = allProducts() as WcProduct[];
  const saved = process.env.HIDE_UNSHIPPABLE;
  process.env.HIDE_UNSHIPPABLE = "";
  const open = filterListable(all);
  process.env.HIDE_UNSHIPPABLE = "true";
  const shown = new Set(filterListable(all).map((p) => p.id));
  process.env.HIDE_UNSHIPPABLE = saved;

  type Row = {
    sku: string; name: string; category: string; price: number;
    needs: string; erpHas: string; slug: string;
  };

  const rows: Row[] = [];
  for (const p of open) {
    if (shown.has(p.id)) continue;
    const sku = (p.sku ?? "").trim().toUpperCase();
    const d = p.dimensions ?? {};
    const missing = [
      !num(p.weight) && "weight",
      !num(d.length) && "length",
      !num(d.width) && "width",
      !num(d.height) && "height",
    ].filter(Boolean) as string[];
    const e = erpFor(sku);
    const parts = e
      ? [num(e.Weight) && `${num(e.Weight)}kg`, num(e.Width) && `${num(e.Width)}cm`,
         num(e.Depth) && `${num(e.Depth)}cm`, num(e.Height) && `${num(e.Height)}cm`].filter(Boolean)
      : [];
    rows.push({
      sku,
      name: p.name,
      category: (p.categories ?? []).map((c) => c.name).join(" / "),
      price: Number(p.price ?? 0),
      // An implausible number is a measurement problem too, so say so rather
      // than reporting "nothing missing" on a box recorded in millimetres.
      needs: missing.length ? missing.join(", ") : "a believable carton (the recorded one cannot exist)",
      erpHas: !e ? "no ERP record" : parts.length ? parts.join(" x ") : "nothing",
      slug: p.slug,
    });
  }
  rows.sort((a, b) => b.price - a.price);

  const oneField = rows.filter((r) => r.needs.split(", ").length === 1 && !r.needs.startsWith("a believable"));
  const total = rows.reduce((s, r) => s + r.price, 0);

  mkdirSync("reports", { recursive: true });
  writeFileSync(
    CSV,
    csv([
      ["SKU", "Product", "Category", "Price", "Needs", "Unleashed has", "URL"],
      ...rows.map((r) => [r.sku, r.name, r.category, r.price, r.needs, r.erpHas,
        `https://masterkraft.com/product/${r.slug}`]),
    ])
  );

  const table = (rs: Row[]) => [
    "| SKU | product | price | needs | Unleashed has |",
    "|---|---|---:|---|---|",
    ...rs.map((r) => `| \`${r.sku}\` | ${r.name} | ${money(r.price)} | ${r.needs} | ${r.erpHas} |`),
  ];

  writeFileSync(
    MD,
    [
      "# Products hidden because freight cannot be quoted",
      "",
      `Generated ${new Date().toISOString().slice(0, 10)} · \`npm run report:unshippable\``,
      "",
      `**${rows.length} products** are live on their own URL and absent from every`,
      "listing and from the sitemap. Production runs `HIDE_UNSHIPPABLE=true`, and",
      "freight needs a weight and all three carton dimensions or the whole cart",
      "becomes unquotable, not just the line.",
      "",
      `One of each lists at ${money(total)}. That is a size, not a forecast — several`,
      "of these are bundles whose price field is the container's, not the pack's.",
      "",
      "Measure it in WooCommerce and it leaves this list on the next snapshot build.",
      "Nothing else has to change.",
      "",
      "Supersedes `reports/unshippable-products.xlsx`, which was made by hand and",
      "still lists two products the site stopped hiding on 2026-09-07.",
      "",
      ...(oneField.length
        ? [
            `## Start here — ${oneField.length} need a single number`,
            "",
            "One reading each, and the most valuable products on the list are in it.",
            "",
            ...table(oneField),
            "",
          ]
        : []),
      "## Everything hidden",
      "",
      "Most valuable first.",
      "",
      ...table(rows),
      "",
      `Full detail, with URLs, in \`${CSV}\`.`,
      "",
    ].join("\n")
  );

  console.log(`unshippable: ${rows.length} products, ${money(total)}, ${oneField.length} need one field`);
});
