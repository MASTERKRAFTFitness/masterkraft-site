// Which source wins for a product's words. Getting this order wrong is silent:
// the page still renders, it just says something nobody chose — either the
// frozen snapshot reinstated over an editor's change, or a duplicate
// description reinstated over the file that exists to fix it.
import { describe, expect, it, vi, beforeEach } from "vitest";

const from = vi.fn();
const adminDb = vi.fn();

vi.mock("@/lib/admin-db", () => ({ adminDb: () => adminDb() }));
// unstable_cache would memoise the FIRST answer across every test in this file,
// so each case would assert against whatever ran first. Pass the function
// straight through; the caching itself is Next's to test, not ours.
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));

const { getProductContent, resolveCopy, resolveSpecs } = await import("@/lib/product-content");

/** A product_content row, with the loader's stamp unless told otherwise. */
const row = (o: Partial<Record<string, unknown>> = {}) => ({
  slug: "olympic-bench",
  overview_short: "A bench.",
  overview: "<p>A bench, at length.</p>",
  features: ["Steel frame"],
  updated_by: "content.load",
  ...o,
});

// The read is PAGED, so this stub slices the way PostgREST does rather than
// handing back the whole array on the first call. The slicing is what makes the
// "reads past the first page" case below mean anything: a stub that ignored the
// range would pass whether the paging loop existed or not.
const respond = (data: unknown[], error: unknown = null) => {
  from.mockReturnValue({
    select: () => ({
      range: (start: number, end: number) =>
        Promise.resolve({ data: error ? null : data.slice(start, end + 1), error }),
    }),
  });
  adminDb.mockReturnValue({ from });
};

beforeEach(() => {
  from.mockReset();
  adminDb.mockReset();
});

describe("only a human-edited row is read", () => {
  it("ignores a loader-owned row", async () => {
    // These rows ARE the snapshot, loaded from it on 5 September. Preferring one
    // over the snapshot is a no-op at best, and at worst reinstates a duplicate
    // description that product-copy.json was written to separate.
    respond([row({ updated_by: "content.load" })]);
    await expect(getProductContent()).resolves.toEqual({});
  });

  it("reads a row somebody has edited", async () => {
    respond([row({ updated_by: "michael@masterkraft.com" })]);
    await expect(getProductContent()).resolves.toEqual({
      "olympic-bench": {
        short: "A bench.",
        html: "<p>A bench, at length.</p><h3>Features</h3><ul><li>Steel frame</li></ul>",
      },
    });
  });

  it("treats a NULL updated_by as human, not as the loader", async () => {
    // The loader always stamps its name, so an unstamped row was written by
    // something else — a person in the SQL editor. Reading "not the loader" as
    // "the frozen original" would discard exactly the edit this table is for.
    respond([row({ updated_by: null })]);
    await expect(getProductContent()).resolves.toHaveProperty("olympic-bench");
  });
});

describe("a row has to be usable to count", () => {
  it("skips a row with no slug, which no page could find", async () => {
    // The table is keyed by erp_code; slug is nullable.
    respond([row({ updated_by: "a@b.c", slug: null })]);
    await expect(getProductContent()).resolves.toEqual({});
  });

  it("skips a row that says nothing", async () => {
    respond([row({ updated_by: "a@b.c", overview_short: null, overview: null, features: [] })]);
    await expect(getProductContent()).resolves.toEqual({});
  });

  it("keeps a row that sets only one field", async () => {
    respond([row({ updated_by: "a@b.c", overview: null, features: [] })]);
    const out = await getProductContent();
    expect(out["olympic-bench"]).toEqual({ short: "A bench." });
  });

  it("renders a body with no features, and features with no body", async () => {
    respond([row({ updated_by: "a@b.c", features: [] })]);
    expect((await getProductContent())["olympic-bench"].html).toBe("<p>A bench, at length.</p>");

    respond([row({ updated_by: "a@b.c", overview: null })]);
    expect((await getProductContent())["olympic-bench"].html).toBe(
      "<h3>Features</h3><ul><li>Steel frame</li></ul>"
    );
  });
});

describe("it degrades to today's behaviour, never to an empty page", () => {
  it("returns nothing when Supabase is not configured", async () => {
    // Report scripts and local checkouts have no credentials, and the site
    // served this copy from the snapshot alone until now.
    adminDb.mockReturnValue(null);
    await expect(getProductContent()).resolves.toEqual({});
  });

  it("swallows a query error rather than failing the page", async () => {
    respond([], { message: "boom" });
    await expect(getProductContent()).resolves.toEqual({});
  });

  it("swallows a thrown client", async () => {
    adminDb.mockImplementation(() => {
      throw new Error("no network");
    });
    await expect(getProductContent()).resolves.toEqual({});
  });
});

describe("precedence: database, then the JSON, then the snapshot", () => {
  // "high-rise-leggings-woman" is a real src/data/product-copy.json entry, so
  // these assert against the actual file rather than a fixture of it.
  const JSON_SLUG = "high-rise-leggings-woman";

  it("falls back to the JSON when the map is empty", () => {
    // The empty map is the shipped state until somebody edits a row, so this is
    // the case that has to be identical to today.
    const out = resolveCopy(JSON_SLUG, {});
    expect(out.short).toMatch(/High-rise training leggings/);
    expect(out.html).toMatch(/<p>/);
  });

  it("is safe to call with no map at all", () => {
    expect(resolveCopy(JSON_SLUG).short).toMatch(/High-rise training leggings/);
  });

  it("lets a database row outrank the JSON", () => {
    const out = resolveCopy(JSON_SLUG, {
      [JSON_SLUG]: { short: "Edited in Supabase.", html: "<p>Edited body.</p>" },
    });
    expect(out).toEqual({ short: "Edited in Supabase.", html: "<p>Edited body.</p>" });
  });

  it("overrides FIELD BY FIELD, keeping the JSON body when only the short moved", () => {
    // Wholesale replacement would blank a good body because somebody fixed a
    // meta description — losing content the edit never asked to touch.
    const out = resolveCopy(JSON_SLUG, { [JSON_SLUG]: { short: "Just the meta." } });
    expect(out.short).toBe("Just the meta.");
    expect(out.html).toMatch(/<p>/);
  });

  it("keeps the JSON short when only the body moved", () => {
    const out = resolveCopy(JSON_SLUG, { [JSON_SLUG]: { html: "<p>Just the body.</p>" } });
    expect(out.short).toMatch(/High-rise training leggings/);
    expect(out.html).toBe("<p>Just the body.</p>");
  });

  it("returns nothing for a slug no source has, so the snapshot still renders", () => {
    // The page treats an absent entry as "leave base alone", which is how the
    // ~108 products with no row and no JSON entry keep their snapshot copy.
    expect(resolveCopy("no-such-product-anywhere", {})).toEqual({
      short: undefined,
      html: undefined,
    });
  });
});

// The spec table follows the same rule as the prose, and gets its own cases
// because its failure looks different: prose that loses an override reads
// oddly, a spec that loses one states a wrong measurement.
describe("the spec table, database first", () => {
  const snapshot = [
    { label: "Assembled size", value: "L 2,070 × W 1,220 × H 2300 mm" },
    { label: "Colour", value: "Tungsten (metallic silver gray)" },
    { label: "Warranty", value: "3 months" },
  ];

  it("returns the snapshot untouched when nothing is edited", () => {
    expect(resolveSpecs("functional-trainer-pro", snapshot, {})).toBe(snapshot);
  });

  it("replaces only the edited field and keeps the rest", () => {
    const out = resolveSpecs("functional-trainer-pro", snapshot, {
      "functional-trainer-pro": { specs: { Warranty: "Frame 5yr, cables 6mo" } },
    });
    expect(out).toEqual([
      { label: "Assembled size", value: "L 2,070 × W 1,220 × H 2300 mm" },
      { label: "Colour", value: "Tungsten (metallic silver gray)" },
      { label: "Warranty", value: "Frame 5yr, cables 6mo" },
    ]);
  });

  // The Functional Trainer's actual gap: no Packing size anywhere on the old
  // store. An editor filling it should see it in its proper row, not appended.
  it("inserts a spec the snapshot never had, in render order", () => {
    const out = resolveSpecs("functional-trainer-pro", snapshot, {
      "functional-trainer-pro": { specs: { "Packing size": "L 2,100 × W 1,250 × H 400 mm" } },
    });
    expect(out.map((r) => r.label)).toEqual([
      "Assembled size",
      "Colour",
      "Packing size",
      "Warranty",
    ]);
  });

  it("ignores an entry for a different slug", () => {
    const out = resolveSpecs("functional-trainer-pro", snapshot, {
      "some-other-product": { specs: { Warranty: "wrong product" } },
    });
    expect(out).toBe(snapshot);
  });

  // THE ASYMMETRY, and the reason this file has two rules instead of one. A
  // loader-owned row's specs are the snapshot and are trusted — check:specs
  // proves they agree over 414 products. Its PROSE is also the snapshot, and is
  // worthless, because product-copy.json may have improved on it since.
  it("reads a loader-owned row's specs but drops its prose", async () => {
    adminDb.mockReturnValue({ from });
    respond([row({ assembled_size: "L 1 × W 1 × H 1 mm", updated_by: "content.load" })]);
    const map = await getProductContent();
    expect(map["olympic-bench"]).toEqual({ specs: { "Assembled size": "L 1 × W 1 × H 1 mm" } });
  });

  // A loader row carrying only prose still says nothing, so it should not
  // appear at all — otherwise "has an entry" stops meaning "has something to
  // say" and every caller has to test the fields instead of the entry.
  it("still drops a loader-owned row with no specs", async () => {
    adminDb.mockReturnValue({ from });
    respond([row({ updated_by: "content.load" })]);
    expect(await getProductContent()).toEqual({});
  });

  it("reads specs off a human-edited row", async () => {
    adminDb.mockReturnValue({ from });
    respond([row({ warranty: "5 years", updated_by: "michael" })]);
    const map = await getProductContent();
    expect(map["olympic-bench"].specs).toEqual({ Warranty: "5 years" });
  });
});

// WooCommerce's own description fields sit BELOW the authored JSON and ABOVE
// the frozen snapshot. Getting that order wrong is silent in both directions:
// too high reinstates the duplicate copy product-copy.json exists to fix, too
// low means deleting catalogue.json strips 385 products of their meta
// description.
describe("the WooCommerce description fields, and where they rank", () => {
  it("reads them off a loader-owned row, unlike prose", async () => {
    adminDb.mockReturnValue({ from });
    respond([row({ short_description: "<p>From Woo.</p>", updated_by: "content.load" })]);
    const map = await getProductContent();
    expect(map["olympic-bench"].shortDescription).toBe("<p>From Woo.</p>");
    // its ACF prose is still dropped - that rule is unchanged
    expect(map["olympic-bench"].short).toBeUndefined();
    expect(map["olympic-bench"].html).toBeUndefined();
  });

  it("supplies `short` when nothing outranks it", () => {
    const out = resolveCopy("a-product", {
      "a-product": { shortDescription: "<p>Woo short.</p>" },
    });
    expect(out.short).toBe("<p>Woo short.</p>");
  });

  it("does NOT outrank a human-edited overview", () => {
    const out = resolveCopy("a-product", {
      "a-product": { short: "Edited.", shortDescription: "<p>Woo short.</p>" },
    });
    expect(out.short).toBe("Edited.");
  });

  it("supplies `html` from the description when nothing outranks it", () => {
    const out = resolveCopy("a-product", {
      "a-product": { description: "<p>Woo body.</p>" },
    });
    expect(out.html).toBe("<p>Woo body.</p>");
  });

  it("does NOT outrank an edited row's overview body", () => {
    const out = resolveCopy("a-product", {
      "a-product": { html: "<p>Edited body.</p>", description: "<p>Woo body.</p>" },
    });
    expect(out.html).toBe("<p>Edited body.</p>");
  });

  // A row carrying ONLY a Woo description is still worth an entry - before
  // these columns existed it would have been skipped as having nothing to say.
  it("keeps a row whose only content is a Woo description", async () => {
    adminDb.mockReturnValue({ from });
    respond([row({ overview_short: null, overview: null, features: [], description: "<p>Only this.</p>", updated_by: "content.load" })]);
    const map = await getProductContent();
    expect(map["olympic-bench"]?.description).toBe("<p>Only this.</p>");
  });
});

describe("the whole table is read, not the first page of it", () => {
  // REGRESSION, 2026-09-23. PostgREST caps a response at 1,000 rows. This table
  // held 404 when the read was written and 1,258 after the catalogue's copy was
  // loaded into it, so an unpaged select silently returned a map missing its
  // tail. Every product in that tail fell back to the snapshot, and an edit to
  // one of those rows did nothing at all — no error, nothing in the logs.
  it("reads past the first page", async () => {
    const rows = Array.from({ length: 1001 }, (_, i) =>
      row({ slug: `product-${i}`, updated_by: "michael", overview_short: `Short ${i}` }),
    );
    respond(rows);
    const map = await getProductContent();
    expect(Object.keys(map)).toHaveLength(1001);
    // The row that a single unpaged request would have dropped.
    expect(map["product-1000"].short).toBe("Short 1000");
  });

  it("stops at the end rather than looping forever on a short page", async () => {
    respond([row({ slug: "only-one", updated_by: "michael" })]);
    const map = await getProductContent();
    expect(Object.keys(map)).toEqual(["only-one"]);
  });
});
