// Re-pricing a cart before it is charged. These lock the rules that decide what
// a customer pays, so a change that quietly alters one should fail here first.
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { UnleashedMap } from "@/lib/unleashed";

const erp: UnleashedMap = {
  MMDBRH12: { price: 55, stock: 4, name: "Rubber Hex Dumbbell - 10kg", sellable: true },
  MBCTMA01: { price: 900, stock: 1, name: "Multi Adjustable Bench", sellable: true },
  MNONAME1: { price: 40, stock: 1, sellable: true }, // priced, but no name
  MPOA0001: { price: 0, stock: 0, name: "Custom Rig", sellable: true },
};

// The WooCommerce half is stubbed so these run offline. Since the fallback was
// deleted (2026-09-15) nothing here should call it at all, so these stubs exist
// to be asserted AGAINST — `not.toHaveBeenCalled()` is the point of them now.
const getProductById = vi.fn();
const getVariation = vi.fn();

vi.mock("@/lib/unleashed", async (orig) => ({
  ...(await orig<typeof import("@/lib/unleashed")>()),
  getUnleashedMap: async () => erp,
}));
// Spread the real module rather than replacing it: other exports are pulled in
// transitively, and stubbing the whole module breaks them.
vi.mock("@/lib/woocommerce", async (orig) => ({
  ...(await orig<typeof import("@/lib/woocommerce")>()),
  getProductById: (...a: unknown[]) => getProductById(...a),
  getVariation: (...a: unknown[]) => getVariation(...a),
}));

const { resolveOrderLines } = await import("@/lib/order-lines");

beforeEach(() => {
  getProductById.mockReset();
  getVariation.mockReset();
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
    expect(getProductById).not.toHaveBeenCalled();
    expect(getVariation).not.toHaveBeenCalled();
  });

  it("resolves a size the old store never sold, which had no WooCommerce id at all", async () => {
    // productId 0 is how lib/variant-line marks exactly these. Before this they
    // could not be re-priced at all, so they could not be paid for by card.
    const { lines, total } = await resolveOrderLines([
      { productId: 0, quantity: 1, sku: "MBCTMA01" },
    ]);
    expect(lines).toHaveLength(1);
    expect(total).toBe(900);
    expect(getProductById).not.toHaveBeenCalled();
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
    expect(getProductById).not.toHaveBeenCalled();
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

  it("does not call WooCommerce on the way to failing", async () => {
    // The failure must be immediate, not 2.5s of timing out against a host that
    // cannot answer.
    await expect(resolveOrderLines([{ productId: 12, quantity: 1 }])).rejects.toThrow();
    expect(getProductById).not.toHaveBeenCalled();
    expect(getVariation).not.toHaveBeenCalled();
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
