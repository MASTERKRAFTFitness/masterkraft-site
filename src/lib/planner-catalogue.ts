// What the fitout planner (/fitout-planner) can put on a floor: the site's own
// equipment, with the photo, price and assembled size each product page shows.
//
// SAME SOURCES AS THE PRODUCT PAGE, so the planner never disagrees with it:
// units from the ERP mirror (erpUnits), the photo the unit already resolves to
// (the repainted /erp-bg shot where there is one), and the spec table from
// resolveSpecs over the snapshot. Nothing here is invented: a product with no
// published assembled size is drawn at its kind's typical size and SAYS so.
import { erpUnits, unitAsProduct, unitCard, type ErpUnit } from "@/lib/erp-catalogue";
import { productBySlug } from "@/lib/catalogue";
import { parseProductDetail } from "@/lib/spec";
import { resolveSpecs, type ContentMap } from "@/lib/product-content";
import type { UnleashedMap } from "@/lib/unleashed";

/** The ERP groups a gym floor is planned from, in the library's tab order. */
export const PLANNER_GROUPS = ["Strength", "Rigs & Racks", "Cardio", "Equipment Storage"] as const;

/** Which 3D model draws a product. Inferred from its name and group. */
export type ModelKind =
  | "treadmill"
  | "bike"
  | "rower"
  | "ski"
  | "elliptical"
  | "stack"
  | "plate"
  | "smith"
  | "cable"
  | "rack"
  | "bench"
  | "dbRack"
  | "barbellRack"
  | "plateTree"
  | "storage"
  | "wall"
  | "box";

/** Floor footprint in metres: x across the front, z front to back, y height. */
export type Footprint = { w: number; d: number; h: number };

export type PlannerProduct = {
  slug: string;
  code: string;
  name: string;
  group: string;
  subgroup?: string;
  image?: string;
  priceLabel: string;
  /** GST-inclusive; 0 is price on application. */
  price: number;
  kind: ModelKind;
  footprint: Footprint;
  /** True when the footprint comes from the published assembled size. */
  measured: boolean;
  assembledSize?: string;
  netWeight?: string;
};

// A typical footprint per kind (w × d × h, metres), used only when a product has
// no published assembled size. Commercial averages, rounded.
export const TYPICAL: Record<ModelKind, Footprint> = {
  treadmill: { w: 0.9, d: 2.1, h: 1.6 },
  bike: { w: 0.6, d: 1.3, h: 1.3 },
  rower: { w: 0.6, d: 2.45, h: 1.0 },
  ski: { w: 0.7, d: 1.0, h: 2.1 },
  elliptical: { w: 0.8, d: 2.0, h: 1.7 },
  stack: { w: 1.3, d: 1.6, h: 2.0 },
  plate: { w: 1.6, d: 1.8, h: 1.9 },
  smith: { w: 2.2, d: 1.7, h: 2.3 },
  cable: { w: 1.8, d: 1.1, h: 2.3 },
  rack: { w: 1.6, d: 1.6, h: 2.3 },
  bench: { w: 0.7, d: 1.4, h: 0.5 },
  dbRack: { w: 1.8, d: 0.7, h: 0.85 },
  barbellRack: { w: 1.0, d: 0.75, h: 1.3 },
  plateTree: { w: 0.8, d: 0.65, h: 1.4 },
  storage: { w: 1.6, d: 0.6, h: 1.6 },
  wall: { w: 1.0, d: 0.15, h: 1.0 },
  box: { w: 1.2, d: 1.2, h: 1.2 },
};

/**
 * Which model draws a product. Name first, because the ERP's groups are broad
 * ("Strength" holds benches, racks and machines alike); then the code's
 * plate-loaded marker; then the group.
 */
export function modelKind(name: string, group: string, code = "", subgroup = ""): ModelKind {
  const n = name.toLowerCase();
  // A Pilates reformer is a long, low carriage on a frame: closest to a bench.
  if (/reformer/.test(n)) return "bench";
  if (/treadmill|curve runner|runner/.test(n)) return "treadmill";
  if (/ski ?erg|ski trainer/.test(n)) return "ski";
  if (/row(er|erg| erg)|rowing/.test(n)) return "rower";
  if (/elliptical|cross ?trainer|stair|climber|stepper/.test(n)) return "elliptical";
  if (/bike|cycle|spin/.test(n)) return "bike";
  if (/smith/.test(n)) return "smith";
  // The Functional Training System range is RACKS (lifting cells with plate
  // storage, extending into a rig line), whatever "functional" suggests; a
  // functional TRAINER is the dual-pulley cable machine.
  if (/functional training system/.test(n)) return "rack";
  if (/functional trainer|cable cross|crossover|cable column|dual pulley|dual adjustable pulley/.test(n)) return "cable";
  if (/dumbbell rack/.test(n)) return "dbRack";
  if (/barbell rack/.test(n)) return "barbellRack";
  if (/plate tree|plate rack|plate storage/.test(n)) return "plateTree";
  if (/wall[- ]mounted/.test(n) || /wall mounted/i.test(subgroup)) return "wall";
  if (/bench/.test(n)) return "bench";
  if (/power rack|half rack|squat rack|squat stand|\brig\b|cage/.test(n)) return "rack";
  if (group === "Rigs & Racks") return "rack";
  if (group === "Equipment Storage") return "storage";
  if (group === "Cardio") return "treadmill";
  if (group === "Strength") return /^[A-Z]{3,4}PL/.test(code) || /plate[- ]loaded/.test(n) ? "plate" : "stack";
  return "box";
}

/**
 * Metres from an assembled-size string, by its labels:
 * "L 1,530 × W 1,170 × H 1,602 mm", "W 1,615mm x H 1,582mm x D 620mm".
 * L or D is front-to-back, W is across. Null when there is no floor footprint
 * in it (fewer than two of the three, or no W at all).
 */
export function parseAssembledSize(text?: string): Footprint | null {
  if (!text) return null;
  const unitIsCm = /\dcm\b|\bcm\b/i.test(text.replace(/\s+cm/gi, "cm")) && !/mm/i.test(text);
  const read = (label: string) => {
    const m = text.match(new RegExp(`\\b${label}\\s*:?\\s*([\\d,.]+)`, "i"));
    if (!m) return undefined;
    const v = parseFloat(m[1].replace(/,/g, ""));
    if (!Number.isFinite(v) || v <= 0) return undefined;
    return unitIsCm ? v / 100 : v / 1000;
  };
  const w = read("W");
  const depth = read("L") ?? read("D");
  const h = read("H");
  if (!w || !depth) return null;
  return { w, d: depth, h: h ?? 1 };
}

function specValue(specs: { label: string; value: string }[], label: string) {
  return specs.find((s) => s.label === label)?.value;
}

/** One unit as the planner needs it. */
export function plannerProduct(unit: ErpUnit, content: ContentMap): PlannerProduct {
  const product = productBySlug(unit.slug) ?? unitAsProduct(unit);
  const specs = resolveSpecs(unit.slug, parseProductDetail(product).specs, content);
  const assembledSize = specValue(specs, "Assembled size");
  const code = unit.codes[0];
  const kind = modelKind(unit.name, unit.group, code, unit.subgroup);
  const measured = parseAssembledSize(assembledSize);
  const { priceLabel } = unitCard(unit).enriched;
  return {
    slug: unit.slug,
    code,
    name: unit.name,
    group: unit.group,
    subgroup: unit.subgroup,
    image: unit.image,
    priceLabel,
    price: unit.price,
    kind,
    // A wall-mounted rack keeps its published width but projects only a hand's
    // depth from the wall, whatever its "D" says about the carton it ships in.
    footprint: measured ?? TYPICAL[kind],
    measured: Boolean(measured),
    assembledSize,
    netWeight: specValue(specs, "Net weight"),
  };
}

/** Every product the planner offers, grouped as the library shows them. */
export function plannerCatalogue(map: UnleashedMap, content: ContentMap): PlannerProduct[] {
  const groups = new Set<string>(PLANNER_GROUPS);
  return [...erpUnits(map).values()]
    .filter((u) => groups.has(u.group))
    .map((u) => plannerProduct(u, content))
    .sort(
      (a, b) =>
        PLANNER_GROUPS.indexOf(a.group as (typeof PLANNER_GROUPS)[number]) -
          PLANNER_GROUPS.indexOf(b.group as (typeof PLANNER_GROUPS)[number]) || a.name.localeCompare(b.name)
    );
}
