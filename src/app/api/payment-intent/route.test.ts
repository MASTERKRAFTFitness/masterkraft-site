import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The gate quote mode was missing. NEXT_PUBLIC_CHECKOUT_MODE hid the card form
// but not this route, and the only thing actually stopping a direct POST was a
// WooCommerce store that happened to be unreachable. These tests exist so that
// taking the buy path off WooCommerce — which is the whole point of the ERP
// order work — cannot quietly re-open it.

// The flag is read at module load, so the route has to be imported AFTER the
// env is arranged.
const post = async (body: unknown) => {
  vi.resetModules();
  const { POST } = await import("./route");
  return POST(
    new Request("https://masterkraft.com/api/payment-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
};

const cart = { items: [{ productId: 487870, sku: "RKST3C01", quantity: 1 }] };

describe("payment-intent quote-only gate", () => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    process.env = { ...saved };
    // Any outbound request from a refused checkout is itself the bug.
    globalThis.fetch = vi.fn(async () => {
      throw new Error("no request should leave the process");
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env = { ...saved };
    globalThis.fetch = realFetch;
  });

  it("refuses in quote mode even when a secret key is configured", async () => {
    process.env.NEXT_PUBLIC_CHECKOUT_MODE = "quote";
    process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";
    const res = await post(cart);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/request a quote/i);
  });

  it("refuses when payments are simply not configured", async () => {
    delete process.env.NEXT_PUBLIC_CHECKOUT_MODE;
    delete process.env.STRIPE_SECRET_KEY;
    const res = await post(cart);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("Payments not configured");
  });

  // Same status, different reason. This is what proves the gate reads the flag
  // rather than refusing everything that reaches it.
  it("falls through the gate in card mode", async () => {
    process.env.NEXT_PUBLIC_CHECKOUT_MODE = "card";
    delete process.env.STRIPE_SECRET_KEY;
    const res = await post(cart);
    expect((await res.json()).error).toBe("Payments not configured");
  });
});
