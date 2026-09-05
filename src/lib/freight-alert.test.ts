import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyFailure, clearAlertHistory, reportCarrierFailure } from "@/lib/freight-alert";

// The router fails soft, so a carrier dropping out is invisible from the
// outside. That is correct for a customer and dangerous for us: the Easyship
// trial allowance ran out on 2026-09-05 and the only reason anyone noticed was
// that a report happened to be running.
describe("classifying a carrier failure", () => {
  it("recognises an exhausted allowance", () => {
    expect(
      classifyFailure("API usage limit exceeded. Please upgrade your plan or wait")
    ).toBe("quota");
    expect(classifyFailure("quota exceeded")).toBe("quota");
  });

  it("recognises a rejected credential", () => {
    expect(classifyFailure("HTTP 401: unauthorized")).toBe("auth");
    expect(classifyFailure("Invalid API key provided")).toBe("auth");
  });

  // A false alarm at 2am costs more trust than it buys, so anything that is not
  // clearly a quota or a credential resolves on its own and stays quiet.
  it("treats anything else as transient", () => {
    expect(classifyFailure("ECONNREFUSED")).toBe("transient");
    expect(classifyFailure("HTTP 503")).toBe("transient");
    expect(classifyFailure("socket hang up")).toBe("transient");
  });
});

describe("alerting a human", () => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  let sent: string[] = [];

  beforeEach(() => {
    process.env = { ...saved };
    process.env.RESEND_API_KEY = "test-key";
    process.env.QUOTE_FROM_EMAIL = "site@masterkraft.com";
    process.env.FREIGHT_ALERT_EMAIL = "michael@masterkraft.com";
    sent = [];
    clearAlertHistory();
    vi.spyOn(console, "error").mockImplementation(() => {});
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      sent.push(String(JSON.parse(String(init.body)).subject));
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    process.env = { ...saved };
    globalThis.fetch = realFetch;
    clearAlertHistory();
    vi.restoreAllMocks();
  });

  const settle = () => new Promise((r) => setTimeout(r, 0));

  it("emails when the allowance runs out", async () => {
    reportCarrierFailure("Easyship", "API usage limit exceeded");
    await settle();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("hit its API limit");
  });

  it("emails when a credential is rejected", async () => {
    reportCarrierFailure("Easyship", "HTTP 401: unauthorized");
    await settle();
    expect(sent[0]).toContain("rejected our credentials");
  });

  // A busy checkout would otherwise send one mail per keystroke.
  it("sends one mail per problem, not one per request", async () => {
    for (let i = 0; i < 25; i++) reportCarrierFailure("Easyship", "API usage limit exceeded");
    await settle();
    expect(sent).toHaveLength(1);
  });

  it("still alerts about a different carrier or a different problem", async () => {
    reportCarrierFailure("Easyship", "API usage limit exceeded");
    reportCarrierFailure("Easyship", "HTTP 401: unauthorized");
    reportCarrierFailure("Australia Post", "API usage limit exceeded");
    await settle();
    expect(sent).toHaveLength(3);
  });

  it("stays quiet about a network blip", async () => {
    reportCarrierFailure("Easyship", "ECONNREFUSED");
    await settle();
    expect(sent).toHaveLength(0);
  });

  // Alerting must never be able to break or slow a checkout.
  it("survives the mailer being down, without throwing", async () => {
    globalThis.fetch = (async () => {
      throw new Error("resend is down");
    }) as unknown as typeof fetch;
    expect(() => reportCarrierFailure("Easyship", "API usage limit exceeded")).not.toThrow();
    await settle();
  });

  it("logs even when email is not configured", async () => {
    delete process.env.RESEND_API_KEY;
    reportCarrierFailure("Easyship", "API usage limit exceeded");
    await settle();
    expect(sent).toHaveLength(0);
    expect(console.error).toHaveBeenCalled();
  });
});
