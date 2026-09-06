import { afterEach, describe, expect, it } from "vitest";
import { filterListable } from "@/lib/woocommerce";
// Hiding unshippable products, added 2026-09-06. Freight needs a weight and all
// three dimensions; without them the WHOLE cart is unquotable, not just the line.
describe("hiding what cannot be shipped", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  const p = (over: Record<string, unknown> = {}) => ({
    sku: "MTEST01",
    weight: "18",
    dimensions: { length: "45", width: "45", height: "37" },
    ...over,
  });

  // The flag is off by default because hiding also removes the quote flow, which
  // is a working sales path for exactly these products.
  it("lists an unmeasured product when the flag is off", () => {
    delete process.env.HIDE_UNSHIPPABLE;
    expect(filterListable([p({ weight: "", dimensions: {} })])).toHaveLength(1);
  });

  it("hides it when the flag is on", () => {
    process.env.HIDE_UNSHIPPABLE = "true";
    expect(filterListable([p({ weight: "", dimensions: {} })])).toHaveLength(0);
  });

  it("keeps a fully measured product either way", () => {
    process.env.HIDE_UNSHIPPABLE = "true";
    expect(filterListable([p()])).toHaveLength(1);
  });

  // A weight with no carton is not shippable — the C2 rower's case.
  it("hides a product with a weight but no dimensions", () => {
    process.env.HIDE_UNSHIPPABLE = "true";
    expect(filterListable([p({ dimensions: {} })])).toHaveLength(0);
  });

  // 2440cm is 24 metres. A number nobody believes is not a measurement.
  it("hides a product whose carton could not be real", () => {
    process.env.HIDE_UNSHIPPABLE = "true";
    expect(
      filterListable([p({ dimensions: { length: "2440", width: "610", height: "40" } })])
    ).toHaveLength(0);
  });
});
