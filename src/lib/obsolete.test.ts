import { describe, expect, it } from "vitest";
import { filterListable, filterSearchable, isObsolete } from "@/lib/woocommerce";

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
