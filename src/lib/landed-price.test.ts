// The landed-price regions decide where money is spent, so the label has to say
// exactly what the measurement said, and a loser must never read as a winner.
import { describe, expect, it } from "vitest";
import { LANDED_PRICE_WINS, regionLabel } from "@/lib/landed-price";

describe("regionLabel", () => {
  it("calls a win in every city national", () => {
    expect(regionLabel("MRCTATT01")).toBe("national");
  });

  it("names the states for a partial win", () => {
    expect(regionLabel("MMKBPGC05")).toBe("vic-nsw");
    expect(regionLabel("MWWPCB01")).toBe("vic");
  });

  it("gives a size that lost everywhere no region at all", () => {
    expect(regionLabel("MWWPOPR06")).toBeUndefined();
  });

  it("treats a size with no Little Bloke equivalent as national", () => {
    // The urethane plates: nothing to lose to, so the product-price advantage stands.
    expect(regionLabel("MWWPOU04")).toBe("national");
  });

  it("is case-insensitive on the code", () => {
    expect(regionLabel("mmkbpgc05")).toBe("vic-nsw");
  });

  it("only ever records the three measured states", () => {
    const seen = new Set(Object.values(LANDED_PRICE_WINS).flat());
    expect([...seen].every((r) => ["vic", "nsw", "wa"].includes(r))).toBe(true);
  });
});
