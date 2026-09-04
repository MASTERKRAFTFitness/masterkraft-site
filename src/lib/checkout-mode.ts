// Quote-only mode, in one place, because the server has to agree with the UI.
//
// This lived in stripe-client.ts, which the browser reads to hide the card form.
// Nothing read it on the server. So /api/payment-intent would create a live
// PaymentIntent for anyone who posted to it directly, while every page on the
// site said "request a quote" — the flag turned the form off, not payments.
//
// That was survivable only by accident. Every buy-path route also repriced the
// cart against a WooCommerce store that has been unreachable since the domain
// cutover, so a direct POST died at repricing before it reached Stripe. The
// outage was doing the work the flag appeared to be doing.
//
// Taking the buy path off WooCommerce removes that accident on purpose — which
// is precisely what the ERP order work does. So this gate has to be real BEFORE
// that lands, not after: the day pricing stops needing the store is the day
// nothing else is standing in front of Stripe.
//
// NEXT_PUBLIC_ is deliberate and not a leak: the same value has to reach the
// browser to hide the form and the server to refuse the intent. One variable
// both sides read cannot drift the way two separate checks did.
export const checkoutMode: "card" | "quote" =
  process.env.NEXT_PUBLIC_CHECKOUT_MODE === "quote" ? "quote" : "card";

/** True when the site is quote-only and no card payment may be started. */
export const quoteOnly = checkoutMode === "quote";
