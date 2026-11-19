import { describe, expect, it, vi } from "vitest";
import {
  MAX_ATTEMPTS,
  completeFrom,
  completeShipped,
  decideCompletion,
  shippedOrders,
  summaryEmail,
  type CompletionRow,
  type Deps,
} from "./complete-on-ship";
import type { DispatchedShipment, OrderInvoice, SalesOrder } from "./unleashed";

const from = new Date("2026-11-20");
const opts = { from, webCustomerCode: "WEB-MASTERKRAFT" };

// Shaped on what Unleashed held on 2026-11-19: web orders shipped through
// Easyship stay Parked in Unleashed, others are marked Dispatched there.
const shipment = (over: Partial<DispatchedShipment> = {}): DispatchedShipment => ({
  orderNumber: "SO-00000920",
  customerCode: "FRIEJ01",
  customerRef: "pi_3WEB920",
  deliveryName: "Jodie Friedrich",
  shipmentNumber: "SS-00000920",
  status: "Dispatched",
  dispatchedAt: "2026-11-20T00:00:00.000Z",
  trackingNumber: null,
  carrier: "InterParcel",
  packages: null,
  weightKg: null,
  deliverTo: null,
  lineCount: 1,
  lines: [],
  ...over,
});

const order = (over: Partial<SalesOrder> = {}): SalesOrder => ({
  orderNumber: "SO-00000920",
  guid: "d9176808-60b5-4602-91f2-e6999e01db4a",
  status: "Placed",
  orderedAt: null,
  total: 221.58,
  lines: [],
  emails: [],
  stripeRef: "pi_3WEB920",
  buyer: { name: null, email: null },
  ...over,
});

const invoice = (over: Partial<OrderInvoice> = {}): OrderInvoice => ({
  invoiceNumber: "INV-00000920",
  status: "Completed",
  total: 221.58,
  ...over,
});

describe("completeFrom", () => {
  it("is off without a date", () => {
    expect(completeFrom(undefined)).toBeNull();
    expect(completeFrom(" ")).toBeNull();
    expect(completeFrom("1")).toBeNull(); // new Date("1") is 2001: "=1" must not mean "everything"
    expect(completeFrom("not a date")).toBeNull();
    expect(completeFrom("2026-11-20")?.toISOString()).toBe("2026-11-20T00:00:00.000Z");
  });
});

describe("shippedOrders", () => {
  it("takes an Easyship label as shipped, even with the Unleashed shipment still Parked", () => {
    const got = shippedOrders(
      [{ order_number: "SO-00000909", created_at: "2026-11-20T00:15:41Z" }],
      [shipment({ orderNumber: "SO-00000909", status: "Parked", dispatchedAt: null })],
      opts
    );
    expect([...got]).toEqual([["SO-00000909", "easyship"]]);
  });

  it("takes a web shipment Dispatched in Unleashed", () => {
    expect([...shippedOrders([], [shipment()], opts)]).toEqual([["SO-00000920", "unleashed"]]);
  });

  it("prefers the Easyship label when both say so", () => {
    const got = shippedOrders([{ order_number: "SO-00000920", created_at: "2026-11-21T00:00:00Z" }], [shipment()], opts);
    expect(got.get("SO-00000920")).toBe("easyship");
  });

  it("ignores trade orders, undispatched shipments, and anything before the start date", () => {
    const got = shippedOrders(
      [{ order_number: "SO-00000877", created_at: "2026-10-29T02:15:32Z" }],
      [
        shipment({ orderNumber: "SO-1", customerCode: "REVL-HQ", customerRef: "PO 4471" }),
        shipment({ orderNumber: "SO-2", status: "Parked" }),
        shipment({ orderNumber: "SO-3", dispatchedAt: "2026-11-19T00:00:00.000Z" }),
      ],
      opts
    );
    expect(got.size).toBe(0);
  });

  it("counts a dispatch ON the start date", () => {
    expect(shippedOrders([], [shipment({ dispatchedAt: "2026-11-20T00:00:00.000Z" })], opts).size).toBe(1);
  });
});

describe("decideCompletion", () => {
  it("completes a paid web order with no invoice yet", () => {
    expect(decideCompletion(order(), [], null)).toEqual({ action: "complete" });
  });

  it("leaves an order Shuyi already invoiced alone, and records it", () => {
    expect(decideCompletion(order(), [invoice()], null)).toEqual({
      action: "record",
      outcome: "already_invoiced",
      invoiceNumber: "INV-00000920",
    });
  });

  it("does not count a Parked invoice as done", () => {
    expect(decideCompletion(order(), [invoice({ status: "Parked" })], null)).toEqual({ action: "complete" });
  });

  it("never touches an order the website did not take by card", () => {
    expect(decideCompletion(order({ stripeRef: null }), [], null).action).toBe("skip");
  });

  it("skips deleted, unknown and Guid-less orders", () => {
    expect(decideCompletion(order({ status: "Deleted" }), [], null).action).toBe("skip");
    expect(decideCompletion(null, [], null).action).toBe("skip");
    expect(decideCompletion(order({ guid: null }), [], null).action).toBe("skip");
  });

  it("flags an order Completed with no invoice instead of completing it again", () => {
    expect(decideCompletion(order({ status: "Completed" }), [], null).action).toBe("flag");
  });

  it("does not retry a settled order or one out of retries", () => {
    expect(decideCompletion(order(), [], { outcome: "invoiced", attempts: 1 }).action).toBe("skip");
    expect(decideCompletion(order(), [], { outcome: "pending", attempts: MAX_ATTEMPTS }).action).toBe("skip");
    expect(decideCompletion(order(), [], { outcome: "pending", attempts: 1 })).toEqual({ action: "complete" });
  });
});

function fakeDeps(over: Partial<Deps> & { stored?: CompletionRow[]; invoicedAfter?: boolean } = {}) {
  const saved: CompletionRow[] = [];
  let completed = false;
  const deps: Deps = {
    getOrder: vi.fn(async () => order()),
    getInvoices: vi.fn(async () => (completed && over.invoicedAfter !== false ? [invoice()] : [])),
    complete: vi.fn(async () => {
      completed = true;
    }),
    rows: vi.fn(async () => new Map((over.stored ?? []).map((r) => [r.order_number, r]))),
    save: vi.fn(async (r: CompletionRow) => {
      saved.push(r);
    }),
    ...over,
  };
  return { deps, saved };
}

const shipped = new Map([["SO-00000920", "easyship" as const]]);

describe("completeShipped", () => {
  it("completes, reads the invoice back and records it", async () => {
    const { deps, saved } = fakeDeps();
    const r = await completeShipped(shipped, deps);
    expect(deps.complete).toHaveBeenCalledWith("d9176808-60b5-4602-91f2-e6999e01db4a");
    expect(r.invoiced).toEqual([{ order: "SO-00000920", invoice: "INV-00000920", trigger: "easyship" }]);
    expect(saved[0]).toMatchObject({ outcome: "invoiced", invoice_number: "INV-00000920", attempts: 1 });
  });

  it("does not trust a 200: no invoice afterwards is flagged, not retried", async () => {
    const { deps, saved } = fakeDeps({ invoicedAfter: false });
    const r = await completeShipped(shipped, deps);
    expect(r.invoiced).toEqual([]);
    expect(r.problems[0]).toMatchObject({ order: "SO-00000920", final: true });
    expect(saved[0].outcome).toBe("needs_check");
  });

  it("makes no Unleashed calls for an order already settled", async () => {
    const { deps } = fakeDeps({
      stored: [{ order_number: "SO-00000920", outcome: "invoiced", trigger: "easyship", invoice_number: "INV-00000920", attempts: 1, last_error: null }],
    });
    await completeShipped(shipped, deps);
    expect(deps.getOrder).not.toHaveBeenCalled();
    expect(deps.complete).not.toHaveBeenCalled();
  });

  it("retries a failure quietly, telling the team only first and last", async () => {
    const boom = { complete: vi.fn(async () => Promise.reject(new Error("Unleashed SalesOrder complete 400: nope"))) };
    const first = fakeDeps(boom);
    const r1 = await completeShipped(shipped, first.deps);
    expect(r1.problems).toEqual([{ order: "SO-00000920", error: "Unleashed SalesOrder complete 400: nope", final: false }]);
    expect(r1.retrying).toBe(1);
    expect(first.saved[0]).toMatchObject({ outcome: "pending", attempts: 1 });

    const pending = (attempts: number): CompletionRow => ({
      order_number: "SO-00000920", outcome: "pending", trigger: "easyship", invoice_number: null, attempts, last_error: "x",
    });
    const middle = await completeShipped(shipped, fakeDeps({ ...boom, stored: [pending(1)] }).deps);
    expect(middle.problems).toEqual([]);

    const last = fakeDeps({ ...boom, stored: [pending(MAX_ATTEMPTS - 1)] });
    const r3 = await completeShipped(shipped, last.deps);
    expect(r3.problems[0].final).toBe(true);
    expect(last.saved[0]).toMatchObject({ outcome: "needs_check", attempts: MAX_ATTEMPTS });
  });

  it("records an order invoiced by hand without completing it", async () => {
    const { deps, saved } = fakeDeps({ getInvoices: vi.fn(async () => [invoice({ invoiceNumber: "INV-00000909" })]) });
    const r = await completeShipped(shipped, deps);
    expect(deps.complete).not.toHaveBeenCalled();
    expect(r.alreadyInvoiced).toEqual(["SO-00000920"]);
    expect(saved[0]).toMatchObject({ outcome: "already_invoiced", invoice_number: "INV-00000909", attempts: 0 });
  });

  it("one order's failure does not stop the next", async () => {
    const two = new Map([
      ["SO-1", "easyship" as const],
      ["SO-00000920", "unleashed" as const],
    ]);
    const { deps } = fakeDeps({
      getOrder: vi.fn(async (n: string) => (n === "SO-1" ? Promise.reject(new Error("timeout")) : order())),
    });
    const r = await completeShipped(two, deps);
    expect(r.problems.map((p) => p.order)).toEqual(["SO-1"]);
    expect(r.invoiced.map((i) => i.order)).toEqual(["SO-00000920"]);
  });
});

describe("summaryEmail", () => {
  it("says nothing on a quiet run", () => {
    expect(summaryEmail({ invoiced: [], alreadyInvoiced: ["SO-1"], problems: [], retrying: 0 })).toBeNull();
  });

  it("lists invoices raised and problems, escaped", () => {
    const e = summaryEmail({
      invoiced: [{ order: "SO-00000920", invoice: "INV-00000920", trigger: "easyship" }],
      alreadyInvoiced: [],
      problems: [{ order: "SO-2", error: "<400>", final: true }],
      retrying: 0,
    })!;
    expect(e.subject).toBe("Web order invoices: 1 raised, 1 need attention");
    expect(e.html).toContain("INV-00000920");
    expect(e.html).toContain("&lt;400&gt;");
    expect(e.html).toContain("raise the invoice by hand");
  });
});
