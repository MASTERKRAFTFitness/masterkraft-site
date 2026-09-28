import { describe, expect, it } from "vitest";
import { estimatedDeliveryDate } from "@/lib/delivery-estimate";

// Monday 28 Sep 2026, local time.
const monday = new Date(2026, 8, 28, 10);

describe("estimated delivery date", () => {
  it("counts business days only: dispatch 3 + VIC 2 + regional 2 from a Monday", () => {
    expect(estimatedDeliveryDate("VIC", monday)).toBe("2026-10-07");
  });

  it("gives a farther state a later date", () => {
    expect(estimatedDeliveryDate("WA", monday) > estimatedDeliveryDate("VIC", monday)).toBe(true);
  });

  it("reads the state however the form sent it", () => {
    expect(estimatedDeliveryDate(" wa ", monday)).toBe(estimatedDeliveryDate("WA", monday));
  });

  it("falls back to the slowest case for a state it does not know", () => {
    expect(estimatedDeliveryDate("", monday)).toBe(estimatedDeliveryDate("NT", monday));
  });

  it("skips a weekend order to the working week", () => {
    const saturday = new Date(2026, 9, 3, 10);
    expect(estimatedDeliveryDate("VIC", saturday)).toBe("2026-10-13");
  });
});
