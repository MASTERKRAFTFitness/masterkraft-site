import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ELAPSED_FIELD, HONEYPOT_FIELD, __resetFormLimits } from "@/lib/form-guard";

// A card checkout whose freight cannot be priced now becomes a quote on its own
// (see quotesAutomatically). The customer is shown "we'll email your freight
// price", so these hold the two ends of that promise: the team is told a
// freight price is what to send, and the customer gets it in writing. An
// ordinary quote request must not start mailing customers, and nothing about a
// blocked bot may reach anybody's inbox.

const post = async (body: unknown) => {
  vi.resetModules();
  const { POST } = await import("./route");
  return POST(new Request("https://masterkraft.com/api/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.9" },
    body: JSON.stringify(body),
  }));
};

const quote = {
  contact: {
    name: "Jane Rower",
    email: "jane@example.com",
    phone: "0400000000",
    location: "1 Test St, Kambah, ACT, 2902",
    notes: "From the card checkout: freight could not be priced automatically (incomplete_dimensions).",
  },
  items: [{ id: 0, name: "CONCEPT 2 - Row Erg with Standard Legs", qty: 1, price: 1705, sku: "C2ROWERG" }],
  subtotal: 1705,
  checkoutId: "5a5f6c91-058b-4081-8bc3-73494fce5f97",
  [ELAPSED_FIELD]: 40_000,
};

describe("quote request", () => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  let calls: { url: string; body: Record<string, unknown> }[];

  beforeEach(() => {
    process.env = { ...saved };
    process.env.RESEND_API_KEY = "test-key";
    process.env.QUOTE_FROM_EMAIL = "MasterKraft <quotes@masterkraft.com>";
    process.env.QUOTE_TO_EMAIL = "hello@masterkraft.com";
    delete process.env.HUBSPOT_FORM_QUOTE;
    calls = [];
    __resetFormLimits();
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    process.env = { ...saved };
    globalThis.fetch = realFetch;
  });

  const resend = () => calls.filter((c) => c.url.includes("api.resend.com")).map((c) => c.body);

  it("tells the team a freight price is owed and the customer it is coming", async () => {
    const body = await (await post({ ...quote, freightQuote: true })).json();
    expect(body).toMatchObject({ ok: true, accepted: true, email: "sent", customerEmail: "sent" });

    const [team, customer] = [
      resend().find((m) => (m.to as string[]).includes("hello@masterkraft.com")),
      resend().find((m) => (m.to as string[]).includes("jane@example.com")),
    ];
    expect(team?.subject).toMatch(/^Freight quote needed: Jane Rower/);
    expect(team?.reply_to).toBe("jane@example.com");
    expect(customer?.subject).toMatch(/freight price on its way/);
    expect(customer?.reply_to).toBe("hello@masterkraft.com");
    expect(String(customer?.html)).toContain("Hi Jane,");
    expect(String(customer?.html)).toContain("Nothing has been charged");
  });

  it("does not email the customer for an ordinary quote request", async () => {
    const body = await (await post(quote)).json();
    expect(body).toMatchObject({ ok: true, email: "sent", customerEmail: "skipped" });
    expect(resend()).toHaveLength(1);
    expect(resend()[0].subject).toMatch(/^Quote request: Jane Rower/);
  });

  it("emails nobody when the bot filter stops it", async () => {
    const res = await post({ ...quote, freightQuote: true, [HONEYPOT_FIELD]: "http://spam.example" });
    expect(await res.json()).toMatchObject({ ok: true, email: "skipped" });
    expect(resend()).toHaveLength(0);
  });

  it("still accepts the quote when the customer email fails", async () => {
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      calls.push({ url: String(url), body });
      const toCustomer = (body.to as string[] | undefined)?.includes("jane@example.com");
      return new Response("{}", { status: toCustomer ? 500 : 200 });
    }) as unknown as typeof fetch;
    const body = await (await post({ ...quote, freightQuote: true })).json();
    expect(body).toMatchObject({ ok: true, accepted: true, email: "sent", customerEmail: "error" });
  });
});
