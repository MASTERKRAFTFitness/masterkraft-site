// Turning a succeeded PaymentIntent into an order. Shared by the three ways a
// payment can arrive:
//
//   - /api/order, from the checkout page, after a card payment that never left it
//   - /api/order again, from /checkout/complete, after Afterpay or Zip sent the
//     customer away and back
//   - /api/stripe/webhook, when the customer paid and never came back
//
// The first sends the cart and address itself, as it always has. The other two
// send only the intent id, and the cart and address come from the intent's own
// metadata (lib/order-intent), written by our server when it priced the cart.
import { after } from "next/server";
import { scheduleCheckoutLead } from "@/lib/checkout-leads";
import { stripe } from "@/lib/stripe";
import { quoteOnly } from "@/lib/checkout-mode";
import { resolveOrderLines, type CartRef, type OrderAddress } from "@/lib/order-lines";
import { placeOrder, orderingEnabled, orderMetadata, existingOrderOn, type PlacedOrder } from "@/lib/orders";
import { reportPurchase } from "@/lib/opinly-server";
import { notifyOrderPlaced } from "@/lib/order-notify";
import { refsToFreightItems } from "@/lib/freight-server";
import { shipmentSyncEnabled, syncShipmentsToEasyship, type ShipmentOrder } from "@/lib/easyship-shipments";
import { orderIntentData } from "@/lib/order-intent";
import { claimOrder, completeClaim, releaseClaim } from "@/lib/order-claims";

export type FulfilInput = {
  paymentIntentId?: string;
  /** Sent by the card checkout. Absent from the return page and the webhook. */
  items?: CartRef[];
  billing?: OrderAddress;
  shipping?: OrderAddress;
  customerNote?: string;
  anonId?: string;
  checkoutId?: string;
};

export type FulfilResult = {
  status: number;
  body: { ok: boolean; error?: string; orderId?: string; orderNumber?: string; value?: number; idempotent?: boolean; pending?: boolean };
};

const fail = (status: number, error: string): FulfilResult => ({ status, body: { ok: false, error } });

/**
 * LOCAL TESTING ONLY. With ORDER_DRY_RUN=true AND a Stripe TEST key, the order
 * is not written to Unleashed and nothing is emailed, reported or shipped: the
 * customer is shown a TEST- number instead. Both conditions, so a stray flag in
 * production (live key) can never stop real orders being recorded.
 */
export function orderDryRun(): boolean {
  return (
    process.env.ORDER_DRY_RUN === "true" && (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_")
  );
}

// How long a caller that lost the claim waits for the winner's order number
// before answering "in progress". The winner is placing an Unleashed order,
// which normally takes a few seconds.
const WAIT_MS = 20_000;
const POLL_MS = 2_000;

export async function fulfilPaymentIntent(input: FulfilInput): Promise<FulfilResult> {
  const { paymentIntentId, customerNote } = input;
  const dryRun = orderDryRun();

  // The same gate lib/checkout-mode puts on /api/payment-intent, for the same
  // reason. An intent minted before quote mode went on can still arrive here,
  // and this is what turns a charge into an order.
  if (quoteOnly) return fail(503, "Card checkout is unavailable. Please request a quote.");
  if (!orderingEnabled() && !dryRun) return fail(503, "Order creation is not enabled");

  // Verify payment first — we need the PaymentIntent both to authorise the order
  // and to enforce idempotency below.
  if (!stripe || !paymentIntentId) return fail(402, "Payment not verified");
  let intent;
  try {
    intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch (e) {
    console.error("[order] PaymentIntent retrieve failed", e);
    return fail(402, "Payment not verified");
  }
  if (intent.status !== "succeeded") return fail(402, "Payment not completed");

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
    return {
      status: 200,
      body: { ok: true, orderId: already.id, orderNumber: already.orderNumber, value: intent.amount_received / 100, idempotent: true },
    };
  }

  // The browser's cart and address when it sent them, otherwise the intent's.
  const stored = orderIntentData(intent.metadata);
  const items = Array.isArray(input.items) && input.items.length ? input.items : stored?.items;
  const billing = input.billing?.email ? input.billing : stored?.billing;
  const shipping = input.shipping ?? (input.billing?.email ? undefined : stored?.billing);
  const anonId = input.anonId ?? stored?.anonId;
  const checkoutId = input.checkoutId ?? stored?.checkoutId;
  if (!items?.length || !billing?.email) return fail(400, "Missing items or billing email");

  // Re-price on the server. By this point the customer has already confirmed
  // payment client-side, so a repricing failure means money may be captured —
  // surface a reconciliation message rather than a bare "invalid cart".
  let lines, total, hasPoa;
  try {
    ({ lines, total, hasPoa } = await resolveOrderLines(items));
  } catch (e) {
    console.error("[order] repricing failed after payment", e);
    return fail(500, "Payment received, but we couldn't record the order. Our team will follow up.");
  }
  if (lines.length === 0 || total <= 0 || hasPoa) return fail(422, "Invalid cart");

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
    return fail(409, "Payment amount mismatch");
  }

  // Only one caller places the order - see lib/order-claims. The loser waits for
  // the winner's order number, so the customer still sees it.
  const claim = await claimOrder(paymentIntentId);
  if (!claim.won) return awaitOtherCaller(paymentIntentId, claim.orderNumber, chargedTotal);

  const freight = {
    amount: freightAmount,
    service: intent.metadata?.freight_service || "",
    carrier: intent.metadata?.freight_carrier || "",
  };

  let order: PlacedOrder;
  try {
    order = dryRun
      ? {
          id: `test-${paymentIntentId}`,
          orderNumber: `TEST-${paymentIntentId.slice(-8)}`,
          status: "dry-run",
          total: chargedTotal,
          backend: "unleashed",
        }
      : await placeOrder({ billing, shipping, lines, paymentIntentId, customerNote, chargedTotal, freight });
  } catch (e) {
    console.error("[order] create failed", e);
    await releaseClaim(paymentIntentId);
    // Payment succeeded but order failed — surface clearly so it can be reconciled.
    return fail(500, "Payment received, but we couldn't record the order. Our team will follow up.");
  }
  await completeClaim(paymentIntentId, order.orderNumber);

  // Record the order on the PaymentIntent so a retry short-circuits above rather
  // than creating a duplicate. Best-effort: the order already exists, so never
  // fail the response if this write doesn't land.
  try {
    await stripe.paymentIntents.update(paymentIntentId, { metadata: orderMetadata(order) });
  } catch (e) {
    console.warn("[order] could not tag PaymentIntent with order id", e);
  }

  if (dryRun) {
    // The checkout's follow-up row is still marked paid: left at payment_started,
    // the abandoned-checkout run would alert the team about a test.
    scheduleCheckoutLead(checkoutId, { status: "paid", orderNumber: String(order.orderNumber) });
    console.log("[order] DRY RUN, nothing written, emailed or shipped", { orderNumber: order.orderNumber });
    return { status: 200, body: { ok: true, orderId: order.id, orderNumber: order.orderNumber, value: chargedTotal } };
  }

  // Report the sale to Opinly. Deduped against the browser's own purchase event
  // by the order number, so whichever of the two lands first wins and the second
  // is collapsed rather than double-counting the revenue.
  //
  // Awaited, but it cannot fail the request: the order exists and the card is
  // charged by this point.
  await reportPurchase({
    orderNumber: order.orderNumber,
    value: chargedTotal,
    currency: "AUD",
    anonId,
    email: billing.email,
  });

  // Confirmation email, team email and HubSpot contact. AFTER the intent is
  // tagged, so a retry arriving while these run short-circuits instead of
  // placing a second order. Cannot fail the request — see lib/order-notify.
  const notified = await notifyOrderPlaced({
    orderNumber: order.orderNumber,
    billing,
    shipping,
    lines,
    freight,
    chargedTotal,
    customerNote,
  });
  console.log("[order] placed", { orderNumber: order.orderNumber, ...notified });
  scheduleCheckoutLead(checkoutId, { status: "paid", orderNumber: String(order.orderNumber) });

  // The order into Easyship's "To Ship" list, label NOT bought - see
  // lib/easyship-shipments. After the response, so a slow Easyship never holds
  // a paid customer's confirmation screen, and it cannot fail the order.
  const freightLabel =
    [intent.metadata?.freight_carrier, intent.metadata?.freight_service].filter(Boolean).join(" ") ||
    undefined;
  scheduleShipmentSync(items, {
    orderNumber: String(order.orderNumber),
    billing,
    shipping,
    lines,
    freightOptionId: intent.metadata?.freight_option_id || undefined,
    freightLabel,
    customerNote,
  });

  return { status: 200, body: { ok: true, orderId: order.id, orderNumber: order.orderNumber, value: chargedTotal } };
}

/**
 * Another caller is placing this order. Wait for its number rather than placing
 * a second one; if it does not arrive in time, say the order is on its way. The
 * winner sends the confirmation email either way.
 */
async function awaitOtherCaller(
  paymentIntentId: string,
  known: string | null,
  value: number
): Promise<FulfilResult> {
  if (known) return { status: 200, body: { ok: true, orderNumber: known, value, idempotent: true } };
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    try {
      const intent = await stripe!.paymentIntents.retrieve(paymentIntentId);
      const done = existingOrderOn(intent.metadata);
      if (done) {
        return { status: 200, body: { ok: true, orderId: done.id, orderNumber: done.orderNumber, value, idempotent: true } };
      }
    } catch {
      /* keep waiting */
    }
  }
  return { status: 202, body: { ok: true, pending: true } };
}

function scheduleShipmentSync(refs: CartRef[], order: Omit<ShipmentOrder, "items">): void {
  // Checked here as well as in the sync, so a switched-off sync does not cost a
  // live Unleashed lookup for cartons it will never use.
  if (!shipmentSyncEnabled()) return;
  const run = async () => {
    try {
      const items = await refsToFreightItems(refs);
      const result = await syncShipmentsToEasyship({ ...order, items });
      console.log("[order] easyship", { orderNumber: order.orderNumber, ...result });
    } catch (e) {
      console.error("[order] easyship sync crashed", { orderNumber: order.orderNumber, e });
    }
  };
  // `after()` throws outside a request scope (route tests call the handler
  // directly), which degrades to a detached promise - same as scheduleCheckoutLead.
  try {
    after(run);
  } catch {
    void run();
  }
}
