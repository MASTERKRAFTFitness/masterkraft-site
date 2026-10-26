// "Anything stopping you?" - the optional question on the checkout page, after
// the freight quote. See components/shop/StoppingQuestion and lib/abandon-reasons.
//
// It only ever UPDATES the shopper's own checkout row, found by the random id
// their browser made, and sends nothing: the answer reaches the team in the
// abandoned-checkout alert (cron/abandoned-checkouts) if they then leave. A
// shopper who goes on to pay was not stopped, and nobody needs an email about it.
//
// NOT CONSENT. Answering is not a request for email; only the "Email me my cart"
// box is (lib/cart-reminders). The answer is for the team's one-to-one follow-up.
import { NextResponse } from "next/server";
import { CHECKOUT_PAGE_REASONS, MAX_REASON_NOTE, validAbandonReason } from "@/lib/abandon-reasons";
import { recordAbandonReason } from "@/lib/cart-reminders";
import { validCheckoutId } from "@/lib/checkout-leads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Room for the id, a code and a full note, and no more. */
const MAX_BODY = 4 * MAX_REASON_NOTE;

export async function POST(request: Request) {
  const text = await request.text().catch(() => "");
  if (text.length > MAX_BODY) return NextResponse.json({ ok: false, error: "Too long." }, { status: 413 });
  let body: { checkoutId?: unknown; reason?: unknown; note?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  const checkoutId = validCheckoutId(body?.checkoutId);
  const reason = validAbandonReason(body?.reason);
  if (!checkoutId || !reason || !CHECKOUT_PAGE_REASONS.includes(reason)) {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  const note = typeof body.note === "string" ? body.note : null;

  try {
    const result = await recordAbandonReason(checkoutId, reason, note);
    // Unknown checkout: the freight step's row was never written (no Supabase,
    // or it failed). Nothing to attach the answer to.
    if (!result) return NextResponse.json({ ok: false, error: "Checkout not found." }, { status: 404 });
  } catch (e) {
    console.error("[checkout/reason] failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "Could not save." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
