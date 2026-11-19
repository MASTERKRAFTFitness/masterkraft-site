import { describe, expect, it } from "vitest";
import type { CheckoutLeadRow } from "@/lib/checkout-leads";
import { followUpDraft, followUpMailto } from "./abandon-followup";

const lead = (over: Partial<CheckoutLeadRow> = {}): CheckoutLeadRow => ({
  checkout_id: "1efdb65f-0044-40ce-83e3-56855a3f0ea2",
  status: "quoted",
  name: "Violet Atkinson",
  email: "violet@example.com",
  phone: null,
  company: null,
  suburb: "Chelsea",
  state: "VIC",
  postcode: "3196",
  items: [{ sku: null, name: "Barbell Squat Pad", qty: 1, price: 20 }],
  subtotal: 20,
  freight_price: 10.42,
  freight_label: null,
  freight_reason: null,
  order_number: null,
  notified_at: null,
  created_at: "2026-10-26T00:00:00Z",
  updated_at: "2026-10-26T00:00:00Z",
  ...over,
});

describe("abandoned checkout follow-up draft", () => {
  it("asks what held them up, by first name, about what was in the cart", () => {
    const { subject, body } = followUpDraft(lead());
    expect(subject).toBe("Your MasterKraft order");
    expect(body).toMatch(/^Hi Violet,\n/);
    expect(body).toContain("started an order for the Barbell Squat Pad on our website");
    expect(body).toContain("Was there anything that held you up?");
  });

  it("counts the other items rather than listing them", () => {
    const items = [
      { sku: null, name: "Barbell Squat Pad", qty: 1, price: 20 },
      { sku: null, name: "Bumper Plate 20kg", qty: 2, price: 99 },
      { sku: null, name: "Collars", qty: 1, price: 15 },
    ];
    expect(followUpDraft(lead({ items })).body).toContain("the Barbell Squat Pad and 2 other items");
    expect(followUpDraft(lead({ items: items.slice(0, 2) })).body).toContain("and 1 other item ");
    expect(followUpDraft(lead({ items: [], name: null })).body).toMatch(/^Hi,\n[\s\S]*for your order/);
  });

  it("answers the reason they gave instead of asking again", () => {
    const body = followUpDraft(lead({ abandon_reason: "freight" })).body;
    expect(body).toContain("You mentioned delivery");
    expect(body).not.toContain("Was there anything");
  });

  it("asks anyway when the reason does not say what to answer", () => {
    expect(followUpDraft(lead({ abandon_reason: "other" })).body).toContain("Was there anything that held you up?");
    expect(followUpDraft(lead({ abandon_reason: "nonsense" })).body).toContain("Was there anything that held you up?");
  });

  it("builds a mailto with spaces as %20, not +, and no link without an email", () => {
    const href = followUpMailto(lead())!;
    expect(href.startsWith("mailto:violet@example.com?subject=Your%20MasterKraft%20order&body=")).toBe(true);
    expect(href).not.toContain("+");
    expect(followUpMailto(lead({ email: null }))).toBeNull();
    expect(followUpMailto(lead({ email: "a?b@example.com" }))).toMatch(/^mailto:a%3Fb@example.com\?/);
  });
});
