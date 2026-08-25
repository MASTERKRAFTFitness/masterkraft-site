import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetLimits,
  checkMessageLimit,
  orderLookupBlocked,
  recordOrderMiss,
  visitorKey,
  PER_MINUTE,
  PER_DAY,
  ORDER_ATTEMPTS,
} from "./rate-limit";

describe("public chat limits", () => {
  beforeEach(() => __resetLimits());

  it("allows a normal conversation and then stops a flood", () => {
    const now = Date.now();
    for (let i = 0; i < PER_MINUTE; i++) {
      expect(checkMessageLimit("1.1.1.1", now).ok).toBe(true);
    }
    const over = checkMessageLimit("1.1.1.1", now);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.retryAfter).toBeGreaterThan(0);
  });

  it("lets the same visitor back in after the minute passes", () => {
    const now = Date.now();
    for (let i = 0; i < PER_MINUTE + 1; i++) checkMessageLimit("2.2.2.2", now);
    expect(checkMessageLimit("2.2.2.2", now + 61_000).ok).toBe(true);
  });

  it("still enforces a daily cap once the per-minute window keeps resetting", () => {
    let clock = Date.now();
    let allowed = 0;
    for (let i = 0; i < PER_DAY + 20; i++) {
      if (checkMessageLimit("3.3.3.3", clock).ok) allowed++;
      clock += 61_000; // always a fresh minute
    }
    expect(allowed).toBe(PER_DAY);
  });

  it("does not let one visitor's flood block another", () => {
    const now = Date.now();
    for (let i = 0; i < PER_MINUTE + 5; i++) checkMessageLimit("4.4.4.4", now);
    expect(checkMessageLimit("5.5.5.5", now).ok).toBe(true);
  });

  it("blocks order guessing after a handful of misses", () => {
    expect(orderLookupBlocked("6.6.6.6")).toBe(false);
    for (let i = 0; i < ORDER_ATTEMPTS; i++) recordOrderMiss("6.6.6.6");
    expect(orderLookupBlocked("6.6.6.6")).toBe(true);
    // and it is per visitor
    expect(orderLookupBlocked("7.7.7.7")).toBe(false);
  });

  it("takes the client from the front of x-forwarded-for, not the proxy chain", () => {
    const req = new Request("https://masterkraft.com/api/chat", {
      headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1, 10.0.0.2" },
    });
    expect(visitorKey(req)).toBe("203.0.113.9");
  });
});
