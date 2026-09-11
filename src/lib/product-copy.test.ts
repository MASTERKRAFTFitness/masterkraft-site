// The authored copy for the half of the catalogue WooCommerce never held.
//
// These are thin-content guards, not spell-checks. The copy exists because ~145
// indexable product URLs were serving a generated "Buy <name> at MASTERKRAFT.
// $X inc. GST." as their meta description, their JSON-LD description and their
// page body at once. Copy that is merely present but templated would recreate
// exactly that problem in a longer form, so uniqueness is asserted rather than
// assumed.
import { describe, expect, it } from "vitest";
import copy from "@/data/product-copy.json";
import { productCopy, productCopyHtml } from "@/lib/product-copy";

const entries = Object.entries(copy as Record<string, { short: string; body: string[]; features?: string[] }>);

describe("authored product copy", () => {
  it("has entries to check", () => {
    expect(entries.length).toBeGreaterThan(100);
  });

  // 155 is where Google truncates; under 60 is not a description.
  it("keeps every short description in meta-description range", () => {
    const bad = entries.filter(([, c]) => c.short.length > 155 || c.short.length < 60);
    expect(bad.map(([k, c]) => `${k} (${c.short.length})`)).toEqual([]);
  });

  // Total substance, not per-paragraph length: a closing "Women's sizing from S
  // to XL." is a legitimate short paragraph, and a rule that banned it would
  // push the copy toward padding, which is the thing being guarded against.
  it("gives every product a body with real substance", () => {
    const bad = entries.filter(
      ([, c]) => !c.body?.length || c.body.join(" ").trim().length < 120
    );
    expect(bad.map(([k, c]) => `${k} (${c.body.join(" ").length})`)).toEqual([]);
  });

  // THE POINT OF THE EXERCISE. Two products sharing a description are two thin
  // pages, not one good one.
  it("never repeats a short description", () => {
    const seen = new Map<string, string[]>();
    for (const [slug, c] of entries) seen.set(c.short, [...(seen.get(c.short) ?? []), slug]);
    expect([...seen.values()].filter((v) => v.length > 1)).toEqual([]);
  });

  // Near-duplicates are the failure mode templated copy actually produces: the
  // same three sentences with the product name swapped. Trigram overlap catches
  // that where an equality check does not.
  it("keeps every pair of products substantially different", () => {
    const shingle = (t: string) => {
      const w = t.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/);
      const s = new Set<string>();
      for (let i = 0; i < w.length - 2; i++) s.add(`${w[i]} ${w[i + 1]} ${w[i + 2]}`);
      return s;
    };
    const docs = entries.map(([k, c]) => [k, shingle(`${c.short} ${c.body.join(" ")}`)] as const);
    const tooSimilar: string[] = [];
    for (let i = 0; i < docs.length; i++) {
      for (let j = i + 1; j < docs.length; j++) {
        const [a, b] = [docs[i][1], docs[j][1]];
        let inter = 0;
        for (const x of a) if (b.has(x)) inter++;
        const jaccard = inter / (a.size + b.size - inter);
        if (jaccard > 0.4) tooSimilar.push(`${docs[i][0]} ~ ${docs[j][0]} (${jaccard.toFixed(2)})`);
      }
    }
    expect(tooSimilar).toEqual([]);
  });

  // The copy is written from the product NAME, the group and the size list,
  // because the ERP's Notes and AttributeSet are empty on all 1,425 products.
  // Nothing in it may state a spec the system cannot check - a confident
  // invented dimension is the kind of wrong a customer discovers on delivery.
  it("states no fabricated physical specifications", () => {
    const banned = /\b\d+\s?(mm|cm|gauge|ga)\b|\b\d+\s?(year|yr)s?\b\s*warranty|\bwarrant(y|ed)\b|\b\d+\s?mm\s*steel\b/i;
    const offenders = entries
      .filter(([, c]) => banned.test(`${c.short} ${c.body.join(" ")} ${(c.features ?? []).join(" ")}`))
      .map(([k]) => k);
    // Figures taken from the unit's OWN record are not fabrications. These are
    // the products whose ERP size list or product name literally states the
    // measurement the copy repeats - checked against reports/copy-gaps.json when
    // each was written. Adding to this list means having checked the same way.
    const allowed = new Set([
      // ERP sizes: 5mm, 10mm, 15mm, 20mm
      "acoustic-underlay-1m-x-10m",
      // ERP sizes: 13mm (Red), 21mm (Grey), 32mm (Black)
      "power-bands",
      // ERP sizes: 55cm, 65cm, 75cm (Anti-Burst)
      "fitness-ball",
      // The measurements are in the product name itself
      "olympic-power-bar-20kg-2200mm-700lb-capacity",
    ]);
    expect(offenders.filter((k) => !allowed.has(k))).toEqual([]);
  });

  it("renders body and features as the HTML the product page expects", () => {
    const [slug] = entries[0];
    const html = productCopyHtml(slug)!;
    expect(html.startsWith("<p>")).toBe(true);
    expect(html).not.toContain("<script");
    const c = productCopy(slug)!;
    if (c.features?.length) expect(html).toContain("<h3>Features</h3>");
  });

  it("returns nothing for a product with no authored copy", () => {
    expect(productCopy("not-a-real-product")).toBeUndefined();
    expect(productCopyHtml("not-a-real-product")).toBeUndefined();
  });
});
