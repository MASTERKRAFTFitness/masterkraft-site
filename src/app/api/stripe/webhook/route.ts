import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { fulfilPaymentIntent } from "@/lib/fulfil-order";
import { orderIntentData } from "@/lib/order-intent";

// STRIPE'S payment_intent.succeeded, for the customer who paid and never came
// back. Afterpay and Zip take the customer off the site to pay; if they close
// that tab instead of returning to /checkout/complete, this is the only thing
// that turns their payment into an order.
//
// It fires for card payments too. Those are normally placed by the checkout page
// a moment earlier, and lib/order-claims stops the two placing one payment
// twice: whichever arrives second gets the first one's order number.
//
// Needs STRIPE_WEBHOOK_SECRET, the signing secret of the endpoint registered in
// the Stripe Dashboard. Without it every event is refused, because an unsigned
// "this payment succeeded" is a free order for anyone who can POST.
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json({ ok: false, error: "Webhook not configured" }, { status: 503 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      await request.text(),
      request.headers.get("stripe-signature") ?? "",
      secret
    );
  } catch {
    return NextResponse.json({ ok: false, error: "Bad signature" }, { status: 400 });
  }

  if (event.type !== "payment_intent.succeeded") return NextResponse.json({ ok: true, ignored: event.type });
  const intent = event.data.object;
  // Not ours (an invoice paid through Xero, a Payment Link), or created before
  // intents carried their cart: the checkout page is the only one that can
  // place those, so there is nothing for this to do.
  if (intent.metadata?.source !== "masterkraft-site" || !orderIntentData(intent.metadata)) {
    return NextResponse.json({ ok: true, ignored: "no stored cart" });
  }

  const { status, body } = await fulfilPaymentIntent({ paymentIntentId: intent.id });
  if (status >= 500) {
    // A failure Stripe should retry: it re-sends with backoff for three days.
    console.error("[stripe-webhook] order not placed, Stripe will retry", { intent: intent.id, ...body });
    return NextResponse.json(body, { status: 500 });
  }
  if (!body.ok) {
    // Not retryable (amount mismatch, invalid cart). Logged for reconciliation;
    // the paid intent in Stripe still shows the customer and the cart.
    console.error("[stripe-webhook] order refused", { intent: intent.id, status, ...body });
  }
  return NextResponse.json(body, { status: 200 });
}
