import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  collectionAddress,
  itemsToParcels,
  marginPercent,
  quoteFreight,
  selectOptions,
  type FreightItem,
  type FreightOption,
} from "@/lib/freight";

const item = (over: Partial<FreightItem> = {}): FreightItem => ({
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
  carrier: "Carrier",
  service: "Standard",
  serviceLevel: "standard",
  price: 100,
  ...over,
});

describe("cart to parcels", () => {
  // Each product carries its OWN carton, so 3 barbells are 3 cartons rather than
  // one impossible 63kg box.
  it("emits one parcel per unit", () => {
    const { parcels, missing } = itemsToParcels([item({ quantity: 3 })]);
    expect(parcels).toHaveLength(3);
    expect(missing).toEqual([]);
    expect(parcels[0]).toEqual({ weight: 21, length: 224, width: 8, height: 8 });
  });

  // Never under-declare a carton: the API takes integer cm.
  it("rounds dimensions up", () => {
    const { parcels } = itemsToParcels([item({ lengthCm: 241.5, widthCm: 122.5, heightCm: 30.5 })]);
    expect(parcels[0]).toMatchObject({ length: 242, width: 123, height: 31 });
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

  it("has no collection address until one is configured", () => {
    delete process.env.FREIGHT_COLLECTION_POSTCODE;
    delete process.env.FREIGHT_COLLECTION_CITY;
    expect(collectionAddress()).toBeNull();
  });
});

describe("failing soft", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env = { ...saved };
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  const delivery = { city: "Geelong", state: "VIC", postcode: "3220", country: "Australia" };

  // The whole point: no key, missing cartons or a dead API must never produce
  // "Free". Heavy goods, and free freight is a promise we cannot keep.
  it("reports not_configured when there is no API key", async () => {
    delete process.env.INTERPARCEL_API_KEY;
    const q = await quoteFreight([item()], delivery);
    expect(q).toEqual({ ok: false, reason: "not_configured" });
  });

  it("fails the whole cart when any item lacks carton data", async () => {
    process.env.INTERPARCEL_API_KEY = "test-key";
    process.env.FREIGHT_COLLECTION_CITY = "Melbourne";
    process.env.FREIGHT_COLLECTION_POSTCODE = "3000";
    const q = await quoteFreight([item(), item({ sku: "SCRWAR04", lengthCm: 0 })], delivery);
    expect(q).toMatchObject({ ok: false, reason: "incomplete_dimensions", missing: ["SCRWAR04"] });
  });
});

describe("what the customer is actually charged", () => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    process.env = { ...saved };
    process.env.INTERPARCEL_API_KEY = "test-key";
    process.env.FREIGHT_COLLECTION_CITY = "Melbourne";
    process.env.FREIGHT_COLLECTION_POSTCODE = "3000";
    process.env.FREIGHT_COLLECTION_STATE = "VIC";
  });
  afterEach(() => {
    process.env = { ...saved };
    globalThis.fetch = realFetch;
  });

  const delivery = { city: "Geelong", state: "VIC", postcode: "3220", country: "Australia" };
  const reply = (body: unknown) => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;
  };

  it("applies the 15% margin and adds GST on a taxable rate", async () => {
    process.env.FREIGHT_MARGIN_PERCENT = "15";
    reply({
      status: 0,
      services: [
        { id: "STD", carrier: "Couriers", service: "Road", serviceLevel: "standard", price: 100, taxable: true, delivery: { daysFrom: 3, daysTo: 5 } },
      ],
    });
    const q = await quoteFreight([item()], delivery);
    // 100 + 15% = 115, + GST = 126.50
    expect(q).toMatchObject({ ok: true });
    if (q.ok) expect(q.options[0].price).toBe(126.5);
  });

  it("does not add GST when the rate already includes it", async () => {
    process.env.FREIGHT_MARGIN_PERCENT = "0";
    reply({
      status: 0,
      services: [{ id: "STD", price: 100, taxable: false, serviceLevel: "standard" }],
    });
    const q = await quoteFreight([item()], delivery);
    if (q.ok) expect(q.options[0].price).toBe(100);
  });

  it("returns the cheapest and the fastest, priced", async () => {
    process.env.FREIGHT_MARGIN_PERCENT = "0";
    reply({
      status: 0,
      services: [
        { id: "STD", price: 50, taxable: false, serviceLevel: "standard", delivery: { daysTo: 5 } },
        { id: "EXP", price: 90, taxable: false, serviceLevel: "express", delivery: { daysTo: 1 } },
        { id: "MID", price: 70, taxable: false, serviceLevel: "standard", delivery: { daysTo: 4 } },
      ],
    });
    const q = await quoteFreight([item()], delivery);
    expect(q.ok).toBe(true);
    if (q.ok) expect(q.options.map((o) => o.id)).toEqual(["STD", "EXP"]);
  });

  // status 1 is their error shape. It must not become a free delivery.
  it("treats an API error as unquotable, not as free freight", async () => {
    reply({ status: 1, errorMessage: "Invalid collection country", errorCode: "100001" });
    const q = await quoteFreight([item()], delivery);
    expect(q).toMatchObject({ ok: false, reason: "error", detail: "Invalid collection country" });
  });

  it("treats an empty service list as unquotable", async () => {
    reply({ status: 0, services: [] });
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
});
