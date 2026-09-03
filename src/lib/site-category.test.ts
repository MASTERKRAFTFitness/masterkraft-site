// A breadcrumb that links to a page which does not exist is a 404 the site
// serves to itself, and it goes into the BreadcrumbList JSON-LD as well, so
// Google reads it too. Twenty-seven of them were live until 2026-09-03, hidden
// behind a category page that answered 200 with a "Page not found" body.
//
// The property that matters is the last test: whatever a product carries, the
// crumb is a real page or nothing at all. Never a guess.
import { describe, expect, it } from "vitest";
import { categories, siteCategoryFor } from "@/lib/categories";
import { allProducts, categoryTerms } from "@/lib/catalogue";
import { ERP_GROUPS } from "@/lib/erp-catalogue";
import { slugify } from "@/lib/erp-catalogue";

const terms = categoryTerms();
const pages = new Set(categories.map((c) => c.slug));

describe("siteCategoryFor", () => {
  it("passes a real category slug straight through", () => {
    expect(siteCategoryFor({ slug: "cardio" }, terms)?.slug).toBe("cardio");
    expect(siteCategoryFor({ slug: "equipment-storage" }, terms)?.slug).toBe("equipment-storage");
  });

  it("maps an ERP group to its hand-written slug, not the slugified name", () => {
    // The whole trap: "Rigs & Racks" slugifies to `rigs-and-racks`, and the page
    // has lived at `rigs-racks` since launch.
    expect(slugify("Rigs & Racks")).toBe("rigs-and-racks");
    expect(siteCategoryFor({ id: 0, name: "Rigs & Racks", slug: "rigs-and-racks" }, terms)?.slug)
      .toBe("rigs-racks");
  });

  it("walks a WooCommerce child term up to the page that lists it", () => {
    const child = terms.find((t) => t.slug === "chest-shoulder-machines");
    expect(child, "fixture term missing from the snapshot").toBeDefined();
    expect(siteCategoryFor(child, terms)?.slug).toBe("strength");

    const barbells = terms.find((t) => t.slug === "barbells");
    expect(siteCategoryFor(barbells, terms)?.slug).toBe("weightlifting");
  });

  it("returns undefined rather than guessing", () => {
    // A promotional cross-section, not a range — it has no page and must not be
    // mapped to one.
    const promo = terms.find((t) => t.slug === "new-products");
    expect(siteCategoryFor(promo, terms)).toBeUndefined();
    expect(siteCategoryFor(undefined, terms)).toBeUndefined();
    expect(siteCategoryFor({ slug: "nothing-like-this" }, terms)).toBeUndefined();
  });

  it("never resolves any real product to a page that does not exist", () => {
    const bad: string[] = [];
    for (const p of allProducts()) {
      for (const c of p.categories ?? []) {
        const resolved = siteCategoryFor(c, terms);
        if (resolved && !pages.has(resolved.slug)) bad.push(`${p.slug} -> ${resolved.slug}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("resolves every ERP group, which is what an ERP-only product carries", () => {
    const unresolved = ERP_GROUPS.filter(
      (g) => !siteCategoryFor({ id: 0, name: g, slug: slugify(g) }, terms)
    );
    expect(unresolved).toEqual([]);
  });
});
