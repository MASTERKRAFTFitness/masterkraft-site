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

  // Added the hard way: a 35-character street line made Easyship reject EVERY
  // quote in production, and it was logged as transient so nobody was told.
  it("recognises a request we are sending wrong", () => {
    expect(
      classifyFailure("The request body content is not valid. origin_address.line_1 is too long (maximum is 35 characters)")
    ).toBe("config");
    expect(classifyFailure("parcels[0].items[0].category can't be blank")).toBe("config");
  });

  // The exact strings Easyship returned on 2026-09-07, probed against the live
  // rates endpoint. Both wear the same wrapper as the line_1 outage above, which
  // is why matching the wrapper emailed Steve about an outage that was not
  // happening while the carrier answered every other request normally.
  it("separates a cart nobody can carry from a request we are sending wrong", () => {
    expect(
      classifyFailure(
        "The request body content is not valid. No shipping solutions available based on the information provided"
      )
    ).toBe("consignment");
    expect(
      classifyFailure(
        "The request body content is not valid. destination_address.state can't be blank"
      )
    ).toBe("consignment");
  });

  // The distinction is WHOSE fault recurs. An origin address or a carton comes
  // from our own configuration and data, so it breaks every cart until someone
  // fixes it; a destination and a quantity arrive from the customer.
  it("still calls our own origin and carton data a config fault", () => {
    expect(
      classifyFailure(
        "The request body content is not valid. origin_address.line_1 is too long (maximum is 35 characters)"
      )
    ).toBe("config");
    expect(
      classifyFailure(
        "The request body content is not valid. parcels[0].total_actual_weight must be greater than 0"
      )
    ).toBe("config");
  });

  // A fault naming no field is one we have never seen. Being woken for it beats
  // losing a carrier silently the way 2026-09-06 did.
  it("keeps waking someone for an unrecognised rejection", () => {
    expect(classifyFailure("The request body content is not valid.")).toBe("config");
  });

  // A false alarm at 2am costs more trust than it buys, so anything that is not
  // clearly a quota, a credential or a malformed request stays quiet.
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

  it("emails when we are sending a malformed request", async () => {
    reportCarrierFailure("Easyship", "The request body content is not valid. line_1 is too long");
    await settle();
    expect(sent[0]).toContain("rejecting our requests");
  });

  // THE REGRESSION THIS FILE EXISTS FOR. Two 300cm cartons is an unservable
  // cart, not a broken deployment, and the mail it used to send said the carrier
  // was switched off and every quote was affected. Neither was true.
  it("does not mail about a consignment no carrier will take", async () => {
    reportCarrierFailure(
      "Easyship",
      "The request body content is not valid. No shipping solutions available based on the information provided"
    );
    await settle();
    expect(sent).toHaveLength(0);
    expect(console.error).toHaveBeenCalled();
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
