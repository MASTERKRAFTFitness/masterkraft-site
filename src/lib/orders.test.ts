// Which system an order lands in, and the bookkeeping that stops one card
// charge becoming two orders. The switch itself is the risk here: a wrong
// answer writes a real order into the wrong system, or none at all.
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { CreateOrderInput } from "@/lib/woo-orders";

const createWooOrder = vi.fn();
const createUnleashedOrder = vi.fn();

vi.mock("@/lib/woo-orders", async (orig) => ({
  ...(await orig<typeof import("@/lib/woo-orders")>()),
  createWooOrder: (...a: unknown[]) => createWooOrder(...a),
}));
vi.mock("@/lib/unleashed-orders", async (orig) => ({
  ...(await orig<typeof import("@/lib/unleashed-orders")>()),
  createUnleashedOrder: (...a: unknown[]) => createUnleashedOrder(...a),
}));

const { placeOrder, orderBackend, orderingEnabled, orderMetadata, existingOrderOn } =
  await import("@/lib/orders");

const env = { ...process.env };
beforeEach(() => {
  createWooOrder.mockReset();
  createUnleashedOrder.mockReset();
  delete process.env.UNLEASHED_WRITE_ENABLED;
  delete process.env.WC_WRITE_ENABLED;
  process.env.WC_STORE_URL = "https://store.example";
});
afterEach(() => {
  process.env = { ...env };
});

const input = { billing: { email: "a@b.c" }, lines: [] } as unknown as CreateOrderInput;

describe("exactly one backend is live", () => {
  it("writes to WooCommerce by default, so nothing changes until it is switched", () => {
    expect(orderBackend()).toBe("woocommerce");
  });

  it("writes to the ERP once the flag is on", () => {
    process.env.UNLEASHED_WRITE_ENABLED = "true";
    expect(orderBackend()).toBe("unleashed");
  });

  it("asks the ACTIVE backend whether ordering is on, not the other one", () => {
    // WooCommerce off, ERP on: ordering is on. Reading the wrong gate here would
    // 503 a checkout that is perfectly able to place an order.
    process.env.UNLEASHED_WRITE_ENABLED = "true";
    expect(orderingEnabled()).toBe(true);
    delete process.env.UNLEASHED_WRITE_ENABLED;
    expect(orderingEnabled()).toBe(false);
    process.env.WC_WRITE_ENABLED = "true";
    expect(orderingEnabled()).toBe(true);
  });

  it("never falls back from one to the other", async () => {
    // An order written to the system nobody is looking at is worse than an
    // error: it reports success and then cannot be found.
    process.env.UNLEASHED_WRITE_ENABLED = "true";
    createUnleashedOrder.mockRejectedValue(new Error("no write scope"));
    await expect(placeOrder(input)).rejects.toThrow(/no write scope/);
    expect(createWooOrder).not.toHaveBeenCalled();
  });
});

describe("both backends return one shape", () => {
  it("normalises a WooCommerce order", async () => {
    createWooOrder.mockResolvedValue({ id: 4711, number: "4711", status: "processing", total: "241.39" });
    await expect(placeOrder(input)).resolves.toEqual({
      id: "4711",
      orderNumber: "4711",
      status: "processing",
      total: 241.39,
      backend: "woocommerce",
    });
  });

  it("normalises an Unleashed order, keeping the Guid as a string", async () => {
    process.env.UNLEASHED_WRITE_ENABLED = "true";
    createUnleashedOrder.mockResolvedValue({
      guid: "e2695b73-49b1-476d-834a-e62dbe41b3",
      orderNumber: "SO-00000851",
      status: "Parked",
      total: 241.39,
    });
    const o = await placeOrder(input);
    expect(o.id).toBe("e2695b73-49b1-476d-834a-e62dbe41b3");
    expect(o.orderNumber).toBe("SO-00000851");
    expect(o.backend).toBe("unleashed");
    // The old route coerced this with Number(); a Guid would have become NaN.
    expect(Number.isNaN(Number(o.id))).toBe(true);
  });

  it("shows the Guid rather than a blank confirmation if no number comes back", async () => {
    process.env.UNLEASHED_WRITE_ENABLED = "true";
    createUnleashedOrder.mockResolvedValue({ guid: "g-1", orderNumber: "", status: "Parked", total: 10 });
    await expect(placeOrder(input)).resolves.toMatchObject({ orderNumber: "g-1" });
  });
});

describe("one card charge cannot become two orders", () => {
  it("records neutral keys, plus the old ones for WooCommerce", () => {
    expect(
      orderMetadata({ id: "4711", orderNumber: "4711", status: "x", total: 1, backend: "woocommerce" })
    ).toEqual({
      order_backend: "woocommerce",
      order_id: "4711",
      order_number: "4711",
      wc_order_id: "4711",
      wc_order_number: "4711",
    });
  });

  it("does not write wc_ keys for an ERP order, where the id is not numeric", () => {
    const m = orderMetadata({ id: "g-1", orderNumber: "SO-1", status: "x", total: 1, backend: "unleashed" });
    expect(m).toEqual({ order_backend: "unleashed", order_id: "g-1", order_number: "SO-1" });
    expect(m.wc_order_id).toBeUndefined();
  });

  it("short-circuits on an intent written by either scheme", () => {
    expect(existingOrderOn({ order_id: "g-1", order_number: "SO-1" })).toEqual({
      id: "g-1",
      orderNumber: "SO-1",
    });
    // An intent created BEFORE the switch is still in flight when it lands.
    expect(existingOrderOn({ wc_order_id: "4711", wc_order_number: "4711" })).toEqual({
      id: "4711",
      orderNumber: "4711",
    });
  });

  it("falls back to the id when only an id was recorded", () => {
    expect(existingOrderOn({ order_id: "g-1" })).toEqual({ id: "g-1", orderNumber: "g-1" });
  });

  it("returns nothing when no order has been placed yet", () => {
    expect(existingOrderOn({})).toBeNull();
    expect(existingOrderOn(null)).toBeNull();
    expect(existingOrderOn(undefined)).toBeNull();
  });
});
