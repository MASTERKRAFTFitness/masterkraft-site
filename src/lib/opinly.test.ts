// The server-side Opinly sink. The browser pixel was removed 29 Oct 2026 (its
// key was rejected); this half only runs when OPINLY_API_KEY is set, and it sits
// inside a paid checkout, so it must stay silent and never throw.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  delete process.env.OPINLY_API_KEY;
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("server reportPurchase", () => {
  async function withMockedClient(track: (...a: unknown[]) => unknown) {
    vi.doMock("@opinly/backend", () => ({ createOpinlyClient: () => ({ track }) }));
    return import("@/lib/opinly-server");
  }

  it("reports the purchase under the order number", async () => {
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

  it("is silent with no API key — unset is a working state", async () => {
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
