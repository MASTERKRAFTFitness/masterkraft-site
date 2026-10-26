"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { trackPurchase } from "@/lib/analytics";
import { forgetCheckoutId, recallBuyer, type PaidBuyer } from "@/components/shop/StripeCheckout";
import CustomerReviewsOptIn from "@/components/shop/CustomerReviewsOptIn";

// WHERE AFTERPAY AND ZIP SEND THE CUSTOMER BACK. Stripe appends the intent id
// and how the redirect went: ?payment_intent=pi_...&redirect_status=succeeded.
// Card payments never come here - they finish on /checkout itself.
//
// The order is placed from the intent alone (lib/fulfil-order): this page sends
// nothing but the id, because the browser that comes back may not be the one
// that left. The Stripe webhook does the same for a customer who never returns,
// and lib/order-claims makes sure the two cannot both place it.

type State =
  | { kind: "working" }
  | { kind: "paid"; orderNumber: string }
  | { kind: "pending" }
  | { kind: "failed" }
  | { kind: "error"; message: string };

// A payment can still read "processing" for a moment after the redirect.
const ATTEMPTS = 6;
const RETRY_MS = 2500;

export default function CheckoutCompletePage() {
  const { ready, clear } = useCart();
  const [state, setState] = useState<State>({ kind: "working" });
  const [buyer, setBuyer] = useState<PaidBuyer | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // After the cart has hydrated, so clear() empties the stored cart rather
    // than being overwritten by it. Once only (StrictMode mounts twice).
    if (!ready || started.current) return;
    started.current = true;

    const params = new URL(window.location.href).searchParams;
    const paymentIntentId = params.get("payment_intent");
    const redirectStatus = params.get("redirect_status");

    const paid = (orderNumber?: string) => {
      forgetCheckoutId();
      clear();
      setBuyer(recallBuyer());
      setState(orderNumber ? { kind: "paid", orderNumber } : { kind: "pending" });
    };

    (async () => {
      if (!paymentIntentId || redirectStatus === "failed") {
        setState({ kind: "failed" });
        return;
      }
      for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
        const res = await fetch("/api/order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentIntentId }),
        }).catch(() => null);
        const data = res ? await res.json().catch(() => ({})) : {};
        if (res?.ok && data.ok) {
          if (data.orderNumber && typeof data.value === "number") {
            trackPurchase({ id: String(data.orderNumber), value: data.value });
          }
          paid(data.orderNumber ? String(data.orderNumber) : undefined);
          return;
        }
        // 402 is "not completed yet": Afterpay or Zip still settling. Anything
        // else will not change by asking again.
        if (res?.status !== 402 || attempt === ATTEMPTS) {
          setState({
            kind: "error",
            message: data.error || "We couldn't confirm your order just now.",
          });
          return;
        }
        await new Promise((r) => setTimeout(r, RETRY_MS));
      }
    })();
  }, [ready, clear]);

  return (
    <section className="container-mk py-16">
      <div className="max-w-lg mx-auto text-center border border-accent bg-accent/5 p-10">
        {state.kind === "working" && (
          <>
            <p className="font-display uppercase tracking-wide text-2xl">Confirming your order…</p>
            <p className="mt-3 text-ash">This takes a few seconds. Please keep this page open.</p>
          </>
        )}
        {state.kind === "paid" && (
          <>
            <p className="font-display uppercase tracking-wide text-2xl">Order confirmed</p>
            <p className="mt-3 text-ash">
              Thanks, your order <strong>#{state.orderNumber}</strong>{" "}is in. You&apos;ll get a
              confirmation email shortly.
            </p>
            <Link href="/all-equipment" className="btn btn-accent mt-8">
              Keep Shopping
            </Link>
            {buyer && <CustomerReviewsOptIn orderId={state.orderNumber} email={buyer.email} state={buyer.state} />}
          </>
        )}
        {state.kind === "pending" && (
          <>
            <p className="font-display uppercase tracking-wide text-2xl">Payment received</p>
            <p className="mt-3 text-ash">
              Thanks, your payment went through and your order is being recorded. You&apos;ll get a
              confirmation email with your order number shortly.
            </p>
            <Link href="/all-equipment" className="btn btn-accent mt-8">
              Keep Shopping
            </Link>
          </>
        )}
        {state.kind === "failed" && (
          <>
            <p className="font-display uppercase tracking-wide text-2xl">Payment not completed</p>
            <p className="mt-3 text-ash">
              Your payment didn&apos;t go through, and you haven&apos;t been charged. Your cart is
              still saved.
            </p>
            <Link href="/checkout" className="btn btn-accent mt-8">
              Back to Checkout
            </Link>
          </>
        )}
        {state.kind === "error" && (
          <>
            <p className="font-display uppercase tracking-wide text-2xl">We&apos;re checking your order</p>
            <p className="mt-3 text-ash">{state.message}</p>
            <p className="mt-3 text-ash">
              If you were charged, our team will be in touch. You can also{" "}
              <Link href="/contact" className="underline">
                contact us
              </Link>
              .
            </p>
          </>
        )}
      </div>
    </section>
  );
}
