// Who inside MasterKraft gets told when a public form is completed.
//
// One list, read by every form route - the fitout brief, quotes, warranty
// claims, the waitlist and newsletter signups. They all used to read
// QUOTE_TO_EMAIL directly and wrap it in a one-element array, which meant
// adding a second recipient was a five-file code change and a deploy.
//
// QUOTE_TO_EMAIL IS NOW A LIST. Comma or semicolon separated:
//
//   QUOTE_TO_EMAIL="hello@masterkraft.com,marketing@masterkraft.com"
//
// A single address still parses to a single recipient, so the variable is
// backwards compatible and nothing had to change in Vercel for the existing
// deployments to keep working. Adding or removing whoever should see incoming
// enquiries is now an env change, not a release.
//
// ORDER MATTERS: the first address is treated as the primary inbox. It is what
// a customer's confirmation email sets as its Reply-To, so replies land in one
// place rather than fanning out to everyone on the notification list.

/** The fallback when nothing is configured. Matches what every route hardcoded before. */
export const DEFAULT_RECIPIENT = "hello@masterkraft.com";

/**
 * The internal notification list, in order, with the primary inbox first.
 *
 * Deduplicated case-insensitively, because the same inbox listed twice makes
 * Resend send two copies of the same brief. Blank entries are dropped rather
 * than passed through - a trailing comma in an env var is a typo, not a request
 * to email the empty string, and Resend rejects the whole send if one is in the
 * list, which would lose the notification entirely.
 *
 * Never returns an empty array: a form completed with nowhere to send it is the
 * one outcome worse than an unconfigured address.
 */
export function internalRecipients(raw = process.env.QUOTE_TO_EMAIL): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of (raw ?? "").split(/[,;]/)) {
    const address = part.trim();
    if (!address) continue;
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(address);
  }
  return out.length ? out : [DEFAULT_RECIPIENT];
}

/**
 * The one inbox a customer's reply should reach.
 *
 * Deliberately NOT the whole list. A Reply-To naming four people turns a
 * customer's "actually, here is the floor plan" into a four-way thread, and the
 * addresses of everyone on the internal list get exposed to the customer.
 */
export function primaryRecipient(raw = process.env.QUOTE_TO_EMAIL): string {
  return internalRecipients(raw)[0];
}
