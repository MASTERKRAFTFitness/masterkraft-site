import { describe, expect, it } from "vitest";
import {
  decide,
  emailsFrom,
  reviewAfterDays,
  reviewDue,
  reviewEmail,
  reviewUrl,
  shippedEmail,
  trackingUrl,
  waitHours,
  withLabelTracking,
} from "./shipped-notices";
import type { DispatchedShipment } from "./unleashed";

// Shaped on SO-00000862's real shipment, 2026-10-17: dispatched via InterParcel
// with no tracking number, which is the normal case.
const shipment = (over: Partial<DispatchedShipment> = {}): DispatchedShipment => ({
  orderNumber: "SO-00000862",
  customerCode: "WEB-MASTERKRAFT",
  deliveryName: "Mirinda O'Gorman",
  shipmentNumber: "SS-00000862",
  status: "Dispatched",
  dispatchedAt: "2026-10-13T00:00:00.000Z",
  trackingNumber: null,
  carrier: "InterParcel",
  packages: null,
  weightKg: null,
  deliverTo: "Brunswick West VIC 3055",
  lineCount: 1,
  lines: [{ name: "High Grip Dead Ball - 3kg", code: "AMDEHG01", qty: 1 }],
  ...over,
});

const opts = {
  webCustomerCode: "WEB-MASTERKRAFT",
  from: new Date("2026-10-01T00:00:00Z"),
  now: new Date("2026-10-13T10:00:00Z"),
  waitHours: 24,
};

describe("decide", () => {
  it("sends at once when there is a tracking number", () => {
    expect(decide(shipment({ trackingNumber: "FE6542476" }), opts)).toEqual({ action: "send", kind: "tracked" });
  });

  it("waits for a tracking number before the wait is up", () => {
    expect(decide(shipment(), opts).action).toBe("wait");
  });

  it("sends without tracking once the wait is up", () => {
    // Most dispatches never get a number, and the confirmation promised contact.
    const later = { ...opts, now: new Date("2026-10-14T01:00:00Z") };
    expect(decide(shipment(), later)).toEqual({ action: "send", kind: "untracked" });
  });

  it("never emails a trade customer's dispatch", () => {
    const trade = shipment({ customerCode: "FERNWOOD-PAK", trackingNumber: "FE1" });
    expect(decide(trade, opts).action).toBe("ignore");
  });

  it("does not reach back before the start date", () => {
    const old = shipment({ dispatchedAt: "2026-09-30T00:00:00.000Z", trackingNumber: "FE1" });
    expect(decide(old, opts).action).toBe("ignore");
  });

  it("counts the start date itself, though DispatchDate is midnight UTC", () => {
    const from = new Date("2026-10-13T05:00:00Z");
    expect(decide(shipment({ trackingNumber: "FE1" }), { ...opts, from }).action).toBe("send");
  });

  it("waits on a parked shipment", () => {
    expect(decide(shipment({ status: "Parked", trackingNumber: "FE1" }), opts).action).toBe("wait");
  });
});

describe("switches", () => {
  it("is off with no start date, or a bad one", () => {
    expect(emailsFrom(undefined)).toBeNull();
    expect(emailsFrom("")).toBeNull();
    expect(emailsFrom("soon")).toBeNull();
    expect(emailsFrom("2026-10-17")?.toISOString()).toBe("2026-10-17T00:00:00.000Z");
  });

  it("defaults the wait to a day", () => {
    expect(waitHours(undefined)).toBe(24);
    expect(waitHours("")).toBe(24);
    expect(waitHours("6")).toBe(6);
    expect(waitHours("nope")).toBe(24);
  });
});

describe("trackingUrl", () => {
  it("links Australia Post", () => {
    expect(trackingUrl("Australia Post", "33ABC123")).toBe(
      "https://auspost.com.au/mypost/track/details/33ABC123"
    );
  });

  it("gives no link where the carrier's page is not known", () => {
    expect(trackingUrl("Freight Exchange", "FE6542476")).toBeNull();
    expect(trackingUrl(null, "COMET-380946")).toBeNull();
  });

  it("gives no link for a note rather than a number", () => {
    // Real value from Unleashed: carrier name and number typed into one field.
    expect(trackingUrl("Australia Post", "Capital Transport #258163")).toBeNull();
  });
});

describe("shippedEmail", () => {
  it("gives the tracking number when there is one", () => {
    const { subject, html } = shippedEmail(shipment({ trackingNumber: "FE6542476", carrier: "Freight Exchange" }), "Mirinda O'Gorman");
    expect(subject).toBe("Your MasterKraft order #SO-00000862 is on its way");
    expect(html).toContain("Hi Mirinda,");
    expect(html).toContain("Freight Exchange FE6542476");
    expect(html).not.toContain("reply to this email and we'll send it");
  });

  it("offers tracking by reply when there is none", () => {
    const { html } = shippedEmail(shipment(), null);
    expect(html).toContain("Hi Mirinda,"); // falls back to the delivery name
    expect(html).toContain("travelling with InterParcel");
    expect(html).toContain("reply to this email and we'll send it through");
  });

  it("escapes what came out of the ERP", () => {
    const { html } = shippedEmail(shipment({ trackingNumber: "<b>x</b>" }), "Jo");
    expect(html).not.toContain("<b>x</b>");
  });
});

describe("review request", () => {
  const ropts = { ...opts, reviewDays: 7 };

  it("is due a week after dispatch, not before", () => {
    // SO-00000862 went out on 13 Oct.
    expect(reviewDue(shipment(), { ...ropts, now: new Date("2026-10-19T23:00:00Z") })).toBe(false);
    expect(reviewDue(shipment(), { ...ropts, now: new Date("2026-10-20T00:00:00Z") })).toBe(true);
  });

  it("asks whether or not there was a tracking number", () => {
    // Every buyer is asked. Choosing who to ask is review gating.
    const later = { ...ropts, now: new Date("2026-10-25T00:00:00Z") };
    expect(reviewDue(shipment({ trackingNumber: "FE1" }), later)).toBe(true);
    expect(reviewDue(shipment({ trackingNumber: null }), later)).toBe(true);
  });

  it("never asks a trade customer, or about an order before the start date", () => {
    const later = { ...ropts, now: new Date("2026-10-25T00:00:00Z") };
    expect(reviewDue(shipment({ customerCode: "FERNWOOD-PAK" }), later)).toBe(false);
    expect(reviewDue(shipment({ dispatchedAt: "2026-09-30T00:00:00.000Z" }), later)).toBe(false);
  });

  it("is off without a review link, and only takes https", () => {
    expect(reviewUrl(undefined)).toBeNull();
    expect(reviewUrl("")).toBeNull();
    expect(reviewUrl("http://g.page/r/abc/review")).toBeNull();
    expect(reviewUrl("javascript:alert(1)")).toBeNull();
    expect(reviewUrl("https://g.page/r/abc/review")).toBe("https://g.page/r/abc/review");
  });

  it("defaults to a week", () => {
    expect(reviewAfterDays(undefined)).toBe(7);
    expect(reviewAfterDays("10")).toBe(10);
    expect(reviewAfterDays("0")).toBe(7);
  });

  it("links the review page and offers nothing for it", () => {
    const { subject, html } = reviewEmail("SO-00000873", "Jessica Zanandrea", "https://g.page/r/abc/review");
    expect(subject).toBe("How did we go with order #SO-00000873?");
    expect(html).toContain("Hi Jessica,");
    expect(html).toContain('href="https://g.page/r/abc/review"');
    expect(html).not.toMatch(/discount|voucher|coupon|% off/i);
  });
});

describe("withLabelTracking", () => {
  const label = (n: string, url: string | null = `https://www.trackmyshipment.co/shipment-tracking/${n}`) => ({
    orderNumber: "SO-00000862",
    trackingNumber: n,
    trackingPageUrl: url,
  });

  it("fills a missing number from the Easyship label, with its tracking page", () => {
    const s = withLabelTracking(shipment(), [label("CPAZ1")]);
    expect(s.trackingNumber).toBe("CPAZ1");
    expect(s.trackingPageUrl).toBe("https://www.trackmyshipment.co/shipment-tracking/CPAZ1");
    expect(decide(s, opts)).toEqual({ action: "send", kind: "tracked" });
    expect(shippedEmail(s, null).html).toContain('href="https://www.trackmyshipment.co/shipment-tracking/CPAZ1"');
  });

  it("keeps a number typed into Unleashed", () => {
    const s = withLabelTracking(shipment({ trackingNumber: "IP123" }), [label("CPAZ1")]);
    expect(s.trackingNumber).toBe("IP123");
  });

  it("gives every number for a split order, and no single page", () => {
    const s = withLabelTracking(shipment(), [label("CPAZ1"), label("TNT2")]);
    expect(s.trackingNumber).toBe("CPAZ1, TNT2");
    expect(s.trackingPageUrl).toBeNull();
  });

  it("changes nothing without a label", () => {
    expect(withLabelTracking(shipment(), undefined)).toEqual(shipment());
  });
});
