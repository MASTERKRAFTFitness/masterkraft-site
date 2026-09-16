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

const { getProductContent, resolveCopy } = await import("@/lib/product-content");

/** A product_content row, with the loader's stamp unless told otherwise. */
const row = (o: Partial<Record<string, unknown>> = {}) => ({
  slug: "olympic-bench",
  overview_short: "A bench.",
  overview: "<p>A bench, at length.</p>",
  features: ["Steel frame"],
  updated_by: "content.load",
  ...o,
});

const respond = (data: unknown[], error: unknown = null) => {
  from.mockReturnValue({ select: () => Promise.resolve({ data, error }) });
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
