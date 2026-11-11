// The whole-cart quote is shared across server instances through the Next data
// cache (getOrQuote). Instances are simulated by clearing this module's memory
// between calls while the fake shared store below keeps its entries.
import { beforeEach, describe, expect, it, vi } from "vitest";

const shared = new Map<string, unknown>();
let sharedAvailable = true;
vi.mock("next/cache", () => ({
  unstable_cache:
    (fn: () => Promise<unknown>, keyParts: string[]) =>
    async () => {
      if (!sharedAvailable) throw new Error("Invariant: incrementalCache missing in unstable_cache");
      const key = keyParts.join("|");
      if (shared.has(key)) return shared.get(key);
      const value = await fn(); // a throw here stores nothing, as in Next
      shared.set(key, value);
      return value;
    },
}));

const { clearFreightCache, getOrQuote } = await import("@/lib/freight-cache");

type Quote = { ok: boolean; price?: number };
const ttl = () => 900;

beforeEach(() => {
  shared.clear();
  sharedAvailable = true;
  clearFreightCache();
});

describe("getOrQuote", () => {
  it("answers a second instance from the shared cache without asking the carriers", async () => {
    const compute = vi.fn(async (): Promise<Quote> => ({ ok: true, price: 33.98 }));
    await getOrQuote("cart-a", ttl, compute);
    clearFreightCache(); // the button's request lands on another instance

    expect(await getOrQuote("cart-a", ttl, compute)).toEqual({ ok: true, price: 33.98 });
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("never shares a failed quote, but still returns it", async () => {
    const compute = vi.fn(async (): Promise<Quote> => ({ ok: false }));
    expect(await getOrQuote("cart-b", ttl, compute)).toEqual({ ok: false });
    expect(shared.size).toBe(0);
  });

  it("prices directly where there is no shared cache (tests, scripts)", async () => {
    sharedAvailable = false;
    const compute = vi.fn(async (): Promise<Quote> => ({ ok: true, price: 12.06 }));
    expect(await getOrQuote("cart-c", ttl, compute)).toEqual({ ok: true, price: 12.06 });
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("does not price twice when the carriers themselves throw", async () => {
    const compute = vi.fn(async (): Promise<Quote> => {
      throw new Error("carrier exploded");
    });
    await expect(getOrQuote("cart-d", ttl, compute)).rejects.toThrow("carrier exploded");
    expect(compute).toHaveBeenCalledTimes(1);
  });
});
