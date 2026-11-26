import { beforeEach, describe, expect, it, vi } from "vitest";

// GRENKE finance: the card is charged the 20% deposit, worked out on the server
// from the repriced total, never from anything the browser sends.

const create = vi.fn(async (args: { amount: number }) => ({ client_secret: "cs_test", amount: args.amount }));
let goodsTotal = 11000;

vi.mock("@/lib/stripe", () => ({ stripe: { paymentIntents: { create: (a: { amount: number }) => create(a) } } }));
vi.mock("@/lib/checkout-mode", () => ({ quoteOnly: false }));
vi.mock("@/lib/order-lines", () => ({
  resolveOrderLines: async () => ({ lines: [{ name: "Rack", quantity: 1, unitPrice: goodsTotal }], total: goodsTotal, hasPoa: false }),
}));
vi.mock("@/lib/freight-server", () => ({
  quoteFreightForRefs: async () => ({ required: false, selected: null, reason: "none" }),
}));
vi.mock("@/lib/checkout-leads", () => ({ scheduleCheckoutLead: () => {}, validCheckoutId: () => null }));

const billing = { email: "buyer@example.com", first_name: "A", last_name: "B", company: "Test Gym", address_1: "1 St" };

const post = async (body: unknown) => {
  const { POST } = await import("./route");
  return POST(
    new Request("https://masterkraft.com/api/payment-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
};

describe("payment-intent GRENKE finance", () => {
  beforeEach(() => {
    create.mockClear();
    goodsTotal = 11000;
  });

  it("charges the 20% deposit and records the plan on the intent", async () => {
    const res = await post({ items: [{ productId: 1, quantity: 1 }], billing, finance: "grenke" });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.amount).toBe(2200);
    expect(body.orderTotal).toBe(11000);
    const args = create.mock.calls[0][0] as unknown as { amount: number; metadata: Record<string, string>; payment_method_types?: string[] };
    expect(args.amount).toBe(220000);
    expect(args.payment_method_types).toEqual(["card"]);
    expect(args.metadata.finance_plan).toBe("grenke-60");
    expect(args.metadata.finance_balance).toBe("8800.00");
  });

  it("refuses finance under the threshold instead of charging a deposit", async () => {
    goodsTotal = 4000;
    const res = await post({ items: [{ productId: 1, quantity: 1 }], billing, finance: "grenke" });
    expect(res.status).toBe(422);
    expect((await res.json()).finance).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it("needs a business name, since GRENKE leases to businesses", async () => {
    const res = await post({ items: [{ productId: 1, quantity: 1 }], billing: { ...billing, company: "" }, finance: "grenke" });
    expect(res.status).toBe(422);
    expect(create).not.toHaveBeenCalled();
  });

  it("charges in full when finance is not chosen", async () => {
    const res = await post({ items: [{ productId: 1, quantity: 1 }], billing });
    expect((await res.json()).amount).toBe(11000);
    const args = create.mock.calls[0][0] as unknown as { metadata: Record<string, string> };
    expect(args.metadata.finance_plan).toBeUndefined();
  });
});
