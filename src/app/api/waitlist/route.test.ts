import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// This list is the whole point of the Recovery Roller page, and it is small and
// high value. These tests exist so a registration cannot go missing the way
// newsletter signups did: HUBSPOT_FORM_WAITLIST does not exist yet, so the
// "skipped" path is the one that will actually run on day one.

const valid = {
  fullName: "Jane Marie Smith",
  email: "jane@fitcorp.com.au",
  phone: "0400 000 000",
  company: "FitCorp",
  siteCount: "6 to 20 sites",
  timeframe: "This quarter",
  consent: "on",
};

// lib/hubspot.ts captures HUBSPOT_PORTAL_ID at module load, so the route has to
// be imported AFTER the env is arranged.
const post = async (body: unknown) => {
  vi.resetModules();
  const { POST } = await import("./route");
  return POST(new Request("https://masterkraft.com/api/waitlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
};

describe("Recovery Roller waitlist", () => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  let calls: { url: string; body: string }[];
  let hubspotStatus = 200;
  let resendStatus = 200;

  beforeEach(() => {
    process.env = { ...saved };
    process.env.HUBSPOT_PORTAL_ID = "442697895";
    process.env.RESEND_API_KEY = "test-key";
    process.env.QUOTE_FROM_EMAIL = "MasterKraft <quotes@masterkraft.com>";
    process.env.QUOTE_TO_EMAIL = "hello@masterkraft.com";
    delete process.env.HUBSPOT_FORM_WAITLIST;
    hubspotStatus = 200;
    resendStatus = 200;
    calls = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, body: String(init?.body ?? "") });
      const status = u.includes("hsforms.com") ? hubspotStatus : resendStatus;
      return new Response("{}", { status });
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    process.env = { ...saved };
    globalThis.fetch = realFetch;
  });

  const hubspotCalls = () => calls.filter((c) => c.url.includes("hsforms.com"));
  const emails = () => calls.filter((c) => c.url.includes("resend.com"));

  it("records the lead in HubSpot when a form GUID is configured", async () => {
    process.env.HUBSPOT_FORM_WAITLIST = "guid-123";
    const res = await post(valid);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ ok: true, hubspot: "submitted", fallback: "not_needed" });
    expect(hubspotCalls()).toHaveLength(1);
  });

  it("stamps the campaign and splits the name so the list can be pulled cleanly", async () => {
    process.env.HUBSPOT_FORM_WAITLIST = "guid-123";
    await post(valid);
    const sent = JSON.parse(hubspotCalls()[0].body);
    const field = (n: string) =>
      sent.fields.find((f: { name: string }) => f.name === n)?.value;
    expect(field("firstname")).toBe("Jane Marie");
    expect(field("lastname")).toBe("Smith");
    expect(field("contact_source")).toBe("Recovery Roller Waitlist");
    expect(field("source_campaign")).toBe("MK_RecoveryRoller_2026");
    expect(field("site_count")).toBe("6 to 20 sites");
  });

  it("emails the lead to a human when no form GUID is configured", async () => {
    const res = await post(valid); // HUBSPOT_FORM_WAITLIST unset - the day-one state
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, hubspot: "skipped", fallback: "sent" });
    const internal = emails().find((e) => e.body.includes("hello@masterkraft.com"));
    expect(internal).toBeDefined();
    expect(internal!.body).toContain("FitCorp");
    expect(internal!.body).toContain("0400 000 000");
  });

  it("flags a network operator on the internal notification", async () => {
    const internalFor = async (siteCount: string) => {
      calls = [];
      await post({ ...valid, siteCount });
      return emails().find((e) => e.body.includes("hello@masterkraft.com"))!.body;
    };
    expect(await internalFor("More than 20 sites")).toContain("NETWORK OPERATOR");
    expect(await internalFor("One site")).not.toContain("NETWORK OPERATOR");
  });

  it("always sends the confirmation the page promised", async () => {
    process.env.HUBSPOT_FORM_WAITLIST = "guid-123";
    await post(valid);
    const toLead = emails().find((e) => e.body.includes("jane@fitcorp.com.au"));
    expect(toLead).toBeDefined();
    expect(toLead!.body).toContain("You are on the list");
    // No date is promised: September and November are not settled.
    expect(toLead!.body).not.toMatch(/September|November/);
  });

  it("does NOT claim success when the lead was captured nowhere", async () => {
    hubspotStatus = 500;
    resendStatus = 500;
    const res = await post(valid);
    const json = await res.json();
    expect(res.status).toBe(502);
    expect(json.ok).toBe(false);
  });

  it("requires every field and the consent tick", async () => {
    for (const missing of ["fullName", "email", "phone", "company", "siteCount", "timeframe"]) {
      const res = await post({ ...valid, [missing]: "" });
      expect(res.status, `${missing} should be required`).toBe(400);
    }
    const noConsent = await post({ ...valid, consent: "" });
    expect(noConsent.status).toBe(400);
  });

  it("rejects a selection the form could not have produced", async () => {
    const res = await post({ ...valid, siteCount: "47 sites" });
    expect(res.status).toBe(400);
    expect(hubspotCalls()).toHaveLength(0);
  });
});
