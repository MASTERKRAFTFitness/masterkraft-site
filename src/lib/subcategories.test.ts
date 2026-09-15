// The subcategory registry is hand-written, and every field of it is either a
// URL somebody will link to or a sentence Google will show. These are the rules
// that stop an edit here becoming a dead page or a fabricated claim.
import { describe, expect, it } from "vitest";
import { categories } from "@/lib/categories";
import { getSubcategory, subcategories, subcategoriesOf } from "@/lib/subcategories";

describe("the subcategory registry", () => {
  it("sits under a category that exists", () => {
    const known = new Set(categories.map((c) => c.slug));
    expect(subcategories.filter((s) => !known.has(s.category)).map((s) => s.slug)).toEqual([]);
  });

  // A duplicate path is two pages claiming one URL, and the second one silently
  // never renders.
  it("claims each path once", () => {
    const paths = subcategories.map((s) => `${s.category}/${s.slug}`);
    expect(paths.length).toBe(new Set(paths).size);
  });

  // ONE SUBGROUP NAME UNDER TWO CATEGORIES IS TWO URLS COMPETING FOR ONE QUERY.
  // The ERP has six such names — "Squat & Power Racks" sits under both Rigs &
  // Racks and Strength — and reports/subgroup-pages.md lists them all. Writing
  // pages for both halves is the duplication these pages exist to remove, so
  // only one half may be written.
  it("writes each ERP subgroup at exactly one URL", () => {
    const byName = new Map<string, string[]>();
    for (const s of subcategories) {
      byName.set(s.erpSubgroup, [...(byName.get(s.erpSubgroup) ?? []), `${s.category}/${s.slug}`]);
    }
    expect([...byName].filter(([, paths]) => paths.length > 1)).toEqual([]);
  });

  it("is reachable by the lookup the route uses", () => {
    for (const s of subcategories) {
      expect(getSubcategory(s.category, s.slug)).toBe(s);
    }
    expect(getSubcategory("body-weight", "not-a-real-sub")).toBeUndefined();
    expect(getSubcategory("nonsense", "gymnastics")).toBeUndefined();
    expect(subcategoriesOf("rigs-racks").map((s) => s.slug)).toContain("squat-and-power-racks");
    expect(subcategoriesOf("nonsense")).toEqual([]);
  });

  // A slug is a URL. Anything outside this set is either escaped in the address
  // bar or silently lower-cased by something downstream.
  it("uses URL-safe slugs", () => {
    expect(subcategories.filter((s) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s.slug))).toEqual([]);
  });

  // Every field here is rendered. An empty one is a page with no H1, no
  // subtitle, or — the reason the registry exists at all — no reason to exist.
  it("carries copy in every field", () => {
    for (const s of subcategories) {
      expect(s.erpSubgroup.trim()).not.toBe("");
      expect(s.label.trim()).not.toBe("");
      expect(s.blurb.trim()).not.toBe("");
      expect(s.about.startsWith("<p>")).toBe(true);
      // Three short paragraphs is the shape; the floor is what separates a page
      // from a doorway page.
      expect(s.about.replace(/<[^>]+>/g, " ").trim().split(/\s+/).length).toBeGreaterThan(60);
      expect(s.about).not.toContain("<script");
    }
  });

  // Google shows about 155 characters. Under 70 wastes the slot the category
  // pages were already caught wasting; over 165 is cut mid-sentence.
  it("writes meta descriptions to the length a search result shows", () => {
    const wrong = subcategories
      .filter((s) => s.meta.length < 70 || s.meta.length > 165)
      .map((s) => `${s.slug} (${s.meta.length})`);
    expect(wrong).toEqual([]);
  });

  // The same rule lib/product-copy is held to, for the same reason: this copy is
  // written from the subgroup NAME and what the catalogue plainly contains, and
  // a confident invented figure is the kind of wrong a customer discovers on
  // delivery. Nothing here may state a spec the system cannot check.
  it("states no fabricated physical specifications", () => {
    const banned = /\b\d+\s?(mm|cm|kg|lb|gauge|ga)\b|\b\d+\s?(year|yr)s?\b\s*warranty|\bwarrant(y|ed)\b/i;
    expect(
      subcategories
        .filter((s) => banned.test(`${s.blurb} ${s.meta} ${s.about}`))
        .map((s) => s.slug)
    ).toEqual([]);
  });

  // Thirty pages written to one template is thirty thin pages. This is the same
  // trigram-overlap check the product copy is held to, at the same threshold.
  it("says something different on each page", () => {
    const words = (s: string) =>
      new Set(
        s
          .replace(/<[^>]+>/g, " ")
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, " ")
          .split(/\s+/)
          .filter((w) => w.length > 3)
      );
    const docs = subcategories.map((s) => [s.slug, words(`${s.blurb} ${s.meta} ${s.about}`)] as const);
    const tooSimilar: string[] = [];
    for (let i = 0; i < docs.length; i++) {
      for (let j = i + 1; j < docs.length; j++) {
        const [a, b] = [docs[i][1], docs[j][1]];
        let inter = 0;
        for (const w of a) if (b.has(w)) inter++;
        const jaccard = inter / (a.size + b.size - inter);
        if (jaccard > 0.4) tooSimilar.push(`${docs[i][0]} ~ ${docs[j][0]} (${jaccard.toFixed(2)})`);
      }
    }
    expect(tooSimilar).toEqual([]);
  });
});
