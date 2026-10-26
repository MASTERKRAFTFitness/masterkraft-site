// The webhook places orders, so an event it cannot prove came from Stripe must
// never reach fulfilPaymentIntent - an unsigned "payment succeeded" would be a
// free order for anyone who can POST.
import { beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import { orderIntentMetadata } from "@/lib/order-intent";

const SECRET = "whsec_test_secret";
const real = new Stripe("sk_test_dummy");
vi.mock("@/lib/stripe", () => ({ stripe: real }));

const fulfilPaymentIntent = vi.fn();
vi.mock("@/lib/fulfil-order", () => ({ fulfilPaymentIntent: (...a: unknown[]) => fulfilPaymentIntent(...a) }));

const { POST } = await import("./route");

function signed(payload: object, secret = SECRET) {
  const body = JSON.stringify(payload);
  const header = real.webhooks.generateTestHeaderString({ payload: body, secret });
  return new Request("http://x/api/stripe/webhook", { method: "POST", body, headers: { "stripe-signature": header } });
}

const event = (metadata: Record<string, string>) => ({
  id: "evt_1",
  object: "event",
  type: "payment_intent.succeeded",
  data: { object: { id: "pi_123", object: "payment_intent", metadata } },
});
const ours = { source: "masterkraft-site", ...orderIntentMetadata({ items: [{ productId: 1, quantity: 1 }], billing: { email: "a@b.co" } }) };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  fulfilPaymentIntent.mockResolvedValue({ status: 200, body: { ok: true, orderNumber: "SO-1" } });
});

describe("POST /api/stripe/webhook", () => {
  it("places the order for a signed succeeded payment from the site", async () => {
    const res = await POST(signed(event(ours)));
    expect(res.status).toBe(200);
    expect(fulfilPaymentIntent).toHaveBeenCalledWith({ paymentIntentId: "pi_123" });
  });

  it("refuses an event signed with the wrong secret", async () => {
    const res = await POST(signed(event(ours), "whsec_wrong"));
    expect(res.status).toBe(400);
    expect(fulfilPaymentIntent).not.toHaveBeenCalled();
  });

  it("refuses everything when no secret is configured", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const res = await POST(signed(event(ours)));
    expect(res.status).toBe(503);
    expect(fulfilPaymentIntent).not.toHaveBeenCalled();
  });

  it("leaves payments that are not the site's checkout alone", async () => {
    await POST(signed(event({ source: "xero" })));
    await POST(signed(event({ source: "masterkraft-site" })));
    expect(fulfilPaymentIntent).not.toHaveBeenCalled();
  });

  it("asks Stripe to retry when the order could not be placed", async () => {
    fulfilPaymentIntent.mockResolvedValue({ status: 500, body: { ok: false, error: "Unleashed down" } });
    const res = await POST(signed(event(ours)));
    expect(res.status).toBe(500);
  });
});
