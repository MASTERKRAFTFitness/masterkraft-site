import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;

// Null until a secret key is configured — routes degrade gracefully.
export const stripe = key ? new Stripe(key) : null;

export function stripeEnabled(): boolean {
  return !!stripe;
}

/**
 * Quote-only mode, enforced on the SERVER.
 *
 * lib/stripe-client gates the card FORM on the same flag, but that is the
 * browser's copy and a route is reachable without it. Until now the buy path was
 * also blocked by accident — every one of its routes read the live WooCommerce
 * store, which has had no hostname since 27 August, so a direct POST failed on
 * its own. Sourcing prices and cartons from the ERP removes that accident, which
 * is a good thing to have done and a bad thing to have done silently: it leaves
 * quote mode resting on a client-side check.
 *
 * So the flag is read here too. In quote mode a PaymentIntent is refused
 * outright rather than minted against live keys for a checkout the site is not
 * offering.
 */
export function quoteOnlyMode(): boolean {
  return process.env.NEXT_PUBLIC_CHECKOUT_MODE === "quote";
}
