import { loadStripe, type Stripe } from "@stripe/stripe-js";

const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;

let promise: Promise<Stripe | null> | null = null;

// Lazily load Stripe.js on the client. Returns null when no key is configured.
export function getStripe(): Promise<Stripe | null> {
  if (!key) return Promise.resolve(null);
  if (!promise) promise = loadStripe(key);
  return promise;
}

/**
 * Quote-only mode.
 *
 * Set NEXT_PUBLIC_CHECKOUT_MODE=quote to take card payment off the site without
 * deleting the Stripe key. Every buy-path route (payment-intent, order, freight
 * quote) reads the live WooCommerce store, so if WordPress is unreachable, a
 * card checkout can only fail after the customer has filled the form in. This
 * turns that into an honest quote flow instead.
 *
 * An explicit flag rather than removing the publishable key, because deleting a
 * credential to change behaviour is invisible to the next reader and awkward to
 * reverse. Unset, or "card", is normal service.
 */
export const checkoutMode: "card" | "quote" =
  process.env.NEXT_PUBLIC_CHECKOUT_MODE === "quote" ? "quote" : "card";

// Gates the card form. Every existing `canPay` check reads this, so the mode
// flag needs no other wiring.
export const paymentsConfigured = !!key && checkoutMode === "card";
