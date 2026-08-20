// Generates the spec-reconciliation punch list:
//
//   reports/wc-spec-gaps.csv          one row per product per field needing work
//   reports/wc-spec-gaps-summary.md   counts, priorities and the worst offenders
//
// Run:  npm run report:specs
//
// WHY IT IMPORTS THE APP. The product page resolves the spec table at render
// time: the discrete ACF fields win, and the legacy `specification_text` blob
// fills whatever they leave empty. Any report that reimplemented that rule would
// eventually disagree with the page it is meant to describe, so this uses the
// real parser (lib/spec.ts) and the real visibility rules (lib/woocommerce.ts).
// That is also why it runs under vitest.reports.config.mts rather than as a
// plain node script -- it needs the "@/" alias and the JSON data imports.
//
// The work this lists is worth doing in WordPress whether or not the content
// ever leaves it: it fixes what customers see today.
import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { categories } from "@/lib/categories";
import { allProducts, productsInCategory } from "@/lib/catalogue";
import { decodeEntities, filterBrandSku, filterListable, type WcMeta, type WcProduct } from "@/lib/woocommerce";
import { parseSpecBlob } from "@/lib/spec";

const CSV = "reports/wc-spec-gaps.csv";
const MD = "reports/wc-spec-gaps-summary.md";

const meta = (m: WcMeta[] | undefined, key: string): string => {
  const v = m?.find((x) => x.key === key)?.value;
  return typeof v === "string" ? v.trim() : v != null ? String(v) : "";
};

// The seven rows the product page can show, with the ACF field behind each and
// whether parseProductDetail will fall back to the blob for it.
const FIELDS = [
  { label: "Assembled size", acf: "assembled_size_length/width/height/depth", blobFallback: true },
  { label: "Colour", acf: "colour", blobFallback: true },
  { label: "Material", acf: "material", blobFallback: true },
  { label: "Net weight", acf: "net_weight", blobFallback: true },
  { label: "Gross weight", acf: "gross_weight", blobFallback: true },
  // push(), not pushMerged() -- there is no blob fallback for packing size.
  { label: "Packing size", acf: "packing_size_length/width/height", blobFallback: false },
  { label: "Warranty", acf: "warranty", blobFallback: true },
] as const;

function discreteValue(p: WcProduct, label: string): string {
  const m = p.meta_data;
  const dims = (...keys: string[]) => {
    const parts = keys.map((k) => meta(m, k)).filter(Boolean);
    return parts.length ? parts.join(" x ") : "";
  };
  switch (label) {
    case "Assembled size":
      return dims("assembled_size_length", "assembled_size_width", "assembled_size_height", "assembled_size_depth");
    case "Packing size":
      return dims("packing_size_length", "packing_size_width", "packing_size_height");
    case "Colour": return meta(m, "colour");
    case "Material": return meta(m, "material");
    case "Net weight": return meta(m, "net_weight");
    case "Gross weight": return meta(m, "gross_weight");
    case "Warranty": return meta(m, "warranty");
    default: return "";
  }
}

// Blob keys parseSpecBlob knows. Anything else in the blob can never reach the
// page, however carefully it was typed in WordPress.
// Mirrors SPEC_BLOB_LABELS in lib/spec.ts, so report rows carry the same field
// names the page uses rather than the raw lowercase blob key.
const BLOB_LABELS: Record<string, string> = {
  colour: "Colour", color: "Colour", material: "Material", warranty: "Warranty",
  "net weight": "Net weight", "gross weight": "Gross weight",
  width: "Assembled size", height: "Assembled size", length: "Assembled size", depth: "Assembled size",
};

// The repair normalizeSpecUnits performs that indicates broken source data.
const DOUBLED_UNIT = /([a-z])months\s*$/i;

const KNOWN_BLOB_KEYS = new Set([
  "colour", "color", "material", "warranty", "net weight", "gross weight",
  "width", "height", "length", "depth",
]);

function rawBlobRows(html: string): { key: string; value: string }[] {
  const out: { key: string; value: string }[] = [];
  for (const li of html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
    const text = li[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
    const parts = text.match(/^([^:]{1,40}):\s*([\s\S]+)$/);
    if (!parts) continue;
    const value = parts[2].replace(/\s+/g, " ").trim();
    if (value) out.push({ key: parts[1].trim().toLowerCase(), value });
  }
  return out;
}

// parseProductDetail appends a unit to some discrete values and not others, so
// a like-for-like comparison has to compare what the PAGE RENDERS against the
// blob, not the raw field. Without this, every "16" vs "16 kg" pair reads as a
// disagreement when the page in fact shows "16kg" and the two agree.
const RENDER_UNIT: Record<string, string> = { "Net weight": "kg", "Gross weight": "kg" };

// Space-insensitive: "16kg" and "16 kg" are the same value formatted differently.
const norm = (s: string) =>
  s.toLowerCase().replace(/\s+/g, "").replace(/mm$/, "").trim();

// The discrete field holds a bare number and the renderer adds no unit, while
// the blob spells one out -- so the page shows "12" where it should read
// "12 months". A real defect, not a disagreement about the value.
const unitMissing = (discrete: string, blob: string) =>
  /^\d+(\.\d+)?$/.test(discrete.trim()) &&
  new RegExp(`^${discrete.trim()}\\s*(month|year|week|day|kg)`, "i").test(blob.trim());
const q = (s: string) => `"${String(s ?? "").replace(/"/g, '""')}"`;

type Row = {
  issue: string; priority: number; sku: string; product: string; category: string;
  field: string; discrete: string; blob: string; action: string; url: string;
};

it("writes the spec-reconciliation punch list", () => {
  // The served set, via the real rules: Clearance opts out of the brand filter.
  const clearanceIds = new Set(productsInCategory(356).map((p) => p.id));
  const served = allProducts().filter((p) => {
    const listable = filterListable([p]).length > 0;
    if (!listable) return false;
    return clearanceIds.has(p.id) || filterBrandSku([p]).length > 0;
  });

  const catOf = (p: WcProduct) =>
    categories.find((c) => (p.categories ?? []).some((t) => t.id === c.wcId))?.label ??
    (p.categories ?? [])[0]?.name ?? "";

  const rows: Row[] = [];

  for (const p of served) {
    const blobHtml = meta(p.meta_data, "specification_text");
    const blob = parseSpecBlob(blobHtml);
    const raw = rawBlobRows(blobHtml);
    const url = `/product/${p.slug}`;
    const base = { sku: p.sku || "(no sku)", product: decodeEntities(p.name), category: catOf(p), url };

    for (const f of FIELDS) {
      const d = discreteValue(p, f.label);
      const b =
        f.label === "Assembled size"
          ? [blob.dims.l, blob.dims.w, blob.dims.h, blob.dims.d].filter(Boolean).join(" x ")
          : blob.rows.find((r) => r.label === f.label)?.value ?? "";

      const rendered = d ? d + (RENDER_UNIT[f.label] ?? "") : "";
      if (d && b && norm(rendered) !== norm(b)) {
        if (unitMissing(d, b)) {
          rows.push({ ...base, issue: "unit_missing", priority: 1, field: f.label, discrete: d, blob: b,
            action: `Page shows "${rendered}" with no unit. Set ${f.acf} to "${b}"` });
        } else {
          rows.push({ ...base, issue: "conflict", priority: 1, field: f.label, discrete: d, blob: b,
            action: `Decide which is correct, then set the ${f.acf} field to it` });
        }
      } else if (!d && b && f.blobFallback) {
        rows.push({ ...base, issue: "blob_only", priority: 3, field: f.label, discrete: "", blob: b,
          action: `Copy "${b}" into the ${f.acf} field` });
      } else if (!d && b && !f.blobFallback) {
        rows.push({ ...base, issue: "blob_not_rendered", priority: 2, field: f.label, discrete: "", blob: b,
          action: `Page shows nothing: no blob fallback for ${f.label}. Set ${f.acf}` });
      } else if (!d && !b) {
        rows.push({ ...base, issue: "missing", priority: 4, field: f.label, discrete: "", blob: "",
          action: `No value anywhere. Set ${f.acf}` });
      }
    }

    // Source data the blob parser had to repair on the way to the page.
    for (const r of raw) {
      if (!KNOWN_BLOB_KEYS.has(r.key)) {
        rows.push({ ...base, issue: "blob_unreadable", priority: 2, field: r.key,
          discrete: "", blob: r.value,
          action: `Blob row "${r.key}" is not a field the site can show. Move it to a real field or drop it` });
      } else if (DOUBLED_UNIT.test(r.value)) {
        // ONLY the doubled-unit typo ("3 monthsmonths"). normalizeSpecUnits also
        // inserts a space into "34kg", which 1,312 blob values need and which is
        // house formatting rather than a defect -- flagging those would bury the
        // 45 real typos under noise.
        const label = BLOB_LABELS[r.key] ?? r.key;
        rows.push({ ...base, issue: "malformed", priority: 1, field: label,
          discrete: discreteValue(p, label), blob: r.value,
          action: `Source reads "${r.value}". Fix specification_text, or type the correct value into the discrete field, which overrides it` });
      }
    }
  }

  rows.sort((a, b) =>
    a.priority - b.priority || a.category.localeCompare(b.category) || a.sku.localeCompare(b.sku));

  writeFileSync(
    CSV,
    "issue,priority,sku,product,category,field,discrete_value,blob_value,action,url\n" +
      rows.map((r) =>
        [r.issue, r.priority, q(r.sku), q(r.product), q(r.category), q(r.field),
         q(r.discrete), q(r.blob), q(r.action), r.url].join(",")).join("\n") + "\n"
  );

  const by = (k: keyof Row) =>
    rows.reduce<Record<string, number>>((a, r) => ((a[String(r[k])] = (a[String(r[k])] ?? 0) + 1), a), {});
  const issues = by("issue");
  const perProduct = rows.reduce<Record<string, number>>(
    (a, r) => ((a[`${r.sku} — ${r.product}`] = (a[`${r.sku} — ${r.product}`] ?? 0) + 1), a), {});
  const worst = Object.entries(perProduct).sort((a, b) => b[1] - a[1]).slice(0, 15);
  const clean = served.length - new Set(rows.map((r) => r.sku)).size;

  const LABEL: Record<string, [string, string]> = {
    conflict: ["Conflict", "The discrete field and the blob both have a value and they genuinely disagree. The page shows the discrete one. Someone has to decide which is right."],
    unit_missing: ["Unit missing", "The discrete field holds a bare number and the page renders it without a unit, so a warranty reads as `12` instead of `12 months`. The blob has the full value. **Customers see this today.**"],
    malformed: ["Malformed source", "The blob value is broken and the site repairs it at render time (this is the `3 monthsmonths` class). Customers see the right thing today; the source is still wrong."],
    blob_not_rendered: ["Not rendered", "Only the blob has it, and this field has no blob fallback, so the page shows nothing at all."],
    blob_unreadable: ["Unreadable row", "A blob row whose label the parser does not recognise. It can never reach the page however it is typed."],
    blob_only: ["Blob only", "The page falls back to the blob and shows the right value. Promoting it to the discrete field is what lets the blob eventually be retired."],
    missing: ["Missing", "No value in either place. A genuine content gap."],
  };
  const order = ["unit_missing", "conflict", "malformed", "blob_not_rendered", "blob_unreadable", "blob_only", "missing"];

  writeFileSync(
    MD,
    `# Spec reconciliation punch list\n\n` +
    `Generated by \`npm run report:specs\` from the committed catalogue snapshot.\n` +
    `Covers the **${served.length} served products**. Full detail: \`wc-spec-gaps.csv\`.\n\n` +
    `**${rows.length} items** across **${new Set(rows.map((r) => r.sku)).size} products**. ` +
    `${clean} served products need nothing.\n\n` +
    `**Start at the top.** The three priority-1 groups are where a customer may be reading ` +
    `something wrong today, and they are only ${(issues.unit_missing ?? 0) + (issues.conflict ?? 0) + (issues.malformed ?? 0)} ` +
    `items. Everything below them is cleanup that changes nothing on the site but has to happen ` +
    `before \`specification_text\` can be retired.\n\n` +
    `| Issue | Count | What it means |\n|---|---:|---|\n` +
    order.filter((k) => issues[k]).map((k) => `| **${LABEL[k][0]}** | ${issues[k]} | ${LABEL[k][1]} |`).join("\n") +
    `\n\n## By field\n\n| Field | Items |\n|---|---:|\n` +
    Object.entries(by("field")).sort((a, b) => b[1] - a[1])
      .map(([f, n]) => `| ${f} | ${n} |`).join("\n") +
    `\n\n## Most work per product\n\n| Items | SKU and product |\n|---:|---|\n` +
    worst.map(([k, n]) => `| ${n} | ${k} |`).join("\n") + "\n"
  );

  console.log(`${rows.length} items across ${new Set(rows.map((r) => r.sku)).size} products -> ${CSV}`);
});
