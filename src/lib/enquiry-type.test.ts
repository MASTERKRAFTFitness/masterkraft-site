// Guards the values HubSpot will actually STORE.
//
// The failure this exists to prevent has already happened once. `enquiry_type`
// is an enumeration with four options, and HubSpot answers a value outside that
// list with a 2xx and an EMPTY property rather than an error - so every form on
// this site silently filed uncategorised leads for as long as it existed.
//
// An earlier version of this test pinned the strings the forms were sending, by
// reading them out of our own source. It passed. It was wrong. A value that has
// to match an external system cannot be verified from inside the repo: the
// option list came from reading the property definition out of HubSpot, and that
// is where to check it again if these ever change.
import { describe, expect, it } from "vitest";
import {
  ALL_ENQUIRY_KINDS,
  ENQUIRY_KIND,
  ENQUIRY_TOPICS,
  PORTAL_ENQUIRY_TYPES,
  hubspotEnquiryType,
  portalEnquiryType,
  toEnquiryKind,
} from "@/lib/enquiry-type";
import { briefHubspotFields, emptyBrief } from "@/lib/fitout-brief";

// Read from the portal's property definition. If HubSpot gains options, update
// this list and the TO_PORTAL table together.
const PORTAL_OPTIONS = [
  "Commercial Equipment Enquiry",
  "Franchise Opportunity",
  "General Enquiry",
  "Support Enquiry",
];

describe("the portal contract", () => {
  it("matches the option list HubSpot defines", () => {
    expect([...PORTAL_ENQUIRY_TYPES]).toEqual(PORTAL_OPTIONS);
  });

  // The single most important assertion here: whatever we map, the result must
  // be storable. Anything else is discarded in silence.
  it("maps every kind to a storable value", () => {
    for (const kind of ALL_ENQUIRY_KINDS) {
      expect(PORTAL_OPTIONS).toContain(portalEnquiryType(kind));
    }
  });
});

describe("the mapping", () => {
  it("files each kind where intended", () => {
    expect(portalEnquiryType(ENQUIRY_KIND.fitout)).toBe("Commercial Equipment Enquiry");
    expect(portalEnquiryType(ENQUIRY_KIND.equipment)).toBe("Commercial Equipment Enquiry");
    expect(portalEnquiryType(ENQUIRY_KIND.distributor)).toBe("Franchise Opportunity");
    expect(portalEnquiryType(ENQUIRY_KIND.wholesale)).toBe("General Enquiry");
    expect(portalEnquiryType(ENQUIRY_KIND.support)).toBe("Support Enquiry");
    expect(portalEnquiryType(ENQUIRY_KIND.general)).toBe("General Enquiry");
  });

  // Documenting the known cost of option B rather than letting someone discover
  // it from a CRM report. Delete this test the day the portal gains its own
  // Fitout option and the two stop colliding.
  it("cannot yet distinguish a fitout brief from an equipment enquiry", () => {
    expect(portalEnquiryType(ENQUIRY_KIND.fitout)).toBe(
      portalEnquiryType(ENQUIRY_KIND.equipment)
    );
  });
});

describe("toEnquiryKind", () => {
  it("accepts our own slugs", () => {
    expect(toEnquiryKind("fitout")).toBe(ENQUIRY_KIND.fitout);
    expect(toEnquiryKind("WHOLESALE")).toBe(ENQUIRY_KIND.wholesale);
  });

  // A visitor on a cached bundle still posts the old prose. Those values are not
  // storable, so they must not be forwarded.
  it("falls back instead of forwarding a value HubSpot would discard", () => {
    for (const legacy of ["A fit-out solution", "Warranty claim", "Equipment purchase", "", null]) {
      const result = hubspotEnquiryType(legacy);
      expect(PORTAL_OPTIONS).toContain(result);
    }
    expect(toEnquiryKind("A fit-out solution")).toBe(ENQUIRY_KIND.general);
  });
});

describe("the contact form topics", () => {
  // The label/value split is the structural fix: prose can move, data cannot.
  it("carries a real kind on every option, and maps to something storable", () => {
    expect(ENQUIRY_TOPICS.length).toBeGreaterThan(0);
    for (const topic of ENQUIRY_TOPICS) {
      expect(ALL_ENQUIRY_KINDS).toContain(topic.value);
      expect(PORTAL_OPTIONS).toContain(portalEnquiryType(topic.value));
      expect(topic.label.trim()).not.toBe("");
    }
  });
});

describe("the fitout brief", () => {
  it("sends a value HubSpot will store", () => {
    const value = briefHubspotFields(emptyBrief).find((f) => f.name === "enquiry_type")!.value;
    expect(PORTAL_OPTIONS).toContain(value);
    expect(value).toBe("Commercial Equipment Enquiry");
  });
});
