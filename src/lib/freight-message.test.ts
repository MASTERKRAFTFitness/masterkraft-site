import { describe, expect, it } from "vitest";
import { freightMessage, quotesAutomatically } from "./freight-message";

describe("quotesAutomatically", () => {
  // The cart decides these: the same address would get the same answer again,
  // so the only useful next step is a person pricing it.
  it.each(["oversize", "too_many_parcels", "too_expensive", "incomplete_dimensions"])(
    "sends %s straight to the team",
    (reason) => expect(quotesAutomatically(reason)).toBe(true),
  );

  // A retry can fix these - a typo'd postcode, a carrier timing out - so the
  // customer keeps Recalculate Freight instead of being quoted on a mistake.
  it.each(["no_services", "error", "no_delivery_address", "not_configured", null, undefined])(
    "leaves %s with the customer",
    (reason) => expect(quotesAutomatically(reason)).toBe(false),
  );

  it("covers exactly the reasons that share the ships-as-freight sentence", () => {
    const freight = freightMessage("oversize");
    for (const r of ["oversize", "too_many_parcels", "too_expensive", "incomplete_dimensions", "no_services", "error"]) {
      expect(quotesAutomatically(r)).toBe(freightMessage(r) === freight);
    }
  });
});
