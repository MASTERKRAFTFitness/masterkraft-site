import { beforeEach, describe, expect, it, vi } from "vitest";

// A tiny stand-in for the Supabase client: one matrix row, and a record of
// every write so the tests can see what reached the database.
type Row = Record<string, unknown>;
let matrix: Row | null;
let historyFails: boolean;
const writes: { table: string; kind: string; values: Row }[] = [];

vi.mock("@/lib/admin-db", () => ({
  adminDb: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: matrix, error: null }) }),
      }),
      update: (values: Row) => ({
        eq: async () => {
          writes.push({ table, kind: "update", values });
          if (matrix) matrix = { ...matrix, ...values };
          return { error: null };
        },
      }),
      insert: async (values: Row) => {
        writes.push({ table, kind: "insert", values });
        return { error: historyFails ? { message: "relation does not exist" } : null };
      },
    }),
  }),
}));

const { customerPrice, parseLevy, setFuelLevy } = await import("@/lib/fuel-levy");

beforeEach(() => {
  matrix = { code: "mainfreight-mel", fuel_levy_percent: "32.5" };
  historyFails = false;
  writes.length = 0;
});

describe("parseLevy", () => {
  it("takes a plain percentage, with or without the sign", () => {
    expect(parseLevy("32.5")).toEqual({ ok: true, value: 32.5 });
    expect(parseLevy(" 28 % ")).toEqual({ ok: true, value: 28 });
    expect(parseLevy("0")).toEqual({ ok: true, value: 0 });
    expect(parseLevy("31.875")).toEqual({ ok: true, value: 31.875 });
  });

  it("refuses blanks, words, negatives and too many decimals", () => {
    for (const bad of ["", "   ", "abc", "-5", "32.5.1", "32.5555", null, undefined, 32.5]) {
      expect(parseLevy(bad).ok).toBe(false);
    }
  });

  // 325 for 32.5 is the typo that would triple every Mainfreight price.
  it("refuses anything over 100% and says why", () => {
    const r = parseLevy("325");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("32.5");
  });
});

describe("customerPrice", () => {
  // The live Yeppoon quote for a 302kg cart, 2026-10-13: $587.35 from the card,
  // 32.5% levy, 15% margin, GST.
  it("matches what checkout charges", () => {
    expect(customerPrice(587.35, 32.5, 15)).toBe(984.47);
  });
});

describe("setFuelLevy", () => {
  const actor = { id: "u1", email: "michael@masterkraft.com" };

  it("writes the levy, then a history row naming who and from what", async () => {
    const r = await setFuelLevy("mainfreight-mel", 30, actor, "  FAF letter 13 Oct ");
    expect(r).toEqual({ ok: true, oldPercent: 32.5, newPercent: 30, recorded: true });
    expect(writes).toEqual([
      { table: "freight_matrices", kind: "update", values: { fuel_levy_percent: 30 } },
      {
        table: "freight_fuel_levy_changes",
        kind: "insert",
        values: {
          matrix_code: "mainfreight-mel",
          old_percent: 32.5,
          new_percent: 30,
          changed_by: "u1",
          changed_by_email: "michael@masterkraft.com",
          note: "FAF letter 13 Oct",
        },
      },
    ]);
  });

  // The levy is what customers pay on; a missing history table must not hold it back.
  it("still saves the levy when the history cannot be written, and says so", async () => {
    historyFails = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await setFuelLevy("mainfreight-mel", 30, actor, null);
    expect(r).toMatchObject({ ok: true, recorded: false });
    expect(matrix?.fuel_levy_percent).toBe(30);
  });

  it("refuses a rate card that does not exist, and writes nothing", async () => {
    matrix = null;
    expect(await setFuelLevy("nope", 30, actor, null)).toMatchObject({ ok: false });
    expect(writes).toEqual([]);
  });
});
