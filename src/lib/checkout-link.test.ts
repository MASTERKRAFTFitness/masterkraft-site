// The Merchant Center checkout link. What matters is that the line it builds is
// the line the product page builds — same cart key — and that it refuses
// anything the feed would refuse.
import { describe, expect, it, vi } from "vitest";
import type { UnleashedMap } from "@/lib/unleashed";

vi.mock("@/lib/catalogue", () => ({
  allProducts: () => [],
  variationsFor: () => [],
  productBySlug: () => undefined,
}));

const { cartLineForCode, hashCode } = await import("@/lib/checkout-link");
const { unitAsProduct, erpUnitBySlug } = await import("@/lib/erp-catalogue");

const entry = (name: string, over: Record<string, unknown> = {}) => ({
  price: 46,
  stock: 4,
  name,
  brand: "MK",
  group: "Weightlifting",
  subgroup: "Weight Plates",
  sellable: true,
  image: "https://cdn.example/plate.jpg",
  widthCm: 30,
  depthCm: 30,
  heightCm: 12,
  weightKg: 8,
  ...over,
});

const map = (over: Record<string, unknown> = {}): UnleashedMap =>
  ({
    MWWPCP01: entry("Change Plates - 0.5kg", { price: 26 }),
    MWWPCP02: entry("Change Plates - 1kg", { price: 46 }),
    MBSARO01: entry("Speed Rope", { group: "Body Weight", subgroup: "Speed & Agility", price: 25 }),
    ...over,
  }) as unknown as UnleashedMap;

describe("cartLineForCode", () => {
  it("builds a range size keyed exactly as the product page keys it", () => {
    const line = cartLineForCode(map(), "MWWPCP02");
    expect(line).toMatchObject({ id: -hashCode("MWWPCP02"), sku: "MWWPCP02", slug: "change-plates", price: 46 });
    expect(line?.name).toMatch(/1kg$/);
  });

  it("builds a single product keyed on the unit's product id", () => {
    const m = map();
    const line = cartLineForCode(m, "mbsaro01");
    expect(line?.id).toBe(unitAsProduct(erpUnitBySlug(m, line!.slug)!).id);
    expect(line).toMatchObject({ sku: "MBSARO01", price: 25 });
  });

  it("refuses what the feed refuses", () => {
    expect(cartLineForCode(map({ MWWPCP02: entry("Change Plates - 1kg", { stock: 0 }) }), "MWWPCP02")).toBeNull();
    expect(cartLineForCode(map({ MWWPCP02: entry("Change Plates - 1kg", { price: 0 }) }), "MWWPCP02")).toBeNull();
    expect(cartLineForCode(map(), "NOPE01")).toBeNull();
    expect(cartLineForCode(map(), "")).toBeNull();
  });
});
