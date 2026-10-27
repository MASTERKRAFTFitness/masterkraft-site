import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadPromotionLabels, parsePromotionCsv } from "@/lib/merchant-promotion";

describe("the promotion list", () => {
  it("reads id,custom_label_4 rows and skips blanks", () => {
    expect(parsePromotionCsv("id,custom_label_4\nmbrmrl03,ads-national\r\n\nMWWPCB01,\n")).toEqual({
      MBRMRL03: "ads-national",
    });
  });

  it("returns nothing for a file without the expected columns", () => {
    expect(parsePromotionCsv("sku,label\nA,b\n")).toEqual({});
  });

  // The published file is what Merchant Center and the feed both read. If its
  // header drifts, every label silently disappears from the feed.
  it("parses the published file", () => {
    const rows = readFileSync("public/merchant-center-promotion.csv", "utf8").trim().split("\n").length - 1;
    const labels = loadPromotionLabels();
    expect(Object.keys(labels)).toHaveLength(rows);
    expect(Object.values(labels).every((l) => l.startsWith("ads-"))).toBe(true);
  });
});
