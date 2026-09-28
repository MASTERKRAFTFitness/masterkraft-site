import { describe, expect, it } from "vitest";
import { legalContent } from "@/lib/legal-content";
import {
  DISPATCH_BUSINESS_DAYS,
  REGIONAL_ALLOWANCE_DAYS,
  TRANSIT_BUSINESS_DAYS,
  estimatedDeliveryDate,
} from "@/lib/delivery-estimate";

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
    const unknown = estimatedDeliveryDate("", monday);
    for (const state of Object.keys(TRANSIT_BUSINESS_DAYS)) {
      expect(unknown >= estimatedDeliveryDate(state, monday)).toBe(true);
    }
  });

  it("skips a weekend order to the working week", () => {
    const saturday = new Date(2026, 9, 3, 10);
    expect(estimatedDeliveryDate("VIC", saturday)).toBe("2026-10-13");
  });
});

describe("the /shipping page", () => {
  const text = legalContent.shipping.flatMap((s) => s.body).join("\n");

  it("states every state's transit range exactly as the table holds it", () => {
    for (const [state, t] of Object.entries(TRANSIT_BUSINESS_DAYS)) {
      expect(text).toContain(`${t.city} (${state}) ${t.min}-${t.max}`);
    }
  });

  it("states the dispatch window and the regional allowance the table holds", () => {
    expect(text).toContain(`within ${DISPATCH_BUSINESS_DAYS.min}-${DISPATCH_BUSINESS_DAYS.max} business days of payment`);
    expect(text).toContain(`an extra 1-${REGIONAL_ALLOWANCE_DAYS} business days`);
  });

  it("gives worked examples that add up", () => {
    const span = (s: string) =>
      `${DISPATCH_BUSINESS_DAYS.min + TRANSIT_BUSINESS_DAYS[s].min}-${DISPATCH_BUSINESS_DAYS.max + TRANSIT_BUSINESS_DAYS[s].max}`;
    expect(text).toContain(`to Melbourne metro is expected ${span("VIC")} business days`);
    expect(text).toContain(`to Perth metro ${span("WA")} business days`);
  });
});
