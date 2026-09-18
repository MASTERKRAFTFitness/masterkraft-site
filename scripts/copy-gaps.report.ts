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
import copyJson from "@/data/product-copy.json";

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
      (catalogue.products as { slug: string; sku?: string; short_description?: string; description?: string }[])
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

    // WHAT THIS FILE IS, because it was read as the wrong thing on 18 September
    // and nearly cost 21 good descriptions.
    //
    // `rows` above is every unit with no SNAPSHOT copy — the population this
    // exercise was scoped against in September, and NOT a backlog: writing an
    // entry in product-copy.json does not remove a unit from it, because the
    // snapshot is still empty and always will be. Left as the file's contents it
    // reads as 140 products needing copy long after all 140 have it, which is
    // exactly how a session came to overwrite finished work with fresh work.
    //
    // So the file holds the units with NOTHING ANYWHERE: no snapshot copy and no
    // authored entry. That is the list somebody can pick up and write, and an
    // empty file is the honest answer when there is nothing left to write.
    const authoredCopy = copyJson as Record<string, unknown>;
    const backlog = rows.filter((r) => !authoredCopy[r.slug]);

    mkdirSync("reports", { recursive: true });
    writeFileSync("reports/copy-gaps.json", JSON.stringify(backlog, null, 2));

    const byGroup: Record<string, number> = {};
    for (const r of backlog) byGroup[r.group] = (byGroup[r.group] ?? 0) + 1;
    console.log(
      `\nunits with no copy anywhere: ${backlog.length} of ${units.length} — written to reports/copy-gaps.json`
    );
    console.log(
      `  (${rows.length} have no snapshot copy; ${rows.length - backlog.length} of those are already written in product-copy.json)\n`
    );
    for (const [g, n] of Object.entries(byGroup).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(n).padStart(3)}  ${g}`);
    }

    // COPY THAT NO LONGER HAS A PRODUCT, and copy that is missing one.
    //
    // Retiring or renaming a record in the ERP silently invalidates the authored
    // copy keyed to its slug, and nothing else notices: product-copy.test.ts runs
    // offline so it cannot know what the ERP holds, and a stale key is inert
    // rather than broken. Three of them appeared within a day of starting to fix
    // ERP names - "oversided-hoodie" when a spelling fix merged that record into
    // its range, then "oversized-hoodie" when the unpriced hoodie series was
    // retired - and both were caught by hand. This is the check that stops the
    // next one needing to be.
    // A key is valid if it names an ERP unit OR a snapshot product. Authored
    // copy is not only for units any more: it also OVERRIDES a snapshot
    // description where WooCommerce shipped one across two products, so a
    // snapshot-only slug here is deliberate rather than stale.
    const slugs = new Set(units.map((u) => u.slug));
    const snapshotSlugs = new Set(
      (catalogue.products as { slug: string }[]).map((p) => p.slug)
    );
    const authored = Object.keys(authoredCopy);
    const orphaned = authored.filter((slug) => !slugs.has(slug) && !snapshotSlugs.has(slug));
    const uncovered = backlog;

    // MIS-KEYED, WHICH IS NOT THE SAME AS ORPHANED, and is what the rule above
    // was blind to. An entry keyed to a SNAPSHOT slug passes the orphan check as
    // a deliberate override — and that is how ten plate and barbell sets sat
    // unreachable from 11 September: their snapshot slug carries the set weight
    // (coloured-bumper-plates-set-of-8-100kg) while the site serves the unit slug
    // (coloured-bumper-plates-set-of-8). Silent, because the page still rendered,
    // just with the generated "Buy <name> at MASTERKRAFT" line instead.
    //
    // The tell is the SKU: if the snapshot product this key names is sold by a
    // live unit under a DIFFERENT slug, the copy is pointed at the wrong URL.
    const unitByCode = new Map<string, string>();
    for (const u of units) for (const c of u.codes) unitByCode.set(c.toUpperCase(), u.slug);
    const misKeyed = authored
      .filter((slug) => !slugs.has(slug))
      .map((slug) => {
        const sku = (snapBySlug.get(slug)?.sku ?? "").trim().toUpperCase();
        const to = sku ? unitByCode.get(sku) : undefined;
        return to && to !== slug ? { from: slug, to } : null;
      })
      .filter((x): x is { from: string; to: string } => !!x);

    if (misKeyed.length) {
      console.log(`\n  ${misKeyed.length} authored entr${misKeyed.length === 1 ? "y is" : "ies are"} keyed to a URL the site does not serve:`);
      for (const m of misKeyed) console.log(`    ${m.from}  ->  ${m.to}`);
      console.log("    The page renders the generated description until the key is moved.");
    }

    // ORPHANED SPLITS IN TWO, and only one half should ever be deleted.
    //
    // HIDE_UNSHIPPABLE keeps a product without a recorded carton off the site, so
    // copy written for one names no live unit and looks identical to copy for a
    // product the ERP has retired. It is not the same thing at all: the first is
    // waiting for a carton to be measured and goes live the day one is, which is
    // the arrangement the station markers have had since September. Telling
    // somebody to delete it, as this report used to, is telling them to throw
    // away finished work over a freight gap.
    const withUnshippable = (() => {
      const flag = process.env.HIDE_UNSHIPPABLE;
      process.env.HIDE_UNSHIPPABLE = "false";
      try {
        return new Set([...erpUnits(map).values()].map((u) => u.slug));
      } finally {
        process.env.HIDE_UNSHIPPABLE = flag;
      }
    })();
    const dormant = orphaned.filter((slug) => withUnshippable.has(slug));
    const retired = orphaned.filter((slug) => !withUnshippable.has(slug));

    if (dormant.length) {
      console.log(`\n  ${dormant.length} authored entr${dormant.length === 1 ? "y is" : "ies are"} waiting on freight data, NOT stale — keep them:`);
      for (const s of dormant) console.log(`    ${s}`);
      console.log("    The product has no carton in erp-cartons.json, so the site hides it. Record one and the page appears with its copy already written.");
    }
    if (retired.length) {
      console.log(`\n  ${retired.length} authored entr${retired.length === 1 ? "y" : "ies"} match no product at all — the ERP has renamed or retired these:`);
      for (const s of retired) console.log(`    ${s}`);
      console.log("    Remove from src/data/product-copy.json, and redirect the dead URL if it was served.");
    }
    if (uncovered.length) {
      console.log(`\n  ${uncovered.length} product${uncovered.length === 1 ? "" : "s"} with no authored copy:`);
      for (const r of uncovered.slice(0, 20)) console.log(`    ${r.slug}`);
    }
    if (!orphaned.length && !uncovered.length && !misKeyed.length) {
      console.log("\n  copy coverage: every product has copy, and every entry has a product.");
    }
  });
});
