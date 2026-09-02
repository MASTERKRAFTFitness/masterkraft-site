// The catalogue as Unleashed has it. Fixture-driven: these lock the rules that
// decide what earns a card and which page it opens, all of which came from real
// shapes in the ERP.
import { describe, expect, it } from "vitest";
import {
  ERP_GROUPS,
  erpSubgroups,
  erpUnits,
  searchErpUnits,
  slugify,
  unitCard,
} from "@/lib/erp-catalogue";
import type { UnleashedMap } from "@/lib/unleashed";

type Row = [code: string, name: string, price: number, group: string, brand?: string, sub?: string];

function erp(rows: Row[]): UnleashedMap {
  const map: UnleashedMap = {};
  for (const [code, name, price, group, brand = "MK", subgroup] of rows) {
    map[code] = { price, stock: 1, name, image: `${code}.jpg`, brand, group, subgroup, sellable: true };
  }
  return map;
}

describe("the ERP is the catalogue", () => {
  it("collapses a range to one card and leaves singles alone", () => {
    const units = erpUnits(
      erp([
        ["MMDBRH01", "Rubber Hex Dumbbell - 1kg", 5, "Mixed Implements"],
        ["MMDBRH12", "Rubber Hex Dumbbell - 10kg", 50, "Mixed Implements"],
        ["MBCTMA01", "Multi Adjustable Bench", 900, "Strength"],
      ])
    );
    expect(units.size).toBe(2);
    const range = [...units.values()].find((u) => u.isRange)!;
    expect(range.codes).toHaveLength(2);
    expect(range.price).toBe(5); // the cheapest size
    const bench = [...units.values()].find((u) => !u.isRange)!;
    expect(bench.codes).toEqual(["MBCTMA01"]);
  });

  it("keeps a range on the page it has always lived at", () => {
    // The dumbbells have been at /product/rubber-hex-dumbbell-group since launch.
    // A change of source is not a reason to break every link pointing there.
    const units = erpUnits(
      erp([
        ["MMDBRH01", "Rubber Hex Dumbbell - 1kg", 5, "Mixed Implements"],
        ["MMDBRH12", "Rubber Hex Dumbbell - 10kg", 50, "Mixed Implements"],
      ])
    );
    expect([...units.keys()]).toEqual(["rubber-hex-dumbbell-group"]);
  });

  it("gives the loser of a page contest its own page rather than dropping it", () => {
    // MWBBFUR is three ranges sharing one old page. The straight barbell is the
    // one that page sold, so it keeps the URL; the curl barbell gets its own
    // rather than vanishing — the old store never listed it at all.
    const units = erpUnits(
      erp([
        ["MWBBFUR01", "Fixed PU Straight Barbell - 10kg", 90, "Weightlifting"],
        ["MWBBFUR03", "Fixed PU Straight Barbell - 15kg", 130, "Weightlifting"],
        ["MWBBFUR20", "Fixed PU Curl Barbell - 5kg", 45, "Weightlifting"],
        ["MWBBFUR21", "Fixed PU Curl Barbell - 7.5kg", 67, "Weightlifting"],
      ])
    );
    const straight = units.get("urethane-fixed-barbells-2");
    expect(straight?.name).toBe("Fixed PU Straight Barbell");
    expect(units.get("fixed-pu-curl-barbell")?.name).toBe("Fixed PU Curl Barbell");
    expect(units.size).toBe(2);
  });

  it("reads a brand prefix as a brand, not as a range", () => {
    // "CONCEPT 2 - Ski Erg with PM5" is one product. Read as a range it becomes a
    // "CONCEPT 2" card whose sizes are four whole ergs.
    const units = erpUnits(
      erp([
        ["C2SKIERG", "CONCEPT 2 - Ski Erg with PM5", 1650, "Cardio", "CONCEPT 2"],
        ["C2ROWERG", "CONCEPT 2 - Row Erg with Standard Legs", 1705, "Cardio", "CONCEPT 2"],
      ])
    );
    expect(units.size).toBe(2);
    expect([...units.values()].every((u) => !u.isRange)).toBe(true);
  });

  it("reads a trailing garment size as a size, and nothing else in brackets", () => {
    const units = erpUnits(
      erp([
        ["MAACU01S", "Sweatshirt (Unisex) (S)", 89, "Apparel"],
        ["MAACU01L", "Sweatshirt (Unisex) (L)", 89, "Apparel"],
        // "(Armatex)" is a material, not a size. Merging it with the plain Wall
        // Ball would put two products behind one picker.
        ["MMWAARM01", "Wall Ball (Armatex) - 4kg", 130, "Mixed Implements"],
        ["MMWAARM10", "Wall Ball - 8lb", 110, "Mixed Implements"],
      ])
    );
    const shirt = units.get("sweatshirt-unisex")!;
    expect(shirt.isRange).toBe(true);
    expect(shirt.codes).toHaveLength(2);
    // Two separate units, on two separate pages — not one picker holding both.
    const balls = [...units.values()].filter((u) => u.group === "Mixed Implements");
    expect(balls).toHaveLength(2);
    expect(new Set(balls.map((u) => u.slug)).size).toBe(2);
    expect(balls.map((u) => u.name).sort()).toEqual(["Wall Ball", "Wall Ball (Armatex)"]);
  });

  it("fills gaps from NO BRAND without duplicating what MK already sells", () => {
    const units = erpUnits(
      erp([
        ["MMDBRH01", "Rubber Hex Dumbbell - 1kg", 5, "Mixed Implements", "MK"],
        ["MMDBRH12", "Rubber Hex Dumbbell - 10kg", 50, "Mixed Implements", "MK"],
        // The white-label copy of the same range — must not become a second card.
        ["NBMDBRH01", "Rubber Hex Dumbbell - 1kg", 4, "Mixed Implements", "NO BRAND"],
        ["NBMDBRH12", "Rubber Hex Dumbbell - 10kg", 45, "Mixed Implements", "NO BRAND"],
        // Lighting exists only on N-codes; this is the gap it fills.
        ["NBLLE2501", "Linear LED Lighting System - 2.4m", 900, "Lighting", "NO BRAND"],
      ])
    );
    const dumbbells = [...units.values()].filter((u) => u.name === "Rubber Hex Dumbbell");
    expect(dumbbells).toHaveLength(1);
    expect(dumbbells[0].brand).toBe("MK");
    expect([...units.values()].some((u) => u.group === "Lighting")).toBe(true);
  });

  it("never lists another company's brand, or the ERP's internal groups", () => {
    const units = erpUnits(
      erp([
        ["SMDBRH01", "Rubber Hex Dumbbell - 1kg", 5, "Mixed Implements", "SNAP"],
        ["RMDBRH01", "Premium Rubber Hex Dumbbell - 4kg", 20, "Mixed Implements", "REVL"],
        ["RFDA01", "Logistics Allowance - Zone 1", 100, "Other Costs"],
      ])
    );
    expect(units.size).toBe(0);
  });

  it("skips what the ERP will not sell, and prices a range from its cheapest size", () => {
    const map = erp([
      ["MMDBRH01", "Rubber Hex Dumbbell - 1kg", 5, "Mixed Implements"],
      ["MMDBRH12", "Rubber Hex Dumbbell - 10kg", 50, "Mixed Implements"],
    ]);
    map.MMDBRH01.sellable = false;
    const unit = [...erpUnits(map).values()][0];
    expect(unit.codes).toEqual(["MMDBRH12"]);
    expect(unitCard(unit).enriched.priceLabel).toBe("$50.00");
  });

  it("labels a range as From, and an unpriced product as POA", () => {
    const map = erp([
      ["MMDBRH01", "Rubber Hex Dumbbell - 1kg", 5, "Mixed Implements"],
      ["MMDBRH12", "Rubber Hex Dumbbell - 10kg", 50, "Mixed Implements"],
      ["MBCTMA01", "Multi Adjustable Bench", 0, "Strength"],
    ]);
    const units = [...erpUnits(map).values()];
    const range = units.find((u) => u.isRange)!;
    const bench = units.find((u) => u.name === "Multi Adjustable Bench")!;
    expect(unitCard(range).enriched.priceLabel).toBe("From $5.00");
    expect(unitCard(bench).enriched.priceLabel).toBe("Contact for pricing");
    expect(unitCard(bench).enriched.priceValue).toBe(0);
  });

  it("offers sub-filters from ProductSubGroup, counted", () => {
    const map = erp([
      ["MMDBRH01", "Rubber Hex Dumbbell - 1kg", 5, "Mixed Implements", "MK", "Dumbbells"],
      ["MMKBPGC01", "Competition Kettlebell - 8kg", 60, "Mixed Implements", "MK", "Kettlebells"],
      ["MMKBPGC02", "Competition Kettlebell - 12kg", 70, "Mixed Implements", "MK", "Kettlebells"],
    ]);
    expect(erpSubgroups(map, "Mixed Implements")).toEqual([
      { name: "Dumbbells", slug: "dumbbells", count: 1 },
      { name: "Kettlebells", slug: "kettlebells", count: 1 },
    ]);
  });

  it("finds a unit by an exact ERP code before it finds it by words", () => {
    const map = erp([
      ["MMDBRH01", "Rubber Hex Dumbbell - 1kg", 5, "Mixed Implements"],
      ["MEFRDB01", "Vertical Dumbbell Rack - 10 Pair", 400, "Equipment Storage"],
    ]);
    expect(searchErpUnits(map, "dumbbell").length).toBe(2);
    expect(searchErpUnits(map, "MEFRDB01")[0].name).toBe("Vertical Dumbbell Rack");
  });

  it("slugifies an ampersand rather than dropping it", () => {
    // "Rigs & Racks" and "Rigs Racks" must not collide.
    expect(slugify("Rigs & Racks")).toBe("rigs-and-racks");
  });

  it("has a category for every group it lists", () => {
    // ERP_GROUPS is what the navigation is built from; a group missing from it
    // would be products with nowhere to appear.
    expect(new Set(ERP_GROUPS).size).toBe(ERP_GROUPS.length);
  });
});
