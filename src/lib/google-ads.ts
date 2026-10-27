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
// The purchase label is the "Purchase" action from the same page. It fires from
// trackPurchase once /api/order has recorded a paid order, with the order total
// as the value and the order number as transaction_id. It went unset from the
// action's creation on 2026-10-06 until 10-27, so Ads showed it "Misconfigured"
// and Performance Max bid on conversion value with no purchases to learn from.
export const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID || "AW-18485786308";
export const GOOGLE_ADS_LEAD_LABEL =
  process.env.NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL || "ZPQ0CJe6-ZMdEMTt2u5E";
export const GOOGLE_ADS_PURCHASE_LABEL =
  process.env.NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL || "Zsn1CPn8x5IdEMTt2u5E";
