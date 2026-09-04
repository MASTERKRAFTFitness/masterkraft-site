import { describe, expect, it } from "vitest";
import {
  filterListable,
  filterSearchable,
  isPortalOnlyBrand,
  isPublicSiteSku,
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
    // Real-shaped codes: both have to clear the public-site allowlist, or this
    // asserts the brand rule instead of the visibility rule it is named for.
    const items = [p("MAAA0001", "catalog"), p("MAAA0002", "search")];
    expect(filterListable(items).map((i) => i.sku)).toEqual(["MAAA0001"]); // search-only is not listed
    expect(filterSearchable(items).map((i) => i.sku)).toEqual(["MAAA0002"]); // catalog-only is not searched
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

describe("what may have a page on the public site", () => {
  it("keeps the portal brands off it — Snap (S), Fernwood (F), REVL (R)", () => {
    expect(isPortalOnlyBrand("SEFRDB13")).toBe(true); // Snap dumbbell rack
    expect(isPortalOnlyBrand("FAAAU01")).toBe(true);
    expect(isPortalOnlyBrand("RKST3C01")).toBe(true); // REVL Studio Kit
  });

  // The REVL range is not just the products NAMED "REVL ...". Most of it is
  // REVL-branded builds of lines we sell publicly, under the same names, one per
  // Snap equivalent — those are the ones that competed with our own pages.
  it("excludes the REVL builds that share our own product names", () => {
    for (const sku of ["RBCTMA01", "RWBBOL02", "RMDBRH-GROUP", "RMWAARM-GROUP"]) {
      expect(isPortalOnlyBrand(sku)).toBe(true);
    }
  });

  // Named "C2", SKU'd "SC", coded "C2*" in Unleashed. A range MasterKraft
  // distributes, kept on the site by decision 2026-08-20.
  it("keeps the Concept2 range, whose SKUs start SC", () => {
    expect(isPortalOnlyBrand("SCRWAR04")).toBe(false);
    expect(isPortalOnlyBrand("SCSTAR03")).toBe(false);
    expect(isPortalOnlyBrand("SCSTACC04")).toBe(false);
  });

  it("leaves MasterKraft, unbranded and clearance stock alone", () => {
    expect(isPortalOnlyBrand("MMDBRH-GROUP")).toBe(false);
    expect(isPortalOnlyBrand("NBWBFW01")).toBe(false);
    expect(isPortalOnlyBrand("AWWPCP01")).toBe(false); // A = third-party clearance
    expect(isPortalOnlyBrand(undefined)).toBe(false);
  });

  // A code we do not recognise is not a portal brand, it is unknown. It still
  // gets no page — that is the allowlist's job, not this one's.
  it("does not call an unknown prefix a portal brand", () => {
    expect(isPortalOnlyBrand("ZZNEW001")).toBe(false);
    expect(isPublicSiteSku("ZZNEW001")).toBe(false);
  });

  // Clearance runs with brandFilter: false, so this is the only thing stopping a
  // Snap or Fernwood item listed there from being served.
  it("drops them even where the brand filter is off", () => {
    // AWWPCP01 is real, currently-served clearance stock: A-prefixed, not retired.
    const items = [{ sku: "SEFRDB13" }, { sku: "AWWPCP01" }, { sku: "SCRWAR04" }];
    expect(filterListable(items).map((i) => i.sku)).toEqual(["AWWPCP01", "SCRWAR04"]);
  });

  // THE POINT OF THE ALLOWLIST. A denylist let REVL onto the site for months
  // because nobody added R to it. Gold's and Jetts are coming on the same
  // arrangement, so an unknown prefix must be OFF the public site by default —
  // otherwise their codes are public from the day they land.
  it("keeps a brand nobody has heard of yet off the site by default", () => {
    for (const sku of ["GAACU01", "JBCTMA01", "ZZNEW001"]) {
      expect(isPublicSiteSku(sku)).toBe(false);
    }
  });

  it("still lets clearance and our own codes through", () => {
    for (const sku of ["MMDBRH-GROUP", "NBWBFW01", "SCRWAR04", "AWWPCP01"]) {
      expect(isPublicSiteSku(sku)).toBe(true);
    }
    // No SKU is not a licence to serve a page.
    expect(isPublicSiteSku(undefined)).toBe(false);
  });
});

describe("the allowlist changes nothing today", () => {
  // Inverting the rule is only safe if it serves exactly what the denylist did.
  // 220 is what the live sitemap carried after the REVL exclusion shipped, so
  // if this number moves, a real product just gained or lost a page.
  it("serves the same 220 products the denylist did", async () => {
    const { allProducts } = await import("@/lib/catalogue");
    expect(filterListable(allProducts()).length).toBe(220);
  });
});
