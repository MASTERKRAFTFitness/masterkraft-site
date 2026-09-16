// The `enquiry_type` values this site sends to HubSpot.
//
// THESE ARE CRM VALUES, NOT PROSE. `enquiry_type` is an ENUMERATION in the
// portal, and HubSpot's Forms API does not reject a value outside the option
// list - it accepts the submission, returns 2xx, and silently leaves the
// property EMPTY. So a wrong value here is invisible from every direction: the
// visitor sees the thank-you, lib/hubspot.ts sees a 200, the route logs
// "submitted", and the lead lands in the CRM uncategorised.
//
// That is not hypothetical. Before this file existed, every form on the site
// sent a value the portal did not define - "A fit-out solution", "Warranty
// claim", "Equipment purchase" - and every lead ever captured has a blank
// enquiry_type as a result. It was found by reading the property definition out
// of HubSpot, which is the only place the truth lives.
//
// RULES FOR CHANGING THIS FILE:
//   1. Add the option in HubSpot FIRST (Settings > Properties > Contact >
//      Enquiry Type). Code shipped ahead of the portal silently discards again.
//   2. Match the option's value EXACTLY, including case.
//   3. Never let a copy sweep near these strings. They look like labels.
//
// enquiry-type.test.ts pins every value, and every place that sends one.

/**
 * The canonical set. Keys are ours; values are HubSpot's, verified against the
 * portal's `enquiry_type` option list.
 */
export const ENQUIRY_TYPE = {
  /** The fitout brief wizard on /contact. */
  fitout: "Fitout Enquiry",
  /** Someone buying equipment rather than a whole floor. */
  equipment: "Commercial Equipment Enquiry",
  /** Wants to distribute MasterKraft. Distinct from the portal's "Franchise Opportunity". */
  distributor: "Distributor Enquiry",
  /** An existing or prospective trade account. */
  wholesale: "Wholesale Enquiry",
  /** Warranty claims and anything else post-sale. */
  support: "Support Enquiry",
  /** The fallback. Anything that does not sort into the above. */
  general: "General Enquiry",
} as const;

export type EnquiryType = (typeof ENQUIRY_TYPE)[keyof typeof ENQUIRY_TYPE];

/**
 * The /contact/enquiry topic select.
 *
 * `label` is what a visitor reads and is free to be reworded. `value` is the
 * CRM value and is not - which is exactly why they are separate fields here.
 * The <option> elements carry the value explicitly rather than relying on their
 * text content, so a copy change cannot silently become a data change.
 */
export const ENQUIRY_TOPICS: { label: string; value: EnquiryType }[] = [
  { label: "Equipment purchase", value: ENQUIRY_TYPE.equipment },
  { label: "A fitout solution", value: ENQUIRY_TYPE.fitout },
  { label: "Becoming a distributor", value: ENQUIRY_TYPE.distributor },
  { label: "Wholesale / portal access", value: ENQUIRY_TYPE.wholesale },
  { label: "Something else", value: ENQUIRY_TYPE.general },
];

/** Every value the portal must define for this site to file leads correctly. */
export const ALL_ENQUIRY_TYPES: EnquiryType[] = Object.values(ENQUIRY_TYPE);

/**
 * Coerce whatever arrived on the wire to a value HubSpot will store.
 *
 * A submission can carry an old cached bundle's topic, or nothing at all, and an
 * unrecognised string would be discarded silently. Falling back to `general`
 * keeps the lead categorised as *something*, which is recoverable; a blank
 * property is not distinguishable from a lead nobody ever classified.
 */
export function toEnquiryType(raw: string | null | undefined): EnquiryType {
  const value = (raw ?? "").trim();
  const match = ALL_ENQUIRY_TYPES.find((t) => t.toLowerCase() === value.toLowerCase());
  return match ?? ENQUIRY_TYPE.general;
}
