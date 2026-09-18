// The rules the catalogue gate compares by, tested without a store to fetch
// from. The gate itself (scripts/build-catalogue.mjs) does the fetching; these
// are the decisions it makes about what counts as drift.
import { describe, it, expect } from "vitest";
// Plain .mjs, shared with scripts/build-catalogue.mjs so the gate and this test
// cannot disagree about what counts as drift.
import { comparable, changedFields, diffCatalogue, confirmedDrift, driftCount } from "../../scripts/lib/catalogue-diff.mjs";

type P = Record<string, unknown>;
const product = (over: P = {}): P => ({
  slug: "squat-rack", sku: "MRSPFW01", name: "Squat Rack", price: "1200",
  categories: [{ id: 1, name: "Rigs & Racks" }, { id: 2, name: "Strength" }, { id: 3, name: "New" }],
  ...over,
});

describe("comparable", () => {
  it("ignores a reshuffle below position 0", () => {
    // The 28 August case: same four terms, different order, nobody edited them.
    const a = product();
    const b = product({ categories: [a.categories![0 as never], { id: 3, name: "New" }, { id: 2, name: "Strength" }] });
    expect(comparable(a)).toBe(comparable(b));
  });

  it("still catches a changed breadcrumb", () => {
    // product/[slug] renders categories[0], so position 0 is not interchangeable.
    const a = product();
    const b = product({ categories: [{ id: 2, name: "Strength" }, { id: 1, name: "Rigs & Racks" }, { id: 3, name: "New" }] });
    expect(comparable(a)).not.toBe(comparable(b));
  });

  it("catches an ordinary edit", () => {
    expect(comparable(product())).not.toBe(comparable(product({ price: "1300" })));
  });
});

describe("changedFields", () => {
  it("names the fields, which is what a failure has to be actionable", () => {
    expect(changedFields(product(), product({ price: "1300", name: "Squat Rack Pro" }))).toEqual(["name", "price"]);
  });

  it("applies the same category rule as the comparison", () => {
    const a = product();
    const b = product({ categories: [a.categories![0 as never], { id: 3, name: "New" }, { id: 2, name: "Strength" }] });
    expect(changedFields(a, b)).toEqual([]);
  });

  it("reports a field present on one side only", () => {
    expect(changedFields(product(), product({ featured: true }))).toEqual(["featured"]);
  });
});

describe("diffCatalogue", () => {
  const was = [product(), product({ slug: "gone", sku: "OLD01" })];
  const now = [product({ price: "1300" }), product({ slug: "new-thing", sku: "NEW01" })];

  it("splits added, removed and changed by slug", () => {
    const d = diffCatalogue(was, now);
    expect(d.added.map((p: P) => p.slug)).toEqual(["new-thing"]);
    expect(d.removed.map((p: P) => p.slug)).toEqual(["gone"]);
    expect(d.changed.map((p: P) => p.slug)).toEqual(["squat-rack"]);
    expect(driftCount(d)).toBe(3);
  });

  it("carries the field names on each changed product", () => {
    expect(diffCatalogue(was, now).changed[0]._fields).toEqual(["price"]);
  });

  it("reports nothing for an unchanged store", () => {
    expect(driftCount(diffCatalogue(was, was))).toBe(0);
  });
});

describe("confirmedDrift", () => {
  // 18 September: 218 products "changed" against an unchanged snapshot, then
  // none a minute later. A gate that fails at random on a correct deploy trains
  // people to re-run it until green, which is exactly what they would do if the
  // drift were real.
  const snapshot = [product(), product({ slug: "bench", sku: "MSWB01", price: "400" })];

  it("drops drift that only one read saw", () => {
    const first = diffCatalogue(snapshot, [product({ price: "9999" }), product({ slug: "bench", sku: "MSWB01", price: "400" })]);
    const second = diffCatalogue(snapshot, snapshot);
    expect(driftCount(first)).toBe(1);
    expect(driftCount(confirmedDrift(first, second))).toBe(0);
  });

  it("keeps drift both reads agree on — a real edit does not heal itself", () => {
    const edited = [product({ price: "1300" }), product({ slug: "bench", sku: "MSWB01", price: "400" })];
    const first = diffCatalogue(snapshot, edited);
    const second = diffCatalogue(snapshot, edited);
    const c = confirmedDrift(first, second);
    expect(c.changed.map((p: P) => p.slug)).toEqual(["squat-rack"]);
    expect(driftCount(c)).toBe(1);
  });

  it("confirms per product, not in bulk", () => {
    // One real edit and one flicker in the same read: the edit must survive and
    // the flicker must not, or a real change could ride in on a transient.
    const first = diffCatalogue(snapshot, [product({ price: "1300" }), product({ slug: "bench", sku: "MSWB01", price: "88" })]);
    const second = diffCatalogue(snapshot, [product({ price: "1300" }), product({ slug: "bench", sku: "MSWB01", price: "400" })]);
    const c = confirmedDrift(first, second);
    expect(c.changed.map((p: P) => p.slug)).toEqual(["squat-rack"]);
  });

  it("confirms added and removed the same way", () => {
    const withExtra = [...snapshot, product({ slug: "ghost", sku: "G01" })];
    const flicker = diffCatalogue(snapshot, withExtra);
    expect(driftCount(confirmedDrift(flicker, diffCatalogue(snapshot, snapshot)))).toBe(0);
    expect(driftCount(confirmedDrift(flicker, diffCatalogue(snapshot, withExtra)))).toBe(1);

    const short = diffCatalogue(snapshot, [snapshot[0]]);
    expect(short.removed.map((p: P) => p.slug)).toEqual(["bench"]);
    expect(driftCount(confirmedDrift(short, diffCatalogue(snapshot, snapshot)))).toBe(0);
  });
});
