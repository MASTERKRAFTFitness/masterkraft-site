// The fuel levy on each freight matrix, read and set from /admin/freight.
//
// WHY A SCREEN FOR ONE NUMBER. Mainfreight's fuel adjustment factor changes
// weekly and multiplies every matrix price checkout charges, so it is the one
// freight setting that is touched routinely. Before this it was an SQL
// statement in the Supabase editor, which nobody should need to run weekly.
//
// SERVER ONLY: goes through adminDb, which holds the service role key.
//
// A change is live on the next quote after the matrix cache expires, a minute
// at most (FREIGHT_MATRIX_TTL_SECONDS). The levy is part of the matrix version
// hash, so no cached quote outlives it.

import { adminDb } from "@/lib/admin-db";
import type { AuditActor } from "@/lib/agent/audit";

export type LevyMatrix = {
  code: string;
  name: string;
  carrier: string;
  active: boolean;
  /** Only `cost` cards have the levy applied; a `price` card's prices are final. */
  basis: "cost" | "price";
  fuelLevyPercent: number;
};

export type LevyChange = {
  id: string;
  matrixCode: string;
  oldPercent: number | null;
  newPercent: number;
  changedByEmail: string | null;
  note: string | null;
  createdAt: string;
};

/** Above this it is almost certainly a typo (325 for 32.5), not a levy. */
export const MAX_LEVY_PERCENT = 100;

/**
 * A levy as typed by a person: "32.5", "32.5%", " 28 ". Up to three decimals,
 * because that is what the column holds and what carriers publish.
 */
export function parseLevy(raw: unknown): { ok: true; value: number } | { ok: false; error: string } {
  const text = typeof raw === "string" ? raw.trim().replace(/%$/, "").trim() : "";
  if (text === "") return { ok: false, error: "Enter the levy as a percentage, for example 32.5." };
  if (!/^\d+(\.\d{1,3})?$/.test(text)) {
    return { ok: false, error: "Use a plain number with up to three decimals, for example 32.5." };
  }
  const value = Number(text);
  if (value > MAX_LEVY_PERCENT) {
    return { ok: false, error: `${value}% is over ${MAX_LEVY_PERCENT}%. Check the letter: 32.5 is entered as 32.5, not 325.` };
  }
  return { ok: true, value };
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : 0;
};

/** Every matrix the levy can apply to, active ones first. Empty without a database. */
export async function listLevyMatrices(): Promise<LevyMatrix[]> {
  const db = adminDb();
  if (!db) return [];
  const { data, error } = await db
    .from("freight_matrices")
    .select("code, name, carrier, active, basis, fuel_levy_percent")
    .order("active", { ascending: false })
    .order("code");
  if (error) {
    console.error("[fuel-levy] could not read freight_matrices", error.message);
    return [];
  }
  return (data ?? []).map((m) => ({
    code: String(m.code),
    name: String(m.name ?? m.code),
    carrier: String(m.carrier ?? m.name ?? m.code),
    active: m.active === true,
    basis: m.basis === "price" ? "price" : "cost",
    fuelLevyPercent: num(m.fuel_levy_percent),
  }));
}

/**
 * Recent changes, newest first. Returns null when the history table is missing,
 * so the page can say the migration is outstanding rather than show "no changes".
 */
export async function recentLevyChanges(limit = 20): Promise<LevyChange[] | null> {
  const db = adminDb();
  if (!db) return null;
  const { data, error } = await db
    .from("freight_fuel_levy_changes")
    .select("id, matrix_code, old_percent, new_percent, changed_by_email, note, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[fuel-levy] could not read freight_fuel_levy_changes", error.message);
    return null;
  }
  return (data ?? []).map((r) => ({
    id: String(r.id),
    matrixCode: String(r.matrix_code),
    oldPercent: r.old_percent === null ? null : num(r.old_percent),
    newPercent: num(r.new_percent),
    changedByEmail: r.changed_by_email ?? null,
    note: r.note ?? null,
    createdAt: String(r.created_at),
  }));
}

export type SetLevyResult =
  | { ok: true; oldPercent: number; newPercent: number; recorded: boolean }
  | { ok: false; error: string };

/**
 * Set one matrix's levy and record who did it.
 *
 * THE LEVY IS WRITTEN FIRST, THE HISTORY SECOND. The levy is what customers are
 * charged on; a history row that failed to write is reported back
 * (`recorded: false`) but must not stop this week's figure going live.
 */
export async function setFuelLevy(
  code: string,
  percent: number,
  actor: AuditActor | null,
  note: string | null
): Promise<SetLevyResult> {
  const db = adminDb();
  if (!db) return { ok: false, error: "No database configured, so there is nothing to change." };

  const { data: current, error: readError } = await db
    .from("freight_matrices")
    .select("code, fuel_levy_percent")
    .eq("code", code)
    .maybeSingle();
  if (readError) return { ok: false, error: `Could not read the rate card: ${readError.message}` };
  if (!current) return { ok: false, error: `There is no rate card called ${code}.` };
  const oldPercent = num(current.fuel_levy_percent);

  const { error: writeError } = await db
    .from("freight_matrices")
    .update({ fuel_levy_percent: percent })
    .eq("code", code);
  if (writeError) return { ok: false, error: `Could not save the levy: ${writeError.message}` };

  const { error: historyError } = await db.from("freight_fuel_levy_changes").insert({
    matrix_code: code,
    old_percent: oldPercent,
    new_percent: percent,
    changed_by: actor?.id ?? null,
    changed_by_email: actor?.email ?? null,
    note: note?.trim() ? note.trim().slice(0, 500) : null,
  });
  if (historyError) {
    console.error("[fuel-levy] levy saved but history not recorded", historyError.message);
  }

  return { ok: true, oldPercent, newPercent: percent, recorded: !historyError };
}

/**
 * What a carrier charge becomes at checkout under a given levy: levy, then our
 * margin, then GST. The same order lib/freight-matrix.ts applies to a cost card.
 */
export function customerPrice(carrierCharge: number, levyPercent: number, marginPercent: number): number {
  return Math.round(carrierCharge * (1 + levyPercent / 100) * (1 + marginPercent / 100) * 1.1 * 100) / 100;
}
