// The catalogue as Unleashed has it. Fixture-driven: these lock the rules that
// decide what earns a card and which page it opens, all of which came from real
// shapes in the ERP.
import { describe, expect, it } from "vitest";
import {
  ERP_GROUPS,
  erpSubgroups,
  erpUnits,
  pageCodes,
  searchErpUnits,
  servedCodes,
  slugify,
  unitCard,
  unitDescription,
} from "@/lib/erp-catalogue";
import type { UnleashedMap } from "@/lib/unleashed";
import { allProducts } from "@/lib/catalogue";

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

  it("spans a range's price, and calls an unpriced product POA", () => {
    const map = erp([
      ["MMDBRH01", "Rubber Hex Dumbbell - 1kg", 5, "Mixed Implements"],
      ["MMDBRH12", "Rubber Hex Dumbbell - 10kg", 50, "Mixed Implements"],
      ["MBCTMA01", "Multi Adjustable Bench", 0, "Strength"],
    ]);
    const units = [...erpUnits(map).values()];
    const range = units.find((u) => u.isRange)!;
    const bench = units.find((u) => u.name === "Multi Adjustable Bench")!;
    expect(unitCard(range).enriched.priceLabel).toBe("$5.00 – $50.00");
    expect(unitCard(bench).enriched.priceLabel).toBe("Contact for pricing");
    expect(unitCard(bench).enriched.priceValue).toBe(0);
  });

  it("only says From when the top of the range is genuinely unknown", () => {
    // One size priced, one not. The dear end is not "the same as the cheap end",
    // which is what a bare "$5.00" would claim, so this one keeps "From".
    const map = erp([
      ["MMDBRH01", "Rubber Hex Dumbbell - 1kg", 5, "Mixed Implements"],
      ["MMDBRH12", "Rubber Hex Dumbbell - 10kg", 0, "Mixed Implements"],
    ]);
    expect(unitCard([...erpUnits(map).values()][0]).enriched.priceLabel).toBe("From $5.00");
  });

  it("drops From when every size costs the same", () => {
    // The apparel ranges. "From $65.00" on a flat price is noise.
    const map = erp([
      ["MAACU01S", "Sweatshirt (Unisex) (S)", 65, "Apparel"],
      ["MAACU01M", "Sweatshirt (Unisex) (M)", 65, "Apparel"],
    ]);
    expect(unitCard([...erpUnits(map).values()][0]).enriched.priceLabel).toBe("$65.00");
  });

  it("tells the card how many sizes there are, and how far they run", () => {
    const map = erp([
      ["MMDEHG01", "High Grip Dead Ball - 6kg", 40, "Mixed Implements"],
      ["MMDEHG04", "High Grip Dead Ball - 15kg", 70, "Mixed Implements"],
      ["MMDEHG16", "High Grip Dead Ball - 75kg", 300, "Mixed Implements"],
    ]);
    expect(unitCard([...erpUnits(map).values()][0]).enriched.rangeLabel).toBe("3 sizes · 6kg – 75kg");
  });

  it("counts the sizes but will not span ends that are not comparable", () => {
    // "Set of 6 – Set of 10" reads as nonsense, so the span goes and the count
    // stays. A garment range spans fine, because S…XL is an order.
    const sets = erp([
      ["MWPA01", "Coloured Bumper Plates - Set of 6", 700, "Weightlifting"],
      ["MWPA02", "Coloured Bumper Plates - Set of 10", 1200, "Weightlifting"],
    ]);
    expect(unitCard([...erpUnits(sets).values()][0]).enriched.rangeLabel).toBe("2 sizes");

    // A model number is not a size either: "2 Tier … 1.0" opens with a bare
    // number and no unit, so it does not earn a span.
    const racks = erp([
      ["MEFRKB01", "Kettlebell Rack - 2 Tier (10 Pair) 1.0", 900, "Equipment Storage"],
      ["MEFRKB02", "Kettlebell Rack - 3 Tier (15 Pair) 1.0", 1100, "Equipment Storage"],
    ]);
    expect(unitCard([...erpUnits(racks).values()][0]).enriched.rangeLabel).toBe("2 sizes");

    const tees = erp([
      ["MAALS01L", "Long Sleeve Tee (Unisex) (L)", 65, "Apparel"],
      ["MAALS01S", "Long Sleeve Tee (Unisex) (S)", 65, "Apparel"],
      ["MAALS01XL", "Long Sleeve Tee (Unisex) (XL)", 65, "Apparel"],
    ]);
    expect(unitCard([...erpUnits(tees).values()][0]).enriched.rangeLabel).toBe("3 sizes · S – XL");
  });

  it("spans on the measurement, not the whole label", () => {
    // The competition kettlebells: one size carries a material in brackets and
    // eleven do not. "6kg (Aluminium) – 40kg" is ugly and "12 sizes" alone
    // throws away the useful half, so the span reads the weights.
    const map = erp([
      ["MMKBPGC01", "Competition Kettlebell - 6kg (Aluminium)", 60, "Mixed Implements"],
      ["MMKBPGC02", "Competition Kettlebell - 8kg", 70, "Mixed Implements"],
      ["MMKBPGC12", "Competition Kettlebell - 40kg", 260, "Mixed Implements"],
    ]);
    expect(unitCard([...erpUnits(map).values()][0]).enriched.rangeLabel).toBe("3 sizes · 6kg – 40kg");
  });

  it("leaves a single product with no size line at all", () => {
    const map = erp([["MBCTMA01", "Multi Adjustable Bench", 900, "Strength"]]);
    expect(unitCard([...erpUnits(map).values()][0]).enriched.rangeLabel).toBeUndefined();
  });

  it("orders garment sizes by body, not by alphabet", () => {
    // Shipped as "L, M, S, XL" on the Long Sleeve Tee: garment labels carry no
    // number, so the numeric sort left them to localeCompare. The picker, the
    // card's span and the thumbnail captions all read this one order.
    const map = erp([
      ["MAALS01L", "Long Sleeve Tee (Unisex) (L)", 65, "Apparel"],
      ["MAALS01XL", "Long Sleeve Tee (Unisex) (XL)", 65, "Apparel"],
      ["MAALS01S", "Long Sleeve Tee (Unisex) (S)", 65, "Apparel"],
      ["MAALS01M", "Long Sleeve Tee (Unisex) (M)", 65, "Apparel"],
    ]);
    expect([...erpUnits(map).values()][0].sizes).toEqual(["S", "M", "L", "XL"]);
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

describe("a unit describes itself when the snapshot has no words for it", () => {
  it("gives a range its sizes and its price span", () => {
    const units = erpUnits(
      erp([
        ["MMDBRH01", "Rubber Hex Dumbbell - 1kg", 5, "Mixed Implements"],
        ["MMDBRH12", "Rubber Hex Dumbbell - 10kg", 50, "Mixed Implements"],
      ])
    );
    const range = [...units.values()][0];
    expect(unitDescription(range)).toBe(
      "Buy Rubber Hex Dumbbell at MASTERKRAFT. 2 sizes \u00b7 1kg \u2013 10kg. $5.00 \u2013 $50.00 inc. GST."
    );
  });

  it("says a single product's price without pretending it is a range", () => {
    const units = erpUnits(erp([["MBCTMA01", "Multi Adjustable Bench", 900, "Strength"]]));
    const bench = [...units.values()][0];
    expect(unitDescription(bench)).toBe("Buy Multi Adjustable Bench at MASTERKRAFT. $900.00 inc. GST.");
  });

  it("never invents a price for a unit that has none", () => {
    const units = erpUnits(erp([["MBCTMA02", "Custom Rig", 0, "Rigs & Racks"]]));
    const rig = [...units.values()][0];
    expect(unitDescription(rig)).toBe("Buy Custom Rig at MASTERKRAFT. Contact for pricing.");
  });

  it("stays inside the length a search snippet will show", () => {
    const units = erpUnits(
      erp([["MBCTMA03", "Multi Adjustable Bench With A Deliberately Very Long Product Name Indeed That Runs On", 900, "Strength"]])
    );
    expect(unitDescription([...units.values()][0]).length).toBeLessThanOrEqual(155);
  });
});

// CLEARANCE IS SOLD AND IS IN NO UNIT. These lock the gap that emptied live
// baskets on 2026-09-06: erpUnits is brand-filtered, Clearance is deliberately
// not, and everything that asked erpUnits alone called live stock retired.
describe("what the site still sells", () => {
  const clearance = (): UnleashedMap =>
    erp([
      ["AMKBUR01", "Urethane Competition Kettlebell - 8kg", 44, "Mixed Implements", "AIR LOCKER"],
      ["AMKBUR02", "Urethane Competition Kettlebell - 10kg", 57.5, "Mixed Implements", "AIR LOCKER"],
      ["AMKBUR06", "Urethane Competition Kettlebell - 24kg", 115, "Mixed Implements", "AIR LOCKER"],
      ["ABPBMS01", "Plyometric Box - 30cm (Steel)", 250, "Body Weight", "AIR LOCKER"],
      ["ABPBMS02", "Plyometric Box - 45cm (Steel)", 280, "Body Weight", "AIR LOCKER"],
      ["MMDBRH01", "Rubber Hex Dumbbell - 1kg", 5, "Mixed Implements"],
      ["MMDBRH02", "Rubber Hex Dumbbell - 2kg", 9, "Mixed Implements"],
    ]);

  it("keeps clearance stock its own brand rule excludes from every unit", () => {
    const map = clearance();
    const units = erpUnits(map);
    // Air Locker is not one of ours, so it earns no card - that part is correct.
    expect([...units.values()].some((u) => u.brand === "AIR LOCKER")).toBe(false);
    // It is still on sale at /equipment/clearance, so the cart must not drop it.
    const served = servedCodes(map);
    expect(served.has("AMKBUR01")).toBe(true);
    expect(served.has("AMKBUR06")).toBe(true);
    expect(served.has("MMDBRH01")).toBe(true);
    expect(served.has("MMDBRH99")).toBe(false);
  });

  it("reads a container page's sizes off the ERP, not off its own SKU", () => {
    // AMKBUR-GROUP is a WooCommerce bundle. Unleashed has never held it, and
    // never will; what it holds is the six kettlebells behind it.
    const map = clearance();
    const page = allProducts().find((p) => p.sku === "AMKBUR-GROUP")!;
    expect(pageCodes(page, map)).toEqual(["AMKBUR01", "AMKBUR02", "AMKBUR06"]);
    expect(servedCodes(map).has("AMKBUR-GROUP")).toBe(false);
  });

  it("matches a store SKU that drifted from its code by hyphens only", () => {
    const map = clearance();
    const page = allProducts().find((p) => p.sku === "ABPBMS-01")!;
    expect(pageCodes(page, map)).toEqual(["ABPBMS01"]);
  });

  it("does not resolve a page onto a code the ERP has retired", () => {
    // Both plyometric box pages sell codes Unleashed marks IsObsoleted.
    const map = clearance();
    map["ABPBMS01"] = { ...map["ABPBMS01"], sellable: false };
    const page = allProducts().find((p) => p.sku === "ABPBMS-01")!;
    expect(pageCodes(page, map)).toEqual([]);
  });

  it("refuses to squash a WooCommerce duplicate suffix onto the wrong product", () => {
    // ABPBMS-01-1 is the 45cm page, made by copying the 30cm one. Squashing the
    // suffix away would sell a 45cm box at the 30cm box's code and price.
    const map = clearance();
    const page = allProducts().find((p) => p.sku === "ABPBMS-01-1")!;
    expect(pageCodes(page, map)).toEqual([]);
  });
});
