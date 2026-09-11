// The products the site sells with no words at all, and everything the ERP
// knows about them — the brief for writing their copy.
//
//   reports/copy-gaps.json   one row per product, machine-readable
//
// Run:  npx vitest run --config vitest.reports.config.mts scripts/copy-gaps.report.ts
//
// WHY. Half the catalogue is mute. Of the 290 products in the sitemap, 145 have
// a frozen-snapshot record carrying WooCommerce copy and 145 have none at all —
// they are ERP-only units that WooCommerce never held, so there is nothing to
// migrate and unitDescription() generates "Buy <name> at MASTERKRAFT. $X inc.
// GST." for the meta description, the JSON-LD description and the page body.
// Near-identical across 145 indexable URLs is the thin-content shape.
//
// WHAT THERE IS TO WRITE FROM, which is less than you would hope: the ERP's
// Notes and AttributeSet are empty on all 1,425 products (see
// erp-copy.report.ts), so there is no material, no colour, no assembled size and
// no warranty text in the system anywhere. The honest inputs are the product
// NAME (which carries the material and form for most of this catalogue — a
// "Rubber Hex Dumbbell" is rubber and hex), the group/subgroup, the size range,
// the price band and the carton dimensions. This report collects exactly those
// so the copy is written from the record rather than from imagination.
import { describe, it, vi } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
// lib/unleashed wraps its catalogue build in Next's unstable_cache, which has
// no request context out here: it fails, getUnleashedMap swallows the error and
// returns {}, and this report silently finds nothing to write about. Passing the
// wrapper through is enough — the report wants one uncached read anyway.
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
  revalidateTag: () => {},
  revalidatePath: () => {},
}));

import { getUnleashedMap } from "@/lib/unleashed";
import { erpUnits } from "@/lib/erp-catalogue";
import catalogue from "@/data/catalogue.json";

// The ERP credentials, the way the other report scripts reach them: vitest does
// not load .env.local the way Next does, and lib/unleashed reads process.env at
// call time, so assigning here (after the imports) is early enough.
Object.assign(
  process.env,
  Object.fromEntries(
    readFileSync(".env.local", "utf8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => [
        l.slice(0, l.indexOf("=")).trim(),
        l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, ""),
      ])
  )
);

describe("copy gaps", () => {
  it("collects every product with no snapshot copy", { timeout: 300_000 }, async () => {
    const snapBySlug = new Map(
      (catalogue.products as { slug: string; short_description?: string; description?: string }[])
        .map((p) => [p.slug, p])
    );
    const map = await getUnleashedMap();
    const units = [...erpUnits(map).values()];

    const rows = units
      .filter((u) => {
        const snap = snapBySlug.get(u.slug);
        if (!snap) return true;
        return !((snap.short_description ?? "") + (snap.description ?? ""))
          .replace(/<[^>]*>/g, "")
          .trim();
      })
      .map((u) => {
        const first = map[u.codes[0]?.toUpperCase() ?? ""] ?? undefined;
        return {
          slug: u.slug,
          name: u.name,
          group: u.group,
          subgroup: u.subgroup ?? null,
          brand: u.brand ?? null,
          codes: u.codes,
          sizes: u.sizes,
          isRange: u.isRange,
          price: u.price,
          priceMax: u.priceMax,
          inStock: u.inStock,
          hasImage: !!u.image,
          // Carton, where the ERP has one. The only physical fact in the system.
          weightKg: (first as { weight?: number } | undefined)?.weight ?? null,
        };
      })
      .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));

    mkdirSync("reports", { recursive: true });
    writeFileSync("reports/copy-gaps.json", JSON.stringify(rows, null, 2));

    const byGroup: Record<string, number> = {};
    for (const r of rows) byGroup[r.group] = (byGroup[r.group] ?? 0) + 1;
    console.log(`\nproducts with no copy: ${rows.length} of ${units.length} units\n`);
    for (const [g, n] of Object.entries(byGroup).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(3)}  ${g}`);
    }
  });
});
