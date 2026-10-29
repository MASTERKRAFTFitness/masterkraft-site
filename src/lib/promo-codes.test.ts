import { beforeEach, describe, expect, it, vi } from "vitest";

const search = vi.fn();
vi.mock("@/lib/stripe", () => ({ stripe: { paymentIntents: { search: (...a: unknown[]) => search(...a) } } }));

import {
  alreadyRedeemed,
  evaluatePromo,
  normaliseCode,
  promoFromMetadata,
  promoMetadata,
} from "./promo-codes";

describe("evaluatePromo: THANKS50, as the thank-you card words it", () => {
  it("takes $50 off a spend over $200", () => {
    const v = evaluatePromo("THANKS50", 200.01);
    expect(v).toMatchObject({ ok: true, discount: 50 });
  });

  it("refuses exactly $200: the card says over", () => {
    const v = evaluatePromo("THANKS50", 200);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.error).toMatch(/over \$200/);
  });

  it("forgives case and spaces", () => {
    expect(normaliseCode(" thanks 50 ")).toBe("THANKS50");
    expect(evaluatePromo("thanks50", 500).ok).toBe(true);
  });

  it("refuses a code that does not exist", () => {
    expect(evaluatePromo("FREESTUFF", 5000)).toEqual({ ok: false, error: "That code isn't valid." });
    expect(evaluatePromo(undefined, 5000).ok).toBe(false);
  });
});

describe("alreadyRedeemed", () => {
  // Braces matter: a function returned from beforeEach is run as a teardown.
  beforeEach(() => {
    search.mockReset();
  });

  it("finds a paid intent that used the code with this email, case-insensitively", async () => {
    search.mockImplementation(async ({ query }: { query: string }) => ({
      data: query.includes("status:'succeeded'") ? [{ id: "pi_1" }] : [],
    }));
    expect(await alreadyRedeemed("THANKS50", " Sam@Example.com ")).toBe(true);
    expect(search.mock.calls[0][0].query).toContain("metadata['promo_email']:'sam@example.com'");
  });

  it("is false when no paid or settling intent used it", async () => {
    search.mockResolvedValue({ data: [] });
    expect(await alreadyRedeemed("THANKS50", "new@example.com")).toBe(false);
    expect(search).toHaveBeenCalledTimes(2);
  });

  it("will not build a query from an email that could break out of its quotes", async () => {
    expect(await alreadyRedeemed("THANKS50", "o'brien@example.com")).toBe(true);
    expect(search).not.toHaveBeenCalled();
  });

  it("throws when Stripe cannot answer, so the code is refused rather than guessed", async () => {
    search.mockRejectedValue(new Error("stripe down"));
    await expect(alreadyRedeemed("THANKS50", "a@b.com")).rejects.toThrow("stripe down");
  });
});

describe("promo metadata round trip", () => {
  it("reads back what the intent was given", () => {
    const md = promoMetadata({ code: "THANKS50", amount: 50 }, "A@B.com");
    expect(md).toEqual({ promo_code: "THANKS50", promo_amount: "50.00", promo_email: "a@b.com" });
    expect(promoFromMetadata(md)).toEqual({ code: "THANKS50", amount: 50 });
  });

  it("is null for an intent with no promo", () => {
    expect(promoFromMetadata({ source: "masterkraft-site" })).toBeNull();
    expect(promoFromMetadata(undefined)).toBeNull();
  });
});
