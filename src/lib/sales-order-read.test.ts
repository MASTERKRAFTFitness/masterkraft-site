// Reading one sales order back out of Unleashed.
//
// WHY THIS FILE EXISTS, 2026-09-18. `getSalesOrder` gained a `stripeRef` today
// when lib/wc-admin.ts was deleted. Until then an order number was joined to its
// payment through the WooCommerce order's `transaction_id`; that reader is gone,
// so the "Stripe: pi_…" line buildComments writes into the ERP order is now the
// ONLY join between an order and the money. The agent's check_payment tool
// answers "did my payment go through" off it.
//
// A regex is doing that join, over a free-text field that also carries staff
// notes, so it is tested rather than trusted — the same reasoning that put the
// labelled-line rule on emailsOn.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const base = {
  OrderNumber: "490118",
  OrderStatus: "Parked",
  OrderDate: "/Date(1786000000000)/",
  Total: 2499,
  Customer: { CustomerName: "Website Customer" },
  SalesOrderLines: [
    { Product: { ProductCode: "MCTMSP02", ProductDescription: "C2 Rower" }, OrderQuantity: 1 },
  ],
};

const order = (comments: string, over: Record<string, unknown> = {}) => ({
  ...base,
  Comments: comments,
  ...over,
});

const comments = (...lines: string[]) => ["Website order.", "Buyer: Jane Smith", ...lines].join("\n");

describe("getSalesOrder: the Stripe reference", () => {
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
    vi.resetModules();
  });

  const stub = (orders: unknown[]) => {
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ Items: orders }), { status: 200 })
    ) as typeof fetch;
  };

  const read = async (orders: unknown[]) => {
    vi.resetModules();
    const { getSalesOrder } = await import("./unleashed");
    stub(orders);
    return getSalesOrder("490118");
  };

  it("reads the PaymentIntent off its own labelled line", async () => {
    const found = await read([order(comments("Email: jane@example.com", "Stripe: pi_3ABCdef456"))]);
    expect(found?.stripeRef).toBe("pi_3ABCdef456");
  });

  it("is null when the order was never paid by card", async () => {
    // A quote, or an order somebody keyed in by hand. Null is the honest answer;
    // check_payment reports "not a card payment through the site" on it, which
    // is very different from "the payment failed".
    const found = await read([order(comments("Email: jane@example.com"))]);
    expect(found?.stripeRef).toBeNull();
  });

  it("ignores a reference a staff note mentions mid-line", async () => {
    // THE REASON THIS IS ANCHORED. Comments is a free-text field staff write in.
    // "Refunded against pi_OTHER" is a note about a different payment, and
    // returning it would have the agent read one customer's card details back
    // in answer to another customer's order number.
    const found = await read([
      order(comments("Email: jane@example.com", "Refunded against pi_OTHERCUSTOMER by Gaetana")),
    ]);
    expect(found?.stripeRef).toBeNull();
  });

  it("takes the order's own reference when a note names another below it", async () => {
    const found = await read([
      order(comments("Stripe: pi_MINE123", "See also pi_SOMEONEELSE for the swap")),
    ]);
    expect(found?.stripeRef).toBe("pi_MINE123");
  });

  it("returns null for a near-miss order number rather than the wrong order", async () => {
    // Unleashed's orderNumber filter is prefix-ish: 490118 can return 4901180.
    // The exact-match guard predates this change; it is asserted here because
    // stripeRef makes handing back a near miss a payment-data leak, not just a
    // wrong status.
    const found = await read([order(comments("Stripe: pi_WRONG"), { OrderNumber: "4901180" })]);
    expect(found).toBeNull();
  });
});
