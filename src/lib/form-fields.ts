// The two field names the bot filter depends on, in one place because both ends
// have to agree on them. The client renders them; the server reads them. If they
// ever drift, the honeypot quietly stops being a honeypot and the fill-time check
// quietly stops checking anything - and nothing fails loudly to tell us.
//
// Kept apart from lib/form-guard.ts so the client bundle imports two strings
// rather than the whole server-side filter.

/** Hidden from people, irresistible to a form-filler. */
export const HONEYPOT_FIELD = "website";
/** How long the form was on screen, in ms. A duration, never a clock reading. */
export const ELAPSED_FIELD = "elapsedMs";
