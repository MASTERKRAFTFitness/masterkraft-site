// Guards the Google Ads conversion calls. The ID and labels are read at import
// time, so each case reloads the module — the same shape as site.test.ts.
//
// The ID and lead label have in-code defaults (lib/google-ads); the purchase
// label does not. The failure mode to avoid is a missing label quietly turning
// into a conversion sent to "AW-123/undefined".
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";

type GtagCall = unknown[];

function gtagSpy(): GtagCall[] {
  const calls: GtagCall[] = [];
  (globalThis as unknown as { window: unknown }).window = globalThis;
  (globalThis as unknown as { gtag: (...a: unknown[]) => void }).gtag = (...a) => {
    calls.push(a);
  };
  return calls;
}


function fbqSpy(): GtagCall[] {
  const calls: GtagCall[] = [];
  (globalThis as unknown as { window: unknown }).window = globalThis;
  (globalThis as unknown as { fbq: (...a: unknown[]) => void }).fbq = (...a) => {
    calls.push(a);
  };
  return calls;
}

async function withEnv(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return import("@/lib/analytics");
}

const configured = {
  NEXT_PUBLIC_GOOGLE_ADS_ID: "AW-123456789",
  NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL: "purchaseLabel",
  NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL: "leadLabel",
};

beforeEach(() => {
  delete (globalThis as unknown as { _hsq?: unknown[] })._hsq;
});

afterEach(() => {
  for (const k of Object.keys(configured)) delete process.env[k];
  delete (globalThis as unknown as { gtag?: unknown }).gtag;
  delete (globalThis as unknown as { fbq?: unknown }).fbq;
  delete (globalThis as unknown as { window?: unknown }).window;
  vi.resetModules();
});

describe("trackPurchase", () => {
  it("sends the GA4 event and an Ads conversion addressed to the action", async () => {
    const calls = gtagSpy();
    const { trackPurchase } = await withEnv(configured);
    trackPurchase({ id: "MK-1001", value: 192.5 });

    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual([
      "event",
      "purchase",
      { currency: "AUD", value: 192.5, transaction_id: "MK-1001" },
    ]);
    expect(calls[1]).toEqual([
      "event",
      "conversion",
      {
        send_to: "AW-123456789/purchaseLabel",
        currency: "AUD",
        value: 192.5,
        // Ads dedupes on this: a reloaded confirmation must not count twice.
        transaction_id: "MK-1001",
      },
    ]);
  });

  it("sends no purchase conversion when env is unset (no default purchase label)", async () => {
    const calls = gtagSpy();
    const { trackPurchase } = await withEnv({
      NEXT_PUBLIC_GOOGLE_ADS_ID: undefined,
      NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL: undefined,
      NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL: undefined,
    });
    trackPurchase({ id: "MK-1001", value: 192.5 });

    expect(calls).toHaveLength(1);
    expect(calls[0][1]).toBe("purchase");
  });

  it("sends nothing to Ads when the account has an ID but no label yet", async () => {
    const calls = gtagSpy();
    const { trackPurchase } = await withEnv({
      ...configured,
      NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL: undefined,
    });
    trackPurchase({ id: "MK-1001", value: 192.5 });

    expect(calls).toHaveLength(1);
    expect(JSON.stringify(calls)).not.toContain("undefined");
  });
});

describe("trackLead", () => {
  it("counts a quote as its own conversion action, not a purchase", async () => {
    const calls = gtagSpy();
    const { trackLead } = await withEnv(configured);
    trackLead(4820, 7);

    expect(calls[0]).toEqual(["event", "generate_lead", { currency: "AUD", value: 4820, items: 7 }]);
    expect(calls[1]).toEqual([
      "event",
      "conversion",
      { send_to: "AW-123456789/leadLabel", currency: "AUD", value: 4820 },
    ]);
    // A quote is a lead, not revenue — nothing here should look like an order.
    expect(JSON.stringify(calls)).not.toContain("transaction_id");
  });
});

describe("trackEnquiry", () => {
  it("counts a brief as an Ads lead, but sends no value", async () => {
    const calls = gtagSpy();
    const { trackEnquiry } = await withEnv(configured);
    trackEnquiry("fitout-brief", "dana@example.com");

    expect(calls[0]).toEqual(["event", "generate_lead", { method: "fitout-brief" }]);
    expect(calls[1]).toEqual([
      "event",
      "conversion",
      { send_to: "AW-123456789/leadLabel", currency: "AUD" },
    ]);
    // A brief has no cart behind it. trackLead's `value` is a quoted subtotal,
    // and a number invented here would corrupt the average deal size the fitout
    // funnel is judged on — so the conversion carries none.
    expect(JSON.stringify(calls)).not.toContain("value");
  });

  // No env vars set: the pinned account and "Submit quote" label take over, so
  // the conversion cannot go missing because a Vercel variable was never added.
  it("falls back to the pinned Ads account and quote label when env is unset", async () => {
    const calls = gtagSpy();
    const { trackEnquiry } = await withEnv({
      NEXT_PUBLIC_GOOGLE_ADS_ID: undefined,
      NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL: undefined,
    });
    trackEnquiry("contact");

    expect(calls).toEqual([
      ["event", "generate_lead", { method: "contact" }],
      [
        "event",
        "conversion",
        { send_to: "AW-18485786308/ZPQ0CJe6-ZMdEMTt2u5E", currency: "AUD" },
      ],
    ]);
    expect(JSON.stringify(calls)).not.toContain("undefined");
  });
});

describe("the Meta pixel conversion", () => {
  it("sends Meta's standard Lead when the pixel has loaded", async () => {
    gtagSpy();
    const meta = fbqSpy();
    const { trackEnquiry } = await withEnv(configured);
    trackEnquiry("fitout-brief", "dana@example.com");

    // The name must be exactly "Lead" — Meta only optimises toward events it
    // recognises, and a custom name leaves campaigns bidding on link clicks.
    expect(meta).toEqual([["track", "Lead", { content_name: "fitout-brief" }]]);
  });

  // fbq only exists after the visitor accepts cookies (see CookieConsent), and
  // off masterkraft.com it never loads at all. Both are ordinary
  // states, not failures: the GA4 event must still fire and nothing may throw.
  it("is a no-op when the pixel never loaded", async () => {
    const calls = gtagSpy();
    const { trackEnquiry } = await withEnv(configured);
    expect(() => trackEnquiry("contact")).not.toThrow();
    expect(calls.some((c) => c[1] === "generate_lead")).toBe(true);
  });
});
