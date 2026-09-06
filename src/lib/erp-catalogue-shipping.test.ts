// Hiding what cannot be shipped, at the layer the catalogue is actually built.
//
// This rule exists in two places on purpose: filterListable covers the
// snapshot-backed listings, and this covers product pages and the sitemap, which
// resolve through erpUnits. Hiding in one and not the other leaves a product
// absent from every listing while still answering 200 on its own URL.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UnleashedMap } from "@/lib/unleashed";

// No snapshot pages, so every judgement below falls to the ERP's own carton.
vi.mock("@/lib/catalogue", () => ({
  allProducts: () => [],
  variationsFor: () => [],
}));

const measured = { widthCm: 45, depthCm: 45, heightCm: 37, weightKg: 18 };
const unmeasured = { weightKg: 18 };

const entry = (name: string, over: Record<string, unknown> = {}) => ({
  price: 100,
  stock: 1,
  name,
  brand: "MK",
  group: "Strength",
  sellable: true,
  ...over,
});

const map = (): UnleashedMap =>
  ({
    MOK1: entry("Olympic Rack - 1.0", measured),
    MOK2: entry("Olympic Rack - 2.0", measured),
    // Same range, one size nobody has measured.
    MOK3: entry("Olympic Rack - 3.0", unmeasured),
    // A product with no measured size anywhere.
    MSOLO: entry("Unmeasured Bench", unmeasured),
  }) as unknown as UnleashedMap;

describe("hiding unshippable products from the ERP catalogue", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("changes nothing when the flag is off", async () => {
    delete process.env.HIDE_UNSHIPPABLE;
    const { erpUnits } = await import("@/lib/erp-catalogue");
    const units = erpUnits(map());
    const rack = [...units.values()].find((u) => u.name === "Olympic Rack");
    expect(rack?.codes).toHaveLength(3);
    expect([...units.values()].some((u) => u.name === "Unmeasured Bench")).toBe(true);
  });

  // THE POINT. A rack measured in two sizes and not a third should still sell
  // the two, rather than the whole range disappearing over one gap.
  it("drops the unmeasured SIZE and keeps the range", async () => {
    process.env.HIDE_UNSHIPPABLE = "true";
    const { erpUnits } = await import("@/lib/erp-catalogue");
    const rack = [...erpUnits(map()).values()].find((u) => u.name === "Olympic Rack");
    expect(rack).toBeDefined();
    expect(rack?.codes).toEqual(["MOK1", "MOK2"]);
  });

  it("removes a product with no shippable size at all", async () => {
    process.env.HIDE_UNSHIPPABLE = "true";
    const { erpUnits } = await import("@/lib/erp-catalogue");
    expect([...erpUnits(map()).values()].some((u) => u.name === "Unmeasured Bench")).toBe(false);
  });

  // A carton nobody believes is not a measurement. 2440cm is 24 metres.
  it("treats an impossible carton as unmeasured", async () => {
    process.env.HIDE_UNSHIPPABLE = "true";
    const { erpUnits } = await import("@/lib/erp-catalogue");
    const m = map();
    (m as Record<string, unknown>).MBAD = entry("Broken Carton", {
      widthCm: 2440,
      depthCm: 610,
      heightCm: 40,
      weightKg: 33,
    });
    expect([...erpUnits(m).values()].some((u) => u.name === "Broken Carton")).toBe(false);
  });
});
