// The customer copy: what a row holds, and when the checkout refuses to trust it.
import { describe, expect, it, vi, beforeEach } from "vitest";

const state: { synced: string | null; error: string | null } = { synced: null, error: null };
vi.mock("@/lib/admin-db", () => ({
  adminDb: () => ({
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        order: () => q,
        limit: async () => ({
          data: state.synced ? [{ synced_at: state.synced }] : [],
          error: state.error ? { message: state.error } : null,
        }),
      };
      return q;
    },
  }),
}));

import { customerIndex, normaliseEmail, toRow, unleashedDate, STALE_AFTER_MS } from "@/lib/erp-customers";

beforeEach(() => {
  state.synced = null;
  state.error = null;
});

describe("a customer row", () => {
  it("reads Unleashed's /Date(ms)/", () => {
    expect(unleashedDate("/Date(1794961339207)/")).toBe("2026-11-18T00:22:19.207Z");
    expect(unleashedDate(null)).toBeNull();
  });

  it("stores the email normalised, so lookups are equality", () => {
    const r = toRow(
      { Guid: "d9176808-60b5-4602-91f2-e6999e01db4a", CustomerCode: " FRIEJ01 ", CustomerName: "TAFE NSW - Loftus Campus", Email: "Jodie.Friedrich1@tafensw.edu.au " },
      "2026-11-18T00:00:00.000Z"
    );
    expect(r).toMatchObject({ code: "FRIEJ01", email: "jodie.friedrich1@tafensw.edu.au", obsolete: false, source: "sync" });
  });

  it("skips a record with no Guid or code", () => {
    expect(toRow({ Guid: "", CustomerCode: "X" }, "now")).toBeNull();
    expect(toRow({ Guid: "g", CustomerCode: " " }, "now")).toBeNull();
  });

  it("forgives a trailing full stop", () => {
    expect(normaliseEmail("blackopsfit@gmail.com.")).toBe("blackopsfit@gmail.com");
  });
});

describe("the checkout only trusts a fresh copy", () => {
  const now = Date.parse("2026-11-18T12:00:00Z");

  it("refuses an empty copy", async () => {
    expect(await customerIndex(now)).toEqual({ unavailable: "the customer copy is empty" });
  });

  it("refuses a copy that stopped refreshing", async () => {
    state.synced = new Date(now - STALE_AFTER_MS - 60_000).toISOString();
    expect(await customerIndex(now)).toMatchObject({ unavailable: expect.stringMatching(/last refreshed/) });
  });

  it("refuses an unreadable copy (the table not yet created)", async () => {
    state.error = 'relation "erp_customers" does not exist';
    expect(await customerIndex(now)).toMatchObject({ unavailable: expect.stringMatching(/unreadable/) });
  });

  it("uses a copy refreshed this hour", async () => {
    state.synced = new Date(now - 30 * 60_000).toISOString();
    expect(await customerIndex(now)).toHaveProperty("byEmail");
  });
});
