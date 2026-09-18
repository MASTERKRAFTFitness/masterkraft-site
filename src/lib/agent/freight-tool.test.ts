// The agent's quote_freight promises "the same prices the website checkout would
// show". It used to read `product.dimensions` off the snapshot itself, which is
// a SECOND carton resolver — and a second resolver is a second answer. These pin
// it to the checkout's own, including the two things the snapshot alone gets
// wrong.
import { describe, expect, it, vi } from "vitest";
import type { FreightItem } from "@/lib/freight";
import type { UnleashedMap } from "@/lib/unleashed";

// MWBBFUR03 is a 16kg fixed barbell the frozen snapshot records as
// 11.6 x 18.3 x 18.3 — believable, ordinary density, and a tenth of the bar.
// Unleashed holds the correction, in its own Width/Depth/Height order.
const erp: UnleashedMap = {
  MWBBFUR03: {
    price: 200, stock: 4, name: "Fixed PU Barbell 16kg",
    widthCm: 116, heightCm: 18.3, depthCm: 18.3, weightKg: 16,
  },
};

const quoted: FreightItem[][] = [];

vi.mock("@/lib/unleashed", async (orig) => ({
  ...(await orig<typeof import("@/lib/unleashed")>()),
  getUnleashedMap: async () => erp,
  getUnleashedMapLive: async () => erp,
}));
vi.mock("@/lib/freight", async (orig) => ({
  ...(await orig<typeof import("@/lib/freight")>()),
  collectionAddress: () => ({ postcode: "3074", suburb: "Thomastown", state: "VIC" }),
  quoteFreight: async (items: FreightItem[]) => {
    quoted.push(items);
    return { options: [] };
  },
}));

const { toolByName } = await import("@/lib/agent/tools");
const freight = toolByName("quote_freight")!;

describe("the agent quotes from the checkout's carton resolver", () => {
  it("prices a range's size, which is a variation and not a product", async () => {
    quoted.length = 0;
    await freight.run({
      postcode: "3000", suburb: "Melbourne", state: "VIC",
      items: [{ sku: "MWBBFUR03", qty: 1 }],
    });
    // Matching SKUs against allProducts() alone, this came back "not in the
    // catalogue": every size of every range was unquotable here.
    expect(quoted).toHaveLength(1);
    expect(quoted[0]).toHaveLength(1);
    expect(quoted[0][0].sku).toBe("MWBBFUR03");
  });

  it("takes the ERP's 116cm over the snapshot's believable 11.6cm", async () => {
    quoted.length = 0;
    await freight.run({
      postcode: "3000", suburb: "Melbourne", state: "VIC",
      items: [{ sku: "MWBBFUR03", qty: 2 }],
    });
    const [item] = quoted[0];
    expect(item.lengthCm).toBe(116);
    expect(item.weightKg).toBe(16);
    expect(item.quantity).toBe(2);
  });

  it("still names a SKU it cannot find rather than quoting without it", async () => {
    quoted.length = 0;
    const result = (await freight.run({
      postcode: "3000", suburb: "Melbourne", state: "VIC",
      items: [{ sku: "NOTASKU9", qty: 1 }],
    })) as { error?: string; unknown?: string[] };
    expect(result.error).toMatch(/None of those SKUs are in the catalogue/i);
    expect(result.unknown).toEqual(["NOTASKU9"]);
    expect(quoted).toHaveLength(0);
  });
});
