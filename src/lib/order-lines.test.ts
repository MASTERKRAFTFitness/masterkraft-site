// Re-pricing a cart before it is charged. These lock the rules that decide what
// a customer pays, so a change that quietly alters one should fail here first.
import { describe, expect, it, vi } from "vitest";
import type { UnleashedMap } from "@/lib/unleashed";

const erp: UnleashedMap = {
  MMDBRH12: { price: 55, stock: 4, name: "Rubber Hex Dumbbell - 10kg", sellable: true },
  MBCTMA01: { price: 900, stock: 1, name: "Multi Adjustable Bench", sellable: true },
  MNONAME1: { price: 40, stock: 1, sellable: true }, // priced, but no name
  MPOA0001: { price: 0, stock: 0, name: "Custom Rig", sellable: true },
};

// BOTH, because the money path deliberately calls the live reader rather than
// the mirror (2026-09-18). Stubbing only getUnleashedMap would let the real
// getUnleashedMapLive run and these would test nothing.
vi.mock("@/lib/unleashed", async (orig) => ({
  ...(await orig<typeof import("@/lib/unleashed")>()),
  getUnleashedMap: async () => erp,
  getUnleashedMapLive: async () => erp,
}));

// THE WOOCOMMERCE STUBS ARE GONE, 2026-09-18, and so is every
// `expect(getProductById).not.toHaveBeenCalled()` they existed for.
//
// getProductById and getVariation were deleted from lib/woocommerce.ts today.
// The stubs spread the real module and added those two names back, so the
// assertions were testing a mock that no longer resembled the code — and once
// the functions are gone, "was not called" can only ever pass. A vacuous test
// that reads like a guarantee is worse than no test.
//
// What replaces them is structural, and cannot go quietly vacuous: the module
// must not import from the WooCommerce layer at all. Same shape as the guard in
// agent/public-tools.test.ts.
const { resolveOrderLines } = await import("@/lib/order-lines");

describe("the re-pricing path has no WooCommerce dependency", () => {
  it("does not import the WooCommerce layer", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("src/lib/order-lines.ts", "utf8")
    );
    expect(src).not.toMatch(/from "@\/lib\/woocommerce"/);
    // Call shapes, not bare names: the file's header comment names both
    // functions while explaining why they are not here, and that history is
    // worth keeping readable.
    expect(src).not.toMatch(/getProductById\(/);
    expect(src).not.toMatch(/getVariation\(/);
  });
});

describe("a cart is re-priced from the ERP", () => {
  it("prices and names a line from its ProductCode, without touching WooCommerce", async () => {
    const { lines, total, hasPoa } = await resolveOrderLines([
      { productId: 0, quantity: 2, sku: "MMDBRH12" },
    ]);
    expect(lines[0].name).toBe("Rubber Hex Dumbbell - 10kg");
    expect(lines[0].unitPrice).toBe(55); // inc-GST, as the map stores it
    expect(lines[0].sku).toBe("MMDBRH12");
    expect(total).toBe(110);
    expect(hasPoa).toBe(false);
  });

  it("resolves a size the old store never sold, which had no WooCommerce id at all", async () => {
    // productId 0 is how lib/variant-line marks exactly these. Before this they
    // could not be re-priced at all, so they could not be paid for by card.
    const { lines, total } = await resolveOrderLines([
      { productId: 0, quantity: 1, sku: "MBCTMA01" },
    ]);
    expect(lines).toHaveLength(1);
    expect(total).toBe(900);
  });

  it("still flags a price-on-application line, so the cart routes to a quote", async () => {
    const { hasPoa } = await resolveOrderLines([{ productId: 0, quantity: 1, sku: "MPOA0001" }]);
    expect(hasPoa).toBe(true);
  });

  it("rounds a mixed cart to the cent", async () => {
    const { total } = await resolveOrderLines([
      { productId: 0, quantity: 3, sku: "MMDBRH12" },
      { productId: 0, quantity: 1, sku: "MBCTMA01" },
    ]);
    expect(total).toBe(1065);
  });
});

describe("it fails closed rather than charging the wrong number", () => {
  it("throws on a code the ERP does not know, instead of falling back to WooCommerce", async () => {
    // Falling through would re-price the line from a different source than the
    // one the cart was built from — the quiet version of charging wrong.
    await expect(resolveOrderLines([{ productId: 55, quantity: 1, sku: "NOSUCH01" }])).rejects.toThrow(
      /ERP code NOSUCH01/
    );
  });

  it("throws on a coded line the ERP cannot name", async () => {
    await expect(resolveOrderLines([{ productId: 0, quantity: 1, sku: "MNONAME1" }])).rejects.toThrow(
      /no product name/
    );
  });

  it("never silently drops a line", async () => {
    await expect(resolveOrderLines([{ productId: 999, quantity: 1 }])).rejects.toThrow(
      /Unresolvable line item/
    );
  });
});

describe("a line with no ERP code is refused, not re-priced elsewhere", () => {
  // REPLACES "carts saved before this shipped still check out" (deleted
  // 2026-09-15 with the WooCommerce fallback it covered). That test asserted a
  // codeless line was priced via getProductById. It could only ever have passed
  // against a mock: WC_STORE_URL points at the storefront, so the real call
  // 404s. CartProvider also drops codeless lines at hydration, so one cannot
  // reach here from the UI. The rule now is that it is refused outright.
  it("throws, naming the missing code rather than the dead store", async () => {
    await expect(resolveOrderLines([{ productId: 12, quantity: 1 }])).rejects.toThrow(
      /product 12 has no ERP code/
    );
  });

  it("fails immediately rather than after a network timeout", async () => {
    // The failure must be immediate, not 2.5s of timing out against a host that
    // cannot answer. There is no longer a call to make — see the structural
    // guard at the top of this file — so this holds the timing, not the caller.
    const started = Date.now();
    await expect(resolveOrderLines([{ productId: 12, quantity: 1 }])).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("refuses the whole cart, not just the bad line", async () => {
    // A cart that is part-priced is the dangerous outcome: it charges for a
    // subset of what the customer thinks they are buying.
    await expect(
      resolveOrderLines([
        { productId: 0, quantity: 1, sku: "MMDBRH12" },
        { productId: 12, quantity: 1 },
      ])
    ).rejects.toThrow(/no ERP code/);
  });
});
