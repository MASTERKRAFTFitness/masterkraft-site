import { describe, expect, it } from "vitest";
import { filterListable, filterSearchable, isObsolete } from "@/lib/woocommerce";
import { filterUnleashedObsolete, isObsoleteInUnleashed } from "@/lib/unleashed";

const p = (sku: string, catalog_visibility?: string) => ({ sku, catalog_visibility });

describe("obsolete products", () => {
  it("treats WooCommerce 'hidden' as obsolete", () => {
    expect(isObsolete(p("MMDBRH", "hidden"))).toBe(true);
    expect(isObsolete(p("MMDBRH-GROUP", "visible"))).toBe(false);
  });

  // catalog_visibility must be asked for in _fields; a caller that forgets it
  // should show too much rather than silently empty every listing.
  it("treats a missing visibility as visible", () => {
    expect(isObsolete(p("MMDBRH"))).toBe(false);
    expect(filterListable([p("MMDBRH")])).toHaveLength(1);
  });

  it("drops hidden products from listings and from search", () => {
    const items = [p("MMDBRH", "hidden"), p("MMDBRH-GROUP", "visible")];
    expect(filterListable(items).map((i) => i.sku)).toEqual(["MMDBRH-GROUP"]);
    expect(filterSearchable(items).map((i) => i.sku)).toEqual(["MMDBRH-GROUP"]);
  });

  it("honours the two one-sided WooCommerce visibilities", () => {
    const items = [p("A", "catalog"), p("B", "search")];
    expect(filterListable(items).map((i) => i.sku)).toEqual(["A"]); // search-only is not listed
    expect(filterSearchable(items).map((i) => i.sku)).toEqual(["B"]); // catalog-only is not searched
  });
});

describe("obsolete products (Unleashed half)", () => {
  const map = {
    MSLBB01: { price: 100, stock: 0, obsolete: true }, // retired in the ERP
    MMDBRH: { price: 50, stock: 4, obsolete: false },
    MFATSY01: { price: 80, stock: 2 }, // no flag recorded
  };

  it("retires a product Unleashed marks obsolete", () => {
    expect(isObsoleteInUnleashed(map, "MSLBB01")).toBe(true);
    expect(isObsoleteInUnleashed(map, "MMDBRH")).toBe(false);
  });

  it("only an explicit true retires a product", () => {
    expect(isObsoleteInUnleashed(map, "MFATSY01")).toBe(false);
  });

  // Plenty of catalogue products have no Unleashed match at all and must keep
  // selling, so an unknown SKU is never treated as obsolete.
  it("keeps products with no Unleashed match", () => {
    expect(isObsoleteInUnleashed(map, "MNOTINERP")).toBe(false);
    expect(isObsoleteInUnleashed(map, undefined)).toBe(false);
  });

  it("is case-insensitive on the SKU", () => {
    expect(isObsoleteInUnleashed(map, "mslbb01")).toBe(true);
  });

  it("filters a product list", () => {
    const items = [{ sku: "MSLBB01" }, { sku: "MMDBRH" }, { sku: "MNOTINERP" }];
    expect(filterUnleashedObsolete(items, map).map((i) => i.sku)).toEqual([
      "MMDBRH",
      "MNOTINERP",
    ]);
  });
});
