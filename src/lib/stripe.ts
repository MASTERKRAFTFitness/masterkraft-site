import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;

// Null until a secret key is configured — routes degrade gracefully.
export const stripe = key ? new Stripe(key) : null;

export function stripeEnabled(): boolean {
  return !!stripe;
}
