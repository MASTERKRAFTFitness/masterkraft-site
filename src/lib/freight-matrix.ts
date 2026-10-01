// Freight matrices - rate cards held in Supabase - and the switch that decides
// whether they or the live carriers answer.
//
// The tables, the modes and what each column means live in
// supabase/migrations/20260930_freight_matrix.sql. This file loads them and
// answers two questions for lib/freight.ts: which source prices a delivery, and
// what do the matrices say a consignment costs.
//
// FAILS TO TODAY'S BEHAVIOUR. No database, a missing migration or a failed read
// all resolve to mode `api` (or FREIGHT_SOURCE, if set) with no matrices, so
// nothing about checkout changes until someone deliberately switches it. And in
// `matrix` mode an empty matrix prices nothing, which sends the cart to the
// quote flow - never to free freight.
//
// Pure functions below the loader take the config as an argument, so they are
// tested without a database.

import { createHash } from "node:crypto";
import { adminDb } from "@/lib/admin-db";
import type { FreightOption, Parcel } from "@/lib/freight";

export const FREIGHT_SOURCES = ["api", "matrix", "matrix_then_api", "api_then_matrix", "pooled"] as const;
export type FreightSource = (typeof FREIGHT_SOURCES)[number];

export type MatrixRate = {
  id: number;
  zone_code: string;
  service: string;
  service_level: string;
  applies_to: "parcel" | "oversize" | "any";
  weight_from_kg: number;
  weight_to_kg: number | null;
  price: number | null;
  per_kg: number;
  minimum: number;
  days_from: number | null;
  days_to: number | null;
};

export type Matrix = {
  code: string;
  name: string;
  carrier: string;
  basis: "price" | "cost";
  perKgOn: "excess" | "total";
  cubicFactorKgM3: number;
  fuelLevyPercent: number;
  consolidate: boolean;
  zones: { code: string; name: string }[];
  postcodes: { zone_code: string; postcode_from: number; postcode_to: number }[];
  /** Active rows only. */
  rates: MatrixRate[];
};

export type MatrixConfig = {
  source: FreightSource;
  /** Active matrices only. */
  matrices: Matrix[];
  /** Changes whenever anything above does. Part of every freight cache key. */
  version: string;
};

const GST = 1.1;

const isSource = (v: unknown): v is FreightSource =>
  typeof v === "string" && (FREIGHT_SOURCES as readonly string[]).includes(v);

/** The mode when the database cannot say: FREIGHT_SOURCE, else `api`. */
export function fallbackSource(): FreightSource {
  const v = (process.env.FREIGHT_SOURCE ?? "").trim().toLowerCase();
  return isSource(v) ? v : "api";
}

function emptyConfig(): MatrixConfig {
  return { source: fallbackSource(), matrices: [], version: `none:${fallbackSource()}` };
}

// Postgres numerics arrive as strings from PostgREST.
const n = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

type Row = Record<string, unknown>;

/** Build a config from raw rows. Exported for tests. */
export function buildMatrixConfig(raw: {
  settings?: Row | null;
  matrices?: Row[];
  zones?: Row[];
  postcodes?: Row[];
  rates?: Row[];
}): MatrixConfig {
  const source = isSource(raw.settings?.source) ? raw.settings.source : fallbackSource();
  const of = (rows: Row[] | undefined, code: string) =>
    (rows ?? []).filter((r) => String(r.matrix_code) === code);

  const matrices: Matrix[] = (raw.matrices ?? [])
    .filter((m) => m.active === true)
    .map((m): Matrix => {
      const code = String(m.code);
      return {
        code,
        name: String(m.name ?? code),
        carrier: String(m.carrier ?? m.name ?? code),
        basis: m.basis === "cost" ? "cost" : "price",
        perKgOn: m.per_kg_on === "total" ? "total" : "excess",
        cubicFactorKgM3: n(m.cubic_factor_kg_m3) ?? 250,
        fuelLevyPercent: n(m.fuel_levy_percent) ?? 0,
        consolidate: m.consolidate === true,
        zones: of(raw.zones, code).map((z) => ({ code: String(z.code), name: String(z.name ?? z.code) })),
        postcodes: of(raw.postcodes, code).map((p) => ({
          zone_code: String(p.zone_code),
          postcode_from: n(p.postcode_from) ?? 0,
          postcode_to: n(p.postcode_to) ?? -1,
        })),
        rates: of(raw.rates, code)
          .filter((r) => r.active !== false)
          .map((r): MatrixRate => ({
            id: n(r.id) ?? 0,
            zone_code: String(r.zone_code),
            service: String(r.service ?? "Standard delivery"),
            service_level: String(r.service_level ?? "standard"),
            applies_to: r.applies_to === "oversize" || r.applies_to === "any" ? r.applies_to : "parcel",
            weight_from_kg: n(r.weight_from_kg) ?? 0,
            weight_to_kg: n(r.weight_to_kg),
            price: n(r.price),
            per_kg: n(r.per_kg) ?? 0,
            minimum: n(r.minimum) ?? 0,
            days_from: n(r.days_from),
            days_to: n(r.days_to),
          }))
          .sort((a, b) => a.id - b.id),
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));

  return {
    source,
    matrices,
    version: createHash("sha1").update(JSON.stringify({ source, matrices })).digest("hex").slice(0, 12),
  };
}

// ----------------------------------------------------------------- loading

let cached: { config: MatrixConfig; at: number } | null = null;

/** How long a loaded matrix is trusted. Short: an edit should be live in a minute. */
function ttlMs(): number {
  const v = parseFloat(process.env.FREIGHT_MATRIX_TTL_SECONDS ?? "");
  return (Number.isFinite(v) && v >= 0 ? v : 60) * 1000;
}

export function clearMatrixCache(): void {
  cached = null;
}

// PostgREST caps a response at 1000 rows by default, and one carrier card is
// 262 zones x 6 weight breaks. Reading it unpaged would silently drop rates.
const PAGE = 1000;

type Db = NonNullable<ReturnType<typeof adminDb>>;

async function readAll(db: Db, table: string, codes: string[]): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from(table)
      .select("*")
      .in("matrix_code", codes)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as Row[]));
    if (!data || data.length < PAGE) return out;
  }
}

/**
 * The current matrices and mode. NEVER THROWS: every failure is the empty
 * config, i.e. FREIGHT_SOURCE or `api` with nothing to price from.
 *
 * A failed read is not cached, so a database blip costs one quote the matrix
 * rather than a minute of them.
 */
export async function loadMatrixConfig(): Promise<MatrixConfig> {
  if (cached && Date.now() - cached.at < ttlMs()) return cached.config;
  const db = adminDb();
  if (!db) return emptyConfig();
  try {
    const [settings, matrices] = await Promise.all([
      db.from("freight_matrix_settings").select("*").maybeSingle(),
      db.from("freight_matrices").select("*").eq("active", true),
    ]);
    const error = settings.error ?? matrices.error;
    if (error) throw new Error(error.message);
    const codes = ((matrices.data ?? []) as Row[]).map((m) => String(m.code));
    const [zones, postcodes, rates] = codes.length
      ? await Promise.all([
          readAll(db, "freight_zones", codes),
          readAll(db, "freight_zone_postcodes", codes),
          readAll(db, "freight_matrix_rates", codes),
        ])
      : [[], [], []];
    const config = buildMatrixConfig({
      settings: settings.data as Row | null,
      matrices: (matrices.data ?? []) as Row[],
      zones,
      postcodes,
      rates,
    });
    cached = { config, at: Date.now() };
    return config;
  } catch (e) {
    // A missing migration lands here. Loud in the log, harmless to checkout.
    console.error("[freight-matrix] unavailable, using", fallbackSource(), "-", e instanceof Error ? e.message : e);
    return emptyConfig();
  }
}

// ---------------------------------------------------------------- deciding

export const usesMatrix = (s: FreightSource) => s !== "api";
export const usesApi = (s: FreightSource) => s !== "matrix";

/**
 * A matrix's zone for a postcode, or null. Overlapping ranges are allowed and
 * the NARROWEST wins, so a zone can be cut out of a wider one.
 */
export function zoneFor(matrix: Matrix, postcode: string): string | null {
  const pc = parseInt(postcode.replace(/\D/g, ""), 10);
  if (!Number.isFinite(pc)) return null;
  const hit = matrix.postcodes
    .filter((r) => pc >= r.postcode_from && pc <= r.postcode_to)
    .sort(
      (a, b) =>
        a.postcode_to - a.postcode_from - (b.postcode_to - b.postcode_from) ||
        a.zone_code.localeCompare(b.zone_code)
    )[0];
  return hit?.zone_code ?? null;
}

/**
 * True when some matrix holds a price. Lets an API-less deployment count as
 * "freight is configured" in a matrix mode.
 */
export function matrixHasRates(config: MatrixConfig): boolean {
  return config.matrices.some((m) => m.rates.some((r) => r.price !== null));
}

/** True when some matrix prices oversize consignments into this postcode. */
export function matrixCarriesOversize(config: MatrixConfig, postcode: string): boolean {
  return config.matrices.some((m) => {
    const zone = zoneFor(m, postcode);
    return zone !== null && m.rates.some((r) => r.zone_code === zone && r.price !== null && r.applies_to !== "parcel");
  });
}

// ----------------------------------------------------------------- pricing

/**
 * What a consignment bills at: each carton's greater of dead and cubic weight,
 * summed. Rounded UP to 0.01kg so a band edge is never undercut by a float.
 */
export function chargeableKg(parcels: Parcel[], cubicFactorKgM3: number): number {
  const kg = parcels.reduce((sum, p) => {
    const cubic = ((p.length * p.width * p.height) / 1e6) * cubicFactorKgM3;
    return sum + Math.max(p.weight, cubic);
  }, 0);
  return Math.ceil(kg * 100 - 1e-9) / 100;
}

export type MatrixQuoteInput = {
  parcels: Parcel[];
  /** True when any carton is over the parcel limits. From the caller, which
   *  already knows - and it keeps this file free of a runtime import cycle. */
  oversize: boolean;
  postcode: string;
  /** FREIGHT_MARGIN_PERCENT, applied to 'cost' matrices only. */
  marginPercent: number;
};

/** One matrix's options for a consignment. */
export function quoteOneMatrix(m: Matrix, input: MatrixQuoteInput): FreightOption[] {
  const zone = zoneFor(m, input.postcode);
  if (!zone || input.parcels.length === 0) return [];
  const kg = chargeableKg(input.parcels, m.cubicFactorKgM3);
  const options: FreightOption[] = [];
  for (const r of m.rates) {
    if (r.zone_code !== zone || r.price === null) continue;
    if (r.applies_to === "parcel" && input.oversize) continue;
    if (r.applies_to === "oversize" && !input.oversize) continue;
    // The first band starts at 0 and must take a 0.2kg satchel, so a band's
    // lower edge is exclusive only above zero.
    const above = r.weight_from_kg === 0 ? kg >= 0 : kg > r.weight_from_kg;
    if (!above || (r.weight_to_kg !== null && kg > r.weight_to_kg)) continue;

    const perKgOver = m.perKgOn === "total" ? kg : Math.max(0, kg - r.weight_from_kg);
    const charge = Math.max(r.minimum, r.price + r.per_kg * perKgOver);
    // A carrier's cost becomes a price the way a live quote does: fuel levy on
    // the carrier's charge, then our margin, then GST.
    const price =
      m.basis === "cost"
        ? charge * (1 + m.fuelLevyPercent / 100) * (1 + input.marginPercent / 100) * GST
        : charge;
    options.push({
      id: `matrix:${m.code}:${zone}:${r.id}`,
      carrier: m.carrier,
      service: r.service,
      serviceLevel: r.service_level,
      price: Math.round(price * 100) / 100,
      ...(r.days_from !== null ? { daysFrom: r.days_from } : {}),
      ...(r.days_to !== null ? { daysTo: r.days_to } : {}),
    });
  }
  return options;
}

/**
 * Every active matrix's options for ONE consignment, or null when none covers
 * it. Option ids are `matrix:<matrix>:<zone>:<rate id>`, stable for identical
 * inputs, which is what payment-intent's re-quote matches on.
 */
export function quoteMatrices(config: MatrixConfig, input: MatrixQuoteInput): FreightOption[] | null {
  const options = config.matrices.flatMap((m) => quoteOneMatrix(m, input));
  return options.length > 0 ? options : null;
}
