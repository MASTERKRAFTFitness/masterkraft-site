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
  // The real fault, in the real shape: the snapshot AND the ERP both hold this
  // carton, the snapshot's is in millimetres, and the snapshot is asked first.
  // ABPBSB04, a 12-inch foam plyo box, records 850 x 1000 x 305.
  {
    id: 303,
    name: "Foam Plyometric Box 12in",
    sku: "ABPBSB04",
    weight: "13",
    dimensions: { length: "850", width: "1000", height: "305" },
  },
  // The same fault that SIZE cannot see. Every side of this is inside the size
  // bounds, so it passed for a month: a 14kg barbell in a box 10.54 x 1.63 x
  // 1.63cm, which is 500,000 kg/m3.
  {
    id: 404,
    name: "Urethane Fixed Barbell 12.5kg",
    sku: "MWBBFRU02",
    weight: "14",
    dimensions: { length: "10.54", width: "1.63", height: "1.63" },
  },
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
  // Apparel: no weight, no dimensions, and none needed.
  MAPPAREL1: { price: 80, stock: 1, name: "Sweatshirt (Unisex)", group: "Apparel" },
  // The corrected carton, as the unit-fix import writes it into Unleashed.
  ABPBSB04: {
    price: 200, stock: 1, name: "Foam Plyometric Box 12in",
    widthCm: 85, heightCm: 30.5, depthCm: 100, weightKg: 13,
  },
  // Corrected by the density pass: the same barbell, times ten.
  MWBBFRU02: {
    price: 100, stock: 1, name: "Urethane Fixed Barbell 12.5kg",
    widthCm: 105.4, heightCm: 16.3, depthCm: 16.3, weightKg: 14,
  },
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

// The snapshot is consulted before the ERP, so a bad snapshot value used to win
// simply by being non-zero. 25 of the 36 millimetre errors corrected in Unleashed
// are also in the frozen snapshot - without this, importing the fix would have
// corrected the ERP, the warehouse and the catalogues while the site went on
// quoting 259 cubic metres for a foam box.
describe("a carton that could not be real is not used", () => {
  it("falls through to the ERP when the snapshot holds millimetres", async () => {
    const { refsToFreightItems } = await import("@/lib/freight-server");
    const [item] = await refsToFreightItems([{ productId: 303, sku: "ABPBSB04", quantity: 1 }]);
    // 85 x 100 x 30.5 from the ERP, in the site's axis order, NOT 850 x 1000 x 305.
    expect(item.lengthCm).toBe(85);
    expect(item.widthCm).toBe(100);
    expect(item.heightCm).toBe(30.5);
    expect(item.weightKg).toBe(13);
  });

  // Weight is not part of the carton test and was never wrong, so it still
  // resolves from the snapshot first.
  it("keeps taking the snapshot when its carton is fine", async () => {
    const { refsToFreightItems } = await import("@/lib/freight-server");
    const [item] = await refsToFreightItems([{ productId: 101, sku: "MBPB3I101", quantity: 1 }]);
    expect([item.lengthCm, item.widthCm, item.heightCm]).toEqual([77, 52, 62]);
  });

  // SIZE WAS NOT ENOUGH. This one is inside every size bound and still cannot
  // exist, and there were 42 of them in the snapshot - a 41kg barbell declared
  // as a box the size of a paperback. The consignment goes out under-declared,
  // the carrier weighs it, and we absorb the difference.
  it("falls through to the ERP when the snapshot carton is denser than metal", async () => {
    const { refsToFreightItems } = await import("@/lib/freight-server");
    const [item] = await refsToFreightItems([{ productId: 404, sku: "MWBBFRU02", quantity: 1 }]);
    // 105.4 x 16.3 x 16.3 from the ERP, in the site's axis order.
    expect([item.lengthCm, item.widthCm, item.heightCm]).toEqual([105.4, 16.3, 16.3]);
    expect(item.weightKg).toBe(14);
  });

  // With no plausible carton anywhere the line is unquotable, which fails the
  // whole cart loudly rather than shipping an under-declared consignment.
  it("reports nothing rather than a number nobody believes", async () => {
    const { refsToFreightItems } = await import("@/lib/freight-server");
    const [item] = await refsToFreightItems([{ productId: 202, sku: "MNODIMS1", quantity: 1 }]);
    expect([item.lengthCm, item.widthCm, item.heightCm]).toEqual([0, 0, 0]);
  });
});

// Apparel is 95 products with zero weights and zero dimensions, and every one
// goes in the same satchel. Measuring them to learn that is not work worth doing.
describe("the satchel default", () => {
  it("gives an apparel product a carton and a weight", async () => {
    const { refsToFreightItems } = await import("@/lib/freight-server");
    const [item] = await refsToFreightItems([{ productId: 0, sku: "MAPPAREL1", quantity: 1 }]);
    expect([item.lengthCm, item.widthCm, item.heightCm]).toEqual([40, 30, 10]);
    expect(item.weightKg).toBe(1);
  });

  // The default must never override something real.
  it("does not override a measured product", async () => {
    const { refsToFreightItems } = await import("@/lib/freight-server");
    const [item] = await refsToFreightItems([{ productId: 101, sku: "MBPB3I101", quantity: 1 }]);
    expect([item.lengthCm, item.widthCm, item.heightCm]).toEqual([77, 52, 62]);
    expect(item.weightKg).toBe(35);
  });

  // And it applies to apparel ONLY: "no dimensions" in Strength spans a 2kg
  // collar and a 300kg rack, so there is no honest default there.
  it("leaves an unmeasured non-apparel product unquotable", async () => {
    const { refsToFreightItems } = await import("@/lib/freight-server");
    const [item] = await refsToFreightItems([{ productId: 202, sku: "MNODIMS1", quantity: 1 }]);
    expect([item.lengthCm, item.widthCm, item.heightCm]).toEqual([0, 0, 0]);
  });
});
