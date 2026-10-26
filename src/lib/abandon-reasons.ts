// "What stopped you?" - the answers a shopper can give, asked in two places:
// the cart reminder email (lib/cart-reminders) and the checkout page itself,
// after the freight quote (components/shop/StoppingQuestion). Both store the
// code in checkout_leads.abandon_reason; the latest answer wins.
//
// Plain data, no server imports, so the checkout page can use it. The codes are
// also a check constraint (migrations/20261026_checkout_abandon_reason.sql):
// adding one here means adding it there.

/** The answers, in the order they are listed. Codes are what's stored. */
export const ABANDON_REASONS = {
  freight: "Delivery cost or timing",
  quote: "I need a formal quote or invoice first",
  question: "I had a question about the product",
  payment: "Payment didn't go through",
  comparing: "Still comparing options",
  later: "Not ready to buy yet",
  other: "Something else",
} as const;

export type AbandonReason = keyof typeof ABANDON_REASONS;

/** Offered on the checkout page, which is before payment, so not "payment". */
export const CHECKOUT_PAGE_REASONS: AbandonReason[] = ["freight", "quote", "question", "comparing", "later", "other"];

export function validAbandonReason(value: unknown): AbandonReason | null {
  return typeof value === "string" && Object.hasOwn(ABANDON_REASONS, value) ? (value as AbandonReason) : null;
}

/** Longest free-text note kept with a reason. */
export const MAX_REASON_NOTE = 1000;
