import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The public tool surface is the only thing standing between an anonymous
// visitor and the customer list, so it gets tested rather than reasoned about.
//
// Two questions these tests answer:
//   1. Can the public list ever contain a tool that returns someone else's data?
//   2. Can check_order_status be talked into confirming an order it should not?

const ORDER = {
  id: 490118,
  number: "490118",
  status: "processing",
  currency: "AUD",
  total: "2499.00",
  shipping_total: "0.00",
  date_created: "2026-08-01T09:14:00",
  date_paid: "2026-08-01T09:15:00",
  billing: {
    first_name: "Jane",
    last_name: "Smith",
    email: "Jane.Smith@example.com.au",
    phone: "0400 000 000",
  },
  shipping: { address_1: "12 Example St", city: "Richmond", state: "VIC", postcode: "3121" },
  line_items: [{ name: "C2 Rower", sku: "MCTMSP02", quantity: 1, total: "2499.00" }],
};

describe("public tool surface", () => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    process.env = { ...saved };
    process.env.WC_STORE_URL = "https://example.test";
    process.env.WC_CONSUMER_KEY = "ck_test";
    process.env.WC_CONSUMER_SECRET = "cs_test";
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    process.env = { ...saved };
    vi.resetModules();
  });

  const load = async () => {
    vi.resetModules();
    const tools = await import("./public-tools");
    const limits = await import("./rate-limit");
    limits.__resetLimits();
    return tools;
  };

  /** Answer every WooCommerce order request with `order`, or 404 when null. */
  const stubWoo = (order: unknown | null, searchHits: unknown[] = [], shipments: unknown = []) => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      // Unleashed shipments go through the same global fetch as WooCommerce.
      if (url.includes("unleashed") || url.includes("/Shipments")) {
        if (shipments === null) return new Response("boom", { status: 500 });
        return new Response(JSON.stringify({ Items: shipments }), { status: 200 });
      }
      if (url.includes("/orders?search=")) {
        return new Response(JSON.stringify(searchHits), { status: 200 });
      }
      if (order === null) return new Response("not found", { status: 404 });
      return new Response(JSON.stringify(order), { status: 200 });
    }) as typeof fetch;
  };

  it("exposes no tool that can return another customer's details", async () => {
    const { PUBLIC_TOOL_DEFINITIONS } = await load();
    const names = PUBLIC_TOOL_DEFINITIONS.map((d) => d.name);
    // These are the internal tools. Any of them appearing here is a data breach,
    // not a style question, so the test names them explicitly.
    for (const banned of ["lookup_order", "list_recent_orders", "check_payment", "send_reply"]) {
      expect(names).not.toContain(banned);
    }
    expect(names).toEqual([
      "search_catalogue",
      "get_product",
      "check_stock",
      "quote_freight",
      "check_order_status",
      "log_enquiry",
    ]);
  });

  it("returns the order when the number and email both match", async () => {
    const { publicToolByName } = await load();
    stubWoo(ORDER);
    const tool = publicToolByName("check_order_status")!;
    const out = (await tool.run(
      { order_number: "490118", email: "jane.smith@example.com.au" },
      { visitor: "1.1.1.1" }
    )) as Record<string, unknown>;

    expect(out.matched).toBe(true);
    expect(out.order_number).toBe("490118");
    expect(out.status_plain).toMatch(/despatch/i);
  });

  it("never returns contact or address details, even on a match", async () => {
    const { publicToolByName } = await load();
    stubWoo(ORDER);
    const tool = publicToolByName("check_order_status")!;
    const out = await tool.run(
      { order_number: "490118", email: "jane.smith@example.com.au" },
      { visitor: "1.1.1.2" }
    );

    // Serialised, because the model sees JSON and a nested leak still leaks.
    const json = JSON.stringify(out);
    expect(json).not.toContain("0400 000 000");
    expect(json).not.toContain("12 Example St");
    expect(json).not.toContain("Jane");
    expect(json).not.toContain("example.com.au");
  });

  it("gives the same answer for a wrong email as for an order that does not exist", async () => {
    const { publicToolByName } = await load();
    const tool = publicToolByName("check_order_status")!;

    stubWoo(ORDER);
    const wrongEmail = (await tool.run(
      { order_number: "490118", email: "someone.else@example.com" },
      { visitor: "2.2.2.1" }
    )) as Record<string, unknown>;

    stubWoo(null);
    const noSuchOrder = (await tool.run(
      { order_number: "999999", email: "someone.else@example.com" },
      { visitor: "2.2.2.2" }
    )) as Record<string, unknown>;

    expect(wrongEmail.matched).toBe(false);
    expect(noSuchOrder.matched).toBe(false);
    // Identical wording. Any difference is an oracle for which numbers are real.
    expect(wrongEmail.note).toBe(noSuchOrder.note);
  });

  it("refuses a fuzzy search hit whose number is not the one asked for", async () => {
    const { publicToolByName } = await load();
    // getOrder falls back to the first search result when the direct lookup
    // misses, which is helpful for staff and would hand a stranger's order to a
    // visitor here.
    stubWoo(null, [ORDER]);
    const tool = publicToolByName("check_order_status")!;
    const out = (await tool.run(
      { order_number: "490117", email: "jane.smith@example.com.au" },
      { visitor: "3.3.3.3" }
    )) as Record<string, unknown>;

    expect(out.matched).toBe(false);
  });

  it("stops answering order lookups after repeated failures", async () => {
    const { publicToolByName } = await load();
    stubWoo(null);
    const tool = publicToolByName("check_order_status")!;
    const visitor = "4.4.4.4";

    let last: Record<string, unknown> = {};
    for (let i = 0; i < 6; i++) {
      last = (await tool.run({ order_number: `4901${i}${i}`, email: "guess@example.com" }, { visitor })) as Record<
        string,
        unknown
      >;
    }
    expect(last.blocked).toBe(true);

    // And a correct guess after the block still gets nothing.
    stubWoo(ORDER);
    const afterBlock = (await tool.run(
      { order_number: "490118", email: "jane.smith@example.com.au" },
      { visitor }
    )) as Record<string, unknown>;
    expect(afterBlock.matched).toBe(false);
  });

  it("asks for the email rather than looking anything up without one", async () => {
    const { publicToolByName } = await load();
    const called = vi.fn();
    globalThis.fetch = called as unknown as typeof fetch;
    const tool = publicToolByName("check_order_status")!;
    const out = (await tool.run({ order_number: "490118", email: "" }, { visitor: "5.5.5.5" })) as Record<
      string,
      unknown
    >;

    expect(out.matched).toBe(false);
    expect(called).not.toHaveBeenCalled();
  });

  it("never leaks the delivery address from a despatch record", async () => {
    const { publicToolByName } = await load();
    stubWoo(ORDER, [], [
      {
        ShipmentNumber: "SH-1",
        ShipmentStatus: "Completed",
        DispatchDate: "2026-08-03",
        TrackingNumber: "TT12345",
        ShippingCompany: { Name: "Followmont" },
        NumberOfPackages: 2,
        DeliveryName: "Jane Smith",
        DeliveryStreetAddress: "12 Example St",
      },
    ]);
    const tool = publicToolByName("check_order_status")!;
    const out = await tool.run(
      { order_number: "490118", email: "jane.smith@example.com.au" },
      { visitor: "8.8.8.1" }
    );

    const json = JSON.stringify(out);
    expect(json).toContain("TT12345");
    expect(json).not.toContain("12 Example St");
    expect(json).not.toContain("Jane");
  });

  it("does not claim an order was never sent when the despatch lookup fails", async () => {
    const { publicToolByName } = await load();
    stubWoo(ORDER, [], null);
    const tool = publicToolByName("check_order_status")!;
    const out = (await tool.run(
      { order_number: "490118", email: "jane.smith@example.com.au" },
      { visitor: "8.8.8.2" }
    )) as Record<string, unknown>;

    expect(out.matched).toBe(true);
    // null, not false: "we could not check" is a different claim from "not sent".
    expect(out.despatched).toBeNull();
  });

  it("strips the freight cap out of a too_expensive refusal", async () => {
    const { PUBLIC_TOOLS } = await load();
    const freight = PUBLIC_TOOLS.find((t) => t.definition.name === "quote_freight")!;
    const internal = await import("./tools");
    // Drive the redaction directly: the point under test is what leaves the
    // public wrapper, not how quoteFreight decides to refuse.
    vi.spyOn(internal.toolByName("quote_freight")!, "run").mockResolvedValue({
      ok: false,
      reason: "too_expensive",
      detail: "cheapest $340.00 over the $200.00 cap",
    });

    const out = (await freight.run({}, { visitor: "9.9.9.1" })) as Record<string, unknown>;
    const json = JSON.stringify(out);
    expect(json).not.toContain("340");
    expect(json).not.toContain("cap");
    expect(out.detail).toBeUndefined();
    expect(out.customer_note).toMatch(/manual freight quote/i);
  });

  it("strips raw carrier errors out of an error refusal", async () => {
    const { PUBLIC_TOOLS } = await load();
    const freight = PUBLIC_TOOLS.find((t) => t.definition.name === "quote_freight")!;
    const internal = await import("./tools");
    vi.spyOn(internal.toolByName("quote_freight")!, "run").mockResolvedValue({
      ok: false,
      reason: "error",
      detail: "AusPost 401 unauthorized: key expired",
    });

    const out = (await freight.run({}, { visitor: "9.9.9.2" })) as Record<string, unknown>;
    expect(JSON.stringify(out)).not.toContain("401");
    expect(out.detail).toBeUndefined();
  });

  it("passes a successful freight quote through untouched", async () => {
    const { PUBLIC_TOOLS } = await load();
    const freight = PUBLIC_TOOLS.find((t) => t.definition.name === "quote_freight")!;
    const internal = await import("./tools");
    const ok = { ok: true, options: [{ name: "Parcel Post", price: 24.5 }] };
    vi.spyOn(internal.toolByName("quote_freight")!, "run").mockResolvedValue(ok);

    expect(await freight.run({}, { visitor: "9.9.9.3" })).toEqual(ok);
  });
});
