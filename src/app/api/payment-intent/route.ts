import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { quoteOnly } from "@/lib/checkout-mode";
import { resolveOrderLines, type CartRef } from "@/lib/order-lines";
import { quoteFreightForRefs, type DeliveryInput } from "@/lib/freight-server";
import { freightMessage } from "@/lib/freight-message";
import { scheduleCheckoutLead, validCheckoutId } from "@/lib/checkout-leads";
import { orderIntentMetadata } from "@/lib/order-intent";
import type { OrderAddress } from "@/lib/order-lines";
import { alreadyRedeemed, alreadyUsedMessage, evaluatePromo, promoMetadata, type AppliedPromo } from "@/lib/promo-codes";

// Creates a Stripe PaymentIntent for the SERVER-repriced cart total (never the
// client-sent prices). Returns the client secret for the Payment Element.
export async function POST(request: Request) {
  // QUOTE-ONLY IS A SERVER RULE, NOT A HIDDEN FORM. The checkout page reads the
  // same flag to render the quote flow, but that only stops the browser we
  // shipped. This route is a public endpoint: without this check, quote mode
  // means "the card form is hidden" rather than "no card may be charged", and a
  // direct POST would start a real payment against live keys while every page
  // on the site promised a quote.
  if (quoteOnly) {
    return NextResponse.json(
      { ok: false, error: "Card payment is unavailable. Please request a quote." },
      { status: 503 }
    );
  }

  if (!stripe) {
    return NextResponse.json({ ok: false, error: "Payments not configured" }, { status: 503 });
  }

  let items: CartRef[];
  let delivery: DeliveryInput | undefined;
  let freightServiceId: string | undefined;
  let checkoutId: unknown;
  let billing: OrderAddress | undefined;
  let anonId: unknown;
  let promoCode: unknown;
  try {
    ({ items, delivery, freightServiceId, checkoutId, billing, anonId, promoCode } = await request.json());
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

  // A PROMO CODE IS JUDGED HERE, against the cart just repriced, whatever the
  // checkout showed. A code that no longer applies is refused with the reason,
  // rather than quietly charging full price to someone who thinks it worked.
  let promo: AppliedPromo | null = null;
  if (promoCode) {
    const verdict = evaluatePromo(promoCode, total);
    if (!verdict.ok) return NextResponse.json({ ok: false, error: verdict.error, promo: false }, { status: 422 });
    if (!billing?.email) {
      return NextResponse.json({ ok: false, error: "Enter your email to use a promo code.", promo: false }, { status: 422 });
    }
    if (verdict.promo.onePerCustomer) {
      let used: boolean;
      try {
        used = await alreadyRedeemed(verdict.promo.code, billing.email);
      } catch (e) {
        console.error("[payment-intent] promo redemption lookup failed", e);
        return NextResponse.json(
          { ok: false, error: "We couldn't check your promo code just now. Please try again.", promo: false },
          { status: 503 }
        );
      }
      if (used) {
        return NextResponse.json(
          { ok: false, error: alreadyUsedMessage(verdict.promo), promo: false },
          { status: 422 }
        );
      }
    }
    promo = { code: verdict.promo.code, amount: verdict.discount };
  }
  const discount = promo?.amount ?? 0;
  const chargeTotal = Math.round((total - discount + freightCost) * 100) / 100;

  // The cart and the buyer, stored ON the intent, so the order can be placed
  // from the intent alone when the customer pays with Afterpay or Zip and the
  // browser that holds them is not the one that comes back - see
  // lib/order-intent. These are the refs priced above, not a second copy.
  let orderData: Record<string, string> = {};
  if (billing?.email) {
    try {
      orderData = orderIntentMetadata({
        items,
        billing,
        checkoutId: validCheckoutId(checkoutId) ?? undefined,
        anonId: typeof anonId === "string" ? anonId : undefined,
      });
    } catch (e) {
      console.error("[payment-intent] cart too large to store on the intent", e);
      return NextResponse.json(
        { ok: false, error: "This order is too large to pay for online. Please request a quote." },
        { status: 422 }
      );
    }
  }

  // A misconfigured/rejected Stripe key throws here. Catch it so the client gets
  // a legible error instead of a bare 500 (which is what masked a bad key earlier).
  let intent;
  try {
    intent = await stripe.paymentIntents.create({
      amount: Math.round(chargeTotal * 100), // cents
      currency: "aud",
      automatic_payment_methods: { enabled: true },
      // Afterpay requires a shipping address on the intent, and every method's
      // fraud checks use it. Delivery goes to the billing address (the form
      // asks for one address), so it is the same address.
      ...(billing?.email && billing.address_1
        ? {
            shipping: {
              name: `${billing.first_name ?? ""} ${billing.last_name ?? ""}`.trim() || billing.email,
              phone: billing.phone || undefined,
              address: {
                line1: billing.address_1,
                city: billing.city || undefined,
                state: billing.state || undefined,
                postal_code: billing.postcode || undefined,
                country: "AU",
              },
            },
          }
        : {}),
      metadata: {
        source: "masterkraft-site",
        line_count: String(lines.length),
        // Read back by /api/order to check the paid amount and to put a real
        // shipping line on the WooCommerce order. Written here on the server, so
        // it is a trustworthy record of what the card was charged for.
        freight_amount: freightCost.toFixed(2),
        freight_service: freight.selected?.service ?? "",
        freight_carrier: freight.selected?.carrier ?? "",
        // WHICH option was bought, not just its name: easyship-shipments reads it
        // to preselect the same courier on the Easyship shipment. Stripe caps a
        // metadata value at 500 characters; a split id is a few UUIDs long.
        freight_option_id: (freight.selected?.id ?? "").slice(0, 500),
        freight: freight.selected ? `${freight.selected.service} ${freightCost}` : "quoted separately",
        // Read back by lib/fulfil-order to check the amount and put the discount
        // on the order, and searched by lib/promo-codes for one use per customer.
        ...(promo && billing?.email ? promoMetadata(promo, billing.email) : {}),
        ...orderData,
      },
    });
  } catch (e) {
    console.error("[payment-intent] Stripe create failed", e);
    return NextResponse.json(
      { ok: false, error: "We couldn't start the payment. Please try again shortly." },
      { status: 502 }
    );
  }

  scheduleCheckoutLead(checkoutId, { status: "payment_started" });
  return NextResponse.json({
    ok: true,
    clientSecret: intent.client_secret,
    amount: chargeTotal,
    goodsTotal: total,
    promo,
    freight: freight.selected
      ? { service: freight.selected.service, carrier: freight.selected.carrier, price: freightCost }
      : null,
    freightReason: freight.selected ? null : freight.reason,
  });
}
