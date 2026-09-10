import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ELAPSED_FIELD, HONEYPOT_FIELD, RATE_LIMITED_MESSAGE, PER_WINDOW } from "@/lib/form-guard";

// The warranty route emails a human on every submission by design, so it is the
// form where an unfiltered bot costs the most: straight into the MD's inbox.
// These tests are about one guarantee - a blocked submission reaches NOTHING,
// and a real claim is never mistaken for one.

// lib/hubspot.ts reads HUBSPOT_PORTAL_ID at module load, and lib/form-guard.ts
// holds its rate-limit buckets in module state, so resetting modules per request
// both arranges the env and gives each test a clean slate.
const post = async (body: unknown, ip = "203.0.113.5") => {
  vi.resetModules();
  const { POST } = await import("./route");
  return POST(
    new Request("https://masterkraft.com/api/warranty-claim", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    })
  );
};

// Verbatim from the claim Steve forwarded on 9 September 2026.
const REAL_SPAM = {
  fullName: "Jymyyqqw",
  email: "wa.tse.ka.h@gmail.com",
  phone: "7631059887",
  company: "Asdnusg LLC",
  product: "vUwHtWUifxAvLRekCeOlIDT",
  sku: "AAXsDqSbZIObDvYqte",
  orderRef: "OzLUwWfDoiXpWrGTn",
  purchaseDate: "1970-05-31",
  fault: "ForlvKQIQhZVEMOFcElc",
  [ELAPSED_FIELD]: 30_000, // even if it takes its time
};

const REAL_CLAIM = {
  fullName: "Sarah Nguyen",
  email: "sarah@northsidestrength.com.au",
  phone: "0428 284 555",
  company: "Northside Strength",
  product: "Commercial Treadmill",
  sku: "MKCT900X",
  orderRef: "INV-2026-8837",
  purchaseDate: "2024-11-02",
  fault: "The belt slips under load and the motor cuts out after about ten minutes of use.",
  [ELAPSED_FIELD]: 62_000,
};

describe("warranty claim", () => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  let calls: string[];

  beforeEach(() => {
    process.env = { ...saved };
    process.env.HUBSPOT_PORTAL_ID = "442697895";
    process.env.HUBSPOT_FORM_WARRANTY = "1959a42c-ea7d-42d3-abf6-e7be062f9885";
    process.env.RESEND_API_KEY = "test-key";
    process.env.QUOTE_FROM_EMAIL = "MasterKraft <quotes@masterkraft.com>";
    process.env.QUOTE_TO_EMAIL = "hello@masterkraft.com";
    calls = [];
    globalThis.fetch = (async (url: string) => {
      calls.push(String(url));
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    process.env = { ...saved };
    globalThis.fetch = realFetch;
  });

  const reachedAnything = () => calls.length;

  it("lodges a real claim", async () => {
    const res = await post(REAL_CLAIM);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, hubspot: "submitted" });
    expect(reachedAnything()).toBeGreaterThan(0);
  });

  // The whole point of the exercise.
  it("sends the real spam submission nowhere", async () => {
    const res = await post(REAL_SPAM);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(reachedAnything()).toBe(0);
  });

  it("sends nothing when the honeypot is filled", async () => {
    const res = await post({ ...REAL_CLAIM, [HONEYPOT_FIELD]: "http://cheap-seo.example" });
    expect(await res.json()).toMatchObject({ ok: true });
    expect(reachedAnything()).toBe(0);
  });

  it("sends nothing when the form was filled faster than a person can type", async () => {
    const res = await post({ ...REAL_CLAIM, [ELAPSED_FIELD]: 200 });
    expect(await res.json()).toMatchObject({ ok: true });
    expect(reachedAnything()).toBe(0);
  });

  // A blocked bot must not be able to tell it was blocked, or it tunes around it.
  it("answers a blocked submission with the same shape as a lodged one", async () => {
    const blocked = await (await post(REAL_SPAM)).json();
    expect(Object.keys(blocked).sort()).toEqual(["confirmed", "hubspot", "ok"]);
    expect(blocked.ok).toBe(true);
  });

  it("still tells a real person what they left out", async () => {
    const res = await post({ ...REAL_CLAIM, fault: "" });
    expect(res.status).toBe(400);
  });

  // The one verdict a real person can trip, so it is the one that gets told.
  it("tells someone over the rate limit where to go instead of swallowing the claim", async () => {
    vi.resetModules();
    const { POST } = await import("./route");
    const send = () =>
      POST(
        new Request("https://masterkraft.com/api/warranty-claim", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-forwarded-for": "198.51.100.44" },
          body: JSON.stringify(REAL_CLAIM),
        })
      );
    for (let i = 0; i < PER_WINDOW; i++) expect((await send()).status).toBe(200);
    const res = await send();
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ ok: false, error: RATE_LIMITED_MESSAGE });
  });
});
