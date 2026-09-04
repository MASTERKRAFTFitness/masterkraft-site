import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { resolveOrderLines, type CartRef, type OrderAddress } from "@/lib/woo-orders";
import { placeOrder, orderingEnabled, orderMetadata, existingOrderOn } from "@/lib/orders";

// Called after the customer pays. Verifies the PaymentIntent succeeded and that
// the paid amount matches the SERVER-repriced total, then places the order.
//
// WHICH SYSTEM the order lands in is lib/orders' business, not this route's.
export async function POST(request: Request) {
  let payload: {
    items?: CartRef[];
    billing?: OrderAddress;
    shipping?: OrderAddress;
    paymentIntentId?: string;
    customerNote?: string;
  };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const { items, billing, shipping, paymentIntentId, customerNote } = payload;
  if (!Array.isArray(items) || items.length === 0 || !billing?.email) {
    return NextResponse.json({ ok: false, error: "Missing items or billing email" }, { status: 400 });
  }
  if (!orderingEnabled()) {
    return NextResponse.json({ ok: false, error: "Order creation is not enabled" }, { status: 503 });
  }

  // Verify payment first — we need the PaymentIntent both to authorise the order
  // and to enforce idempotency below.
  if (!stripe || !paymentIntentId) {
    return NextResponse.json({ ok: false, error: "Payment not verified" }, { status: 402 });
  }
  let intent;
  try {
    intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch (e) {
    console.error("[order] PaymentIntent retrieve failed", e);
    return NextResponse.json({ ok: false, error: "Payment not verified" }, { status: 402 });
  }
  if (intent.status !== "succeeded") {
    return NextResponse.json({ ok: false, error: "Payment not completed" }, { status: 402 });
  }

  // Idempotency: if we already created an order for this PaymentIntent, return it
  // instead of creating a duplicate. Guards against retries and double-submits,
  // where the same succeeded payment would otherwise mint a second order.
  //
  // Reads both the neutral keys and the older wc_* ones, so an intent created
  // before the backend switch still short-circuits. The id stays a STRING: an
  // Unleashed Guid is not a number, and coercing it would return NaN to a
  // customer whose card had already been charged.
  const already = existingOrderOn(intent.metadata);
  if (already) {
    return NextResponse.json({
      ok: true,
      orderId: already.id,
      orderNumber: already.orderNumber,
      idempotent: true,
    });
  }

  // Re-price on the server. By this point the customer has already confirmed
  // payment client-side, so a repricing failure means money may be captured —
  // surface a reconciliation message rather than a bare "invalid cart".
  let lines, total, hasPoa;
  try {
    ({ lines, total, hasPoa } = await resolveOrderLines(items));
  } catch (e) {
    console.error("[order] repricing failed after payment", e);
    return NextResponse.json(
      { ok: false, error: "Payment received, but we couldn't record the order. Our team will follow up." },
      { status: 500 }
    );
  }
  if (lines.length === 0 || total <= 0 || hasPoa) {
    return NextResponse.json({ ok: false, error: "Invalid cart" }, { status: 422 });
  }

  // The charge is goods PLUS freight. Comparing it against the goods total alone
  // would reject every freight-bearing order AFTER the card was captured, which
  // is how a paid customer ends up with no order. The freight figure comes from
  // the PaymentIntent metadata, written by our own server when the intent was
  // created, so it records what was charged without re-quoting the carrier here
  // (a rate that moved, or a carrier having a bad minute, must not lose an order
  // that has already been paid for).
  const freightCharged = Number(intent.metadata?.freight_amount ?? 0);
  const freightAmount = Number.isFinite(freightCharged) && freightCharged > 0 ? freightCharged : 0;
  const chargedTotal = Math.round((total + freightAmount) * 100) / 100;

  if (intent.amount_received !== Math.round(chargedTotal * 100) || intent.currency !== "aud") {
    return NextResponse.json({ ok: false, error: "Payment amount mismatch" }, { status: 409 });
  }

  let order;
  try {
    order = await placeOrder({
      billing,
      shipping,
      lines,
      paymentIntentId,
      customerNote,
      chargedTotal,
      freight: {
        amount: freightAmount,
        service: intent.metadata?.freight_service || "",
        carrier: intent.metadata?.freight_carrier || "",
      },
    });
  } catch (e) {
    console.error("[order] create failed", e);
    // Payment succeeded but order failed — surface clearly so it can be reconciled.
    return NextResponse.json(
      { ok: false, error: "Payment received, but we couldn't record the order. Our team will follow up." },
      { status: 500 }
    );
  }

  // Record the order on the PaymentIntent so a retry short-circuits above rather
  // than creating a duplicate. Best-effort: the order already exists, so never
  // fail the response if this write doesn't land.
  try {
    await stripe.paymentIntents.update(paymentIntentId, { metadata: orderMetadata(order) });
  } catch (e) {
    console.warn("[order] could not tag PaymentIntent with order id", e);
  }

  return NextResponse.json({ ok: true, orderId: order.id, orderNumber: order.orderNumber });
}
