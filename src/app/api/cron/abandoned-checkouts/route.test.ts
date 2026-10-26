import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckoutLeadRow } from "@/lib/checkout-leads";

// The team alert, with and without the shopper's answer from the checkout page.
const abandonedCheckoutLeads = vi.fn();
vi.mock("@/lib/checkout-leads", () => ({
  abandonedCheckoutLeads,
  markCheckoutLeadNotified: vi.fn(async () => {}),
}));
vi.mock("@/lib/cart-reminders", () => ({ sendCartReminders: vi.fn(async () => ({ ok: true })) }));

const { GET } = await import("./route");

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

describe("abandoned checkout alert", () => {
  let sent: { subject: string; html: string }[];
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    vi.stubEnv("RESEND_API_KEY", "k");
    vi.stubEnv("QUOTE_FROM_EMAIL", "quotes@masterkraft.com");
    sent = [];
    globalThis.fetch = (async (_u: string, init?: RequestInit) => {
      sent.push(JSON.parse(String(init?.body)));
      return new Response("{}");
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    globalThis.fetch = realFetch;
  });

  const run = () =>
    GET(new Request("https://masterkraft.com/api/cron/abandoned-checkouts", { headers: { authorization: "Bearer s3cret" } }));

  it("leads with what stopped them, escaped, when they said", async () => {
    abandonedCheckoutLeads.mockResolvedValue([lead({ abandon_reason: "freight", abandon_reason_note: "<b>$90</b> to Chelsea?" })]);
    await run();
    expect(sent[0].subject).toBe("Abandoned checkout: $20.00 - Violet Atkinson (Delivery cost or timing)");
    expect(sent[0].html).toContain("They said what stopped them:</strong> Delivery cost or timing");
    expect(sent[0].html).toContain("&lt;b&gt;$90&lt;/b&gt; to Chelsea?");
  });

  it("says nothing about a reason when there isn't one", async () => {
    abandonedCheckoutLeads.mockResolvedValue([lead()]);
    await run();
    expect(sent[0].subject).toBe("Abandoned checkout: $20.00 - Violet Atkinson");
    expect(sent[0].html).not.toContain("stopped them");
  });
});
