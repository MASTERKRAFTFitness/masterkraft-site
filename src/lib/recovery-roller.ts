// Recovery Roller waitlist page content.
//
// Kept as data rather than markup so the page can be upgraded into the real
// product page later without a rewrite: the pending rows fill in, the form
// becomes an enquiry form, and nothing here is thrown away.
//
// TWO EDITING RULES, both deliberate:
//
// 1. NO BENEFIT CLAIMS. The light is described as "integrated" and nothing more.
//    Nothing on this page says what the machine does for a member, pending the
//    TGA question. That is a compliance position, not an oversight - do not add
//    recovery, circulation, healing or performance claims here.
// 2. The release wording lives in ONE constant below. It appears twice on the
//    page, and the teaser video and captions have to agree with it.

// Michael's call 2026-08-25: "First look September" rather than "Landing
// September". September is prototypes and samples; launch and pricing are at the
// November conference, so a page that invites enquiries must not read as a buy
// date.
export const RELEASE_LABEL = "First look September";

export const SPEC_ROWS: { label: string; value: string | null }[] = [
  { label: "Product", value: "Recovery Roller" },
  { label: "Type", value: "Motorised roller bed" },
  { label: "Light", value: "Integrated, beneath the rollers" },
  { label: "Control", value: "Touchscreen" },
  { label: "Housing", value: "Commercial grade, upholstered" },
  { label: "Manufacture", value: "Built by MasterKraft" },
  { label: "Availability", value: RELEASE_LABEL },
  // null renders as "On release" - the gaps are the point of the page.
  { label: "Dimensions", value: null },
  { label: "Weight", value: null },
  { label: "Power", value: null },
  { label: "Roller configuration", value: null },
  { label: "Session programs", value: null },
  { label: "User capacity", value: null },
  { label: "Warranty", value: null },
  { label: "Price", value: null },
];

export const ARGUMENTS = [
  {
    title: "Recovery became a tier",
    body: "Across the big networks, recovery now sits behind the top membership rather than alongside it. Members are choosing it and paying for it.",
  },
  {
    title: "Most gyms answer with a corner",
    body: "A mat, two foam rollers and whatever was left in the fit-out budget. It is the most asked-about part of a floor and the least specified.",
  },
  {
    title: "The gap was the equipment",
    body: "Consumer products built for a lounge room on one side, fleet contracts built for national chains on the other. Very little engineered as commercial gym equipment.",
  },
];

export const SITE_COUNT_OPTIONS = [
  "One site",
  "2 to 5 sites",
  "6 to 20 sites",
  "More than 20 sites",
  "Franchisor or head office",
];

export const TIMEFRAME_OPTIONS = [
  "This quarter",
  "Next 3 to 6 months",
  "Planning for next year",
  "Just researching",
];

// Stamped on every submission so the list can be pulled cleanly for the November
// send and reported against the teaser spend.
export const CONTACT_SOURCE = "Recovery Roller Waitlist";
export const SOURCE_CAMPAIGN = "MK_RecoveryRoller_2026";

// A site count of this or above is a network operator rather than a single
// independent, which is the difference between a follow-up call and a
// conversation with Steve. Flagged on the internal notification.
export const NETWORK_OPERATOR_OPTIONS = new Set([
  "6 to 20 sites",
  "More than 20 sites",
  "Franchisor or head office",
]);
