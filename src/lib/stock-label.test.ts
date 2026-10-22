import { describe, expect, it } from "vitest";
import { CHINA_LEAD_TIME, stockLabel } from "./stock-label";

describe("stockLabel", () => {
  it("counts Melbourne stock as in stock, whatever China holds", () => {
    expect(stockLabel(4, 20)).toEqual({ text: "4 in stock", optionSuffix: "" });
  });

  it("gives China-only stock the lead time, not 'in stock'", () => {
    expect(stockLabel(0, 12).text).toBe(`Overseas stock · ships in ${CHINA_LEAD_TIME}`);
    expect(stockLabel(0, 12).optionSuffix).toBe(` (ships in ${CHINA_LEAD_TIME})`);
  });

  it("is made to order with neither", () => {
    expect(stockLabel(0, 0)).toEqual({ text: "Made to order", optionSuffix: " (made to order)" });
    expect(stockLabel(undefined, undefined).text).toBe("Made to order");
  });

  it("keeps the snapshot's quantity-less 'In stock'", () => {
    expect(stockLabel(undefined, undefined, true).text).toBe("In stock");
  });
});
