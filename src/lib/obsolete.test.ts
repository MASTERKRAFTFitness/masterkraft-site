import { describe, expect, it } from "vitest";
import { filterListable, filterSearchable, isObsolete } from "@/lib/woocommerce";
import { isRetiredSku } from "@/lib/obsolete";
import { skuAliases } from "@/lib/unleashed-aliases";

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

describe("obsolete products (the ERP half)", () => {
  // Real codes from the committed list: the discontinued Selectorize range.
  it("retires a product Unleashed has marked obsolete", () => {
    expect(isRetiredSku("MSLBB01")).toBe(true); // Glute Ham Bench Pro
    expect(isRetiredSku("MSBMSE01")).toBe(true); // Lat Pulldown Machine Elite
  });

  it("keeps a product that is still sold", () => {
    expect(isRetiredSku("MMDBRH-GROUP")).toBe(false);
  });

  // Many catalogue products have no ERP match at all and must keep selling.
  it("does not retire an unknown or missing SKU", () => {
    expect(isRetiredSku("NOT-A-REAL-SKU")).toBe(false);
    expect(isRetiredSku(undefined)).toBe(false);
    expect(isRetiredSku("")).toBe(false);
  });

  it("is case and whitespace insensitive", () => {
    expect(isRetiredSku("  mslbb01 ")).toBe(true);
  });

  // The catalogue and the ERP use different code schemes for the same product,
  // so a retired product must not slip through under its web SKU.
  it("resolves web SKUs through the alias map", () => {
    const aliased = Object.entries(skuAliases).find(([, code]) => isRetiredSku(code));
    if (!aliased) return; // no retired product currently has an alias
    expect(isRetiredSku(aliased[0])).toBe(true);
  });

  it("drops retired products from listings", () => {
    const items = [{ sku: "MSLBB01" }, { sku: "MMDBRH-GROUP" }];
    expect(filterListable(items).map((i) => i.sku)).toEqual(["MMDBRH-GROUP"]);
  });
});
