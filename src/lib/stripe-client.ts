import { loadStripe, type Stripe } from "@stripe/stripe-js";

const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

let promise: Promise<Stripe | null> | null = null;

// Lazily load Stripe.js on the client. Returns null when no key is configured.
export function getStripe(): Promise<Stripe | null> {
  if (!key) return Promise.resolve(null);
  if (!promise) promise = loadStripe(key);
  return promise;
}

export const paymentsConfigured = !!key;
