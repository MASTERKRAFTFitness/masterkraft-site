import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// GET must never record (mail scanners open every link); POST records, and
// tells the team only when the answer changed.
const recordAbandonReason = vi.fn();
const resend = vi.fn(async () => {});
vi.mock("@/lib/cart-reminders", async (real) => ({
  ...(await real<typeof import("@/lib/cart-reminders")>()),
  recordAbandonReason,
  resend,
}));

const { GET, POST } = await import("./route");
const { reasonUrl, unsubscribeUrl } = await import("@/lib/cart-reminders");

const ID = "1efdb65f-0044-40ce-83e3-56855a3f0ea2";
const row = { checkout_id: ID, name: "Violet", email: "violet@example.com", items: [], abandon_reason: "quote" };

function post(url: string, fields: Record<string, string>) {
  return POST(new Request(url, { method: "POST", body: new URLSearchParams(fields) }));
}

describe("cart reminder reason", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    vi.stubEnv("QUOTE_TO_EMAIL", "hello@masterkraft.com");
    recordAbandonReason.mockReset();
    resend.mockClear();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("asks on GET with the clicked answer chosen, and records nothing", async () => {
    const res = await GET(new Request(reasonUrl(ID, "quote")!));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<form method="post"');
    expect(html).toContain('value="quote" checked');
    expect(recordAbandonReason).not.toHaveBeenCalled();
  });

  it("records on POST and emails the team, reply-to the shopper", async () => {
    recordAbandonReason.mockResolvedValue({ row, changed: true });
    const res = await post(reasonUrl(ID, "quote")!, { reason: "quote", note: "For the club" });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("formal quote");
    expect(recordAbandonReason).toHaveBeenCalledWith(ID, "quote", "For the club");
    expect(resend).toHaveBeenCalledWith(
      expect.objectContaining({ to: ["hello@masterkraft.com"], reply_to: "violet@example.com" })
    );
  });

  it("sends no second email for the same answer", async () => {
    recordAbandonReason.mockResolvedValue({ row, changed: false });
    expect((await post(reasonUrl(ID, "quote")!, { reason: "quote" })).status).toBe(200);
    expect(resend).not.toHaveBeenCalled();
  });

  it("still thanks them when the team email fails", async () => {
    recordAbandonReason.mockResolvedValue({ row, changed: true });
    resend.mockRejectedValueOnce(new Error("down"));
    expect((await post(reasonUrl(ID, "quote")!, { reason: "quote" })).status).toBe(200);
  });

  it("refuses an unknown reason, a forged link, or an unsubscribe signature", async () => {
    expect((await post(reasonUrl(ID, "quote")!, { reason: "hacked" })).status).toBe(400);
    expect((await post(`https://masterkraft.com/api/cart-reminder/reason?c=${ID}&t=nope`, { reason: "quote" })).status).toBe(400);
    const unsub = new URL(unsubscribeUrl(ID)!).searchParams.get("t")!;
    expect((await post(`https://masterkraft.com/api/cart-reminder/reason?c=${ID}&t=${unsub}`, { reason: "quote" })).status).toBe(400);
    expect(recordAbandonReason).not.toHaveBeenCalled();
  });
});
