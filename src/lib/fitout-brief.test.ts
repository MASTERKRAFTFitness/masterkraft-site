// What is worth pinning about the brief is the SUMMARY, because it is the only
// thing that reaches HubSpot. Every qualification answer rides in one `message`
// field (see the note at the top of fitout-brief.ts), so a regression here is a
// sales team reading a blank enquiry, not a cosmetic bug.
import { describe, it, expect } from "vitest";
import {
  briefHubspotFields,
  briefLines,
  briefSummary,
  emptyBrief,
  humanBytes,
  type FitoutBrief,
} from "@/lib/fitout-brief";
import { ENQUIRY_KIND, portalEnquiryType } from "@/lib/enquiry-type";

const full: FitoutBrief = {
  ...emptyBrief,
  projectType: "Commercial Gym",
  stage: "Ready to quote",
  floorArea: "420",
  areaUnit: "m²",
  ceilingHeight: "3.6",
  heightUnit: "m",
  obstacles: ["Structural pillars", "Low pipes or ducting"],
  zones: ["Free weights", "Rigs and racks"],
  branding: "I'd like custom branded",
  budget: "$50k - $150k",
  timeline: "1-3 months",
  firstName: "Dana",
  lastName: "Whitlock",
  company: "Northside Strength",
  email: "dana@northsidestrength.com.au",
  phone: "0400 111 222",
  postcode: "3121",
  message: "Second level, goods lift only.",
};

describe("briefLines", () => {
  it("renders every answered field with its label", () => {
    const lines = briefLines(full, [{ filename: "plan.pdf", size: 2_100_000 }]);
    expect(lines).toEqual([
      ["Fitout type", "Commercial Gym"],
      ["Project stage", "Ready to quote"],
      ["Floor area", "420 m²"],
      ["Ceiling height", "3.6 m"],
      ["Obstacles", "Structural pillars, Low pipes or ducting"],
      ["Zones wanted", "Free weights, Rigs and racks"],
      ["Branding", "I'd like custom branded"],
      ["Budget", "$50k - $150k"],
      ["Timeline", "1-3 months"],
      ["Postcode", "3121"],
      ["Floor plans", "plan.pdf (2.0 MB)"],
      ["Notes", "Second level, goods lift only."],
    ]);
  });

  // Steps 2-4 are all skippable on purpose - someone "gathering concepts" should
  // be able to reach the contact step in two taps. A summary that padded the
  // skipped answers with "-" would bury the two they did give.
  it("drops skipped answers instead of padding them", () => {
    const lines = briefLines({ ...emptyBrief, projectType: "Home Gym", stage: "Gathering concepts" });
    expect(lines).toEqual([
      ["Fitout type", "Home Gym"],
      ["Project stage", "Gathering concepts"],
    ]);
  });

  // The unit is a select that always has a value, so on its own it means nothing.
  it("omits a dimension that is only a unit", () => {
    const lines = briefLines({ ...emptyBrief, areaUnit: "sq ft", heightUnit: "ft" });
    expect(lines).toEqual([]);
  });
});

describe("briefSummary", () => {
  it("is plain text, one labelled answer per line", () => {
    const summary = briefSummary({ ...emptyBrief, projectType: "PT Studio", budget: "Under $10k" });
    expect(summary).toBe("Fitout type: PT Studio\nBudget: Under $10k");
  });
});

describe("briefHubspotFields", () => {
  // A completed brief is qualification, not a signup, so it enters the funnel as
  // an MQL rather than a bare Lead. The value is HubSpot's internal one; the
  // label "MQL" would be accepted with a 2xx and stored as nothing.
  it("files the brief as a marketing qualified lead", () => {
    const stage = briefHubspotFields(full).find((f) => f.name === "lifecyclestage")!.value;
    expect(stage).toBe("marketingqualifiedlead");
  });

  it("sends only the properties the portal already defines", () => {
    const names = briefHubspotFields(full).map((f) => f.name);
    expect(names).toEqual([
      "firstname",
      "lastname",
      "email",
      "phone",
      "company",
      "enquiry_type",
      "lifecyclestage",
      "message",
    ]);
  });

  // HubSpot rejects the WHOLE submission on an unknown property, so the brief
  // has to arrive inside `message` rather than as fields of its own.
  it("carries the qualification answers inside message", () => {
    const message = briefHubspotFields(full).find((f) => f.name === "message")!.value;
    expect(message).toContain("Floor area: 420 m²");
    expect(message).toContain("Branding: I'd like custom branded");
    expect(message).toContain("Timeline: 1-3 months");
  });

  // Asserted against the shared constant, NOT a literal copy. This test used to
  // hardcode "A fit-out solution" and passed happily for as long as it existed,
  // while HubSpot silently discarded that value on every submission - a literal
  // duplicated into a test proves the duplication, not the correctness. The real
  // option list is pinned once, in enquiry-type.test.ts.
  it("files the lead against the fitout funnel", () => {
    const type = briefHubspotFields(full).find((f) => f.name === "enquiry_type")!.value;
    expect(type).toBe(portalEnquiryType(ENQUIRY_KIND.fitout));
  });
});

describe("humanBytes", () => {
  it("scales the unit to the size", () => {
    expect(humanBytes(512)).toBe("512 B");
    expect(humanBytes(2048)).toBe("2 KB");
    expect(humanBytes(5_400_000)).toBe("5.1 MB");
  });
});
