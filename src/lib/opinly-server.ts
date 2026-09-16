import { createOpinlyClient } from "@opinly/backend";

// Opinly web analytics — the server half.
//
// The browser also reports the purchase, so why report it twice? Because the
// browser's report is the one that goes missing: the tab is closed on the
// "Order confirmed" screen, the pixel was blocked, or the customer declined
// cookies and there is no pixel at all. The order, meanwhile, is a fact the
// server holds. Reporting from both ends and letting Opinly dedupe means a sale
// is recorded if EITHER end survives.
//
// The two are collapsed by `externalEventId`. Both ends must send the same one —
// see trackPurchase in lib/analytics for the browser half.

const key = process.env.OPINLY_API_KEY;

// Null until an API key is configured — same deal as lib/stripe. Unset is a
// working state: the browser pixel still reports, and nothing here throws.
const client = key ? createOpinlyClient({ apiKey: key }) : null;

export function opinlyServerEnabled(): boolean {
  return !!client;
}

/**
 * Report a paid order, best-effort.
 *
 * ALWAYS resolves. This is called from the order route AFTER the card has been
 * charged and the order written, where a rejected promise would turn a
 * successful sale into an error page. An analytics miss is a reporting problem;
 * a throw here would be a customer problem.
 *
 * Awaited by the caller rather than left floating: on Vercel the function can be
 * frozen the moment it responds, which would drop an in-flight request.
 *
 * `anonId` comes from the browser (window.opinly.anonId, forwarded with the
 * order POST). With neither anonId nor email, Opinly has nothing to join the
 * sale to and the revenue shows up as unattributed "direct" — so we pass the
 * billing email too, which the server always has even when the pixel is blocked.
 */
export async function reportPurchase(input: {
  orderNumber: string;
  value: number;
  currency?: string;
  anonId?: string;
  email?: string;
}): Promise<void> {
  if (!client) return;
  if (!input.anonId && !input.email) return;
  try {
    await client.track(
      "purchase",
      { value: input.value, currency: input.currency ?? "AUD" },
      {
        externalEventId: input.orderNumber,
        ...(input.anonId ? { anonId: input.anonId } : {}),
        ...(input.email ? { email: input.email } : {}),
      },
    );
  } catch (e) {
    console.warn("[opinly] purchase not reported", e);
  }
}
