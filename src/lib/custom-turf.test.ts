import { describe, expect, it } from "vitest";
import {
  describeCustomTurf,
  formatMetres,
  isQuoteOnlyCode,
  parseTurfMetres,
  priceCustomTurf,
  priceTurfSize,
  turfLineComment,
  turfSizeLabel,
  validTurfMetres,
} from "./custom-turf";

const price = (w: unknown, l: unknown) => {
  const q = priceCustomTurf(w, l);
  if (!q) throw new Error(`expected ${w} x ${l} to price`);
  return q;
};

describe("priceCustomTurf", () => {
  it("charges $75/m² plus the $500 custom fee, ex GST", () => {
    const q = price(2, 10);
    expect(q.areaM2).toBe(20);
    expect(q.turfExGst).toBe(1500);
    expect(q.totalExGst).toBe(2000);
    expect(q.roundedUp).toBe(false);
    expect(q.gst).toBe(200);
    expect(q.totalIncGst).toBe(2200);
  });

  it("prices the 1m x 1m piece", () => {
    const q = price(1, 1);
    expect(q.totalExGst).toBe(575);
    expect(q.totalIncGst).toBe(632.5);
  });

  it("takes any size exactly as typed and rounds only the price, up to the dollar", () => {
    const q = price(2.35, 10.8);
    expect(q.widthM).toBe(2.35);
    expect(q.lengthM).toBe(10.8);
    expect(q.areaM2).toBe(25.38);
    expect(q.unroundedExGst).toBeCloseTo(2403.5, 9);
    expect(q.totalExGst).toBe(2404);
    expect(q.roundedUp).toBe(true);
    expect(q.gst).toBe(240.4);
    expect(q.totalIncGst).toBe(2644.4);
  });

  it("leaves a price that is already whole dollars alone", () => {
    // 1.2 x 1.5 = 1.8 m² x $75 = $135 exactly: no float noise adds a dollar.
    const q = price(1.2, 1.5);
    expect(q.totalExGst).toBe(635);
    expect(q.roundedUp).toBe(false);
    // and a millimetre size whose area x 75 lands on a whole number
    expect(price(0.4, 0.1).totalExGst).toBe(503);
  });

  it("rounds a tiny fraction up, never down", () => {
    // 1.001 m² x $75 = $75.075, so $575.075 becomes $576
    expect(price(1.001, 1).totalExGst).toBe(576);
  });

  it("refuses sizes it cannot price rather than snapping them", () => {
    expect(priceCustomTurf(2.3456, 10)).toBeNull(); // more than 3 decimals
    expect(priceCustomTurf(0.05, 10)).toBeNull(); // under 0.1 m
    expect(priceCustomTurf(10.01, 10)).toBeNull(); // wider than 10 m
    expect(priceCustomTurf(2, 50.001)).toBeNull(); // longer than 50 m
    expect(priceCustomTurf("2", 10)).toBeNull(); // a string, not a number
    expect(priceCustomTurf(Number.NaN, 10)).toBeNull();
    expect(priceCustomTurf(2, Infinity)).toBeNull();
    expect(priceCustomTurf(0, -3)).toBeNull();
  });

  it("accepts the bounds themselves", () => {
    expect(price(0.1, 0.1).totalExGst).toBe(501); // 0.01 m² x 75 = 0.75 + 500
    expect(price(10, 50).totalExGst).toBe(38000);
  });
});

describe("validTurfMetres / parseTurfMetres", () => {
  it("keeps millimetres and refuses anything finer", () => {
    expect(validTurfMetres(2.355, 10)).toBe(2.355);
    expect(validTurfMetres(2.3555, 10)).toBeNull();
  });

  it("reads what was typed in the box", () => {
    expect(parseTurfMetres(" 2.35 ", 10)).toBe(2.35);
    expect(parseTurfMetres(".5", 10)).toBe(0.5);
    expect(parseTurfMetres("3.", 10)).toBe(3);
    expect(parseTurfMetres("", 10)).toBeNull();
    expect(parseTurfMetres("abc", 10)).toBeNull();
    expect(parseTurfMetres("1e1", 10)).toBeNull();
    expect(parseTurfMetres("-2", 10)).toBeNull();
    expect(parseTurfMetres("2.3456", 10)).toBeNull();
    expect(parseTurfMetres("10.5", 10)).toBeNull();
  });
});

describe("priceTurfSize", () => {
  it("prices a size from a request and is POA without one", () => {
    expect(priceTurfSize({ widthM: 2.35, lengthM: 10.8 })?.totalExGst).toBe(2404);
    expect(priceTurfSize(undefined)).toBeNull();
    expect(priceTurfSize({ widthM: "2", lengthM: 10 })).toBeNull();
  });
});

describe("labels", () => {
  it("shows dimensions as typed, trailing zeros trimmed", () => {
    expect(formatMetres(10.8)).toBe("10.8");
    expect(formatMetres(2)).toBe("2");
    expect(formatMetres(25.380000000000003)).toBe("25.38");
    expect(formatMetres(1.234567)).toBe("1.235");
    expect(turfSizeLabel(price(2.35, 10.8))).toBe("2.35m x 10.8m (25.38 m²)");
  });

  it("reads as one line for the team", () => {
    expect(describeCustomTurf(price(3, 12))).toBe(
      "Custom Artificial Turf 3m x 12m (36 m²), incl. custom design, print, cut & production"
    );
  });

  it("gives the sales order line its size", () => {
    expect(turfLineComment(price(2.35, 10.8))).toBe("Custom Turf size: 2.35m x 10.8m (25.38 m²)");
  });
});

describe("isQuoteOnlyCode", () => {
  it("covers custom turf (MK and Fernwood) and nothing else", () => {
    expect(isQuoteOnlyCode("MFATCT01")).toBe(true);
    expect(isQuoteOnlyCode(" mfatct01")).toBe(true);
    expect(isQuoteOnlyCode("FFATCT01")).toBe(true);
    expect(isQuoteOnlyCode("MFATSY04")).toBe(false);
    expect(isQuoteOnlyCode(undefined)).toBe(false);
  });
});
