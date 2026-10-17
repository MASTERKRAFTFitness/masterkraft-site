import { describe, expect, it } from "vitest";
import { decide, emailsFrom, shippedEmail, trackingUrl, waitHours } from "./shipped-notices";
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
