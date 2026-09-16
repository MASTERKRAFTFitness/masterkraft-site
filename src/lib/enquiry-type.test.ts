import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Every value below is a HubSpot dropdown option for the `enquiry_type`
// property, not prose. The contact form's <option> elements carry no `value`
// attribute, so the submitted value IS the text content, and api/contact
// forwards it untouched: `{ name: "enquiry_type", value: topic || "Something
// else" }`. Reword any of them and leads file under a value HubSpot does not
// know.
//
// Nothing surfaces that. lib/hubspot.ts only throws on a non-2xx, so a mis-filed
// lead is indistinguishable from a delivered one - the form still says thank you.
//
// "A fit-out solution" is the live example: it is the only string in src/ that
// kept its hyphen through the fitout-not-fit-out copy sweep, and it reads like
// an oversight to anyone who does not know it is a CRM value.
const ENQUIRY_TYPES = [
  "Equipment purchase",
  "A fit-out solution",
  "Becoming a distributor",
  "Wholesale / portal access",
  "Something else",
];

// What api/contact sends when the select was left untouched. It has to be one of
// the options above, or the empty submission files under an unknown value.
const FALLBACK = "Something else";

const contactForm = readFileSync("src/components/marketing/ContactForm.tsx", "utf8");
const contactRoute = readFileSync("src/app/api/contact/route.ts", "utf8");

describe("enquiry_type", () => {
  it.each(ENQUIRY_TYPES)("offers %o under the value HubSpot defines", (type) => {
    expect(contactForm).toContain(`<option>${type}</option>`);
  });

  // The form is the only place these are written down, so a sixth option added
  // without a HubSpot property to match it should fail here too.
  it("offers nothing HubSpot has not been told about", () => {
    const offered = [...contactForm.matchAll(/<option>([^<]+)<\/option>/g)].map((m) => m[1]);
    expect(offered).toEqual(ENQUIRY_TYPES);
  });

  it("falls back to one of its own options when the select is untouched", () => {
    expect(contactRoute).toContain(`value: topic || "${FALLBACK}"`);
    expect(ENQUIRY_TYPES).toContain(FALLBACK);
  });
});
