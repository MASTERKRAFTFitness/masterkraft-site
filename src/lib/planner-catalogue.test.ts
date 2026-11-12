import { describe, expect, it } from "vitest";
import { modelKind, parseAssembledSize } from "@/lib/planner-catalogue";

describe("parseAssembledSize", () => {
  it("reads labelled millimetres in any order", () => {
    expect(parseAssembledSize("L 1,530 × W 1,170 × H 1,602 mm")).toEqual({ w: 1.17, d: 1.53, h: 1.602 });
    expect(parseAssembledSize("W 1,615mm x H 1,582mm x D 620mm")).toEqual({ w: 1.615, d: 0.62, h: 1.582 });
  });

  it("reads centimetres when that is the unit", () => {
    expect(parseAssembledSize("L 240cm x W 90cm x H 160cm")).toEqual({ w: 0.9, d: 2.4, h: 1.6 });
  });

  it("gives no footprint without both a width and a depth", () => {
    expect(parseAssembledSize("W 59mm x H 125mm")).toBeNull();
    expect(parseAssembledSize(undefined)).toBeNull();
    expect(parseAssembledSize("Black")).toBeNull();
  });
});

describe("modelKind", () => {
  it("draws the Functional Training System range as racks, not cable machines", () => {
    expect(modelKind("Functional Training System 1.0", "Rigs & Racks", "MSFTSFS01")).toBe("rack");
    expect(modelKind("Functional Trainer", "Strength", "MSFTFT01")).toBe("cable");
  });

  it("tells plate-loaded from pin-loaded strength by the code", () => {
    expect(modelKind("Hack Squat", "Strength", "MSLBPL32")).toBe("plate");
    expect(modelKind("Prone Leg Curl", "Strength", "MSLBSE01")).toBe("stack");
  });

  it("recognises cardio and storage by name", () => {
    expect(modelKind("Commercial Treadmill", "Cardio")).toBe("treadmill");
    expect(modelKind("Concept2 RowErg", "Cardio")).toBe("rower");
    expect(modelKind("Horizontal Dumbbell Rack - 2 Tier (7 Pair) 3.0", "Equipment Storage")).toBe("dbRack");
    expect(modelKind("Rope & Band Rack (Wall Mounted)", "Equipment Storage")).toBe("wall");
    expect(modelKind("Adjustable Utility Weight Bench Pro", "Strength")).toBe("bench");
    expect(modelKind("Performance Reformer", "Cardio")).toBe("bench");
  });
});
