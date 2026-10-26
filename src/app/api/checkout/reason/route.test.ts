import { beforeEach, describe, expect, it, vi } from "vitest";

const recordAbandonReason = vi.fn();
vi.mock("@/lib/cart-reminders", () => ({ recordAbandonReason }));

const { POST } = await import("./route");

const ID = "1efdb65f-0044-40ce-83e3-56855a3f0ea2";
const post = (body: unknown) =>
  POST(new Request("https://masterkraft.com/api/checkout/reason", { method: "POST", body: JSON.stringify(body) }));

describe("checkout page reason", () => {
  beforeEach(() => recordAbandonReason.mockReset());

  it("stores the answer on the shopper's checkout", async () => {
    recordAbandonReason.mockResolvedValue({ row: {}, changed: true });
    const res = await post({ checkoutId: ID, reason: "freight", note: "Pick up instead?" });
    expect(res.status).toBe(200);
    expect(recordAbandonReason).toHaveBeenCalledWith(ID, "freight", "Pick up instead?");
  });

  it("refuses a bad id, an unknown code, and the email-only payment code", async () => {
    expect((await post({ checkoutId: "x", reason: "freight" })).status).toBe(400);
    expect((await post({ checkoutId: ID, reason: "bogus" })).status).toBe(400);
    expect((await post({ checkoutId: ID, reason: "payment" })).status).toBe(400);
    expect(recordAbandonReason).not.toHaveBeenCalled();
  });

  it("refuses an oversized body before parsing it", async () => {
    expect((await post({ checkoutId: ID, reason: "other", note: "x".repeat(5000) })).status).toBe(413);
  });

  it("says when the checkout is unknown, and when saving failed", async () => {
    recordAbandonReason.mockResolvedValueOnce(null);
    expect((await post({ checkoutId: ID, reason: "later" })).status).toBe(404);
    recordAbandonReason.mockRejectedValueOnce(new Error("db down"));
    expect((await post({ checkoutId: ID, reason: "later" })).status).toBe(500);
  });
});
