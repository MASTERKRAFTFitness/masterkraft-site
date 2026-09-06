import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearFreightCache, freightCacheStats } from "@/lib/freight-cache";
import {
  collectionAddress,
  isOversize,
  itemsToParcels,
  marginPercent,
  maxAutoQuote,
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

// The quote cache is module-level state shared by every test in this file.
// Without clearing it between tests, a quote from one is served to the next and
// the mocked carriers below look as though they are being ignored.
beforeEach(clearFreightCache);

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
    // These cover Australia Post on its own. The two-carrier behaviour has its
    // own suite below.
    delete process.env.EASYSHIP_API_TOKEN;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  // The whole point: no key, missing cartons, pallet freight or a dead API must
  // never produce "Free". Heavy goods, and free freight is a promise we cannot keep.
  it("reports not_configured when neither carrier has credentials", async () => {
    delete process.env.AUSPOST_API_KEY;
    delete process.env.EASYSHIP_API_TOKEN;
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
    delete process.env.EASYSHIP_API_TOKEN;
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
      expect(q.options.map((o) => o.id)).toEqual(["auspost:AUS_PARCEL_REGULAR"]);
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
    if (q.ok)
      expect(q.options.map((o) => o.id)).toEqual([
        "auspost:AUS_PARCEL_REGULAR",
        "auspost:AUS_PARCEL_EXPRESS",
      ]);
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
    // The detail names the carrier, because with two of them "it failed" is not
    // enough to act on.
    expect(q).toMatchObject({
      ok: false,
      reason: "error",
      detail: "Australia Post: Length exceeds maximum",
    });
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

// The point of having two carriers: they win opposite ends of this catalogue, so
// the cheapest answer depends on the carton and the lane. Australia Post is flat
// and unbeatable on small parcels; Easyship is far cheaper on heavy ones, on long
// lanes, and is the only one that carries the bulky 58% at all.
describe("two carriers, priced against each other", () => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  let hits: string[] = [];

  beforeEach(() => {
    process.env = { ...saved };
    process.env.AUSPOST_API_KEY = "test-key";
    process.env.EASYSHIP_API_TOKEN = "test-token";
    process.env.FREIGHT_COLLECTION_CITY = "Thomastown";
    process.env.FREIGHT_COLLECTION_POSTCODE = "3074";
    process.env.FREIGHT_COLLECTION_STATE = "VIC";
    process.env.FREIGHT_MARGIN_PERCENT = "0";
    hits = [];
  });
  afterEach(() => {
    process.env = { ...saved };
    globalThis.fetch = realFetch;
  });

  /** Route the mock by URL, so each carrier can be given its own answer. */
  const carriers = (opts: { auspost?: unknown | Error; easyship?: unknown | Error }) => {
    globalThis.fetch = (async (url: string) => {
      const u = String(url);
      hits.push(u);
      const which = u.includes("easyship") ? opts.easyship : opts.auspost;
      if (which instanceof Error) throw which;
      return new Response(JSON.stringify(which ?? {}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;
  };

  const pac = (price: string, code = "AUS_PARCEL_REGULAR", name = "Parcel Post") => ({
    services: { service: [{ code, name, price }] },
  });
  const es = (charge: number, name = "TNT - Road Express", days = [1, 3]) => ({
    rates: [
      {
        total_charge: charge,
        courier_service: { id: "uuid-tnt-road", name },
        min_delivery_time: days[0],
        max_delivery_time: days[1],
      },
    ],
  });

  const calledAusPost = () => hits.some((u) => u.includes("auspost"));
  const calledEasyship = () => hits.some((u) => u.includes("easyship"));

  it("asks both at once and sells whichever is cheaper", async () => {
    carriers({ auspost: pac("20.00"), easyship: es(15) });
    const q = await quoteFreight([item()], delivery);
    expect(calledAusPost()).toBe(true);
    expect(calledEasyship()).toBe(true);
    expect(q.ok).toBe(true);
    if (q.ok) {
      expect(q.options[0].price).toBe(15);
      expect(q.options[0].carrier).toBe("TNT");
    }
  });

  // The flat national satchel rate is the case Easyship cannot beat, and the
  // router has to be willing to return Australia Post to prove it is comparing
  // rather than preferring.
  it("sells Australia Post when it is the cheaper of the two", async () => {
    carriers({ auspost: pac("10.20"), easyship: es(17.7) });
    const q = await quoteFreight([item()], delivery);
    if (q.ok) {
      expect(q.options[0].carrier).toBe("Australia Post");
      expect(q.options[0].price).toBe(10.2);
    }
  });

  // 107 products are over the parcel limits. PAC would reject them, so asking is
  // a wasted call and a slower checkout - but the cart is no longer unquotable.
  it("gives an over-limit carton to Easyship alone, without calling PAC", async () => {
    carriers({ easyship: es(619.96) });
    const q = await quoteFreight([barbell()], delivery);
    expect(calledAusPost()).toBe(false);
    expect(calledEasyship()).toBe(true);
    expect(q.ok).toBe(true);
    if (q.ok) expect(q.options[0].price).toBe(619.96);
  });

  it("still quotes when one carrier breaks", async () => {
    carriers({ auspost: new Error("ECONNREFUSED"), easyship: es(15) });
    const q = await quoteFreight([item()], delivery);
    expect(q.ok).toBe(true);
    if (q.ok) expect(q.options[0].price).toBe(15);
  });

  // Both down is the one case that must still never say "Free".
  it("fails soft when both carriers break", async () => {
    carriers({ auspost: new Error("ECONNREFUSED"), easyship: new Error("ECONNREFUSED") });
    const q = await quoteFreight([item()], delivery);
    expect(q).toMatchObject({ ok: false, reason: "error" });
  });

  // An over-limit cart with no second carrier configured is the OLD behaviour,
  // and it has to survive: that is what the checkout turns into "ships as freight".
  it("still reports oversize when Easyship is not configured", async () => {
    delete process.env.EASYSHIP_API_TOKEN;
    carriers({});
    const q = await quoteFreight([barbell()], delivery);
    expect(q).toMatchObject({ ok: false, reason: "oversize", oversize: ["MWBBOL04"] });
  });

  // Ids travel to the browser and come back to be re-priced when the card is
  // charged. Two carriers means they must not collide.
  it("namespaces option ids by carrier", async () => {
    carriers({ auspost: pac("10.00"), easyship: es(30, "TNT - Overnight", [1, 1]) });
    const q = await quoteFreight([item()], delivery);
    if (q.ok) {
      expect(q.options.map((o) => o.id)).toEqual(["auspost:AUS_PARCEL_REGULAR", "easyship:uuid-tnt-road"]);
    }
  });

  it("shows the courier, not the reseller we buy through", async () => {
    carriers({ auspost: new Error("x"), easyship: es(15, "CouriersPlease - Multi Box STD") });
    const q = await quoteFreight([item()], delivery);
    if (q.ok) {
      expect(q.options[0].carrier).toBe("CouriersPlease");
      expect(q.options[0].service).toBe("Multi Box STD");
    }
  });

  // Easyship quotes GST-inclusive on this account. Adding GST again would
  // overcharge; assuming it when it is absent would undercharge by 10%.
  it("does not add GST to an Easyship rate that already includes it", async () => {
    carriers({ auspost: new Error("x"), easyship: es(100) });
    const q = await quoteFreight([item()], delivery);
    if (q.ok) expect(q.options[0].price).toBe(100);
  });

  it("adds GST to an Easyship rate when told the account excludes it", async () => {
    process.env.EASYSHIP_PRICES_INCLUDE_GST = "false";
    carriers({ auspost: new Error("x"), easyship: es(100) });
    const q = await quoteFreight([item()], delivery);
    if (q.ok) expect(q.options[0].price).toBe(110);
  });

  it("applies the handling margin to Easyship too", async () => {
    process.env.FREIGHT_MARGIN_PERCENT = "15";
    carriers({ auspost: new Error("x"), easyship: es(100) });
    const q = await quoteFreight([item()], delivery);
    if (q.ok) expect(q.options[0].price).toBe(115);
  });

  // Easyship prices a whole consignment in one request, which is the latency win
  // the bulky brief asked carriers for. PAC needs one call per carton shape.
  it("prices a multi-carton cart in a single Easyship call", async () => {
    carriers({ auspost: pac("20.00"), easyship: es(90) });
    await quoteFreight([item({ quantity: 3 })], delivery);
    expect(hits.filter((u) => u.includes("easyship"))).toHaveLength(1);
  });
});

// The cache is not just a cost control. It is what makes the price SHOWN and the
// price CHARGED the same number, because both come out of one carrier answer.
describe("caching the carrier answer", () => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  let calls = 0;

  beforeEach(() => {
    process.env = { ...saved };
    process.env.AUSPOST_API_KEY = "test-key";
    delete process.env.EASYSHIP_API_TOKEN;
    process.env.FREIGHT_COLLECTION_CITY = "Thomastown";
    process.env.FREIGHT_COLLECTION_POSTCODE = "3074";
    process.env.FREIGHT_MARGIN_PERCENT = "0";
    clearFreightCache();
    calls = 0;
  });
  afterEach(() => {
    process.env = { ...saved };
    globalThis.fetch = realFetch;
    clearFreightCache();
  });

  /** Each call returns a DIFFERENT price, so a second live call is visible. */
  const drifting = () => {
    globalThis.fetch = (async () => {
      calls++;
      return new Response(
        JSON.stringify({
          services: {
            service: [{ code: "AUS_PARCEL_REGULAR", name: "Parcel Post", price: String(10 * calls) }],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as unknown as typeof fetch;
  };

  // THE POINT. The checkout quotes to display, payment-intent quotes again to
  // charge. Against a carrier whose rate drifts, that is a 409 after the card is
  // captured. One cached answer serves both.
  it("charges what it displayed, even against a carrier that drifts", async () => {
    drifting();
    const shown = await quoteFreight([item()], delivery);
    const charged = await quoteFreight([item()], delivery);
    expect(calls).toBe(1);
    expect(shown.ok && charged.ok).toBe(true);
    if (shown.ok && charged.ok) expect(charged.options[0].price).toBe(shown.options[0].price);
  });

  it("does not re-ask the carrier for a cart it has already priced", async () => {
    drifting();
    await quoteFreight([item()], delivery);
    await quoteFreight([item()], delivery);
    await quoteFreight([item()], delivery);
    expect(calls).toBe(1);
    expect(freightCacheStats().hits).toBe(2);
  });

  // Same boxes, different order: still the same consignment and the same price.
  it("treats a reordered cart as the same consignment", async () => {
    drifting();
    const a = item({ sku: "A", weightKg: 5 });
    const b = item({ sku: "B", weightKg: 9 });
    await quoteFreight([a, b], delivery);
    // Two distinct cartons cost two PAC calls on the way in. What matters is
    // that asking again in the other order costs nothing.
    const afterFirst = calls;
    await quoteFreight([b, a], delivery);
    expect(calls).toBe(afterFirst);
  });

  it("asks again for a different destination", async () => {
    drifting();
    await quoteFreight([item()], delivery);
    await quoteFreight([item()], { ...delivery, postcode: "6000", city: "Perth" });
    expect(calls).toBe(2);
  });

  it("asks again for a different cart", async () => {
    drifting();
    await quoteFreight([item()], delivery);
    await quoteFreight([item({ weightKg: 3 })], delivery);
    expect(calls).toBe(2);
  });

  // The street arrives after the suburb during checkout. Keying on it would miss
  // the cache on every keystroke and burn the metered calls this exists to save.
  it("ignores the street line, which does not change a rate", async () => {
    drifting();
    await quoteFreight([item()], delivery);
    await quoteFreight([item()], { ...delivery, line1: "12 Example St" });
    expect(calls).toBe(1);
  });

  // A cached price that outlived a margin change would be charged.
  it("does not serve a price across a margin change", async () => {
    drifting();
    const before = await quoteFreight([item()], delivery);
    process.env.FREIGHT_MARGIN_PERCENT = "15";
    const after = await quoteFreight([item()], delivery);
    expect(calls).toBe(2);
    if (before.ok && after.ok) expect(after.options[0].price).not.toBe(before.options[0].price);
  });

  it("can be switched off entirely", async () => {
    process.env.FREIGHT_CACHE_TTL_SECONDS = "0";
    drifting();
    await quoteFreight([item()], delivery);
    await quoteFreight([item()], delivery);
    expect(calls).toBe(2);
  });

  // A carrier over its quota stays over it. Re-asking on every keystroke burns
  // the allowance that caused the problem in the first place.
  it("remembers a failure briefly rather than hammering a dead carrier", async () => {
    globalThis.fetch = (async () => {
      calls++;
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;
    const a = await quoteFreight([item()], delivery);
    const b = await quoteFreight([item()], delivery);
    expect(a).toMatchObject({ ok: false, reason: "error" });
    expect(b).toMatchObject({ ok: false, reason: "error" });
    expect(calls).toBe(1);
  });

  // Config-dependent and instant to recompute. Caching it would keep freight
  // switched off after the credentials arrived.
  it("never caches not_configured", async () => {
    delete process.env.AUSPOST_API_KEY;
    expect(await quoteFreight([item()], delivery)).toMatchObject({ reason: "not_configured" });
    process.env.AUSPOST_API_KEY = "test-key";
    drifting();
    expect((await quoteFreight([item()], delivery)).ok).toBe(true);
  });
});

// Bulky freight is priced on volume, and this catalogue is large, light and
// mostly air: 38 of 107 bulky products bill on volume at a mean 1.41x, and a
// 16kg medicine ball rack bills as 175kg. The ceiling lets the ones that price
// sensibly sell by card and sends the rest to a human.
describe("the ceiling on what we will quote online", () => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    process.env = { ...saved };
    process.env.AUSPOST_API_KEY = "test-key";
    delete process.env.EASYSHIP_API_TOKEN;
    process.env.FREIGHT_COLLECTION_CITY = "Thomastown";
    process.env.FREIGHT_COLLECTION_POSTCODE = "3074";
    process.env.FREIGHT_MARGIN_PERCENT = "0";
    clearFreightCache();
  });
  afterEach(() => {
    process.env = { ...saved };
    globalThis.fetch = realFetch;
    clearFreightCache();
  });

  const priced = (...services: { code: string; name: string; price: string }[]) => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ services: { service: services } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as unknown as typeof fetch;
  };

  // Unset must mean "no cap". A new build must never start refusing quotes
  // because someone forgot to configure something.
  it("is off unless configured", () => {
    delete process.env.FREIGHT_MAX_AUTO_QUOTE;
    expect(maxAutoQuote()).toBe(0);
    process.env.FREIGHT_MAX_AUTO_QUOTE = "250";
    expect(maxAutoQuote()).toBe(250);
  });

  it("ignores a nonsense value rather than capping at zero", () => {
    process.env.FREIGHT_MAX_AUTO_QUOTE = "not-a-number";
    expect(maxAutoQuote()).toBe(0);
    process.env.FREIGHT_MAX_AUTO_QUOTE = "-50";
    expect(maxAutoQuote()).toBe(0);
  });

  it("sells a delivery that comes in under the cap", async () => {
    process.env.FREIGHT_MAX_AUTO_QUOTE = "250";
    priced({ code: "AUS_PARCEL_REGULAR", name: "Parcel Post", price: "120.00" });
    const q = await quoteFreight([item()], delivery);
    expect(q.ok).toBe(true);
    if (q.ok) expect(q.options[0].price).toBe(120);
  });

  it("sends a delivery over the cap to the quote flow", async () => {
    process.env.FREIGHT_MAX_AUTO_QUOTE = "250";
    priced({ code: "AUS_PARCEL_REGULAR", name: "Parcel Post", price: "446.58" });
    const q = await quoteFreight([item()], delivery);
    expect(q).toMatchObject({ ok: false, reason: "too_expensive" });
    if (!q.ok) expect(q.detail).toContain("446.58");
  });

  // The cap filters BEFORE selectOptions, so an over-ceiling express service is
  // never offered as the "faster" second line either.
  it("never offers a service that is over the cap", async () => {
    process.env.FREIGHT_MAX_AUTO_QUOTE = "250";
    priced(
      { code: "AUS_PARCEL_REGULAR", name: "Parcel Post", price: "120.00" },
      { code: "AUS_PARCEL_EXPRESS", name: "Express Post", price: "900.00" }
    );
    const q = await quoteFreight([item()], delivery);
    expect(q.ok).toBe(true);
    if (q.ok) {
      expect(q.options.map((o) => o.price)).toEqual([120]);
      expect(q.options.every((o) => o.price <= 250)).toBe(true);
    }
  });

  it("charges what it can carry when nothing is capped", async () => {
    delete process.env.FREIGHT_MAX_AUTO_QUOTE;
    priced({ code: "AUS_PARCEL_REGULAR", name: "Parcel Post", price: "446.58" });
    const q = await quoteFreight([item()], delivery);
    expect(q.ok).toBe(true);
  });

  // The cap is part of the cache key. Without that, raising it would keep
  // serving the refusal that the old value produced.
  it("does not serve a refusal across a change to the cap", async () => {
    process.env.FREIGHT_MAX_AUTO_QUOTE = "100";
    priced({ code: "AUS_PARCEL_REGULAR", name: "Parcel Post", price: "300.00" });
    expect(await quoteFreight([item()], delivery)).toMatchObject({ reason: "too_expensive" });
    process.env.FREIGHT_MAX_AUTO_QUOTE = "500";
    expect((await quoteFreight([item()], delivery)).ok).toBe(true);
  });

  // Still never "Free". Too expensive to sell online is not too cheap to charge.
  it("is a refusal, not a zero", async () => {
    process.env.FREIGHT_MAX_AUTO_QUOTE = "10";
    priced({ code: "AUS_PARCEL_REGULAR", name: "Parcel Post", price: "446.58" });
    const q = await quoteFreight([item()], delivery);
    expect(q.ok).toBe(false);
    if (!q.ok) expect(q.reason).not.toBe("no_services");
  });
});
