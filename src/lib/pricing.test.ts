import { describe, it, expect } from "vitest";
import { formatPrice, getBundleFromPrice, getPricing, getPriceValue } from "@/lib/woocommerce";
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

describe("Concept2 aliases", () => {
  // The range is coded three ways: named "C2 …", SKU'd SC…, and C2… in the ERP.
  // Without these the three ergs fall back to the WooCommerce RRP and undersell
  // by $330 / $330 / $88.
  it("maps the WooCommerce SC SKUs to the Unleashed C2 codes", () => {
    expect(skuAliases["SCRWAR04"]).toBe("C2ROWERG");
    expect(skuAliases["SCSTAR03"]).toBe("C2SKIERG");
    expect(skuAliases["SCSTACC04"]).toBe("C2SKIERGFS");
  });

  it("prices a C2 erg from the ERP, not the web RRP", () => {
    const map = { C2ROWERG: { price: 1705, stock: 0 } };
    const e = enrich({ sku: "SCRWAR04", regular_price: "1250", stock_status: "instock" }, map);
    expect(e.priceValue).toBe(1705);
    expect(e.source).toBe("unleashed");
  });
});

describe("bundle pricing", () => {
  const bundle = (min?: string, priceMin?: string) => ({
    type: "bundle",
    bundle_price: {
      price: { min: { incl_tax: priceMin ?? "78.38" } },
      regular_price: min === undefined ? undefined : { min: { incl_tax: min } },
    },
  });

  // regular_price, not price: `price` is the field the wholesale plugin distorts.
  it("takes the minimum from regular_price, not price", () => {
    expect(getBundleFromPrice(bundle("110"))).toBe(110);
  });

  it("is already GST-inclusive, so it is not multiplied again", () => {
    expect(getBundleFromPrice(bundle("249"))).toBe(249);
  });

  it("ignores non-bundles", () => {
    expect(getBundleFromPrice({ type: "simple", bundle_price: { regular_price: { min: { incl_tax: "99" } } } })).toBeNull();
    expect(getBundleFromPrice({ type: "variable" })).toBeNull();
  });

  // A bundle with no usable figure must fall through to the old behaviour
  // ("Contact for pricing") rather than render "From $0.00".
  it("returns null when there is no usable minimum", () => {
    expect(getBundleFromPrice(bundle(undefined))).toBeNull();
    expect(getBundleFromPrice(bundle("0"))).toBeNull();
    expect(getBundleFromPrice({ type: "bundle" })).toBeNull();
  });
});

describe("a bundle is priced for display, not for sale", () => {
  // A bundle is a configurable range and the site has no configurator, so the
  // minimum is a guide price. canPay requires every cart item to be above zero,
  // so a real priceValue here would make a whole range card-payable at the cost
  // of its cheapest item.
  //
  // The fixture is a REVL Studio Kit, a GENUINE multi-item package. It has to
  // be: most "-GROUP" bundles are sized ranges with a variable twin and are
  // now priced off their variations instead — see the next block.
  it("keeps priceValue at 0 so bundles stay on the quote flow", async () => {
    const { enrichCard } = await import("@/lib/unleashed");
    const card = await enrichCard(
      {
        type: "bundle",
        sku: "RKST3C01",
        stock_status: "onbackorder",
        bundle_price: { regular_price: { min: { incl_tax: "110" } } },
      } as never,
      {}
    );
    expect(card.priceLabel).toBe("From $110.00");
    expect(card.priceValue).toBe(0);
  });
});

describe("a sized range is priced off the ERP, not off its bundle record", () => {
  // The Urethane Fixed Barbells are the pair getBundleFromPrice documents: the
  // WooCommerce bundle minimum ($110) disagreed with the range's own cheapest
  // size, and it is the range the shopper now picks from. One source, the ERP.
  const erp = {
    MWBBFUR01: { price: 90, stock: 2, name: "Fixed PU Straight Barbell - 10kg", brand: "MK", sellable: true },
    MWBBFUR03: { price: 150, stock: 0, name: "Fixed PU Straight Barbell - 15kg", brand: "MK", sellable: true },
  };

  it("shows the cheapest size, and a real priceValue the price filter can use", async () => {
    const { enrichCard } = await import("@/lib/unleashed");
    const card = await enrichCard(
      {
        type: "bundle",
        sku: "MWBBFUR-GROUP",
        stock_status: "onbackorder",
        bundle_price: { regular_price: { min: { incl_tax: "110" } } },
      } as never,
      erp
    );
    expect(card.priceLabel).toBe("From $90.00");
    expect(card.priceValue).toBe(90);
    expect(card.source).toBe("unleashed");
    // In stock because one size is, even though the WooCommerce record says
    // backorder — the ERP is what knows.
    expect(card.inStock).toBe(true);
  });

  it("falls back to the bundle minimum when the ERP has no range", async () => {
    const { enrichCard } = await import("@/lib/unleashed");
    const card = await enrichCard(
      {
        type: "bundle",
        sku: "MWBBFUR-GROUP",
        stock_status: "instock",
        bundle_price: { regular_price: { min: { incl_tax: "110" } } },
      } as never,
      {}
    );
    expect(card.priceLabel).toBe("From $110.00");
    expect(card.priceValue).toBe(0);
  });
});
