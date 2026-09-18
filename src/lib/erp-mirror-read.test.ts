// Reading the catalogue out of the Supabase mirror instead of Unleashed.
//
// These pin the properties that make the mirror safe to switch on, and every
// one of them is a way the site could be silently wrong rather than visibly
// broken — which is the whole risk of putting a cache in front of the product
// database. See docs/erp-mirror-scope.md.
import { describe, expect, it, vi, beforeEach } from "vitest";

// Next's cache has no request context in a test; pass the wrapper through so
// buildMapFromMirror is exercised rather than its cached shell.
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
  revalidateTag: () => {},
  revalidatePath: () => {},
}));

let rows: Record<string, unknown>[] = [];
let configured = true;
let failWith: string | null = null;
/** Every .range() the read asks for, so paging can be asserted rather than assumed. */
let ranges: [number, number][] = [];

vi.mock("@/lib/admin-db", () => ({
  adminDbConfigured: () => configured,
  adminDb: () =>
    configured
      ? {
          from: () => {
            const q = {
              select: () => q,
              or: () => q,
              order: () => q,
              range: (from: number, to: number) => {
                ranges.push([from, to]);
                if (failWith) return Promise.resolve({ data: null, error: { message: failWith } });
                return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
              },
            };
            return q;
          },
        }
      : null,
}));

const { buildMapFromMirror } = await import("@/lib/unleashed");

const fresh = () => new Date().toISOString();

/** One mirror row. Price is EX GST, as the ERP holds it and the table stores it. */
const row = (over: Record<string, unknown> = {}) => ({
  erp_code: "MMDBRH12",
  guid: "g-1",
  name: "Rubber Hex Dumbbell - 10kg",
  price: 50,
  stock: 4,
  brand: "MK",
  group_name: "Weightlifting",
  subgroup: "Dumbbells",
  sellable: true,
  image: "https://unlappcdn.unleashedsoftware.com/x.jpg",
  weight_kg: 10,
  width_cm: 30,
  depth_cm: 20,
  height_cm: 10,
  synced_at: fresh(),
  ...over,
});

/** The floor is 1,000, so a valid fixture has to clear it. */
const many = (n: number, over: (i: number) => Record<string, unknown> = () => ({})) =>
  Array.from({ length: n }, (_, i) => row({ erp_code: `CODE${String(i).padStart(5, "0")}`, ...over(i) }));

beforeEach(() => {
  rows = many(1_200);
  configured = true;
  failWith = null;
  ranges = [];
});

describe("it falls back rather than serving something wrong", () => {
  it("returns null when Supabase is not configured", async () => {
    // Report scripts and local checkouts run without credentials and must behave
    // exactly as they did before the mirror existed.
    configured = false;
    expect(await buildMapFromMirror()).toBeNull();
  });

  it("returns null when the read errors", async () => {
    failWith = "connection refused";
    expect(await buildMapFromMirror()).toBeNull();
  });

  it("returns null when the table is below the row floor", async () => {
    // A half-written first run has no previous size to be measured against, so
    // the loader's shrink guard cannot help. 16 slow seconds beats a shop
    // missing a third of its products.
    rows = many(999);
    expect(await buildMapFromMirror()).toBeNull();
  });

  it("returns null when the mirror is stale", async () => {
    // THE CASE THIS ACTUALLY HIT: on 18 Sep the mirror was 11 days old because
    // nothing refreshes it on a schedule. Without the ceiling, enabling the flag
    // would have served an 11-day-old catalogue as though it were live.
    const old = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    rows = many(1_200, () => ({ synced_at: old }));
    expect(await buildMapFromMirror()).toBeNull();
  });

  it("judges freshness by the OLDEST row, not the newest", async () => {
    // The loader writes wholesale, so one fresh row beside a thousand old ones
    // means a partial write. Taking the newest would read that as healthy.
    const old = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    rows = many(1_200, (i) => ({ synced_at: i === 0 ? fresh() : old }));
    expect(await buildMapFromMirror()).toBeNull();
  });

  it("returns null when a row has no timestamp to vouch for it", async () => {
    rows = many(1_200, (i) => (i === 500 ? { synced_at: null } : {}));
    expect(await buildMapFromMirror()).toBeNull();
  });
});

describe("it reads every row, not the first page", () => {
  it("pages past PostgREST's 1,000-row cap", async () => {
    // THE BUG THIS EXISTS FOR. PostgREST caps a select at 1,000 rows and says
    // nothing about it — 200, exactly 1,000 rows. The catalogue is 1,648, so the
    // unpaged read built a map missing a third of the shop, and 1,000 clears the
    // floor by one row so nothing else would have caught it either.
    rows = many(1_648);
    const map = await buildMapFromMirror();
    expect(Object.keys(map ?? {})).toHaveLength(1_648);
    expect(ranges.length).toBeGreaterThan(1);
    expect(ranges[0]).toEqual([0, 999]);
  });

  it("stops at a short page rather than looping", async () => {
    rows = many(1_200);
    await buildMapFromMirror();
    expect(ranges).toEqual([
      [0, 999],
      [1_000, 1_999],
    ]);
  });
});

describe("a mirror row means the same thing as an API response", () => {
  it("applies GST, because the table stores the ERP's ex-GST price", async () => {
    rows = many(1_200, (i) => (i === 0 ? { price: 50 } : {}));
    const map = await buildMapFromMirror();
    expect(map?.CODE00000.price).toBe(55); // 50 x 1.1
  });

  it("leaves a zero price at zero rather than making one up", async () => {
    rows = many(1_200, (i) => (i === 0 ? { price: 0 } : {}));
    expect((await buildMapFromMirror())?.CODE00000.price).toBe(0);
  });

  it("keeps the ERP's own axis order", async () => {
    // Width/Depth/Height are NOT length/width/height. Scrambling them here would
    // misquote freight, and lib/freight-server is the only place that remaps.
    const map = await buildMapFromMirror();
    const e = map?.CODE00000;
    expect([e?.widthCm, e?.depthCm, e?.heightCm]).toEqual([30, 20, 10]);
  });

  it("upper-cases the code, as the map is keyed", async () => {
    rows = many(1_200, (i) => (i === 0 ? { erp_code: "mmdbrh12" } : {}));
    expect((await buildMapFromMirror())?.MMDBRH12).toBeTruthy();
  });

  it("treats a null sellable as sellable, matching buildMap", async () => {
    rows = many(1_200, (i) => (i === 0 ? { sellable: null } : {}));
    expect((await buildMapFromMirror())?.CODE00000.sellable).toBe(true);
  });

  it("carries a missing carton as undefined rather than zero", async () => {
    // Zero is a dimension. Undefined is "we do not know", and freight has to be
    // able to tell those apart.
    rows = many(1_200, (i) => (i === 0 ? { weight_kg: null, width_cm: null } : {}));
    const e = (await buildMapFromMirror())?.CODE00000;
    expect(e?.weightKg).toBeUndefined();
    expect(e?.widthCm).toBeUndefined();
  });
});
