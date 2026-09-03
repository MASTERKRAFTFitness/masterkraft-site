import { describe, expect, it } from "vitest";
import {
  filterListable,
  filterSearchable,
  isForeignBrandSku,
  isObsolete,
} from "@/lib/woocommerce";
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

describe("other companies' branded ranges", () => {
  it("excludes Snap (S), Fernwood (F) and REVL (R)", () => {
    expect(isForeignBrandSku("SEFRDB13")).toBe(true); // Snap dumbbell rack
    expect(isForeignBrandSku("FAAAU01")).toBe(true);
    expect(isForeignBrandSku("RKST3C01")).toBe(true); // REVL Studio Kit
  });

  // The REVL range is not just the products NAMED "REVL ...". Most of it is
  // own-brand copies of lines we sell under the same names, one per Snap
  // equivalent, and those are the ones worth keeping out of the index.
  it("excludes the REVL copies that share our own product names", () => {
    for (const sku of ["RBCTMA01", "RWBBOL02", "RMDBRH-GROUP", "RMWAARM-GROUP"]) {
      expect(isForeignBrandSku(sku)).toBe(true);
    }
  });

  // Named "C2", SKU'd "SC", coded "C2*" in Unleashed. A range MasterKraft
  // distributes, kept on the site by decision 2026-08-20.
  it("keeps the Concept2 range, whose SKUs start SC", () => {
    expect(isForeignBrandSku("SCRWAR04")).toBe(false);
    expect(isForeignBrandSku("SCSTAR03")).toBe(false);
    expect(isForeignBrandSku("SCSTACC04")).toBe(false);
  });

  it("leaves MasterKraft, unbranded and clearance stock alone", () => {
    expect(isForeignBrandSku("MMDBRH-GROUP")).toBe(false);
    expect(isForeignBrandSku("NBWBFW01")).toBe(false);
    expect(isForeignBrandSku("AWWPCP01")).toBe(false); // A = third-party clearance
    expect(isForeignBrandSku(undefined)).toBe(false);
  });

  // Clearance runs with brandFilter: false, so this is the only thing stopping a
  // Snap or Fernwood item listed there from being served.
  it("drops them even where the brand filter is off", () => {
    // AWWPCP01 is real, currently-served clearance stock: A-prefixed, not retired.
    const items = [{ sku: "SEFRDB13" }, { sku: "AWWPCP01" }, { sku: "SCRWAR04" }];
    expect(filterListable(items).map((i) => i.sku)).toEqual(["AWWPCP01", "SCRWAR04"]);
  });
});
