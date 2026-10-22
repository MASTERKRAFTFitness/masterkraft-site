import { describe, expect, it } from "vitest";
import {
  BRANDING_LINES,
  CLUB_DISCOUNT,
  CLUB_RUNS,
  METHODS_IN_USE,
  TRADE_DISCOUNT,
  feeShareCovered,
  formatAud,
  fullRangeFee,
  incGst,
} from "./custom-branding";

describe("custom branding matrix", () => {
  it("every line has a positive fee and size count", () => {
    for (const line of BRANDING_LINES) {
      expect(line.fee, line.product).toBeGreaterThan(0);
      expect(line.sizes, line.product).toBeGreaterThan(0);
    }
  });

  it("product names are unique (they key the table rows)", () => {
    const names = BRANDING_LINES.map((l) => l.product);
    expect(new Set(names).size).toBe(names.length);
  });

  it("matches the full-range totals on the sales sheet", () => {
    const total = (p: string) => fullRangeFee(BRANDING_LINES.find((l) => l.product.startsWith(p))!);
    expect(total("Competition bumper")).toBe(625);
    expect(total("Urethane fixed dumbbells")).toBe(1350);
    expect(total("Premium rubber hex")).toBe(1950);
  });

  it("lists only methods the matrix uses", () => {
    expect(new Set(METHODS_IN_USE)).toEqual(new Set(BRANDING_LINES.map((l) => l.method)));
  });

  it("applies the 13 Oct fee rule on order value ex GST", () => {
    expect(feeShareCovered(20_000)).toBe(0);
    expect(feeShareCovered(20_001)).toBe(0.5);
    expect(feeShareCovered(50_000)).toBe(0.5);
    expect(feeShareCovered(50_001)).toBe(1);
  });

  it("matches the sheet's 20kg bumper example", () => {
    expect(225 * (1 - TRADE_DISCOUNT)).toBeCloseTo(202.5, 2);
    expect(225 * (1 - CLUB_DISCOUNT)).toBeCloseTo(191.25, 2);
  });

  it("has four Buying Club runs, the first cut-off 13 Nov 2026", () => {
    expect(CLUB_RUNS).toHaveLength(4);
    expect(CLUB_RUNS[0].cutoff).toBe("Fri 13 Nov 2026");
  });

  it("adds GST without float noise", () => {
    expect(incGst(125)).toBe(137.5);
    expect(incGst(50)).toBe(55);
    expect(formatAud(137.5)).toBe("$137.50");
    expect(formatAud(1950)).toBe("$1,950");
  });
});
