import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The bug this route shipped with: no form GUID meant every signup returned
// ok:true and went nowhere. These tests exist so that cannot come back quietly.

// lib/hubspot.ts captures HUBSPOT_PORTAL_ID at module load, so the route has to
// be imported AFTER the env is arranged or every case looks like "skipped".
const post = async (body: unknown) => {
  vi.resetModules();
  const { POST } = await import("./route");
  return POST(new Request("https://masterkraft.com/api/newsletter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
};

describe("newsletter signup", () => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  let calls: string[];

  beforeEach(() => {
    process.env = { ...saved };
    process.env.HUBSPOT_PORTAL_ID = "442697895";
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

  const hitHubspot = () => calls.filter((u) => u.includes("hsforms.com")).length;
  const hitResend = () => calls.filter((u) => u.includes("api.resend.com")).length;

  it("rejects a request with no email", async () => {
    const res = await post({});
    expect(res.status).toBe(400);
  });

  it("sends to HubSpot and does NOT email when a form GUID is configured", async () => {
    process.env.HUBSPOT_FORM_NEWSLETTER = "1959a42c-ea7d-42d3-abf6-e7be062f9885";
    const body = await (await post({ email: "someone@example.com" })).json();
    expect(body).toMatchObject({ ok: true, hubspot: "submitted", fallback: "not_needed" });
    expect(hitHubspot()).toBe(1);
    expect(hitResend()).toBe(0);
  });

  // The actual production state for months: no GUID, so nothing reached HubSpot.
  it("emails the signup when no form GUID is configured", async () => {
    delete process.env.HUBSPOT_FORM_NEWSLETTER;
    const body = await (await post({ email: "someone@example.com" })).json();
    expect(body).toMatchObject({ ok: true, hubspot: "skipped", fallback: "sent" });
    expect(hitHubspot()).toBe(0);
    expect(hitResend()).toBe(1);
  });

  it("emails the signup when HubSpot rejects it", async () => {
    process.env.HUBSPOT_FORM_NEWSLETTER = "bad-guid";
    globalThis.fetch = (async (url: string) => {
      calls.push(String(url));
      if (String(url).includes("hsforms.com")) return new Response("nope", { status: 404 });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const body = await (await post({ email: "someone@example.com" })).json();
    expect(body).toMatchObject({ ok: true, hubspot: "error", fallback: "sent" });
    expect(hitResend()).toBe(1);
  });

  // No Resend credentials either. Still 200 to the subscriber, but the response
  // must not claim it was captured when it was not.
  it("reports honestly when neither path is configured", async () => {
    delete process.env.HUBSPOT_FORM_NEWSLETTER;
    delete process.env.RESEND_API_KEY;
    const body = await (await post({ email: "someone@example.com" })).json();
    expect(body).toMatchObject({ ok: true, hubspot: "skipped", fallback: "skipped" });
    expect(hitResend()).toBe(0);
  });
});
