import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { checkoutMode } from "@/lib/checkout-mode";

const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

let promise: Promise<Stripe | null> | null = null;

// Lazily load Stripe.js on the client. Returns null when no key is configured.
export function getStripe(): Promise<Stripe | null> {
  if (!key) return Promise.resolve(null);
  if (!promise) promise = loadStripe(key);
  return promise;
}

// Quote-only mode now lives in checkout-mode.ts, so the server can read the
// same flag. Re-exported here because every existing `canPay` check imports it
// from this module.
export { checkoutMode };

// Gates the card form. Every existing `canPay` check reads this, so the mode
// flag needs no other wiring.
export const paymentsConfigured = !!key && checkoutMode === "card";
