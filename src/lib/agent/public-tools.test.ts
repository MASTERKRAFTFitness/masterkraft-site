import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The public tool surface is the only thing standing between an anonymous
// visitor and the customer list, so it gets tested rather than reasoned about.
//
// Three questions these tests answer:
//   1. Can the public list ever contain a tool that returns someone else's data?
//   2. Can check_order_status be talked into confirming an order it should not?
//   3. Does anything written for staff reach a customer verbatim?

const COMMENTS = [
  "Website order.",
  "Buyer: Jane Smith",
  "Email: Jane.Smith@example.com.au",
  "Phone: 0400 000 000",
  "Stripe: pi_3ABC",
].join("\n");

const ORDER = {
  OrderNumber: "490118",
  OrderStatus: "Parked",
  OrderDate: "/Date(1786000000000)/",
  Total: 2499,
  Comments: COMMENTS,
  Customer: { CustomerName: "Website Customer" },
  SalesOrderLines: [
    { Product: { ProductCode: "MCTMSP02", ProductDescription: "C2 Rower" }, OrderQuantity: 1 },
  ],
};

const SHIPMENT = {
  ShipmentNumber: "SH-1",
  ShipmentStatus: "Completed",
  DispatchDate: "/Date(1786200000000)/",
  TrackingNumber: "TT12345",
  ShippingCompany: { Name: "Followmont" },
  NumberOfPackages: 2,
  DeliverySuburb: "Richmond",
  DeliveryPostCode: "3121",
};

describe("public tool surface", () => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    process.env = { ...saved };
    process.env.UNLEASHED_API_ID = "test-id";
    process.env.UNLEASHED_API_KEY = "test-key";
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    process.env = { ...saved };
    vi.restoreAllMocks();
    vi.resetModules();
  });

  const load = async () => {
    vi.resetModules();
    const tools = await import("./public-tools");
    const limits = await import("./rate-limit");
    limits.__resetLimits();
    return tools;
  };

  /**
   * Stand in for Unleashed. `orders` is what the SalesOrders search returns,
   * which is NOT necessarily an exact match: the real endpoint matches loosely.
   * `shipments` of null makes the despatch read fail.
   */
  const stubErp = (orders: unknown[], shipments: unknown[] | null = []) => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/SalesShipments/")) {
        if (shipments === null) return new Response("boom", { status: 500 });
        return new Response(JSON.stringify({ Items: shipments }), { status: 200 });
      }
      if (url.includes("/SalesOrders/")) {
        return new Response(JSON.stringify({ Items: orders }), { status: 200 });
      }
      return new Response("unexpected call", { status: 500 });
    }) as typeof fetch;
  };

  const check = async (
    input: Record<string, unknown>,
    visitor: string
  ): Promise<Record<string, unknown>> => {
    const { publicToolByName } = await load();
    const tool = publicToolByName("check_order_status")!;
    return (await tool.run(input, { visitor })) as Record<string, unknown>;
  };

  it("exposes no tool that can return another customer's details", async () => {
    const { PUBLIC_TOOL_DEFINITIONS } = await load();
    const names = PUBLIC_TOOL_DEFINITIONS.map((d) => d.name);
    // These are the internal tools. Any of them appearing here is a data breach,
    // not a style question, so the test names them explicitly.
    for (const banned of ["lookup_order", "list_recent_orders", "check_payment", "send_reply", "check_shipment"]) {
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

  it("reads orders from the ERP, never from WooCommerce", async () => {
    // Orders moved to Unleashed on 2026-09-06 and WC_STORE_URL points at a host
    // with no WooCommerce behind it, so a Woo call here means every customer is
    // told their order does not exist.
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("src/lib/agent/public-tools.ts", "utf8")
    );
    expect(src).not.toContain("wc-admin");
    expect(src).not.toContain("getOrder(");
  });

  it("returns the order when the number and email both match", async () => {
    stubErp([ORDER]);
    const out = await check(
      { order_number: "490118", email: "jane.smith@example.com.au" },
      "1.1.1.1"
    );
    expect(out.matched).toBe(true);
    expect(out.order_number).toBe("490118");
    expect(out.status_plain).toMatch(/picked/i);
    expect(out.total).toBe("AUD 2499.00");
  });

  it("never returns contact or address details, even on a match", async () => {
    stubErp([ORDER], [SHIPMENT]);
    const out = await check(
      { order_number: "490118", email: "jane.smith@example.com.au" },
      "1.1.1.2"
    );
    // Serialised, because the model sees JSON and a nested leak still leaks.
    const json = JSON.stringify(out);
    expect(json).toContain("TT12345"); // the tracking number is the point
    expect(json).not.toContain("0400 000 000");
    expect(json).not.toContain("Richmond");
    expect(json).not.toContain("3121");
    expect(json).not.toContain("Jane");
    expect(json).not.toContain("example.com.au");
    expect(json).not.toContain("pi_3ABC");
  });

  it("gives the same answer for a wrong email as for an order that does not exist", async () => {
    stubErp([ORDER]);
    const wrongEmail = await check(
      { order_number: "490118", email: "someone.else@example.com" },
      "2.2.2.1"
    );
    stubErp([]);
    const noSuchOrder = await check(
      { order_number: "999999", email: "someone.else@example.com" },
      "2.2.2.2"
    );

    expect(wrongEmail.matched).toBe(false);
    expect(noSuchOrder.matched).toBe(false);
    // Identical wording. Any difference is an oracle for which numbers are real.
    expect(wrongEmail.note).toBe(noSuchOrder.note);
  });

  it("refuses a near miss from the ERP's loose order-number search", async () => {
    // Unleashed matches orderNumber loosely, so a search for 490118 can return
    // 4901180. Handing that back is handing over a stranger's order.
    stubErp([{ ...ORDER, OrderNumber: "4901180" }]);
    const out = await check(
      { order_number: "490118", email: "jane.smith@example.com.au" },
      "3.3.3.3"
    );
    expect(out.matched).toBe(false);
  });

  it("cannot be unlocked when the order has no email recorded", async () => {
    stubErp([{ ...ORDER, Comments: "Website order.\nBuyer: Jane Smith" }]);
    const out = await check(
      { order_number: "490118", email: "jane.smith@example.com.au" },
      "3.3.3.4"
    );
    // Worse for that customer, but the correct direction: no email on file
    // means no way to prove it is theirs.
    expect(out.matched).toBe(false);
  });

  it("accepts only the labelled Email line, not any address in the comments", async () => {
    // Staff notes land in the same field. An address mentioned in passing must
    // not become a key to the order.
    stubErp([
      {
        ...ORDER,
        Comments: "Website order.\nBuyer: Jane Smith\nChased by warehouse@masterkraft.com re freight",
      },
    ]);
    const out = await check(
      { order_number: "490118", email: "warehouse@masterkraft.com" },
      "3.3.3.5"
    );
    expect(out.matched).toBe(false);
  });

  it("treats an ERP outage as a miss rather than a confirmation", async () => {
    globalThis.fetch = vi.fn(async () => new Response("down", { status: 503 })) as typeof fetch;
    const out = await check(
      { order_number: "490118", email: "jane.smith@example.com.au" },
      "3.3.3.6"
    );
    expect(out.matched).toBe(false);
  });

  it("stops answering order lookups after repeated failures", async () => {
    const { publicToolByName } = await load();
    stubErp([]);
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
    stubErp([ORDER]);
    const afterBlock = (await tool.run(
      { order_number: "490118", email: "jane.smith@example.com.au" },
      { visitor }
    )) as Record<string, unknown>;
    expect(afterBlock.matched).toBe(false);
  });

  it("asks for the email rather than looking anything up without one", async () => {
    const called = vi.fn();
    globalThis.fetch = called as unknown as typeof fetch;
    const out = await check({ order_number: "490118", email: "" }, "5.5.5.5");
    expect(out.matched).toBe(false);
    expect(called).not.toHaveBeenCalled();
  });

  it("does not claim an order was never sent when the despatch lookup fails", async () => {
    stubErp([ORDER], null);
    const out = await check(
      { order_number: "490118", email: "jane.smith@example.com.au" },
      "8.8.8.2"
    );
    expect(out.matched).toBe(true);
    // null, not false: "we could not check" is a different claim from "not sent".
    expect(out.despatched).toBeNull();
  });

  it("says despatched-without-tracking is normal, not a missing shipment", async () => {
    stubErp([ORDER], [{ ...SHIPMENT, TrackingNumber: null, ShippingCompany: null }]);
    const out = await check(
      { order_number: "490118", email: "jane.smith@example.com.au" },
      "8.8.8.3"
    );
    const despatches = out.despatches as { tracking_note: string | null }[];
    expect(out.despatched).toBe(true);
    expect(despatches[0].tracking_note).toMatch(/no tracking number was recorded/i);
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
