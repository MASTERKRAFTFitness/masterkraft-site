// Spec + detail parsing for a WooCommerce product.
//
// Split out of woocommerce.ts because it is pure: it maps a product's meta_data
// to the overview, features and spec table the product page renders, and depends
// on nothing but types. That lets the reporting scripts import the REAL parser
// (scripts/build-spec-gaps.ts) instead of reimplementing it and drifting from
// what customers actually see. woocommerce.ts re-exports everything here, so
// existing imports keep working.
import type { ProductDetail, WcMeta, WcProduct } from "@/lib/woocommerce";

const metaStr = (meta: WcMeta[] | undefined, key: string): string => {
  const v = meta?.find((m) => m.key === key)?.value;
  return typeof v === "string" ? v.trim() : v != null ? String(v) : "";
};

// Older products keep their whole spec table in one ACF HTML blob
// (`specification_text`) rather than the discrete `assembled_size_*` / `colour`
// / … fields. 78 of the 224 listed products have ONLY the blob, so without this
// their spec table renders empty. The markup is uniform across the catalogue: a
// single "Assembled Size" <strong> heading, then <li> items of "Label: value".
// "34kg" -> "34 kg", "12months" -> "12 months".
//
// The blob template appends "months" to the warranty value whether or not the
// value is written in months, so anything phrased differently comes back with a
// stray unit glued to its last WORD: "2 Years Non-Wearable Partsmonths" (the two
// C2 ergs, Air Rower Pro, Air Cycle Elite), and a value already ending in months
// doubles up: "3 monthsmonths" (the 34kg plyo box, Functional Trainer Pro).
// Only stripped at the END and only after a letter, so a real "3 months" (space
// and digit before it) is never touched.
// Exported for the tests. Fixing the source data in WordPress is still the right
// call; this stops a bad value there reaching customers.
export function normalizeSpecUnits(value: string): string {
  return value
    .replace(/([a-z])months\s*$/i, "$1")
    .replace(/(\d)\s*(kg|months?|years?|weeks?|days?)\b/gi, "$1 $2");
}

const SPEC_BLOB_LABELS: Record<string, string> = {
  colour: "Colour",
  color: "Colour",
  material: "Material",
  warranty: "Warranty",
  "net weight": "Net weight",
  "gross weight": "Gross weight",
};

export function parseSpecBlob(html: string): {
  dims: { l: string; w: string; h: string; d: string };
  rows: { label: string; value: string }[];
} {
  const dims = { l: "", w: "", h: "", d: "" };
  const rows: { label: string; value: string }[] = [];
  if (!html) return { dims, rows };

  for (const li of html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)) {
    const text = li[1]
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .trim();
    const parts = text.match(/^([^:]{1,40}):\s*([\s\S]+)$/);
    if (!parts) continue;
    const key = parts[1].trim().toLowerCase();
    const value = parts[2].replace(/\s+/g, " ").trim();
    if (!value) continue;

    // Dimensions carry their own "mm"; strip it so they format like the
    // discrete fields do (dims() re-adds a single trailing unit).
    const bare = value.replace(/\s*mm\s*$/i, "");
    if (key === "width") dims.w = bare;
    else if (key === "height") dims.h = bare;
    else if (key === "length") dims.l = bare;
    else if (key === "depth") dims.d = bare;
    else {
      const label = SPEC_BLOB_LABELS[key];
      if (label) {
        // Weights are stored as "34kg"; warranties as "12months". Insert the
        // missing space so they read consistently with the discrete fields, and
        // collapse a doubled unit: several warranties were hand-typed as
        // "3 monthsmonths" in WordPress (the 34kg plyo box and the Functional
        // Trainer show it to customers; 3 more carry it behind a correct
        // discrete field). Fixing the source data is still the right call, this
        // just stops a typo there rendering on the site.
        rows.push({ label, value: normalizeSpecUnits(value) });
      }
    }
  }
  return { dims, rows };
}

// Parse the ACF meta bag into the overview / features / specs the product page
// renders. Missing fields simply drop out (unknown is never shown as blank/0).
export function parseProductDetail(p: WcProduct): ProductDetail {
  const m = p.meta_data;
  const features: string[] = [];
  const count = parseInt(metaStr(m, "features"), 10);
  const max = Number.isFinite(count) && count > 0 ? count : 6;
  for (let i = 0; i < max; i++) {
    const t = metaStr(m, `features_${i}_text`);
    if (t) features.push(t);
  }

  const specs: { label: string; value: string }[] = [];
  const push = (label: string, value: string, unit = "") => {
    const v = value.trim();
    if (v) specs.push({ label, value: unit ? `${v}${unit}` : v });
  };
  const dims = (l: string, w: string, h: string, d: string) => {
    const parts = [
      l && `L ${l}`,
      w && `W ${w}`,
      h && `H ${h}`,
      d && `D ${d}`,
    ].filter(Boolean);
    return parts.length ? `${parts.join(" × ")} mm` : "";
  };
  // Discrete ACF fields win; the legacy HTML blob fills whatever they leave empty.
  const blob = parseSpecBlob(metaStr(m, "specification_text"));
  const blobRow = (label: string) => blob.rows.find((r) => r.label === label)?.value ?? "";
  const pushMerged = (label: string, discrete: string, unit = "") => {
    if (discrete.trim()) push(label, discrete, unit);
    else push(label, blobRow(label));
  };

  push(
    "Assembled size",
    dims(
      metaStr(m, "assembled_size_length"),
      metaStr(m, "assembled_size_width"),
      metaStr(m, "assembled_size_height"),
      metaStr(m, "assembled_size_depth"),
    ) || dims(blob.dims.l, blob.dims.w, blob.dims.h, blob.dims.d),
  );
  pushMerged("Colour", metaStr(m, "colour"));
  pushMerged("Material", metaStr(m, "material"));
  pushMerged("Net weight", metaStr(m, "net_weight"), "kg");
  pushMerged("Gross weight", metaStr(m, "gross_weight"), "kg");
  push(
    "Packing size",
    dims(
      metaStr(m, "packing_size_length"),
      metaStr(m, "packing_size_width"),
      metaStr(m, "packing_size_height"),
      "",
    ),
  );
  pushMerged("Warranty", metaStr(m, "warranty"));

  const showPkg = metaStr(m, "show_package_inclusions");
  const pkgText = metaStr(m, "package_inclusion_text");

  return {
    overviewShort: metaStr(m, "product_overview_short") || undefined,
    overviewDescription: metaStr(m, "product_overview_description") || undefined,
    features,
    specs,
    packageInclusions: showPkg === "1" && pkgText ? pkgText : undefined,
  };
}
