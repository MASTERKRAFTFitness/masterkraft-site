import { describe, expect, it } from "vitest";
import { clampMetres, describeCustomTurf, isQuoteOnlyCode, priceCustomTurf } from "./custom-turf";

describe("priceCustomTurf", () => {
  it("charges $75/m² plus the $500 custom fee, ex GST", () => {
    const q = priceCustomTurf(2, 10);
    expect(q.areaM2).toBe(20);
    expect(q.turfExGst).toBe(1500);
    expect(q.totalExGst).toBe(2000);
    expect(q.gst).toBe(200);
    expect(q.totalIncGst).toBe(2200);
  });

  it("prices the smallest piece", () => {
    const q = priceCustomTurf(1, 1);
    expect(q.totalExGst).toBe(575);
    expect(q.totalIncGst).toBe(632.5);
  });

  it("rounds to whole metres and keeps inside the pickers", () => {
    expect(priceCustomTurf(2.4, 9.6).areaM2).toBe(20);
    expect(priceCustomTurf(0, -3).areaM2).toBe(1);
    expect(priceCustomTurf(99, 999).areaM2).toBe(10 * 50);
    expect(clampMetres(Number.NaN, 10)).toBe(1);
  });
});

describe("describeCustomTurf", () => {
  it("reads as one line for the team", () => {
    expect(describeCustomTurf(priceCustomTurf(3, 12))).toBe(
      "Custom Artificial Turf 3m x 12m (36 m²), incl. custom design, print, cut & production"
    );
  });
});

describe("isQuoteOnlyCode", () => {
  it("covers custom turf and nothing else", () => {
    expect(isQuoteOnlyCode("MFATCT01")).toBe(true);
    expect(isQuoteOnlyCode(" mfatct01")).toBe(true);
    expect(isQuoteOnlyCode("MFATSY04")).toBe(false);
    expect(isQuoteOnlyCode(undefined)).toBe(false);
  });
});
