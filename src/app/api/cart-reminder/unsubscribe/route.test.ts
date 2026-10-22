import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// GET must never unsubscribe (mail scanners open every link); POST must, for
// the page's button and for Gmail / Apple Mail's one-click button alike.
const unsubscribeCheckout = vi.fn(async () => true);
vi.mock("@/lib/cart-reminders", async (real) => ({
  ...(await real<typeof import("@/lib/cart-reminders")>()),
  unsubscribeCheckout,
}));

const { GET, POST } = await import("./route");
const { unsubscribeUrl } = await import("@/lib/cart-reminders");

const ID = "1efdb65f-0044-40ce-83e3-56855a3f0ea2";

describe("cart reminder unsubscribe", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    unsubscribeCheckout.mockClear();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("asks on GET and changes nothing", async () => {
    const res = await GET(new Request(unsubscribeUrl(ID)!));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<form method="post"');
    expect(unsubscribeCheckout).not.toHaveBeenCalled();
  });

  it("unsubscribes on a one-click POST", async () => {
    const res = await POST(
      new Request(unsubscribeUrl(ID)!, { method: "POST", body: "List-Unsubscribe=One-Click" })
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("You're unsubscribed");
    expect(unsubscribeCheckout).toHaveBeenCalledWith(ID);
  });

  it("refuses a forged link", async () => {
    const res = await POST(
      new Request(`https://masterkraft.com/api/cart-reminder/unsubscribe?c=${ID}&t=forged`, { method: "POST" })
    );
    expect(res.status).toBe(400);
    expect(unsubscribeCheckout).not.toHaveBeenCalled();
  });

  it("refuses every link when no secret is configured", async () => {
    const url = unsubscribeUrl(ID)!;
    vi.stubEnv("CRON_SECRET", "");
    expect((await POST(new Request(url, { method: "POST" }))).status).toBe(400);
  });
});
