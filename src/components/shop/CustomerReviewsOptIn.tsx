"use client";

import Script from "next/script";
import { estimatedDeliveryDate } from "@/lib/delivery-estimate";

// Google Customer Reviews: after a paid order, Google offers the buyer a survey
// about the purchase, emailed once the order should have arrived. The answers
// become the store's seller rating, which is a component of Merchant Center's
// store quality score and, at 100 reviews in 12 months, the stars on a
// Shopping ad.
//
// NOT BEHIND THE COOKIE BANNER, unlike gtag and the Meta pixel. Those track a
// visitor across the site; this is a one-off dialog on the confirmation screen
// that asks the buyer, in Google's own words, whether to take part, and nothing
// is surveyed unless they say yes. Gating it on analytics consent would put a
// consent step in front of a consent step.
//
// UNSET IS A WORKING STATE. With no merchant id the component renders nothing,
// which is what lets it ship before the id is in Vercel.
const MERCHANT_ID = process.env.NEXT_PUBLIC_GOOGLE_MERCHANT_ID;

type SurveyOptIn = {
  load: (name: string, cb: () => void) => void;
  surveyoptin: { render: (opts: Record<string, unknown>) => void };
};

export default function CustomerReviewsOptIn({
  orderId,
  email,
  state,
}: {
  orderId: string;
  email: string;
  state: string;
}) {
  if (!MERCHANT_ID || !email) return null;

  const render = () => {
    const gapi = (window as unknown as { gapi?: SurveyOptIn }).gapi;
    gapi?.load("surveyoptin", () => {
      gapi.surveyoptin.render({
        merchant_id: Number(MERCHANT_ID),
        order_id: orderId,
        email,
        delivery_country: "AU",
        estimated_delivery_date: estimatedDeliveryDate(state),
      });
    });
  };

  return <Script src="https://apis.google.com/js/platform.js" strategy="afterInteractive" onReady={render} />;
}
