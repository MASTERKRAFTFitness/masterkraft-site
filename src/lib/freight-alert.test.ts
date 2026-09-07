import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The durable cooldown. Unconfigured by default, which is how local dev and
// every test above it behave: no database, so the claim always succeeds and the
// in-process Map is the only gate.
type RpcResult = { data: boolean | null; error: { message: string } | null };
const rpc = vi.fn(async (): Promise<RpcResult> => ({ data: true, error: null }));
let dbConfigured = false;
vi.mock("@/lib/admin-db", () => ({
  adminDb: () => (dbConfigured ? { rpc } : null),
  adminDbConfigured: () => dbConfigured,
}));

const { classifyFailure, clearAlertHistory, reportCarrierFailure } = await import("@/lib/freight-alert");

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
    dbConfigured = false;
    rpc.mockClear();
    rpc.mockImplementation(async () => ({ data: true, error: null }));
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

  // THE COOLDOWN DOES NOT SURVIVE A COLD START, which is the bug. The Map above
  // is per instance, so on Vercel "one mail per six hours" was one per lambda.
  // A fresh instance is exactly what clearAlertHistory() simulates.
  describe("the cooldown that outlives the instance", () => {
    it("does not re-send after a cold start when the database says no", async () => {
      dbConfigured = true;
      reportCarrierFailure("Easyship", "API usage limit exceeded");
      await settle();
      expect(sent).toHaveLength(1);

      // A new lambda: empty Map, same problem, same six-hour window.
      clearAlertHistory();
      rpc.mockImplementation(async () => ({ data: false, error: null }));
      reportCarrierFailure("Easyship", "API usage limit exceeded");
      await settle();
      expect(sent).toHaveLength(1);
    });

    it("asks Postgres with the carrier, the kind and the window", async () => {
      dbConfigured = true;
      process.env.FREIGHT_ALERT_COOLDOWN_MINUTES = "30";
      reportCarrierFailure("Australia Post", "HTTP 401: unauthorized");
      await settle();
      expect(rpc).toHaveBeenCalledWith("claim_freight_alert", {
        p_carrier: "Australia Post",
        p_kind: "auth",
        p_cooldown_seconds: 1800,
      });
    });

    // A duplicate mail is a nuisance. An alerter that goes quiet because a
    // SECOND system is down goes quiet exactly when things are broken.
    it("sends anyway when the cooldown table cannot be reached", async () => {
      dbConfigured = true;
      rpc.mockImplementation(async () => {
        throw new Error("supabase unreachable");
      });
      reportCarrierFailure("Easyship", "API usage limit exceeded");
      await settle();
      expect(sent).toHaveLength(1);
    });

    it("sends anyway when the migration has not been applied", async () => {
      dbConfigured = true;
      rpc.mockImplementation(async () => ({
        data: null,
        error: { message: "function claim_freight_alert does not exist" },
      }));
      reportCarrierFailure("Easyship", "API usage limit exceeded");
      await settle();
      expect(sent).toHaveLength(1);
    });

    // Nothing about the durable claim may reach a carrier that is fine, or a
    // cart that simply cannot be carried.
    it("never asks about a failure it would not mail about", async () => {
      dbConfigured = true;
      reportCarrierFailure("Easyship", "ECONNREFUSED");
      reportCarrierFailure("Easyship", "The request body content is not valid. No shipping solutions available based on the information provided");
      await settle();
      expect(rpc).not.toHaveBeenCalled();
      expect(sent).toHaveLength(0);
    });
  });

  it("logs even when email is not configured", async () => {
    delete process.env.RESEND_API_KEY;
    reportCarrierFailure("Easyship", "API usage limit exceeded");
    await settle();
    expect(sent).toHaveLength(0);
    expect(console.error).toHaveBeenCalled();
  });
});
