// Who is allowed to trigger the mirror refresh.
//
// This route pages a rate-limited ERP and rewrites the product catalogue, so
// "can a stranger run it?" is the only question these tests care about. The
// refresh itself is tested through lib/erp-mirror and the parity report.
import { describe, expect, it, vi, beforeEach } from "vitest";

const refreshErpMirror = vi.fn();
vi.mock("@/lib/erp-mirror", () => ({ refreshErpMirror: (...a: unknown[]) => refreshErpMirror(...a) }));
vi.mock("next/cache", () => ({ revalidateTag: () => {} }));

const { GET } = await import("./route");

const ok = {
  ok: true,
  read: 1648,
  withPrice: 1491,
  withCarton: 742,
  withStock: 578,
  before: 1648,
  written: 1648,
  pruned: 0,
  refused: false,
  shrinkPct: 0,
  dryRun: false,
  ms: 80_000,
};

const call = (headers: Record<string, string> = {}) =>
  GET(new Request("https://masterkraft.com/api/cron/erp-mirror", { headers }));

beforeEach(() => {
  refreshErpMirror.mockReset();
  refreshErpMirror.mockResolvedValue(ok);
  process.env.CRON_SECRET = "s3cret";
});

describe("it refuses anyone who is not the scheduler", () => {
  it("rejects a request with no Authorization header", async () => {
    const res = await call();
    expect(res.status).toBe(401);
    expect(refreshErpMirror).not.toHaveBeenCalled();
  });

  it("rejects a wrong secret", async () => {
    const res = await call({ authorization: "Bearer wrong" });
    expect(res.status).toBe(401);
    expect(refreshErpMirror).not.toHaveBeenCalled();
  });

  it("FAILS CLOSED when CRON_SECRET is not set", async () => {
    // The dangerous case, and the reason this is a test rather than a comment.
    // Forgetting the variable in Vercel must not leave an open endpoint that
    // pages Unleashed and rewrites erp_products on demand — it must leave a
    // broken cron, which is loud and harmless.
    delete process.env.CRON_SECRET;
    const res = await call({ authorization: "Bearer anything" });
    expect(res.status).toBe(503);
    expect(refreshErpMirror).not.toHaveBeenCalled();
  });

  it("does not accept the secret without the Bearer scheme", async () => {
    const res = await call({ authorization: "s3cret" });
    expect(res.status).toBe(401);
    expect(refreshErpMirror).not.toHaveBeenCalled();
  });
});

describe("it runs for the scheduler", () => {
  it("refreshes and reports when the secret matches", async () => {
    const res = await call({ authorization: "Bearer s3cret" });
    expect(res.status).toBe(200);
    expect(refreshErpMirror).toHaveBeenCalledWith({ write: true });
    await expect(res.json()).resolves.toMatchObject({ ok: true, written: 1648 });
  });

  it("surfaces a refusal as a failure, not a quiet 200", async () => {
    // The shrink guard firing is the system working — but a cron that reports
    // success while writing nothing goes unnoticed until the mirror is stale
    // enough that the read path abandons it. Red in the Vercel log instead.
    refreshErpMirror.mockResolvedValue({
      ...ok,
      ok: false,
      refused: true,
      written: 0,
      reason: "refused: this sync would shrink the mirror by 40%",
    });
    const res = await call({ authorization: "Bearer s3cret" });
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toMatchObject({ refused: true, written: 0 });
  });

  it("does not leak a stack trace when the refresh throws", async () => {
    refreshErpMirror.mockRejectedValue(new Error("upsert failed at row 500: timeout"));
    const res = await call({ authorization: "Bearer s3cret" });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBe("upsert failed at row 500: timeout");
  });
});
