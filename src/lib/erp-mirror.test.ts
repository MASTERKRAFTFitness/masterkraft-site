import { describe, expect, it } from "vitest";
import { sellPriceTiers, stockByWarehouse, stockColumns } from "./erp-mirror";

describe("sellPriceTiers", () => {
  it("keeps positive tier values keyed by tier number", () => {
    expect(
      sellPriceTiers({
        SellPriceTier1: { Name: "Tier 1", Value: "123.45" },
        SellPriceTier3: { Name: "Tier 3", Value: 99 },
        SellPriceTier10: { Name: "Tier 10", Value: 1577.7667 },
      }),
    ).toEqual({ "1": 123.45, "3": 99, "10": 1577.7667 });
  });

  it("drops zero, negative and missing values, so a missing tier is never a stored 0", () => {
    expect(
      sellPriceTiers({
        SellPriceTier1: { Value: 0 },
        SellPriceTier2: { Value: "0.0000" },
        SellPriceTier4: { Value: -5 },
        SellPriceTier5: { Value: 12 },
      }),
    ).toEqual({ "5": 12 });
  });

  it("is null when the product has no tier prices at all", () => {
    expect(sellPriceTiers({ ProductCode: "X" })).toBeNull();
  });
});

describe("stockByWarehouse", () => {
  it("keeps every warehouse's figures per product, codes trimmed and upper-cased", () => {
    const m = stockByWarehouse([
      {
        warehouse: "MELB WHS",
        rows: [
          { ProductCode: " mkbp05 ", QtyOnHand: 20, AllocatedQty: 198, AvailableQty: -178 },
          { ProductCode: "MKONLY", QtyOnHand: "3", AllocatedQty: "0", AvailableQty: "3" },
        ],
      },
      { warehouse: "CHINA WHS", rows: [{ ProductCode: "MKBP05", QtyOnHand: 200, AllocatedQty: 0, AvailableQty: 200 }] },
    ]);
    expect(m.get("MKBP05")).toEqual({
      "MELB WHS": { onHand: 20, allocated: 198, available: -178 },
      "CHINA WHS": { onHand: 200, allocated: 0, available: 200 },
    });
    expect(m.get("MKONLY")).toEqual({ "MELB WHS": { onHand: 3, allocated: 0, available: 3 } });
  });

  it("keeps a zero as zero and leaves out products with no record", () => {
    const m = stockByWarehouse([
      { warehouse: "MELB WHS", rows: [{ ProductCode: "Z", QtyOnHand: 0, AvailableQty: 0 }, { ProductCode: "" }] },
    ]);
    expect(m.get("Z")).toEqual({ "MELB WHS": { onHand: 0, allocated: 0, available: 0 } });
    expect([...m.keys()]).toEqual(["Z"]);
  });
});

describe("stockColumns", () => {
  const now = "2026-10-29T01:17:00.000Z";
  const byWarehouse = stockByWarehouse([
    { warehouse: "MELB WHS", rows: [{ ProductCode: "A", AvailableQty: 5 }] },
    { warehouse: "CHINA WHS", rows: [{ ProductCode: "A", AvailableQty: 40 }, { ProductCode: "CN", AvailableQty: 9 }] },
  ]);

  it("sends Melbourne as stock, every warehouse, and the date", () => {
    expect(stockColumns("A", byWarehouse, now)).toEqual({
      stock: 5,
      stock_by_warehouse: {
        "MELB WHS": { onHand: 0, allocated: 0, available: 5 },
        "CHINA WHS": { onHand: 0, allocated: 0, available: 40 },
      },
      stock_synced_at: now,
    });
  });

  it("sends null, not zero, for a product Melbourne has no record of", () => {
    expect(stockColumns("CN", byWarehouse, now).stock).toBeNull();
    expect(stockColumns("NONE", byWarehouse, now)).toEqual({ stock: null, stock_by_warehouse: null, stock_synced_at: now });
  });

  it("sends no stock key at all when the stock read failed, so the last good figures survive", () => {
    // THE FIX. `stock` used to go out as null on every row here, blanking
    // Melbourne stock across the catalogue on one failed read.
    expect(stockColumns("A", null, now)).toEqual({});
  });
});
