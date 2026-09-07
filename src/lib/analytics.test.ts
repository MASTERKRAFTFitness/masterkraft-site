// Guards the Google Ads conversion calls. The ID and labels are read at import
// time, so each case reloads the module — the same shape as site.test.ts.
//
// What is actually worth pinning here is the UNSET case: this ships before the
// Ads account has any numbers in it, and the failure mode to avoid is a missing
// label quietly turning into a conversion sent to "AW-123/undefined".
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

  it("still reports to GA4 when Ads is not configured", async () => {
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
