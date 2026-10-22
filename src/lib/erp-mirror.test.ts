import { describe, expect, it } from "vitest";
import { sellPriceTiers } from "./erp-mirror";

describe("sellPriceTiers", () => {
  it("keeps positive tier values keyed by tier number", () => {
    expect(
      sellPriceTiers({
        SellPriceTier1: { Name: "Tier 1", Value: "123.45" },
        SellPriceTier3: { Name: "Tier 3", Value: 99 },
        SellPriceTier10: { Name: "Tier 10", Value: 1577.7667 },
      }),
    ).toEqual({ "1": 123.45, "3": 99, "10": 1577.7667 });
  });

  it("drops zero, negative and missing values, so a missing tier is never a stored 0", () => {
    expect(
      sellPriceTiers({
        SellPriceTier1: { Value: 0 },
        SellPriceTier2: { Value: "0.0000" },
        SellPriceTier4: { Value: -5 },
        SellPriceTier5: { Value: 12 },
      }),
    ).toEqual({ "5": 12 });
  });

  it("is null when the product has no tier prices at all", () => {
    expect(sellPriceTiers({ ProductCode: "X" })).toBeNull();
  });
});
