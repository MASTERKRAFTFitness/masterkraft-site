import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ELAPSED_FIELD, HONEYPOT_FIELD, __resetFormLimits } from "@/lib/form-guard";

// The gap these tests hold shut: this route talked to HubSpot and nothing else,
// so a genuine enquiry could sit unread in the CRM with no inbox ever told. The
// notification is not a fallback for a HubSpot failure - it must send on every
// accepted submission - and nothing about a blocked bot may reach an inbox.

// lib/hubspot.ts captures HUBSPOT_PORTAL_ID at module load, so the route has to
// be imported AFTER the env is arranged or every case looks like "skipped".
const post = async (body: unknown) => {
  vi.resetModules();
  const { POST } = await import("./route");
  return POST(new Request("https://masterkraft.com/api/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.9" },
    body: JSON.stringify(body),
  }));
};

const enquiry = {
  firstName: "Robert",
  lastName: "Morrissey",
  email: "robert@example.com",
  phone: "0450900259",
  company: "Northside Strength",
  topic: "equipment",
  message: "Can I get the measurements on the functional trainer?",
  [ELAPSED_FIELD]: 40_000,
};

describe("contact enquiry", () => {
  const saved = { ...process.env };
  const realFetch = globalThis.fetch;
  let calls: { url: string; body: string }[];

  beforeEach(() => {
    process.env = { ...saved };
    process.env.HUBSPOT_PORTAL_ID = "442697895";
    process.env.HUBSPOT_FORM_CONTACT = "162b5e32-7422-434b-ad4b-e0898d05e3a8";
    process.env.RESEND_API_KEY = "test-key";
    process.env.QUOTE_FROM_EMAIL = "MasterKraft <quotes@masterkraft.com>";
    process.env.QUOTE_TO_EMAIL = "hello@masterkraft.com";
    calls = [];
    __resetFormLimits();
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body ?? "") });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    process.env = { ...saved };
    globalThis.fetch = realFetch;
  });

  const resend = () => calls.filter((c) => c.url.includes("api.resend.com"));
  const hubspot = () => calls.filter((c) => c.url.includes("hsforms.com"));

  it("rejects a submission with no message", async () => {
    const res = await post({ ...enquiry, message: "" });
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  // The whole point of the change: HubSpot succeeding is not a reason to stay quiet.
  it("emails the team even when HubSpot takes the lead", async () => {
    const body = await (await post(enquiry)).json();
    expect(body).toMatchObject({ ok: true, hubspot: "submitted", notified: "sent" });
    expect(hubspot()).toHaveLength(1);
    expect(resend()).toHaveLength(1);
  });

  it("still emails when HubSpot is not configured", async () => {
    delete process.env.HUBSPOT_FORM_CONTACT;
    const body = await (await post(enquiry)).json();
    expect(body).toMatchObject({ ok: true, hubspot: "skipped", notified: "sent" });
    expect(resend()).toHaveLength(1);
  });

  it("sends to every address on the notification list, replying to the enquirer", async () => {
    process.env.QUOTE_TO_EMAIL = "hello@masterkraft.com, steve@masterkraft.com";
    await post(enquiry);
    const sent = JSON.parse(resend()[0].body);
    expect(sent.to).toEqual(["hello@masterkraft.com", "steve@masterkraft.com"]);
    expect(sent.reply_to).toBe("robert@example.com");
  });

  it("puts the name, company and topic in the subject so it reads on a phone", async () => {
    await post(enquiry);
    const sent = JSON.parse(resend()[0].body);
    expect(sent.subject).toBe(
      "Enquiry: Robert Morrissey (Northside Strength) — Equipment purchase"
    );
  });

  it("carries the message and the contact details in the body", async () => {
    await post(enquiry);
    const sent = JSON.parse(resend()[0].body);
    expect(sent.html).toContain("Can I get the measurements on the functional trainer?");
    expect(sent.html).toContain("robert@example.com");
    expect(sent.html).toContain("0450900259");
  });

  // A blocked bot must cost an inbox nothing. This is the case that made the
  // warranty form painful in the first place.
  it("emails nobody when the honeypot is filled", async () => {
    const body = await (await post({ ...enquiry, [HONEYPOT_FIELD]: "http://spam.example" })).json();
    expect(body).toMatchObject({ ok: true, notified: "skipped" });
    expect(calls).toHaveLength(0);
  });

  it("emails nobody when the form was filled impossibly fast", async () => {
    const body = await (await post({ ...enquiry, [ELAPSED_FIELD]: 120 })).json();
    expect(body).toMatchObject({ ok: true, notified: "skipped" });
    expect(calls).toHaveLength(0);
  });

  // The 8-10 September flood, exactly as it arrived: random strings in every field.
  it("emails nobody when the fields read as machine-generated", async () => {
    const body = await (await post({
      ...enquiry,
      firstName: "Bootteb",
      lastName: "Zogybpxe",
      company: "Vuqmjqxcrtn",
      message: "lMARyYkHLkPMtmnwqIsUJy",
    })).json();
    expect(body).toMatchObject({ ok: true, notified: "skipped" });
    expect(calls).toHaveLength(0);
  });

  it("does not email when Resend is unconfigured, and says so rather than claiming sent", async () => {
    delete process.env.RESEND_API_KEY;
    const body = await (await post(enquiry)).json();
    expect(body).toMatchObject({ ok: true, hubspot: "submitted", notified: "skipped" });
    expect(resend()).toHaveLength(0);
  });
});
