// The Opinly sinks, browser and server.
//
// Two things here are worth pinning rather than trusting to review:
//
// 1. THE DEDUPE CONTRACT. Browser and server both report a purchase, and the
//    only thing stopping that being double-counted revenue is both of them
//    sending the SAME externalEventId. A test is cheaper than discovering it
//    from a doubled sales figure.
// 2. THE MISSING PIXEL. `window.opinly` is undefined for anyone who declined
//    cookies or runs a blocker, and these calls sit inside a paid checkout.
//    They must no-op, not throw.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

type TrackCall = [string, Record<string, unknown>?, Record<string, unknown>?];

function pixelSpy() {
  const track: TrackCall[] = [];
  const identify: unknown[] = [];
  (globalThis as unknown as { window: unknown }).window = globalThis;
  (globalThis as unknown as { opinly: unknown }).opinly = {
    anonId: "anon_abc123",
    track: (...a: TrackCall) => void track.push(a),
    identify: (t: unknown) => void identify.push(t),
  };
  return { track, identify };
}

/** A browser where the pixel never arrived: window exists, window.opinly does not. */
function noPixel() {
  (globalThis as unknown as { window: unknown }).window = globalThis;
  delete (globalThis as unknown as { opinly?: unknown }).opinly;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  delete (globalThis as unknown as { opinly?: unknown }).opinly;
  delete (globalThis as unknown as { window?: unknown }).window;
  delete (globalThis as unknown as { gtag?: unknown }).gtag;
  delete process.env.OPINLY_API_KEY;
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("browser pixel", () => {
  it("tags a purchase with the order number so the server event dedupes against it", async () => {
    const spy = pixelSpy();
    const { trackPurchase } = await import("@/lib/analytics");
    trackPurchase({ id: "MK-1001", value: 192.5 });

    expect(spy.track).toEqual([
      ["purchase", { value: 192.5, currency: "AUD" }, { externalEventId: "MK-1001" }],
    ]);
  });

  it("prices in AUD, which is what the store actually charges", async () => {
    const spy = pixelSpy();
    const { trackAddToCart } = await import("@/lib/analytics");
    trackAddToCart({ id: 42, name: "Olympic Barbell", price: 200 }, 2);

    expect(spy.track[0][0]).toBe("add_to_cart");
    expect(spy.track[0][1]).toMatchObject({
      value: 400,
      currency: "AUD",
      product_id: "42",
      quantity: 2,
    });
  });

  it("identifies on sign_up and reports the source, not a bare count", async () => {
    const spy = pixelSpy();
    const { trackSignUp } = await import("@/lib/analytics");
    trackSignUp("newsletter", "buyer@example.com");

    expect(spy.identify).toEqual([{ email: "buyer@example.com" }]);
    expect(spy.track).toEqual([["sign_up", { source: "newsletter" }, undefined]]);
  });

  it("ignores an identify with nothing to identify by", async () => {
    const spy = pixelSpy();
    const { identifyUser } = await import("@/lib/analytics");
    identifyUser(undefined);
    identifyUser("");

    expect(spy.identify).toEqual([]);
  });

  it("no-ops when the pixel never loaded, rather than throwing mid-checkout", async () => {
    noPixel();
    const { trackPurchase, identifyUser } = await import("@/lib/analytics");
    const { opinlyAnonId } = await import("@/lib/opinly");

    expect(() => trackPurchase({ id: "MK-1001", value: 192.5 })).not.toThrow();
    expect(() => identifyUser("buyer@example.com")).not.toThrow();
    expect(opinlyAnonId()).toBeUndefined();
  });
});

describe("server reportPurchase", () => {
  async function withMockedClient(track: (...a: unknown[]) => unknown) {
    vi.doMock("@opinly/backend", () => ({ createOpinlyClient: () => ({ track }) }));
    return import("@/lib/opinly-server");
  }

  it("reports the same externalEventId the browser used", async () => {
    process.env.OPINLY_API_KEY = "sk-test";
    const calls: unknown[][] = [];
    const { reportPurchase } = await withMockedClient((...a) => {
      calls.push(a);
      return Promise.resolve({});
    });

    await reportPurchase({
      orderNumber: "MK-1001",
      value: 192.5,
      anonId: "anon_abc123",
      email: "buyer@example.com",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe("purchase");
    expect(calls[0][1]).toEqual({ value: 192.5, currency: "AUD" });
    expect(calls[0][2]).toEqual({
      externalEventId: "MK-1001",
      anonId: "anon_abc123",
      email: "buyer@example.com",
    });
  });

  it("is silent with no API key — unset is a working state, the pixel still reports", async () => {
    delete process.env.OPINLY_API_KEY;
    const calls: unknown[][] = [];
    const { reportPurchase, opinlyServerEnabled } = await withMockedClient((...a) => {
      calls.push(a);
      return Promise.resolve({});
    });

    expect(opinlyServerEnabled()).toBe(false);
    await reportPurchase({ orderNumber: "MK-1001", value: 192.5, email: "buyer@example.com" });
    expect(calls).toEqual([]);
  });

  it("skips an event with neither anonId nor email, which Opinly could only file as direct", async () => {
    process.env.OPINLY_API_KEY = "sk-test";
    const calls: unknown[][] = [];
    const { reportPurchase } = await withMockedClient((...a) => {
      calls.push(a);
      return Promise.resolve({});
    });

    await reportPurchase({ orderNumber: "MK-1001", value: 192.5 });
    expect(calls).toEqual([]);
  });

  it("swallows a failing API call — the card is already charged by this point", async () => {
    process.env.OPINLY_API_KEY = "sk-test";
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { reportPurchase } = await withMockedClient(() => Promise.reject(new Error("502")));

    await expect(
      reportPurchase({ orderNumber: "MK-1001", value: 192.5, email: "buyer@example.com" }),
    ).resolves.toBeUndefined();
  });
});
