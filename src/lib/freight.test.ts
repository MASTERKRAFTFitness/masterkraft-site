import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  collectionAddress,
  isOversize,
  itemsToParcels,
  marginPercent,
  oversizeSkus,
  pricesIncludeGst,
  quoteFreight,
  selectOptions,
  type FreightItem,
  type FreightOption,
} from "@/lib/freight";

// A carton Australia Post will actually carry: under 22kg, under 105cm, under
// 0.25 cubic metres.
const item = (over: Partial<FreightItem> = {}): FreightItem => ({
  sku: "MBASADJ",
  name: "Group Fitness Step",
  quantity: 1,
  weightKg: 18,
  lengthCm: 45,
  widthCm: 45,
  heightCm: 37,
  ...over,
});

// A real product that is pallet freight, not a parcel: 224cm long.
const barbell = (over: Partial<FreightItem> = {}): FreightItem => ({
  sku: "MWBBOL04",
  name: "Olympic Barbell 20kg",
  quantity: 1,
  weightKg: 21,
  lengthCm: 224,
  widthCm: 8,
  heightCm: 8,
  ...over,
});

const opt = (over: Partial<FreightOption> = {}): FreightOption => ({
  id: "A",
  carrier: "Australia Post",
  service: "Parcel Post",
  serviceLevel: "standard",
  price: 100,
  ...over,
});

describe("cart to parcels", () => {
  // Each product carries its OWN carton, so 3 steps are 3 cartons rather than
  // one impossible box.
  it("emits one parcel per unit", () => {
    const { parcels, missing } = itemsToParcels([item({ quantity: 3 })]);
    expect(parcels).toHaveLength(3);
    expect(missing).toEqual([]);
    expect(parcels[0]).toEqual({ weight: 18, length: 45, width: 45, height: 37 });
  });

  // Never under-declare a carton: the API takes integer cm.
  it("rounds dimensions up", () => {
    const { parcels } = itemsToParcels([item({ lengthCm: 44.5, widthCm: 44.5, heightCm: 36.5 })]);
    expect(parcels[0]).toMatchObject({ length: 45, width: 45, height: 37 });
  });

  it("reports items with no usable carton data instead of guessing", () => {
    const { parcels, missing } = itemsToParcels([
      item(),
      item({ sku: "SCRWAR04", lengthCm: 0, widthCm: 0, heightCm: 0 }), // C2 erg: weight, no dims
      item({ sku: "MMDBRH-GROUP", weightKg: 0, lengthCm: 0, widthCm: 0, heightCm: 0 }), // bundle
    ]);
    expect(parcels).toHaveLength(1);
    expect(missing).toEqual(["SCRWAR04", "MMDBRH-GROUP"]);
  });
});

// Two thirds of this catalogue is pallet freight. Recognising that BEFORE
// calling the API is the difference between an honest "calculated on quote" and
// a rejected request the customer sees as an error.
describe("what Australia Post will not carry", () => {
  it("rejects a carton over 22kg", () => {
    expect(isOversize({ weight: 35, length: 40, width: 40, height: 40 })).toBe(true);
  });

  it("rejects a carton longer than 105cm", () => {
    expect(isOversize({ weight: 21, length: 224, width: 8, height: 8 })).toBe(true);
  });

  it("rejects a carton over 0.25 cubic metres", () => {
    // 100 x 60 x 60 = 0.36 m3, inside every other limit.
    expect(isOversize({ weight: 10, length: 100, width: 60, height: 60 })).toBe(true);
  });

  it("accepts a carton inside all three limits", () => {
    expect(isOversize({ weight: 18, length: 45, width: 45, height: 37 })).toBe(false);
  });

  it("names the offending SKUs so the cart can explain itself", () => {
    expect(oversizeSkus([item(), barbell()])).toEqual(["MWBBOL04"]);
  });
});

describe("which services the customer sees", () => {
  it("shows the cheapest plus the fastest that beats it", () => {
    const picked = selectOptions([
      opt({ id: "std", price: 100, daysTo: 5 }),
      opt({ id: "exp", price: 180, daysTo: 1 }),
      opt({ id: "mid", price: 140, daysTo: 3 }),
    ]);
    expect(picked.map((o) => o.id)).toEqual(["std", "exp"]);
  });

  // Nothing is faster, so a second line would just be a more expensive way to
  // wait the same time.
  it("shows one option when nothing is quicker", () => {
    const picked = selectOptions([
      opt({ id: "std", price: 100, daysTo: 3 }),
      opt({ id: "pricey", price: 200, daysTo: 4 }),
    ]);
    expect(picked.map((o) => o.id)).toEqual(["std"]);
  });

  it("copes with a single service or none", () => {
    expect(selectOptions([opt({ id: "only" })]).map((o) => o.id)).toEqual(["only"]);
    expect(selectOptions([])).toEqual([]);
  });
});

describe("configuration", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("defaults the handling margin to 15%", () => {
    delete process.env.FREIGHT_MARGIN_PERCENT;
    expect(marginPercent()).toBe(15);
  });

  it("lets the margin be changed without a code edit", () => {
    process.env.FREIGHT_MARGIN_PERCENT = "0";
    expect(marginPercent()).toBe(0);
    process.env.FREIGHT_MARGIN_PERCENT = "22.5";
    expect(marginPercent()).toBe(22.5);
  });

  it("ignores a nonsense margin rather than charging a negative one", () => {
    process.env.FREIGHT_MARGIN_PERCENT = "not-a-number";
    expect(marginPercent()).toBe(15);
    process.env.FREIGHT_MARGIN_PERCENT = "-10";
    expect(marginPercent()).toBe(15);
  });

  // AusPost publish GST-inclusive retail prices, so the default must be "already
  // included". The escape hatch exists in case this account's rates differ.
  it("treats carrier prices as GST-inclusive unless told otherwise", () => {
    delete process.env.AUSPOST_PRICES_INCLUDE_GST;
    expect(pricesIncludeGst()).toBe(true);
    process.env.AUSPOST_PRICES_INCLUDE_GST = "false";
    expect(pricesIncludeGst()).toBe(false);
  });

  it("has no collection address until one is configured", () => {
    delete process.env.FREIGHT_COLLECTION_POSTCODE;
    delete process.env.FREIGHT_COLLECTION_CITY;
    expect(collectionAddress()).toBeNull();
  });
});

const delivery = { city: "Geelong", state: "VIC", postcode: "3220", country: "Australia" };

describe("failing soft", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env = { ...saved };
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  // The whole point: no key, missing cartons, pallet freight or a dead API must
  // never produce "Free". Heavy goods, and free freight is a promise we cannot keep.
  it("reports not_configured when there is no API key", async () => {
    delete process.env.AUSPOST_API_KEY;
    const q = await quoteFreight([item()], delivery);
    expect(q).toEqual({ ok: false, reason: "not_configured" });
  });

  it("fails the whole cart when any item lacks carton data", async () => {
    process.env.AUSPOST_API_KEY = "test-key";
    process.env.FREIGHT_COLLECTION_CITY = "Thomastown";
    process.env.FREIGHT_COLLECTION_POSTCODE = "3074";
    const q = await quoteFreight([item(), item({ sku: "SCRWAR04", lengthCm: 0 })], delivery);
    expect(q).toMatchObject({ ok: false, reason: "incomplete_dimensions", missing: ["SCRWAR04"] });
  });

  // Sent to the quote flow WITHOUT calling the API: PAC would only reject it.
  it("sends pallet freight to the quote flow instead of to the API", async () => {
    process.env.AUSPOST_API_KEY = "test-key";
    process.env.FREIGHT_COLLECTION_CITY = "Thomastown";
    process.env.FREIGHT_COLLECTION_POSTCODE = "3074";
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response("{}");
    }) as typeof fetch;
    const q = await quoteFreight([item(), barbell()], delivery);
    expect(q).toMatchObject({ ok: false, reason: "oversize", oversize: ["MWBBOL04"] });
    expect(called).toBe(false);
  });
});

describe("what the customer is actually charged", () => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  let calls: string[] = [];

  beforeEach(() => {
    process.env = { ...saved };
    process.env.AUSPOST_API_KEY = "test-key";
    process.env.FREIGHT_COLLECTION_CITY = "Thomastown";
    process.env.FREIGHT_COLLECTION_POSTCODE = "3074";
    process.env.FREIGHT_COLLECTION_STATE = "VIC";
    calls = [];
  });
  afterEach(() => {
    process.env = { ...saved };
    globalThis.fetch = realFetch;
  });

  /** Reply with the PAC service-list shape, one body per call in order. */
  const reply = (...bodies: unknown[]) => {
    let i = 0;
    globalThis.fetch = (async (url: string) => {
      calls.push(String(url));
      const body = bodies[Math.min(i++, bodies.length - 1)];
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;
  };

  const pac = (services: { code: string; name: string; price: string }[]) => ({
    services: { service: services },
  });

  it("applies the handling margin and does not add GST to a retail rate", async () => {
    process.env.FREIGHT_MARGIN_PERCENT = "15";
    reply(pac([{ code: "AUS_PARCEL_REGULAR", name: "Parcel Post", price: "20.00" }]));
    const q = await quoteFreight([item()], delivery);
    expect(q).toMatchObject({ ok: true });
    // 20.00 + 15% = 23.00, and GST is already in the carrier's figure.
    if (q.ok) expect(q.options[0].price).toBe(23);
  });

  it("adds GST when the account is told rates exclude it", async () => {
    process.env.FREIGHT_MARGIN_PERCENT = "0";
    process.env.AUSPOST_PRICES_INCLUDE_GST = "false";
    reply(pac([{ code: "AUS_PARCEL_REGULAR", name: "Parcel Post", price: "20.00" }]));
    const q = await quoteFreight([item()], delivery);
    if (q.ok) expect(q.options[0].price).toBe(22);
  });

  it("sends the despatch postcode as the origin", async () => {
    reply(pac([{ code: "AUS_PARCEL_REGULAR", name: "Parcel Post", price: "20.00" }]));
    await quoteFreight([item()], delivery);
    expect(calls[0]).toContain("from_postcode=3074");
    expect(calls[0]).toContain("to_postcode=3220");
  });

  // PAC prices one parcel per call, so identical cartons are priced once and
  // multiplied rather than costing an API call each.
  it("prices identical cartons once and multiplies", async () => {
    process.env.FREIGHT_MARGIN_PERCENT = "0";
    reply(pac([{ code: "AUS_PARCEL_REGULAR", name: "Parcel Post", price: "20.00" }]));
    const q = await quoteFreight([item({ quantity: 3 })], delivery);
    expect(calls).toHaveLength(1);
    if (q.ok) expect(q.options[0].price).toBe(60);
  });

  // The whole consignment has to travel somehow, so a service only one carton
  // can use is not a service we can sell.
  it("offers only services every carton can travel on", async () => {
    process.env.FREIGHT_MARGIN_PERCENT = "0";
    reply(
      pac([
        { code: "AUS_PARCEL_REGULAR", name: "Parcel Post", price: "20.00" },
        { code: "AUS_PARCEL_EXPRESS", name: "Express Post", price: "30.00" },
      ]),
      pac([{ code: "AUS_PARCEL_REGULAR", name: "Parcel Post", price: "25.00" }])
    );
    const q = await quoteFreight([item(), item({ sku: "OTHER", weightKg: 5 })], delivery);
    expect(q.ok).toBe(true);
    if (q.ok) {
      expect(q.options.map((o) => o.id)).toEqual(["AUS_PARCEL_REGULAR"]);
      expect(q.options[0].price).toBe(45);
    }
  });

  it("returns the cheapest and the fastest, priced", async () => {
    process.env.FREIGHT_MARGIN_PERCENT = "0";
    reply(
      pac([
        { code: "AUS_PARCEL_REGULAR", name: "Parcel Post", price: "20.00" },
        { code: "AUS_PARCEL_EXPRESS", name: "Express Post", price: "30.00" },
      ])
    );
    const q = await quoteFreight([item()], delivery);
    if (q.ok) expect(q.options.map((o) => o.id)).toEqual(["AUS_PARCEL_REGULAR", "AUS_PARCEL_EXPRESS"]);
  });

  // PAC collapses a single service to an object rather than a one-item array.
  it("copes with a single service returned as an object", async () => {
    process.env.FREIGHT_MARGIN_PERCENT = "0";
    reply({ services: { service: { code: "AUS_PARCEL_REGULAR", name: "Parcel Post", price: "20.00" } } });
    const q = await quoteFreight([item()], delivery);
    expect(q.ok).toBe(true);
    if (q.ok) expect(q.options[0].price).toBe(20);
  });

  it("treats an API error as unquotable, not as free freight", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: { errorMessage: "Length exceeds maximum" } }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;
    const q = await quoteFreight([item()], delivery);
    expect(q).toMatchObject({ ok: false, reason: "error", detail: "Length exceeds maximum" });
  });

  it("treats an empty service list as unquotable", async () => {
    reply({ services: { service: [] } });
    const q = await quoteFreight([item()], delivery);
    expect(q).toMatchObject({ ok: false, reason: "no_services" });
  });

  it("survives the API being unreachable", async () => {
    globalThis.fetch = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;
    const q = await quoteFreight([item()], delivery);
    expect(q).toMatchObject({ ok: false, reason: "error" });
  });

  // A 40-carton order is a pallet job. Cap the fan-out rather than firing 40
  // requests mid-checkout.
  it("sends an unreasonable number of cartons to the quote flow", async () => {
    reply(pac([{ code: "AUS_PARCEL_REGULAR", name: "Parcel Post", price: "20.00" }]));
    const q = await quoteFreight([item({ quantity: 40 })], delivery);
    expect(q).toMatchObject({ ok: false, reason: "too_many_parcels" });
  });
});
