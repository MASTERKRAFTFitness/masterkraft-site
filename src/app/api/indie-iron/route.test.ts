import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";

// Indie Iron sign-ups. HUBSPOT_FORM_INDIE_IRON will not exist on day one, so
// the "skipped" path is tested as hard as the happy one.

const valid = {
  firstName: "Jane",
  lastName: "Smith",
  email: "jane@ironhouse.com.au",
  phone: "0400 000 000",
  company: "Iron House Gym",
  state: "VIC",
  sites: "2–3",
  window: "Founding round (closes 15 Nov 2026)",
  products: ["Plates", "Kettlebells"],
  branding: "My gym logo",
  message: "",
  consent: true,
};

// lib/hubspot.ts reads HUBSPOT_PORTAL_ID at module load.
const post = async (body: unknown) => {
  vi.resetModules();
  const { POST } = await import("./route");
  return POST(
    new Request("https://masterkraft.com/api/indie-iron", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` },
      body: JSON.stringify(body),
    })
  );
};

describe("Indie Iron sign-up", () => {
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
    delete process.env.HUBSPOT_FORM_INDIE_IRON;
    hubspotStatus = 200;
    resendStatus = 200;
    calls = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, body: String(init?.body ?? "") });
      return new Response("{}", { status: u.includes("hsforms.com") ? hubspotStatus : resendStatus });
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    process.env = { ...saved };
    globalThis.fetch = realFetch;
  });

  const hubspotCalls = () => calls.filter((c) => c.url.includes("hsforms.com"));
  const emails = () => calls.filter((c) => c.url.includes("resend.com"));

  it("sends every Indie Iron property, the owner and the lifecycle stage", async () => {
    process.env.HUBSPOT_FORM_INDIE_IRON = "guid-ii";
    const res = await post(valid);
    expect(await res.json()).toMatchObject({ ok: true, hubspot: "submitted", notified: "sent" });
    const sent = JSON.parse(hubspotCalls()[0].body);
    const field = (n: string) => sent.fields.find((f: { name: string }) => f.name === n)?.value;
    expect(hubspotCalls()[0].url).toContain("/442697895/guid-ii");
    expect(field("company")).toBe("Iron House Gym");
    expect(field("indie_iron_sites")).toBe("2–3");
    expect(field("indie_iron_window")).toBe("Founding round (closes 15 Nov 2026)");
    expect(field("indie_iron_products")).toBe("Plates;Kettlebells");
    expect(field("indie_iron_branding")).toBe("My gym logo");
    expect(field("indie_iron_member")).toBe("true");
    expect(field("lifecyclestage")).toBe("lead");
    expect(field("hubspot_owner_id")).toBe("368320454");
  });

  it("tells the team about every sign-up, with the reply going to the gym", async () => {
    process.env.HUBSPOT_FORM_INDIE_IRON = "guid-ii";
    await post(valid);
    const mail = JSON.parse(emails()[0].body);
    expect(mail.to).toEqual(["hello@masterkraft.com"]);
    expect(mail.reply_to).toBe("jane@ironhouse.com.au");
    expect(mail.html).toContain("Iron House Gym");
    expect(mail.html).not.toContain("did NOT record");
  });

  it("flags it loudly when HubSpot has no form yet", async () => {
    const res = await post(valid);
    expect(await res.json()).toMatchObject({ ok: true, hubspot: "skipped", notified: "sent" });
    expect(JSON.parse(emails()[0].body).html).toContain("did NOT record");
  });

  it("does not say 'you're in' when the sign-up was captured nowhere", async () => {
    process.env.HUBSPOT_FORM_INDIE_IRON = "guid-ii";
    hubspotStatus = 500;
    resendStatus = 500;
    const res = await post(valid);
    expect(res.status).toBe(502);
    expect((await res.json()).ok).toBe(false);
  });

  it("requires the required fields, a product and the consent tick", async () => {
    for (const k of ["firstName", "lastName", "email", "phone", "company", "state"]) {
      expect((await post({ ...valid, [k]: "" })).status, `${k} is required`).toBe(400);
    }
    expect((await post({ ...valid, products: [] })).status).toBe(400);
    expect((await post({ ...valid, consent: false })).status).toBe(400);
  });

  it("leaves the optional fields optional", async () => {
    const res = await post({ ...valid, sites: "", window: "", branding: "", message: "" });
    expect(res.status).toBe(200);
  });

  it("rejects values the form could not have produced", async () => {
    for (const bad of [
      { state: "Tasmania" },
      { sites: "47" },
      { products: ["Rowers"] },
      { branding: "Both" },
      { window: "Whenever" },
    ]) {
      expect((await post({ ...valid, ...bad })).status, JSON.stringify(bad)).toBe(400);
    }
    expect((await post({ ...valid, window: "Not sure" })).status).toBe(200);
    expect(hubspotCalls()).toHaveLength(0);
  });
});
