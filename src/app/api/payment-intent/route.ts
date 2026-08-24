import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { resolveOrderLines, type CartRef } from "@/lib/woo-orders";
import { quoteFreightForRefs, type DeliveryInput } from "@/lib/freight-server";

// Creates a Stripe PaymentIntent for the SERVER-repriced cart total (never the
// client-sent prices). Returns the client secret for the Payment Element.
export async function POST(request: Request) {
  if (!stripe) {
    return NextResponse.json({ ok: false, error: "Payments not configured" }, { status: 503 });
  }

  let items: CartRef[];
  let delivery: DeliveryInput | undefined;
  let freightServiceId: string | undefined;
  try {
    ({ items, delivery, freightServiceId } = await request.json());
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ ok: false, error: "Cart is empty" }, { status: 400 });
  }

  let lines, total, hasPoa;
  try {
    ({ lines, total, hasPoa } = await resolveOrderLines(items));
  } catch (e) {
    console.error("[payment-intent] repricing failed", e);
    return NextResponse.json(
      { ok: false, error: "We couldn't price one or more items. Please refresh your cart or request a quote." },
      { status: 422 }
    );
  }
  if (lines.length === 0 || total <= 0 || hasPoa) {
    return NextResponse.json(
      { ok: false, error: "One or more items are priced on application. Please request a quote." },
      { status: 422 }
    );
  }

  // FREIGHT IS PRICED HERE, ON THE SERVER, and re-quoted from scratch: the
  // client sends only WHICH service was chosen, never what it costs. A freight
  // price posted by the browser would be a way to buy delivery for a dollar.
  //
  // When freight cannot be quoted - no API key yet, a product with no carton
  // dimensions, no compliant service - the order is NOT charged with an unknown
  // freight cost. It is pushed to the quote flow, the same way an item priced on
  // application already is. The one thing that must never happen is charging a
  // card while the summary says freight is free.
  const freight = await quoteFreightForRefs(items, delivery, freightServiceId);
  if (freight.required && !freight.selected) {
    return NextResponse.json(
      { ok: false, error: freightMessage(freight.reason), reason: freight.reason },
      { status: 422 }
    );
  }
  const freightCost = freight.selected?.price ?? 0;
  const chargeTotal = Math.round((total + freightCost) * 100) / 100;

  // A misconfigured/rejected Stripe key throws here. Catch it so the client gets
  // a legible error instead of a bare 500 (which is what masked a bad key earlier).
  let intent;
  try {
    intent = await stripe.paymentIntents.create({
      amount: Math.round(chargeTotal * 100), // cents
      currency: "aud",
      automatic_payment_methods: { enabled: true },
      metadata: {
        source: "masterkraft-site",
        line_count: String(lines.length),
        // Read back by /api/order to check the paid amount and to put a real
        // shipping line on the WooCommerce order. Written here on the server, so
        // it is a trustworthy record of what the card was charged for.
        freight_amount: freightCost.toFixed(2),
        freight_service: freight.selected?.service ?? "",
        freight_carrier: freight.selected?.carrier ?? "",
        freight: freight.selected ? `${freight.selected.service} ${freightCost}` : "quoted separately",
      },
    });
  } catch (e) {
    console.error("[payment-intent] Stripe create failed", e);
    return NextResponse.json(
      { ok: false, error: "We couldn't start the payment. Please try again shortly." },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    clientSecret: intent.client_secret,
    amount: chargeTotal,
    goodsTotal: total,
    freight: freight.selected
      ? { service: freight.selected.service, carrier: freight.selected.carrier, price: freightCost }
      : null,
    freightReason: freight.selected ? null : freight.reason,
  });
}

// Say WHY the order needs a quote. Most rejections here are not the customer's
// address failing - they are a rack or a machine, which ships as freight rather
// than parcel post and always did. Telling a Sydney customer we could not price
// "this delivery address" for a 250kg machine sends them off to re-check a
// postcode that was never the problem.
function freightMessage(reason?: string): string {
  switch (reason) {
    case "oversize":
    case "too_many_parcels":
      return "This order ships as freight rather than parcel post, so we price delivery per order. Request a quote and our team will confirm the cost with you.";
    case "incomplete_dimensions":
      return "We don't have shipping dimensions on file for one or more items in this order. Request a quote and our team will confirm delivery with you.";
    case "no_delivery_address":
      return "Please enter your delivery suburb and postcode so we can calculate freight.";
    default:
      return "We couldn't calculate freight for this order right now. Please request a quote and our team will confirm it.";
  }
}
