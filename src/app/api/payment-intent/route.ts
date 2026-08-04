import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { resolveOrderLines, type CartRef } from "@/lib/woo-orders";

// Creates a Stripe PaymentIntent for the SERVER-repriced cart total (never the
// client-sent prices). Returns the client secret for the Payment Element.
export async function POST(request: Request) {
  if (!stripe) {
    return NextResponse.json({ ok: false, error: "Payments not configured" }, { status: 503 });
  }

  let items: CartRef[];
  try {
    ({ items } = await request.json());
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ ok: false, error: "Cart is empty" }, { status: 400 });
  }

  const { lines, total, hasPoa } = await resolveOrderLines(items);
  if (lines.length === 0 || total <= 0 || hasPoa) {
    return NextResponse.json(
      { ok: false, error: "One or more items are priced on application — please request a quote." },
      { status: 422 }
    );
  }

  const intent = await stripe.paymentIntents.create({
    amount: Math.round(total * 100), // cents
    currency: "aud",
    automatic_payment_methods: { enabled: true },
    metadata: { source: "masterkraft-site", line_count: String(lines.length) },
  });

  return NextResponse.json({ ok: true, clientSecret: intent.client_secret, amount: total });
}
