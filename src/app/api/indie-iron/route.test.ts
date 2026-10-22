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
  /** How the welcome email (the Resend call addressed to the gym) fails, if it does. */
  let welcomeFails: "status" | "throw" | null = null;

  beforeEach(() => {
    process.env = { ...saved };
    process.env.HUBSPOT_PORTAL_ID = "442697895";
    process.env.RESEND_API_KEY = "test-key";
    process.env.QUOTE_FROM_EMAIL = "MasterKraft <quotes@masterkraft.com>";
    process.env.QUOTE_TO_EMAIL = "hello@masterkraft.com";
    delete process.env.HUBSPOT_FORM_INDIE_IRON;
    hubspotStatus = 200;
    resendStatus = 200;
    welcomeFails = null;
    calls = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      const u = String(url);
      calls.push({ url: u, body: String(init?.body ?? "") });
      const toGym = u.includes("resend.com") && String(init?.body).includes(`"to":["${valid.email}"]`);
      if (toGym && welcomeFails === "throw") throw new Error("network down");
      if (toGym && welcomeFails === "status") return new Response("{}", { status: 500 });
      return new Response("{}", { status: u.includes("hsforms.com") ? hubspotStatus : resendStatus });
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    process.env = { ...saved };
    globalThis.fetch = realFetch;
    vi.useRealTimers();
    vi.doUnmock("@/lib/indie-iron-welcome");
  });

  const hubspotCalls = () => calls.filter((c) => c.url.includes("hsforms.com"));
  const emails = () => calls.filter((c) => c.url.includes("resend.com"));
  const welcome = () =>
    emails()
      .map((c) => JSON.parse(c.body))
      .find((m) => m.to[0] === valid.email);

  it("sends every Indie Iron property the form defines", async () => {
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
    // The form cannot hold these, so they are left to a HubSpot workflow.
    expect(field("hubspot_owner_id")).toBeUndefined();
    expect(field("lifecyclestage")).toBeUndefined();
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

  describe("welcome email", () => {
    it("welcomes the gym with its window, the closing time and the pricing", async () => {
      process.env.HUBSPOT_FORM_INDIE_IRON = "guid-ii";
      await post(valid);
      const mail = welcome();
      expect(mail.to).toEqual(["jane@ironhouse.com.au"]);
      expect(mail.reply_to).toBe("hello@masterkraft.com");
      expect(mail.subject).toBe("Welcome to Indie Iron");
      expect(mail.html).toContain("Hi Jane,");
      expect(mail.html).toContain("Iron House Gym");
      expect(mail.html).toContain("<strong>Founding round</strong> window");
      expect(mail.html).toContain("23:59 Melbourne time on Sun 15 Nov 2026");
      expect(mail.html).toContain("up to 20% off the website price");
      expect(mail.html).toContain("What happens next");
      expect(mail.html).toContain("27 Dec 2026 – 10 Jan 2027");
      // The brief's rules: never "cheap", never tiers.
      expect(mail.html).not.toMatch(/cheap|tier/i);
    });

    it("is sent after the team email, so a slow welcome never delays the team", async () => {
      await post(valid);
      expect(emails().map((c) => JSON.parse(c.body).to[0])).toEqual(["hello@masterkraft.com", valid.email]);
    });

    it("escapes what the gym typed", async () => {
      await post({ ...valid, firstName: "<b>Jane</b>", company: "Iron & Co" });
      expect(welcome().html).toContain("Hi &lt;b&gt;Jane&lt;/b&gt;,");
      expect(welcome().html).toContain("Iron &amp; Co");
    });

    it("points a gym that is not sure at the next open window", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-12-01T00:00:00Z"));
      await post({ ...valid, window: "Not sure" });
      expect(welcome().html).toContain("haven't picked a buy window");
      expect(welcome().html).toContain("<strong>Autumn</strong>");
      expect(welcome().html).toContain("23:59 Melbourne time on Mon 15 Feb 2027");
    });

    it("rolls a window that closed mid-submit into the next one", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      // 00:30 on 16 Nov in Melbourne: the founding round closed 31 minutes ago.
      vi.setSystemTime(new Date("2026-11-15T13:30:00Z"));
      await post(valid);
      expect(welcome().html).toContain("Founding round window closed just before");
      expect(welcome().html).toContain("23:59 Melbourne time on Mon 15 Feb 2027");
    });

    for (const how of ["status", "throw"] as const) {
      it(`changes nothing for the gym when Resend fails it (${how})`, async () => {
        process.env.HUBSPOT_FORM_INDIE_IRON = "guid-ii";
        welcomeFails = how;
        const res = await post(valid);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true, hubspot: "submitted", notified: "sent" });
        expect(hubspotCalls()).toHaveLength(1);
      });
    }

    it("changes nothing for the gym when building it throws", async () => {
      vi.doMock("@/lib/indie-iron-welcome", () => ({
        welcomeEmail: () => {
          throw new Error("bad template");
        },
      }));
      const res = await post(valid);
      expect(await res.json()).toEqual({ ok: true, hubspot: "skipped", notified: "sent" });
      expect(emails()).toHaveLength(1);
    });

    it("is skipped, not attempted, without a Resend key", async () => {
      process.env.HUBSPOT_FORM_INDIE_IRON = "guid-ii";
      delete process.env.RESEND_API_KEY;
      const res = await post(valid);
      expect(await res.json()).toEqual({ ok: true, hubspot: "submitted", notified: "skipped" });
      expect(emails()).toHaveLength(0);
    });

    it("is not sent when the sign-up was captured nowhere", async () => {
      process.env.HUBSPOT_FORM_INDIE_IRON = "guid-ii";
      hubspotStatus = 500;
      resendStatus = 500;
      await post(valid);
      expect(welcome()).toBeUndefined();
    });
  });
});
