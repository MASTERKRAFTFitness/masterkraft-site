// GOOGLE ADS ACCOUNT AND CONVERSION LABELS.
//
// IN CODE, WITH AN ENV OVERRIDE — the same call CookieConsent makes for the Meta
// pixel. An Ads ID and a conversion label are public by design (Google's own
// snippet prints them into every page), so there is nothing to keep out of the
// repo, and pinning them here means the quote conversion cannot silently stop
// counting because a Vercel variable was unset or saved without a redeploy.
// The env vars still win when set, so a new account or label needs no code change.
//
// The lead label is the "Submit quote" action from Ads > Goals > Conversions. It
// fires from trackEnquiry (fitout brief, contact form) and trackLead (cart quote),
// only after the submission has been accepted by the server.
//
// The purchase label has no default: there is no card-order action in the Ads
// account yet, and an unset label is a working state — see adsConversion.
export const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID || "AW-18485786308";
export const GOOGLE_ADS_LEAD_LABEL =
  process.env.NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL || "ZPQ0CJe6-ZMdEMTt2u5E";
export const GOOGLE_ADS_PURCHASE_LABEL = process.env.NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL || undefined;
