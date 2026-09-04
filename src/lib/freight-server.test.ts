// Cartons, resolved. A wrong number here is under-declared freight that the
// carrier finds later and we absorb, so the fallbacks and the axis mapping are
// pinned rather than trusted.
import { describe, expect, it, vi } from "vitest";
import type { UnleashedMap } from "@/lib/unleashed";

const snapshot = [
  {
    id: 101,
    name: "Plyometric Box",
    sku: "MBPB3I101",
    weight: "35",
    dimensions: { length: "77", width: "52", height: "62" },
  },
  { id: 202, name: "Dimensionless Thing", sku: "MNODIMS1", weight: "", dimensions: {} },
];

const variations = {
  101: [
    { id: 9001, sku: "MBPB3I101-L", weight: "40", dimensions: { length: "80", width: "55", height: "65" } },
    { id: 9002, sku: "MBPB3I101-S", weight: "", dimensions: {} },
  ],
};

// The ERP orders its carton Width/Height/Depth. 77/62/52 here is the same box as
// the snapshot's 77/52/62 — see the mapping under test.
const erp: UnleashedMap = {
  MERPONLY1: {
    price: 100, stock: 1, name: "ERP Only Rig",
    widthCm: 77, heightCm: 62, depthCm: 52, weightKg: 35,
  },
  MNOCARTON: { price: 50, stock: 1, name: "No Carton" },
};

vi.mock("@/lib/catalogue", () => ({
  productById: (id: number) => snapshot.find((p) => p.id === id),
  variationsFor: (id: number) => (variations as Record<number, unknown[]>)[id] ?? [],
}));
vi.mock("@/lib/unleashed", async (orig) => ({
  ...(await orig<typeof import("@/lib/unleashed")>()),
  getUnleashedMap: async () => erp,
}));

const { refsToFreightItems } = await import("@/lib/freight-server");

describe("cartons come from the committed snapshot", () => {
  it("resolves a product without reaching a live store", async () => {
    const [item] = await refsToFreightItems([{ productId: 101, quantity: 2 }]);
    expect(item).toMatchObject({
      sku: "MBPB3I101",
      name: "Plyometric Box",
      quantity: 2,
      weightKg: 35,
      lengthCm: 77,
      widthCm: 52,
      heightCm: 62,
    });
  });

  it("prefers a variation's own carton over its parent's", async () => {
    const [item] = await refsToFreightItems([{ productId: 101, variationId: 9001, quantity: 1 }]);
    expect(item.weightKg).toBe(40);
    expect(item.lengthCm).toBe(80);
  });

  it("falls back to the parent when the variation carries no carton", async () => {
    const [item] = await refsToFreightItems([{ productId: 101, variationId: 9002, quantity: 1 }]);
    expect(item.weightKg).toBe(35);
    expect(item.lengthCm).toBe(77);
  });
});

describe("the ERP fills the lines the snapshot has never had", () => {
  it("quotes an ERP-only line, mapping Width/Depth/Height onto length/width/height", async () => {
    // THE AXIS MAPPING, which is the whole reason this lives in one place.
    // ERP W=77 H=62 D=52 is the snapshot's 77/52/62, not 77/62/52.
    const [item] = await refsToFreightItems([{ productId: 0, sku: "MERPONLY1", quantity: 1 }]);
    expect(item.lengthCm).toBe(77); // from ERP Width
    expect(item.widthCm).toBe(52); //  from ERP Depth
    expect(item.heightCm).toBe(62); // from ERP Height
    expect(item.weightKg).toBe(35);
    expect(item.name).toBe("ERP Only Rig");
    expect(item.sku).toBe("MERPONLY1");
  });

  it("matches the snapshot's own carton for the same physical box", async () => {
    const [fromSnapshot] = await refsToFreightItems([{ productId: 101, quantity: 1 }]);
    const [fromErp] = await refsToFreightItems([{ productId: 0, sku: "MERPONLY1", quantity: 1 }]);
    expect([fromErp.lengthCm, fromErp.widthCm, fromErp.heightCm]).toEqual([
      fromSnapshot.lengthCm,
      fromSnapshot.widthCm,
      fromSnapshot.heightCm,
    ]);
  });
});

describe("an unresolvable line is unquotable, never dropped", () => {
  it("zeroes a line the snapshot knows but cannot measure", async () => {
    // Dropping it would under-declare the consignment; zeroes fail the quote loudly.
    const [item] = await refsToFreightItems([{ productId: 202, quantity: 1 }]);
    expect(item.weightKg).toBe(0);
    expect(item.lengthCm).toBe(0);
  });

  it("zeroes a line neither source knows, and keeps it in the consignment", async () => {
    const items = await refsToFreightItems([
      { productId: 101, quantity: 1 },
      { productId: 777, quantity: 3 },
    ]);
    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({ name: "Unknown", weightKg: 0, quantity: 3 });
  });

  it("zeroes an ERP code with no carton rather than part-filling one", async () => {
    const [item] = await refsToFreightItems([{ productId: 0, sku: "MNOCARTON", quantity: 1 }]);
    expect(item.weightKg).toBe(0);
    expect(item.lengthCm).toBe(0);
  });
});
