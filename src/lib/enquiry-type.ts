// What this site tells HubSpot about WHY someone got in touch.
//
// THE CONSTRAINT: `enquiry_type` is an ENUMERATION in the portal, and it defines
// exactly four options - Commercial Equipment Enquiry, Franchise Opportunity,
// General Enquiry, Support Enquiry. HubSpot does not reject a value outside that
// list. It accepts the submission, returns 2xx, and leaves the property EMPTY.
//
// So a wrong value is invisible from every direction: the visitor sees the
// thank-you, lib/hubspot.ts sees a 200, the route logs "submitted", and the lead
// files as uncategorised. Every form on this site used to send a value the portal
// did not define - "A fit-out solution", "Warranty claim", "Equipment purchase" -
// which is why every lead captured before this file has a blank enquiry_type.
//
// TWO LAYERS, ON PURPOSE:
//
//   EnquiryKind is OURS. Six of them, because the site genuinely has six front
//   doors and the fitout wizard exists precisely to tell them apart.
//
//   PortalEnquiryType is HUBSPOT'S. Four values, and the only thing that may be
//   sent on the wire.
//
// Mapping between them happens here and nowhere else. That is the whole point:
// the day someone adds "Fitout Enquiry" to the portal, this file changes by one
// line and every form follows. Without the split, sharpening the taxonomy later
// would mean touching five routes and a form again.
//
// WHAT IS LOST TODAY, stated plainly: fitout briefs and one-off equipment
// enquiries both file as Commercial Equipment Enquiry, so the CRM cannot filter
// between them. The brief is still fully readable in `message` (it leads with
// "Fitout type:"), so nothing is lost to a human - only to a filter.

/** The four values the portal actually defines. Verified by reading the property. */
export const PORTAL_ENQUIRY_TYPES = [
  "Commercial Equipment Enquiry",
  "Franchise Opportunity",
  "General Enquiry",
  "Support Enquiry",
] as const;

export type PortalEnquiryType = (typeof PORTAL_ENQUIRY_TYPES)[number];

/**
 * Our own kinds - finer-grained than the portal's four, and what travels on the
 * wire from the forms. Slugs rather than prose so a copy sweep has nothing to
 * catch: these are identifiers, and they look like identifiers.
 */
export const ENQUIRY_KIND = {
  fitout: "fitout",
  equipment: "equipment",
  distributor: "distributor",
  wholesale: "wholesale",
  support: "support",
  general: "general",
} as const;

export type EnquiryKind = (typeof ENQUIRY_KIND)[keyof typeof ENQUIRY_KIND];

export const ALL_ENQUIRY_KINDS: EnquiryKind[] = Object.values(ENQUIRY_KIND);

/**
 * Which portal option each kind files under.
 *
 * `wholesale` lands on General rather than Commercial Equipment because a trade
 * account request is not a purchase enquiry and would pollute the sales queue.
 * `distributor` lands on Franchise Opportunity as the closest available fit -
 * distributing is not franchising, but it is nearer than the other three.
 *
 * THIS IS THE ONE TABLE TO EDIT if the portal ever gains better options.
 */
const TO_PORTAL: Record<EnquiryKind, PortalEnquiryType> = {
  fitout: "Commercial Equipment Enquiry",
  equipment: "Commercial Equipment Enquiry",
  distributor: "Franchise Opportunity",
  wholesale: "General Enquiry",
  support: "Support Enquiry",
  general: "General Enquiry",
};

/**
 * The topic select on /contact/enquiry.
 *
 * `label` is prose and free to be reworded. `value` is an EnquiryKind slug, and
 * is carried on the <option> explicitly rather than inferred from the text - so
 * a copy change cannot become a data change, which is exactly how the previous
 * bug survived a rename sweep unnoticed.
 */
export const ENQUIRY_TOPICS: { label: string; value: EnquiryKind }[] = [
  { label: "Equipment purchase", value: ENQUIRY_KIND.equipment },
  { label: "A fitout solution", value: ENQUIRY_KIND.fitout },
  { label: "Becoming a distributor", value: ENQUIRY_KIND.distributor },
  { label: "Wholesale / portal access", value: ENQUIRY_KIND.wholesale },
  { label: "Something else", value: ENQUIRY_KIND.general },
];

/**
 * Coerce whatever arrived on the wire to one of our kinds.
 *
 * Anything unrecognised becomes `general` rather than being passed through. A
 * visitor on a cached bundle can still post the old prose values, and those
 * would be discarded silently by HubSpot - filed imprecisely is recoverable,
 * filed nowhere is not.
 */
export function toEnquiryKind(raw: string | null | undefined): EnquiryKind {
  const value = (raw ?? "").trim().toLowerCase();
  return ALL_ENQUIRY_KINDS.find((k) => k === value) ?? ENQUIRY_KIND.general;
}

/** The value to put on the wire for a kind. Always one HubSpot will store. */
export function portalEnquiryType(kind: EnquiryKind): PortalEnquiryType {
  return TO_PORTAL[kind];
}

/** Wire value straight through to a portal value, for routes that forward a topic. */
export function hubspotEnquiryType(raw: string | null | undefined): PortalEnquiryType {
  return portalEnquiryType(toEnquiryKind(raw));
}
