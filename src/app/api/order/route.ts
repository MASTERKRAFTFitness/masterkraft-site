import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import {
  resolveOrderLines,
  createWooOrder,
  ordersEnabled,
  type CartRef,
  type OrderAddress,
} from "@/lib/woo-orders";

// Called after the customer pays. Verifies the PaymentIntent succeeded and that
// the paid amount matches the SERVER-repriced total, then creates the WC order.
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
  if (!ordersEnabled()) {
    return NextResponse.json({ ok: false, error: "Order creation is not enabled" }, { status: 503 });
  }

  // Re-price on the server.
  const { lines, total, hasPoa } = await resolveOrderLines(items);
  if (lines.length === 0 || total <= 0 || hasPoa) {
    return NextResponse.json({ ok: false, error: "Invalid cart" }, { status: 422 });
  }

  // Verify payment before creating the order.
  if (!stripe || !paymentIntentId) {
    return NextResponse.json({ ok: false, error: "Payment not verified" }, { status: 402 });
  }
  const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (intent.status !== "succeeded") {
    return NextResponse.json({ ok: false, error: "Payment not completed" }, { status: 402 });
  }
  if (intent.amount_received !== Math.round(total * 100) || intent.currency !== "aud") {
    return NextResponse.json({ ok: false, error: "Payment amount mismatch" }, { status: 409 });
  }

  try {
    const order = await createWooOrder({ billing, shipping, lines, paymentIntentId, customerNote });
    return NextResponse.json({ ok: true, orderId: order.id, orderNumber: order.number });
  } catch (e) {
    console.error("[order] create failed", e);
    // Payment succeeded but order failed — surface clearly so it can be reconciled.
    return NextResponse.json(
      { ok: false, error: "Payment received, but we couldn't record the order. Our team will follow up." },
      { status: 500 }
    );
  }
}
