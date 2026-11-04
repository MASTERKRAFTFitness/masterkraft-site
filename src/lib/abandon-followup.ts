// The team's one-to-one follow-up to an abandoned checkout, ready written.
//
// The abandoned-checkout alert (cron/abandoned-checkouts) goes to the team for
// EVERY abandoned cart, but only shoppers who ticked "Email me my cart" are
// asked by email what stopped them. For everyone else the question has to come
// from a person, and a blank reply is easy to put off. This is a mailto link in
// the alert that opens a short personal email to the shopper, asking what held
// them up, for whoever picks it up to read over, sign and send.
//
// SENT BY A PERSON, ABOUT THIS ORDER ONLY. That is what keeps it ordinary
// customer service rather than a commercial message under the Spam Act (see the
// alert route). So it has no unsubscribe footer, no offer and no other products:
// it asks about the cart they were checking out, and nothing else. Nothing sends
// it automatically - the link only opens a draft.
//
// When they already said what stopped them (on the checkout page), it answers
// that instead of asking again.
import type { CheckoutLeadRow } from "@/lib/checkout-leads";
import { validAbandonReason, type AbandonReason } from "@/lib/abandon-reasons";

function firstName(full: string | null): string | null {
  return full?.trim().split(/\s+/)[0] || null;
}

/** "the Barbell Squat Pad", "the Barbell Squat Pad and 2 other items", or "your order". */
function whatTheyWereBuying(row: CheckoutLeadRow): string {
  const items = row.items ?? [];
  if (items.length === 0) return "your order";
  const first = items[0].name.trim();
  if (items.length === 1) return `the ${first}`;
  const more = items.length - 1;
  return `the ${first} and ${more} other item${more === 1 ? "" : "s"}`;
}

/** What to say when they told us what stopped them. "other" and "later" fall back to asking. */
const ANSWER: Partial<Record<AbandonReason, string>> = {
  freight:
    "You mentioned delivery was what held you up. Freight on bigger equipment varies a lot by address and service, so if you let me know what you were hoping for (a price, a date, or a pickup), I'll see what we can do.",
  quote:
    "You mentioned you needed a formal quote or invoice first. Happy to put one together. Just reply with the business name it should be addressed to and I'll send it through.",
  question:
    "You mentioned you had a question about the product. Reply here or give us a call on (03) 9044 9575 and we'll talk it through.",
  payment:
    "It looks like the payment didn't go through. If you'd like, I can send you an invoice to pay by bank transfer instead, or we can try again together over the phone.",
  comparing:
    "You mentioned you were still comparing options. If it helps, I'm happy to answer anything about specs, sizing or how it stacks up against what else you're looking at.",
};

const ASK =
  "Was there anything that held you up? Delivery cost or timing, a question about the equipment, needing a formal quote first, or something else? Just reply and let me know, and I'll help sort it out.";

/** Subject and body of the draft. Plain text, as a mailto body has to be. */
export function followUpDraft(row: CheckoutLeadRow): { subject: string; body: string } {
  const name = firstName(row.name);
  const what = whatTheyWereBuying(row);
  const reason = validAbandonReason(row.abandon_reason);
  const middle = (reason && ANSWER[reason]) || ASK;
  const body = [
    name ? `Hi ${name},` : "Hi,",
    "",
    `I saw you started an order for ${what} on our website but didn't get to finish it.`,
    "",
    middle,
    "",
    "Thanks,",
    "",
    "MasterKraft",
    "(03) 9044 9575",
  ].join("\n");
  return { subject: "Your MasterKraft order", body };
}

/**
 * A mailto link that opens the draft, addressed to the shopper. Null without an
 * email. encodeURIComponent rather than URLSearchParams: mail apps read "+" as a
 * plus sign, not a space.
 */
export function followUpMailto(row: CheckoutLeadRow): string | null {
  const to = row.email?.trim();
  if (!to) return null;
  const { subject, body } = followUpDraft(row);
  // The address as typed (an encoded "@" trips some mail apps), with only the
  // characters that would end it early escaped.
  return `mailto:${to.replace(/[?&#\s]/g, (c) => encodeURIComponent(c))}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
