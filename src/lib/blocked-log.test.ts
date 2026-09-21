// The point of this log is that it captures the blocks NOBODY ELSE RECORDS, and
// that it cannot become a way to flood a public table. Both are asserted here.
import { describe, it, expect, vi, afterEach } from "vitest";
import { shouldLogBlocked } from "@/lib/blocked-log";
import type { SpamReason } from "@/lib/form-guard";

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("shouldLogBlocked", () => {
  // These three return an ordinary success and send nothing, so the row here is
  // the only evidence the submission ever happened.
  it("keeps the verdicts that are silent to the visitor", () => {
    for (const reason of ["honeypot", "too_fast", "gibberish"] as SpamReason[]) {
      expect(shouldLogBlocked(reason)).toBe(true);
    }
  });

  // Rate limiting is the one verdict the visitor is TOLD about, so nothing is
  // lost silently. It is also the one that repeats on every request once the cap
  // is hit — logging it per row would turn a flood into unbounded writes on an
  // unauthenticated path.
  it("refuses rate_limit, which is neither silent nor bounded", () => {
    expect(shouldLogBlocked("rate_limit")).toBe(false);
  });
});

describe("recordBlocked", () => {
  it("writes nothing at all for a rate limit", async () => {
    const rpc = vi.fn();
    vi.doMock("@/lib/admin-db", () => ({ adminDb: () => ({ rpc }) }));
    const { recordBlocked: rec } = await import("@/lib/blocked-log");
    await rec({ form: "contact", reason: "rate_limit", email: "a@b.com" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("caps every field before it reaches the database", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    vi.doMock("@/lib/admin-db", () => ({ adminDb: () => ({ rpc }) }));
    const { recordBlocked: rec } = await import("@/lib/blocked-log");
    await rec({
      form: "contact",
      reason: "gibberish",
      name: "x".repeat(5000),
      email: "y".repeat(5000),
      message: "z".repeat(99999),
      visitor: "v".repeat(500),
    });
    const [, args] = rpc.mock.calls[0];
    expect(args.p_name.length).toBe(256);
    expect(args.p_email.length).toBe(256);
    expect(args.p_message.length).toBe(4000);
    expect(args.p_visitor.length).toBe(64);
  });

  // Rule 1 of an unauthenticated write path: it cannot break the form. A
  // Supabase outage must not change what the visitor sees.
  it("swallows a database failure", async () => {
    vi.doMock("@/lib/admin-db", () => ({
      adminDb: () => ({ rpc: vi.fn().mockRejectedValue(new Error("supabase down")) }),
    }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { recordBlocked: rec } = await import("@/lib/blocked-log");
    await expect(rec({ form: "contact", reason: "honeypot" })).resolves.toBeUndefined();
  });

  it("is a no-op when Supabase is not configured", async () => {
    vi.doMock("@/lib/admin-db", () => ({ adminDb: () => null }));
    const { recordBlocked: rec } = await import("@/lib/blocked-log");
    await expect(rec({ form: "contact", reason: "honeypot" })).resolves.toBeUndefined();
  });

  it("passes the identifying fields through so a person can be answered", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    vi.doMock("@/lib/admin-db", () => ({ adminDb: () => ({ rpc }) }));
    const { recordBlocked: rec } = await import("@/lib/blocked-log");
    await rec({
      form: "fitout-brief",
      reason: "too_fast",
      detail: "fitout-brief: submitted in 900ms",
      visitor: "203.0.113.9",
      name: "Dana Whitlock",
      email: "dana@northsidestrength.com.au",
      message: "Second level, goods lift only.",
    });
    const [fn, args] = rpc.mock.calls[0];
    expect(fn).toBe("record_blocked_submission");
    expect(args.p_form).toBe("fitout-brief");
    expect(args.p_email).toBe("dana@northsidestrength.com.au");
    expect(args.p_detail).toBe("fitout-brief: submitted in 900ms");
  });
});
