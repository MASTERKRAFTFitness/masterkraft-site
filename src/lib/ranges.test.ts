// Ranges are built from Unleashed, so these run against a FIXTURE ERP map, not
// the network and not the WooCommerce snapshot's variations. The fixture mirrors
// the shapes the real catalogue actually contains, including its two messes.
import { describe, expect, it } from "vitest";
import { getRange } from "@/lib/ranges";
import type { UnleashedMap } from "@/lib/unleashed";
import type { WcProduct } from "@/lib/woocommerce";

const p = (sku: string, id = 1): WcProduct => ({ id, sku, name: sku, slug: sku } as WcProduct);

function erp(
  rows: [code: string, name: string, price: number, brand?: string][]
): UnleashedMap {
  const map: UnleashedMap = {};
  for (const [code, name, price, brand = "MK"] of rows) {
    map[code] = { price, stock: 1, name, image: `${code}.jpg`, brand, sellable: true };
  }
  return map;
}

describe("ranges come from Unleashed", () => {
  it("groups on the name before \" - \", and orders smallest first", () => {
    const map = erp([
      ["MMDBRH12", "Rubber Hex Dumbbell - 10kg", 50],
      ["MMDBRH01", "Rubber Hex Dumbbell - 1kg", 5],
      ["MMDBRH03", "Rubber Hex Dumbbell - 2.5kg", 12.5],
    ]);
    const r = getRange(p("MMDBRH-GROUP"), map)!;
    expect(r.name).toBe("Rubber Hex Dumbbell");
    expect(r.sizes.map((s) => s.label)).toEqual(["1kg", "2.5kg", "10kg"]);
    expect(r.sizes[0].code).toBe("MMDBRH01");
    expect(r.sizes[0].image).toBe("MMDBRH01.jpg");
  });

  it("keeps one brand's range out of another's", () => {
    // "Rubber Hex Dumbbell" is 26 products on MK and another 26 each on SNAP,
    // NO BRAND, Air Locker and Hyper Health. Two brands in one dropdown means
    // every weight twice, at two prices.
    const map = erp([
      ["MMDBRH01", "Rubber Hex Dumbbell - 1kg", 5, "MK"],
      ["MMDBRH02", "Rubber Hex Dumbbell - 2kg", 10, "MK"],
      ["MMDBRH03", "Rubber Hex Dumbbell - 2.5kg", 4, "NO BRAND"],
    ]);
    const r = getRange(p("MMDBRH-GROUP"), map)!;
    expect(r.brand).toBe("MK");
    expect(r.sizes.map((s) => s.code)).toEqual(["MMDBRH01", "MMDBRH02"]);
  });

  it("never merges two products that share a code stem", () => {
    // MWBBFUR really does hold a curl barbell and a straight barbell, both
    // running 10kg and 15kg. Merged, the dropdown shows "10kg" twice.
    const map = erp([
      ["MWBBFUR01", "Fixed PU Straight Barbell - 10kg", 100],
      ["MWBBFUR03", "Fixed PU Straight Barbell - 15kg", 150],
      ["MWBBFUR20", "Fixed PU Curl Barbell - 10kg", 110],
      ["MWBBFUR21", "Fixed PU Curl Barbell - 15kg", 160],
    ]);
    const r = getRange(p("MWBBFUR-GROUP"), map)!;
    expect(r.sizes).toHaveLength(2);
    expect(new Set(r.sizes.map((s) => s.label)).size).toBe(2);
  });

  it("does not merge two products that merely have different size vocabularies", () => {
    // RBRPPO holds the Power Bands (13/21/32mm) and the Micro Bands (Heavy,
    // X Heavy). Their sizes never collide, and they are still two products.
    const map = erp([
      ["RBRPPO01", "Power Bands - 13mm (Red)", 12, "REVL"],
      ["RBRPPO02", "Power Bands - 21mm (Grey)", 20, "REVL"],
      ["RBRPPOM01", "Micro Bands - Heavy (Black)", 8, "REVL"],
    ]);
    const r = getRange(p("RBRPPO-GROUP"), map)!;
    expect(r.name).toBe("Power Bands");
    expect(r.sizes.map((s) => s.label)).toEqual(["13mm (Red)", "21mm (Grey)"]);
  });

  it("leaves a straggler from a half-finished ERP rename out, rather than guessing", () => {
    // MMDBUR is 28 products called "PU Dumbbells (Pair)" and one still carrying
    // the old name. Pulling it in would mean merging on a rule that also merges
    // the Micro Bands into the Power Bands. The fix is one field in Unleashed;
    // `npm run report:ranges` is what surfaces it.
    const map = erp([
      ["MMDBUR01", "PU Dumbbells (Pair) - 10kg", 176],
      ["MMDBUR02", "PU Dumbbells (Pair) - 12.5kg", 220],
      ["MMDBUR19", "Urethane Fixed Dumbbells (Pair) - 7.5kg", 130],
    ]);
    const r = getRange(p("MMDBUR-GROUP"), map)!;
    expect(r.name).toBe("PU Dumbbells (Pair)");
    expect(r.sizes.map((s) => s.label)).toEqual(["10kg", "12.5kg"]);
  });

  it("is not a range when there is nothing to choose between", () => {
    expect(getRange(p("RKST3C01"), erp([]))).toBeNull();
    expect(
      getRange(p("MMDBRH-GROUP"), erp([["MMDBRH01", "Rubber Hex Dumbbell - 1kg", 5]]))
    ).toBeNull();
    // A product with no size suffix is a product, not a range.
    expect(getRange(p("MBCTMA01"), erp([["MBCTMA01", "Multi Adjustable Bench", 900]]))).toBeNull();
  });

  it("ignores what the ERP will not sell", () => {
    const map = erp([
      ["MMDBRH01", "Rubber Hex Dumbbell - 1kg", 5],
      ["MMDBRH02", "Rubber Hex Dumbbell - 2kg", 10],
      ["MMDBRH03", "Rubber Hex Dumbbell - 2.5kg", 12.5],
    ]);
    map.MMDBRH03.sellable = false;
    expect(getRange(p("MMDBRH-GROUP"), map)!.sizes.map((s) => s.code)).toEqual([
      "MMDBRH01",
      "MMDBRH02",
    ]);
  });
});
