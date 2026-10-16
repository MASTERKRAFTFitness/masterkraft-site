import { describe, expect, it } from "vitest";
import { BRANDING_LINES, METHODS, formatAud, incGst } from "./custom-branding";

describe("custom branding matrix", () => {
  it("every line offers at least one method, at a positive fee", () => {
    for (const line of BRANDING_LINES) {
      const fees = Object.values(line.fees);
      expect(fees.length, line.product).toBeGreaterThan(0);
      for (const fee of fees) expect(fee, line.product).toBeGreaterThan(0);
      for (const m of Object.keys(line.fees)) expect(METHODS).toContain(m);
    }
  });

  it("product names are unique (they key the table rows)", () => {
    const names = BRANDING_LINES.map((l) => l.product);
    expect(new Set(names).size).toBe(names.length);
  });

  it("matches the 4-grip plate total on Steve's sheet", () => {
    const plates = BRANDING_LINES.find((l) => l.product.includes("4 Grip"))!;
    expect(plates.sizes * plates.fees.mold!).toBe(4550);
  });

  it("adds GST without float noise", () => {
    expect(incGst(650)).toBe(715);
    expect(incGst(125)).toBe(137.5);
    expect(incGst(50)).toBe(55);
    expect(formatAud(715)).toBe("$715");
    expect(formatAud(137.5)).toBe("$137.50");
  });
});
