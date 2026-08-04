import { describe, it, expect } from "vitest";
import { formatPrice, getPricing, getPriceValue } from "@/lib/woocommerce";
import { lookupBySku, enrich, type UnleashedEntry } from "@/lib/unleashed";
import { skuAliases } from "@/lib/unleashed-aliases";

describe("formatPrice", () => {
  it("shows 'Contact for pricing' for zero/invalid", () => {
    expect(formatPrice(0)).toBe("Contact for pricing");
    expect(formatPrice(NaN)).toBe("Contact for pricing");
    expect(formatPrice("")).toBe("Contact for pricing");
  });
  it("formats AUD with thousands separators", () => {
    expect(formatPrice(100)).toBe("$100.00");
    expect(formatPrice("2699")).toBe("$2,699.00");
  });
});

describe("getPriceValue (ex-GST → inc-GST ×1.1)", () => {
  it("uses regular_price and adds GST", () => {
    expect(getPriceValue({ regular_price: "100" })).toBe(110);
    expect(getPriceValue({ regular_price: "708.18" })).toBe(779); // 708.18 × 1.1 = 778.998 → 779.00
  });
  it("prefers a valid sale price below regular", () => {
    expect(getPriceValue({ regular_price: "100", sale_price: "80" })).toBe(88);
  });
  it("ignores a sale price that is not below regular", () => {
    expect(getPriceValue({ regular_price: "100", sale_price: "120" })).toBe(110);
  });
  it("falls back to price when regular is missing", () => {
    expect(getPriceValue({ price: "50" })).toBe(55);
  });
  it("returns 0 (POA) when there is no price", () => {
    expect(getPriceValue({})).toBe(0);
    expect(getPriceValue({ regular_price: "0" })).toBe(0);
  });
});

describe("getPricing labels", () => {
  it("returns a plain price label", () => {
    expect(getPricing({ regular_price: "100" })).toEqual({ price: "$110.00" });
  });
  it("returns a compareAt when on sale", () => {
    expect(getPricing({ regular_price: "100", sale_price: "80" })).toEqual({
      price: "$88.00",
      compareAt: "$110.00",
    });
  });
  it("returns 'Contact for pricing' for POA", () => {
    expect(getPricing({}).price).toBe("Contact for pricing");
  });
});

describe("lookupBySku", () => {
  const map: Record<string, UnleashedEntry> = { ABC01: { price: 10, stock: 2 } };
  it("matches case-insensitively", () => {
    expect(lookupBySku(map, "abc01")).toEqual({ price: 10, stock: 2 });
  });
  it("returns null for misses / undefined", () => {
    expect(lookupBySku(map, "nope")).toBeNull();
    expect(lookupBySku(map, undefined)).toBeNull();
  });
  it("resolves a WC sku through the alias map to the Unleashed code", () => {
    const [wcSku, unleashedCode] = Object.entries(skuAliases)[0];
    const aliasMap: Record<string, UnleashedEntry> = { [unleashedCode]: { price: 99, stock: 4 } };
    expect(lookupBySku(aliasMap, wcSku)).toEqual({ price: 99, stock: 4 });
  });
});

describe("enrich", () => {
  it("prefers Unleashed price + stock when matched", () => {
    const e = enrich({ sku: "ABC01", regular_price: "999" }, { ABC01: { price: 215, stock: 5 } });
    expect(e.source).toBe("unleashed");
    expect(e.priceValue).toBe(215);
    expect(e.priceLabel).toBe("$215.00");
    expect(e.inStock).toBe(true);
    expect(e.stockQty).toBe(5);
  });
  it("falls back to WooCommerce RRP when no Unleashed match", () => {
    const e = enrich({ sku: "XYZ", regular_price: "100", stock_status: "instock" }, {});
    expect(e.source).toBe("website");
    expect(e.priceValue).toBe(110);
    expect(e.inStock).toBe(true);
  });
  it("is POA (0) with no price anywhere", () => {
    const e = enrich({ sku: "XYZ" }, {});
    expect(e.priceValue).toBe(0);
    expect(e.priceLabel).toBe("Contact for pricing");
  });
});
