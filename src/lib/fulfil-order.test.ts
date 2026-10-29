// Turning a paid intent into an order, from the browser or from Stripe's
// webhook. The two failures that matter: a paid customer with no order, and one
// payment that becomes two orders because both callers arrived together.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { orderIntentMetadata } from "@/lib/order-intent";

const retrieve = vi.fn();
const update = vi.fn();
vi.mock("@/lib/stripe", () => ({ stripe: { paymentIntents: { retrieve: (...a: unknown[]) => retrieve(...a), update: (...a: unknown[]) => update(...a) } } }));
vi.mock("@/lib/checkout-mode", () => ({ quoteOnly: false }));

const placeOrder = vi.fn();
vi.mock("@/lib/orders", async (orig) => ({
  ...(await orig<typeof import("@/lib/orders")>()),
  orderingEnabled: () => true,
  placeOrder: (...a: unknown[]) => placeOrder(...a),
}));
vi.mock("@/lib/order-lines", () => ({
  resolveOrderLines: async () => ({ lines: [{ sku: "N-PLATE-20", qty: 2, price: 50 }], total: 100, hasPoa: false }),
}));

const claimOrder = vi.fn();
const releaseClaim = vi.fn();
vi.mock("@/lib/order-claims", () => ({
  claimOrder: (...a: unknown[]) => claimOrder(...a),
  completeClaim: async () => {},
  releaseClaim: (...a: unknown[]) => releaseClaim(...a),
}));

const notifyOrderPlaced = vi.fn(async () => ({}));
vi.mock("@/lib/order-notify", () => ({ notifyOrderPlaced: (...a: unknown[]) => notifyOrderPlaced(...(a as [])) }));
vi.mock("@/lib/opinly-server", () => ({ reportPurchase: async () => {} }));
vi.mock("@/lib/checkout-leads", () => ({ scheduleCheckoutLead: () => {} }));
vi.mock("@/lib/easyship-shipments", () => ({ shipmentSyncEnabled: () => false, syncShipmentsToEasyship: async () => ({}) }));

const { fulfilPaymentIntent } = await import("@/lib/fulfil-order");

const billing = { first_name: "Sam", email: "sam@example.com", state: "VIC" };
const items = [{ productId: 1, quantity: 2, sku: "N-PLATE-20" }];

function paidIntent(metadata: Record<string, string> = {}) {
  return {
    id: "pi_123",
    status: "succeeded",
    amount_received: 14000,
    currency: "aud",
    metadata: { source: "masterkraft-site", freight_amount: "40.00", ...metadata },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  claimOrder.mockResolvedValue({ won: true });
  placeOrder.mockResolvedValue({ id: "guid", orderNumber: "SO-1", status: "Parked", total: 140, backend: "unleashed" });
});

describe("fulfilPaymentIntent", () => {
  it("places an Afterpay/Zip order from the cart stored on the intent alone", async () => {
    retrieve.mockResolvedValue(paidIntent(orderIntentMetadata({ items, billing })));
    const r = await fulfilPaymentIntent({ paymentIntentId: "pi_123" });
    expect(r.body).toMatchObject({ ok: true, orderNumber: "SO-1", value: 140 });
    expect(placeOrder.mock.calls[0][0]).toMatchObject({ billing, chargedTotal: 140 });
    expect(notifyOrderPlaced).toHaveBeenCalledOnce();
  });

  it("still takes the card checkout's own cart and address", async () => {
    retrieve.mockResolvedValue(paidIntent());
    const r = await fulfilPaymentIntent({ paymentIntentId: "pi_123", items, billing });
    expect(r.body.ok).toBe(true);
  });

  it("refuses an id-only request for an intent that carries no cart", async () => {
    retrieve.mockResolvedValue(paidIntent());
    const r = await fulfilPaymentIntent({ paymentIntentId: "pi_123" });
    expect(r.status).toBe(400);
    expect(placeOrder).not.toHaveBeenCalled();
  });

  it("returns the existing order instead of placing a second", async () => {
    retrieve.mockResolvedValue(paidIntent({ order_id: "guid", order_number: "SO-9" }));
    const r = await fulfilPaymentIntent({ paymentIntentId: "pi_123" });
    expect(r.body).toMatchObject({ ok: true, orderNumber: "SO-9", idempotent: true });
    expect(placeOrder).not.toHaveBeenCalled();
  });

  it("does not place an order when another caller holds the claim, and reports its number", async () => {
    retrieve.mockResolvedValue(paidIntent(orderIntentMetadata({ items, billing })));
    claimOrder.mockResolvedValue({ won: false, orderNumber: "SO-7" });
    const r = await fulfilPaymentIntent({ paymentIntentId: "pi_123" });
    expect(r.body).toMatchObject({ ok: true, orderNumber: "SO-7", idempotent: true });
    expect(placeOrder).not.toHaveBeenCalled();
  });

  it("gives the claim back when placing fails, so a retry can succeed", async () => {
    retrieve.mockResolvedValue(paidIntent(orderIntentMetadata({ items, billing })));
    placeOrder.mockRejectedValue(new Error("Unleashed down"));
    const r = await fulfilPaymentIntent({ paymentIntentId: "pi_123" });
    expect(r.status).toBe(500);
    expect(releaseClaim).toHaveBeenCalledWith("pi_123");
  });

  it("waits while a payment is still settling", async () => {
    retrieve.mockResolvedValue({ ...paidIntent(), status: "processing" });
    const r = await fulfilPaymentIntent({ paymentIntentId: "pi_123" });
    expect(r.status).toBe(402);
  });

  it("places a promo order for goods less the discount on the intent, plus freight", async () => {
    // 100 goods - 50 THANKS50 + 40 freight = 90
    retrieve.mockResolvedValue({
      ...paidIntent({ ...orderIntentMetadata({ items, billing }), promo_code: "THANKS50", promo_amount: "50.00" }),
      amount_received: 9000,
    });
    const r = await fulfilPaymentIntent({ paymentIntentId: "pi_123" });
    expect(r.body).toMatchObject({ ok: true, value: 90 });
    expect(placeOrder.mock.calls[0][0]).toMatchObject({ chargedTotal: 90, discount: { code: "THANKS50", amount: 50 } });
    expect(notifyOrderPlaced.mock.calls[0]).toMatchObject([{ discount: { code: "THANKS50", amount: 50 } }]);
  });

  it("refuses a payment that does not match the repriced total", async () => {
    retrieve.mockResolvedValue({ ...paidIntent(orderIntentMetadata({ items, billing })), amount_received: 100 });
    const r = await fulfilPaymentIntent({ paymentIntentId: "pi_123" });
    expect(r.status).toBe(409);
    expect(claimOrder).not.toHaveBeenCalled();
  });
});
