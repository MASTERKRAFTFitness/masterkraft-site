// Guards the values HubSpot will actually STORE.
//
// This replaces an earlier version of this test that pinned the strings the
// forms used to send - "A fit-out solution", "Equipment purchase" and so on.
// Those were never valid: `enquiry_type` is an enumeration in the portal whose
// options are Commercial Equipment Enquiry / Franchise Opportunity / General
// Enquiry / Support Enquiry, and HubSpot answers an unknown value with a 2xx
// and an EMPTY property rather than an error. So the old test locked in the bug
// it was written to prevent, and every lead the site ever captured has a blank
// enquiry_type.
//
// The lesson worth keeping: a value that has to match an external system cannot
// be verified by reading our own source. It was found by reading the property
// definition out of HubSpot. If these ever change again, check there first.
import { describe, expect, it } from "vitest";
import {
  ALL_ENQUIRY_TYPES,
  ENQUIRY_TOPICS,
  ENQUIRY_TYPE,
  toEnquiryType,
} from "@/lib/enquiry-type";
import { briefHubspotFields, emptyBrief } from "@/lib/fitout-brief";

// Verified against the portal. Two of these (Fitout, Distributor, Wholesale)
// had to be ADDED to HubSpot; the rest already existed.
const EXPECTED = [
  "Fitout Enquiry",
  "Commercial Equipment Enquiry",
  "Distributor Enquiry",
  "Wholesale Enquiry",
  "Support Enquiry",
  "General Enquiry",
];

describe("ENQUIRY_TYPE", () => {
  it("is exactly the set HubSpot defines", () => {
    expect(ALL_ENQUIRY_TYPES).toEqual(EXPECTED);
  });

  // Case matters to HubSpot's option matching, and these read like labels, so a
  // sentence-casing pass over "prose" would silently unfile every lead.
  it("keeps each value verbatim", () => {
    expect(ENQUIRY_TYPE.fitout).toBe("Fitout Enquiry");
    expect(ENQUIRY_TYPE.equipment).toBe("Commercial Equipment Enquiry");
    expect(ENQUIRY_TYPE.distributor).toBe("Distributor Enquiry");
    expect(ENQUIRY_TYPE.wholesale).toBe("Wholesale Enquiry");
    expect(ENQUIRY_TYPE.support).toBe("Support Enquiry");
    expect(ENQUIRY_TYPE.general).toBe("General Enquiry");
  });

  // The whole point of the label/value split: prose can move, data cannot.
  it("gives every contact-form topic a real CRM value", () => {
    expect(ENQUIRY_TOPICS.length).toBeGreaterThan(0);
    for (const topic of ENQUIRY_TOPICS) {
      expect(ALL_ENQUIRY_TYPES).toContain(topic.value);
      expect(topic.label.trim()).not.toBe("");
    }
  });
});

describe("toEnquiryType", () => {
  it("passes through a value the portal knows", () => {
    expect(toEnquiryType("Fitout Enquiry")).toBe(ENQUIRY_TYPE.fitout);
  });

  it("matches case-insensitively, since the wire is not trusted", () => {
    expect(toEnquiryType("fitout enquiry")).toBe(ENQUIRY_TYPE.fitout);
  });

  // An old cached bundle can still post the pre-fix strings. Better filed as
  // General than discarded into a blank property nobody can query.
  it("falls back rather than letting an unknown value be discarded", () => {
    expect(toEnquiryType("A fit-out solution")).toBe(ENQUIRY_TYPE.general);
    expect(toEnquiryType("Warranty claim")).toBe(ENQUIRY_TYPE.general);
    expect(toEnquiryType("")).toBe(ENQUIRY_TYPE.general);
    expect(toEnquiryType(undefined)).toBe(ENQUIRY_TYPE.general);
  });
});

describe("the brief files itself under a value HubSpot stores", () => {
  it("sends Fitout Enquiry", () => {
    const value = briefHubspotFields(emptyBrief).find((f) => f.name === "enquiry_type")!.value;
    expect(value).toBe(ENQUIRY_TYPE.fitout);
    expect(ALL_ENQUIRY_TYPES).toContain(value);
  });
});
