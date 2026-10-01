import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The matrices live in Supabase. Each test sets the rows it wants; `null` means
// no database at all, which is local dev and every other freight test.
type Row = Record<string, unknown>;
type Rows = { settings: Row | null; matrices: Row[]; zones: Row[]; postcodes: Row[]; rates: Row[] };
let db: Rows | null = null;
let dbError: string | null = null;

vi.mock("@/lib/admin-db", () => ({
  adminDbConfigured: () => db !== null,
  adminDb: () => {
    if (!db) return null;
    const rows = db;
    const from = (name: string) => {
      let data: unknown =
        name === "freight_matrix_settings"
          ? rows.settings
          : name === "freight_matrices"
            ? rows.matrices.filter((m) => m.active)
            : name === "freight_zones"
              ? rows.zones
              : name === "freight_zone_postcodes"
                ? rows.postcodes
                : rows.rates;
      const result = () => ({ data, error: dbError ? { message: dbError } : null });
      const chain = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        range: (a: number, b: number) => {
          data = (data as Row[]).slice(a, b + 1);
          return chain;
        },
        maybeSingle: async () => result(),
        then: (ok: (v: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(ok),
      };
      return chain;
    };
    return { from };
  },
}));

const { clearFreightCache } = await import("@/lib/freight-cache");
const { buildMatrixConfig, chargeableKg, clearMatrixCache, loadMatrixConfig, quoteMatrices, zoneFor } =
  await import("@/lib/freight-matrix");
const { freightAvailable, quoteFreight } = await import("@/lib/freight");
type FreightItem = import("@/lib/freight").FreightItem;

// Two cards, the two shapes the schema exists for.
//
// OWN: a flat price list of our own. Prices are final; per_kg above the floor.
// MF:  a carrier contract card, Mainfreight-shaped. Cost basis, weight breaks
//      on the whole weight, a minimum per consignment, 333 cubic, a fuel levy,
//      and consolidation.
const matrices: Row[] = [
  { code: "OWN", name: "Own", carrier: "MASTERKRAFT Freight", active: true, basis: "price", per_kg_on: "excess", cubic_factor_kg_m3: "250", fuel_levy_percent: "0", consolidate: false },
  { code: "MF", name: "Mainfreight", carrier: "Mainfreight", active: false, basis: "cost", per_kg_on: "total", cubic_factor_kg_m3: "333", fuel_levy_percent: "10", consolidate: true },
];
const zones: Row[] = [
  { matrix_code: "OWN", code: "VIC", name: "Victoria" },
  { matrix_code: "OWN", code: "NSW", name: "New South Wales" },
  { matrix_code: "OWN", code: "NSWR", name: "NSW regional" },
  { matrix_code: "MF", code: "MELBOURNE", name: "MELBOURNE" },
];
const postcodes: Row[] = [
  { matrix_code: "OWN", zone_code: "VIC", postcode_from: 3000, postcode_to: 3999 },
  { matrix_code: "OWN", zone_code: "NSW", postcode_from: 2000, postcode_to: 2999 },
  { matrix_code: "OWN", zone_code: "NSWR", postcode_from: 2640, postcode_to: 2660 },
  { matrix_code: "MF", zone_code: "MELBOURNE", postcode_from: 3000, postcode_to: 3207 },
];
let nextId = 1;
const rate = (over: Row): Row => ({
  id: nextId++,
  matrix_code: "OWN",
  zone_code: "VIC",
  service: "Standard delivery",
  service_level: "standard",
  applies_to: "parcel",
  weight_from_kg: "0",
  weight_to_kg: "5",
  price: "15",
  per_kg: "0",
  minimum: "0",
  days_from: 2,
  days_to: 5,
  active: true,
  ...over,
});
const rates: Row[] = [
  rate({ id: 1 }),
  rate({ id: 2, weight_from_kg: "5", weight_to_kg: "25", price: "30" }),
  rate({ id: 3, weight_from_kg: "25", weight_to_kg: null, price: "50", per_kg: "2" }),
  rate({ id: 4, service: "Express", service_level: "express", price: "40", days_from: 1, days_to: 2 }),
  rate({ id: 5, zone_code: "NSW", weight_to_kg: "25", price: "25" }),
  // A blank cell: NSW regional is left to the carriers.
  rate({ id: 6, zone_code: "NSWR", weight_to_kg: "25", price: null }),
  rate({ id: 7, applies_to: "oversize", weight_to_kg: null, price: "150", service: "Bulky" }),
  rate({ id: 8, price: "1", active: false }),
  // Mainfreight Melbourne, straight off the card.
  rate({ id: 20, matrix_code: "MF", zone_code: "MELBOURNE", applies_to: "any", service: "Express", weight_from_kg: "0", weight_to_kg: "250", price: "27.39", per_kg: "0.7835", minimum: "102.70", days_from: null, days_to: null }),
  rate({ id: 21, matrix_code: "MF", zone_code: "MELBOURNE", applies_to: "any", service: "Express", weight_from_kg: "250", weight_to_kg: "500", price: "27.39", per_kg: "0.4175", minimum: "102.70", days_from: null, days_to: null }),
];

const withMf = () => matrices.map((m) => (m.code === "MF" ? { ...m, active: true } : m));
const config = (over: Partial<Rows> = {}) =>
  buildMatrixConfig({ settings: { source: "matrix" }, matrices, zones, postcodes, rates, ...over });
const own = () => config().matrices[0];

const step = (over: Partial<FreightItem> = {}): FreightItem => ({
  sku: "STEP",
  name: "Step",
  quantity: 1,
  weightKg: 4,
  lengthCm: 30,
  widthCm: 20,
  heightCm: 10,
  ...over,
});
const barbell: FreightItem = {
  sku: "MWBBOL04",
  name: "Olympic Barbell 20kg",
  quantity: 1,
  weightKg: 21,
  lengthCm: 224,
  widthCm: 8,
  heightCm: 8,
};
const to = (postcode: string) => ({ city: "Somewhere", postcode, country: "Australia" });
const parcel = (weight: number) => [{ weight, length: 10, width: 10, height: 10 }];
const input = (weight: number, postcode = "3074", oversize = false) => ({
  parcels: parcel(weight),
  oversize,
  postcode,
  marginPercent: 15,
});

const ENV = [
  "AUSPOST_API_KEY",
  "EASYSHIP_API_TOKEN",
  "FREIGHT_COLLECTION_CITY",
  "FREIGHT_COLLECTION_POSTCODE",
  "FREIGHT_SOURCE",
  "FREIGHT_MARGIN_PERCENT",
  "FREIGHT_MARGIN_OVERSIZE_PERCENT",
];
beforeEach(() => {
  for (const k of ENV) delete process.env[k];
  process.env.FREIGHT_COLLECTION_CITY = "Thomastown";
  process.env.FREIGHT_COLLECTION_POSTCODE = "3074";
  db = null;
  dbError = null;
  clearMatrixCache();
  clearFreightCache();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("zones", () => {
  it("maps a postcode to its zone", () => {
    expect(zoneFor(own(), "3074")).toBe("VIC");
    expect(zoneFor(own(), "2000")).toBe("NSW");
  });

  // So a regional zone can be carved out of a state without rewriting it.
  it("lets the narrowest overlapping range win", () => {
    expect(zoneFor(own(), "2650")).toBe("NSWR");
  });

  it("returns null for a postcode in no zone, or no postcode at all", () => {
    expect(zoneFor(own(), "6000")).toBeNull();
    expect(zoneFor(own(), "")).toBeNull();
  });

  // Each card zones postcodes its own way.
  it("keeps each matrix's zones to itself", () => {
    const mf = config({ matrices: withMf() }).matrices.find((m) => m.code === "MF")!;
    expect(zoneFor(mf, "3074")).toBe("MELBOURNE");
    expect(zoneFor(mf, "2000")).toBeNull();
  });
});

describe("chargeable weight", () => {
  it("is dead weight when the carton is dense", () => {
    expect(chargeableKg([{ weight: 4, length: 30, width: 20, height: 10 }], 250)).toBe(4);
  });

  // 0.06m3 x 250 = 15kg, which is what a carrier bills a light, bulky box at.
  it("is cubic weight when the carton is mostly air", () => {
    expect(chargeableKg([{ weight: 2, length: 50, width: 40, height: 30 }], 250)).toBe(15);
  });

  it("is dead weight only when the factor is 0", () => {
    expect(chargeableKg([{ weight: 2, length: 50, width: 40, height: 30 }], 0)).toBe(2);
  });

  it("sums the cartons of a consignment", () => {
    const box = { weight: 4, length: 30, width: 20, height: 10 };
    expect(chargeableKg([box, box, box], 250)).toBe(12);
  });
});

describe("pricing a price-basis matrix", () => {
  it("offers every service whose band holds the weight", () => {
    expect(quoteMatrices(config(), input(4))?.map((o) => [o.id, o.price])).toEqual([
      ["matrix:OWN:VIC:1", 15],
      ["matrix:OWN:VIC:4", 40],
    ]);
  });

  // (from, to]: 5kg is the top of the first band, not the bottom of the second.
  it("treats a band's upper edge as inclusive", () => {
    expect(quoteMatrices(config(), input(5))?.[0].price).toBe(15);
    expect(quoteMatrices(config(), input(5.01))?.[0].price).toBe(30);
  });

  it("adds per-kg above the band's floor on an open top band", () => {
    // 50 + 2 x (40 - 25)
    expect(quoteMatrices(config(), input(40))?.[0].price).toBe(80);
  });

  it("does not add margin or GST to a final price", () => {
    expect(quoteMatrices(config(), { ...input(4), marginPercent: 50 })?.[0].price).toBe(15);
  });

  it("never prices an oversize carton off a parcel rate, or a parcel off an oversize one", () => {
    expect(quoteMatrices(config(), input(20, "3074", true))?.map((o) => o.id)).toEqual(["matrix:OWN:VIC:7"]);
    expect(quoteMatrices(config(), input(20))?.map((o) => o.id)).toEqual(["matrix:OWN:VIC:2"]);
  });

  it("treats a blank price, an inactive row and an unknown postcode as not covered", () => {
    expect(quoteMatrices(config(), input(4, "2650"))).toBeNull();
    expect(quoteMatrices(config(), input(4, "6000"))).toBeNull();
    expect(own().rates.some((r) => r.id === 8)).toBe(false);
  });

  it("ignores an inactive matrix", () => {
    expect(config().matrices.map((m) => m.code)).toEqual(["OWN"]);
  });
});

describe("pricing a carrier's cost card", () => {
  const mf = () =>
    config({ matrices: withMf(), rates: rates.filter((r) => r.matrix_code === "MF") });
  // cost x 1.10 fuel x 1.15 margin x 1.10 GST
  const priced = (cost: number) => Math.round(cost * 1.1 * 1.15 * 1.1 * 100) / 100;

  it("charges the minimum when the weight does not reach it", () => {
    expect(quoteMatrices(mf(), input(21))?.[0].price).toBe(priced(102.7));
  });

  it("charges basic plus the break's rate on the WHOLE weight above the minimum", () => {
    // 27.39 + 150 x 0.7835 = 144.915
    expect(quoteMatrices(mf(), input(150))?.[0].price).toBe(priced(27.39 + 150 * 0.7835));
    // Into the 251-500 break, every kilo at the lower rate: 27.39 + 300 x 0.4175
    expect(quoteMatrices(mf(), input(300))?.[0].price).toBe(priced(27.39 + 300 * 0.4175));
  });

  it("bills on its own cubic factor", () => {
    // 1m x 0.5m x 0.5m at 333kg/m3 = 83.25kg, still under the minimum; at 2m it is 166.5kg.
    const big = [{ weight: 10, length: 200, width: 50, height: 50 }];
    expect(quoteMatrices(mf(), { ...input(0), parcels: big })?.[0].price).toBe(priced(27.39 + 166.5 * 0.7835));
  });
});

describe("loading", () => {
  it("falls back to api with nothing to price when there is no database", async () => {
    const c = await loadMatrixConfig();
    expect(c.source).toBe("api");
    expect(c.matrices).toEqual([]);
  });

  it("honours FREIGHT_SOURCE when the database cannot say", async () => {
    process.env.FREIGHT_SOURCE = "pooled";
    expect((await loadMatrixConfig()).source).toBe("pooled");
  });

  // A missing migration must not take checkout down with it.
  it("falls back when the tables are missing", async () => {
    db = { settings: null, matrices, zones, postcodes, rates };
    dbError = 'relation "freight_matrices" does not exist';
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await loadMatrixConfig()).source).toBe("api");
  });

  // PostgREST stops at 1000 rows; a carrier card is 1,500+.
  it("reads past the first page of rates", async () => {
    const many = Array.from({ length: 2500 }, (_, i) =>
      rate({ id: 1000 + i, weight_from_kg: String(100 + i), weight_to_kg: String(101 + i) })
    );
    db = { settings: { source: "matrix" }, matrices, zones, postcodes, rates: many };
    const c = await loadMatrixConfig();
    expect(c.matrices[0].rates).toHaveLength(2500);
  });

  it("changes version when a rate changes", () => {
    const b = config({ rates: rates.map((r) => (r.id === 1 ? { ...r, price: "16" } : r)) });
    expect(config().version).not.toBe(b.version);
  });
});

describe("the router, by source", () => {
  const useDb = (source: string, over: Partial<Rows> = {}) => {
    db = { settings: { source }, matrices, zones, postcodes, rates, ...over };
  };

  // A carrier that answers every consignment at $99, so which source priced the
  // cart is obvious from the number.
  const stubCarrier = () => {
    process.env.AUSPOST_API_KEY = "test-key";
    process.env.FREIGHT_MARGIN_PERCENT = "0";
    const fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          services: { service: [{ code: "AUS_PARCEL_REGULAR", name: "Parcel Post", price: "99" }] },
        })
      )
    );
    vi.stubGlobal("fetch", fetch);
    return fetch;
  };

  it("matrix: prices from the matrix and never calls a carrier", async () => {
    useDb("matrix");
    const fetch = stubCarrier();
    const q = await quoteFreight([step()], to("3074"));
    expect(q.ok && q.options.map((o) => o.price)).toEqual([15, 40]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("matrix: works with no carrier credentials at all", async () => {
    useDb("matrix");
    expect(await freightAvailable()).toBe(true);
    expect((await quoteFreight([step()], to("3074"))).ok).toBe(true);
  });

  it("matrix: a delivery it cannot price goes to the quote flow, not free", async () => {
    useDb("matrix");
    expect(await quoteFreight([step()], to("6000"))).toMatchObject({ ok: false, reason: "no_services" });
  });

  it("matrix_then_api: asks the carriers only for what the matrix leaves blank", async () => {
    useDb("matrix_then_api");
    const fetch = stubCarrier();
    const vic = await quoteFreight([step()], to("3074"));
    expect(vic.ok && vic.options[0].id).toBe("matrix:OWN:VIC:1");
    expect(fetch).not.toHaveBeenCalled();

    const regional = await quoteFreight([step()], to("2650"));
    expect(regional.ok && regional.options[0]).toMatchObject({ carrier: "Australia Post", price: 99 });
  });

  it("api_then_matrix: the matrix covers when the carriers fail", async () => {
    useDb("api_then_matrix");
    process.env.AUSPOST_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const q = await quoteFreight([step()], to("3074"));
    expect(q.ok && q.options[0].id).toBe("matrix:OWN:VIC:1");
  });

  it("pooled: carriers and matrix compete, cheapest first", async () => {
    useDb("pooled");
    const fetch = stubCarrier();
    const q = await quoteFreight([step()], to("3074"));
    expect(fetch).toHaveBeenCalled();
    expect(q.ok && q.options[0]).toMatchObject({ id: "matrix:OWN:VIC:1", price: 15 });
  });

  it("pooled: the carriers still answer where the matrix is silent", async () => {
    useDb("pooled");
    stubCarrier();
    const q = await quoteFreight([step()], to("2650"));
    expect(q.ok && q.options[0]).toMatchObject({ carrier: "Australia Post", price: 99 });
  });

  it("api: ignores the matrix entirely", async () => {
    useDb("api");
    stubCarrier();
    const q = await quoteFreight([step()], to("3074"));
    expect(q.ok && q.options[0]).toMatchObject({ carrier: "Australia Post", price: 99 });
  });

  // A split cart: the barbell alone on the oversize rate, the step on a parcel
  // rate, summed into one line the customer sees.
  it("prices a split cart per consignment and adds it up", async () => {
    useDb("matrix");
    const q = await quoteFreight([barbell, step()], to("3074"));
    expect(q.ok && q.options[0]).toMatchObject({ id: "split:matrix:OWN:VIC:7+matrix:OWN:VIC:1", price: 165 });
  });

  it("sends oversize to the quote flow where nothing carries it", async () => {
    useDb("matrix");
    expect(await quoteFreight([barbell], to("2000"))).toMatchObject({
      ok: false,
      reason: "oversize",
      oversize: ["MWBBOL04"],
    });
  });

  // Three barbells split three ways pay Mainfreight's minimum three times.
  it("offers a consolidating matrix the whole cart as one consignment", async () => {
    useDb("matrix", { matrices: withMf(), rates: rates.filter((r) => r.matrix_code === "MF") });
    process.env.FREIGHT_MARGIN_PERCENT = "0";
    process.env.FREIGHT_MARGIN_OVERSIZE_PERCENT = "0";
    const q = await quoteFreight([{ ...barbell, quantity: 3 }], to("3074"));
    const once = Math.round(102.7 * 1.1 * 1.1 * 100) / 100;
    expect(q.ok && q.options[0]).toMatchObject({ id: "whole:matrix:MF:MELBOURNE:20", price: once });
  });

  // payment-intent re-quotes and matches on the id; a rate edit must not be
  // served from the old cached quote.
  it("re-prices after a rate edit, keeping the option id", async () => {
    useDb("matrix");
    const before = await quoteFreight([step()], to("3074"));
    db!.rates = rates.map((r) => (r.id === 1 ? { ...r, price: "18" } : r));
    clearMatrixCache();
    const after = await quoteFreight([step()], to("3074"));
    expect(before.ok && before.options[0]).toMatchObject({ id: "matrix:OWN:VIC:1", price: 15 });
    expect(after.ok && after.options[0]).toMatchObject({ id: "matrix:OWN:VIC:1", price: 18 });
  });
});
