// Who a web order is booked to. The matching rules decide whose ledger a sale
// lands in, so they are pinned here; the network is faked.
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  buildCustomerPayload,
  customerCodeBase,
  emailQueryPrefix,
  nextCustomerCode,
  normaliseEmail,
  pickMatch,
  resolveBuyerCustomer,
  type RawCustomer,
} from "@/lib/unleashed-customers";

// Jodie's real order, SO-00000877, the one that started this.
const jodie = {
  first_name: "Jodie",
  last_name: "Friedrich",
  company: "TAFE NSW - Loftus Campus",
  email: "Jodie.Friedrich1@tafensw.edu.au",
  phone: "0279214611",
  address_1: "Rawson Ave",
  city: "Loftus",
  state: "NSW",
  postcode: "2232",
};

const cust = (over: Partial<RawCustomer>): RawCustomer => ({
  Guid: "g",
  CustomerCode: "X",
  Email: null,
  Obsolete: false,
  ...over,
});

describe("matching a buyer to an existing customer", () => {
  it("matches the email exactly, ignoring case", () => {
    const r = pickMatch("valexellis@gmail.com", [cust({ CustomerCode: "ALEXV01", Email: "VAlexellis@gmail.com" })]);
    expect(r).toEqual({ customer: expect.objectContaining({ CustomerCode: "ALEXV01" }) });
  });

  it("ignores prefix hits, which is all Unleashed's contactEmail filter promises", () => {
    expect(pickMatch("val@gmail.com", [cust({ Email: "valexellis@gmail.com" })])).toEqual({ none: true });
  });

  it("ignores obsolete customers", () => {
    expect(pickMatch("a@b.com", [cust({ Email: "a@b.com", Obsolete: true })])).toEqual({ none: true });
  });

  it("calls two live matches ambiguous rather than guess a ledger", () => {
    const r = pickMatch("adam@masterkraft.com", [
      cust({ CustomerCode: "24FIT", Email: "adam@masterkraft.com" }),
      cust({ CustomerCode: "INPUT", Email: "adam@masterkraft.com" }),
    ]);
    expect(r).toEqual({ ambiguous: ["24FIT", "INPUT"] });
  });

  it("forgives the trailing full stop staff left on some records", () => {
    expect(normaliseEmail(" blackopsfit@gmail.com. ")).toBe("blackopsfit@gmail.com");
  });

  it("sends only what can go unencoded, since an encoded query 403s", () => {
    expect(emailQueryPrefix("jo@tafensw.edu.au")).toBe("jo@tafensw.edu.au");
    expect(emailQueryPrefix("jo+gym@x.com")).toBe("jo");
  });
});

describe("a new customer's code follows the staff convention", () => {
  it("takes four of the surname and the first initial", () => {
    expect(customerCodeBase(jodie)).toBe("FRIEJ");
    expect(customerCodeBase({ first_name: "Richard", last_name: "Au" })).toBe("AUR");
    expect(customerCodeBase({ first_name: "Zoë", last_name: "O'Brien" })).toBe("OBRIZ");
  });

  it("falls back to the first name, then the email", () => {
    expect(customerCodeBase({ first_name: "Madonna" })).toBe("MADON");
    expect(customerCodeBase({ email: "gym.owner@x.com" })).toBe("GYMOW");
  });

  it("takes the next free number", () => {
    expect(nextCustomerCode("FRIEJ", [])).toBe("FRIEJ01");
    expect(nextCustomerCode("BAILC", ["BAILC01", "BAILC03", "CUST-00000027", "BAILCX"])).toBe("BAILC02");
  });
});

describe("the new customer record", () => {
  const p = buildCustomerPayload(jodie, {
    guid: "cust-guid",
    code: "FRIEJ01",
    paymentIntentId: "pi_3UTC5cS2z0rvyg3E0ndpQVmC",
    now: new Date("2026-10-22T03:00:00Z"),
  });

  it("is named for the business, with the person as contact", () => {
    expect(p.CustomerName).toBe("TAFE NSW - Loftus Campus");
    expect(p.ContactFirstName).toBe("Jodie");
    expect(p.ContactLastName).toBe("Friedrich");
    expect(p.Email).toBe("jodie.friedrich1@tafensw.edu.au");
  });

  it("is named for the person when there is no business", () => {
    expect(buildCustomerPayload({ ...jodie, company: "" }, { guid: "g", code: "FRIEJ01" }).CustomerName).toBe("Jodie Friedrich");
  });

  it("is set up like the online customers staff create", () => {
    expect(p).toMatchObject({
      CustomerType: "Online",
      SellPriceTier: "T7-DIRECT",
      PaymentTerm: "100% Upfront",
      XeroSalesAccount: "4000",
      TaxCode: "G.S.T.",
      Taxable: true,
    });
  });

  it("carries a postal and a shipping address", () => {
    expect((p.Addresses as { AddressType: string }[]).map((a) => a.AddressType)).toEqual(["Postal", "Shipping"]);
  });
});

describe("resolving against Unleashed", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.unstubAllGlobals());

  const json = (body: unknown, status = 200) =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

  it("uses the one existing customer and creates nothing", async () => {
    fetchMock.mockReturnValueOnce(json({ Items: [cust({ Guid: "g-alex", CustomerCode: "ALEXV01", Email: "valexellis@gmail.com" })] }));
    const r = await resolveBuyerCustomer({ email: "valexellis@gmail.com" });
    expect(r).toEqual({ how: "matched", ref: { Guid: "g-alex" }, code: "ALEXV01" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("contactEmail=valexellis@gmail.com");
  });

  it("creates a customer with the next free code when there is no match", async () => {
    fetchMock
      .mockReturnValueOnce(json({ Items: [] }))
      .mockReturnValueOnce(json({ Items: [cust({ CustomerCode: "FRIEJ01" })] }))
      .mockReturnValueOnce(json({}, 201));
    const r = await resolveBuyerCustomer(jodie);
    expect(r).toMatchObject({ how: "created", code: "FRIEJ02" });
    const [url, init] = fetchMock.mock.calls[2];
    expect(String(url)).toMatch(/\/Customers\/[0-9a-f-]{36}$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body).CustomerCode).toBe("FRIEJ02");
  });

  it("falls back, never throws, when Unleashed refuses", async () => {
    fetchMock.mockReturnValueOnce(json({ Items: [] })).mockReturnValueOnce(json({ Items: [] })).mockReturnValueOnce(json({ description: "nope" }, 403));
    const r = await resolveBuyerCustomer(jodie);
    expect(r).toMatchObject({ how: "fallback" });
    if (r.how === "fallback") expect(r.reason).toMatch(/403/);
  });

  it("falls back on an ambiguous email without creating anything", async () => {
    fetchMock.mockReturnValueOnce(
      json({ Items: [cust({ CustomerCode: "24FIT", Email: "adam@masterkraft.com" }), cust({ CustomerCode: "INPUT", Email: "adam@masterkraft.com" })] })
    );
    const r = await resolveBuyerCustomer({ email: "adam@masterkraft.com" });
    expect(r).toMatchObject({ how: "fallback" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back with no email at all", async () => {
    expect(await resolveBuyerCustomer({ first_name: "No", last_name: "Email" })).toEqual({ how: "fallback", reason: "no buyer email" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
