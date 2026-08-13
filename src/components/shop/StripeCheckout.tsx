"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { getStripe } from "@/lib/stripe-client";
import { useCart, type CartItem } from "@/components/cart/CartProvider";
import { track } from "@/lib/analytics";

const aud = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
const fieldClass =
  "w-full px-4 py-3 border border-line bg-white text-ink placeholder:text-ash/70 focus:outline-none focus:border-accent transition-colors";

const AU_STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];

type Billing = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  company: string;
  address_1: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
};

function refsFrom(items: CartItem[]) {
  return items.map((i) => ({
    productId: i.productId ?? i.id,
    variationId: i.variationId,
    quantity: i.qty,
  }));
}

type OrderRef = { productId: number; variationId?: number; quantity: number };

export default function StripeCheckout({ onPaid }: { onPaid?: (orderNumber: string) => void }) {
  const { items, subtotal, lock, unlock } = useCart();
  const [phase, setPhase] = useState<"details" | "payment">("details");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  // Snapshot of the cart taken when the PaymentIntent was created. The order is
  // created from THIS, not the live cart, so nothing the customer does mid-payment
  // can desync what they pay from what the order records.
  const [orderRefs, setOrderRefs] = useState<OrderRef[]>([]);
  // The authoritative total the PaymentIntent was created for (server-repriced).
  // This is what Stripe actually charges — always display THIS, never the cart
  // subtotal, which can be stale relative to live Unleashed pricing.
  const [serverTotal, setServerTotal] = useState<number | null>(null);
  const [billing, setBilling] = useState<Billing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Safety net: never leave the cart locked if the customer navigates away
  // mid-payment (unmount) without going back or completing.
  useEffect(() => unlock, [unlock]);

  async function startPayment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    const b: Billing = {
      first_name: String(f.get("first_name") ?? ""),
      last_name: String(f.get("last_name") ?? ""),
      email: String(f.get("email") ?? ""),
      phone: String(f.get("phone") ?? ""),
      company: String(f.get("company") ?? ""),
      address_1: String(f.get("address_1") ?? ""),
      city: String(f.get("city") ?? ""),
      state: String(f.get("state") ?? ""),
      postcode: String(f.get("postcode") ?? ""),
      country: "AU",
    };
    const refs = refsFrom(items);
    try {
      const res = await fetch("/api/payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: refs }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Could not start payment.");
      setBilling(b);
      setOrderRefs(refs);
      setClientSecret(data.clientSecret);
      setServerTotal(typeof data.amount === "number" ? data.amount : null);
      setPhase("payment");
      lock(); // freeze the cart while this payment is in flight
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-[1.4fr_1fr] gap-12">
      <div>
        {phase === "details" && (
          <form onSubmit={startPayment} className="space-y-4">
            <h2 className="font-display uppercase tracking-wide text-lg mb-2">Billing & Delivery</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <input name="first_name" required aria-label="First name" placeholder="First name" className={fieldClass} />
              <input name="last_name" required aria-label="Last name" placeholder="Last name" className={fieldClass} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <input name="email" required type="email" aria-label="Email" placeholder="Email" className={fieldClass} />
              <input name="phone" required aria-label="Phone" placeholder="Phone" className={fieldClass} />
            </div>
            <input name="company" aria-label="Company / gym name (optional)" placeholder="Company / gym name (optional)" className={fieldClass} />
            <input name="address_1" required aria-label="Delivery address" placeholder="Delivery address" className={fieldClass} />
            <div className="grid sm:grid-cols-3 gap-4">
              <input name="city" required aria-label="Suburb" placeholder="Suburb" className={fieldClass} />
              <select name="state" required defaultValue="" className={fieldClass}>
                <option value="" disabled>
                  State
                </option>
                {AU_STATES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <input name="postcode" required aria-label="Postcode" placeholder="Postcode" className={fieldClass} />
            </div>
            {error && <p className="text-accent-600 text-sm">{error}</p>}
            <button type="submit" disabled={loading} className="btn btn-accent w-full sm:w-auto disabled:opacity-60">
              {loading ? "…" : "Continue to Payment"} <span aria-hidden>→</span>
            </button>
          </form>
        )}

        {phase === "payment" && clientSecret && billing && (
          <Elements
            stripe={getStripe()}
            options={{ clientSecret, appearance: { theme: "flat", variables: { colorPrimary: "#0f6fdc" } } }}
          >
            <PayForm
              billing={billing}
              orderRefs={orderRefs}
              subtotal={subtotal}
              serverTotal={serverTotal}
              onPaid={onPaid}
              onBack={() => {
                unlock();
                setPhase("details");
              }}
            />
          </Elements>
        )}
      </div>

      {/* Order summary */}
      <aside className="lg:sticky lg:top-28 h-fit border border-line p-6">
        <h2 className="font-display uppercase tracking-wide text-lg mb-5">Order</h2>
        <ul className="divide-y divide-line">
          {items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3 py-3 text-sm">
              <span className="min-w-0">
                <span className="line-clamp-1">{i.name}</span>
                <span className="text-ash font-mono text-xs">× {i.qty}</span>
              </span>
              <span className="font-mono shrink-0">{aud.format(i.price * i.qty)}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between font-mono text-sm py-3 mt-2 border-t border-line">
          <span className="text-ash">Subtotal (inc. GST)</span>
          <span>{aud.format(subtotal)}</span>
        </div>
        <div className="flex justify-between font-mono text-sm">
          <span className="text-ash">Shipping</span>
          <span>Free</span>
        </div>
        <div className="flex justify-between font-mono text-base py-3 mt-2 border-t border-line font-semibold">
          <span>Total</span>
          <span>{aud.format(serverTotal ?? subtotal)}</span>
        </div>
      </aside>
    </div>
  );
}

function PayForm({
  billing,
  orderRefs,
  subtotal,
  serverTotal,
  onPaid,
  onBack,
}: {
  billing: Billing;
  orderRefs: OrderRef[];
  subtotal: number;
  serverTotal: number | null;
  onPaid?: (orderNumber: string) => void;
  onBack: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const { clear } = useCart();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ number: string } | null>(null);

  // What Stripe will actually charge (server-repriced). Falls back to the cart
  // subtotal only if the server didn't return an amount.
  const charge = serverTotal ?? subtotal;
  // Cart price drifted from live pricing — tell the customer before they pay.
  const priceChanged = serverTotal !== null && Math.abs(serverTotal - subtotal) >= 0.01;

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setPaying(true);
    setError(null);
    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message ?? "Check your card details.");
      setPaying(false);
      return;
    }
    const { error: payError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
      confirmParams: {
        payment_method_data: {
          billing_details: {
            name: `${billing.first_name} ${billing.last_name}`.trim(),
            email: billing.email,
            phone: billing.phone,
            address: {
              line1: billing.address_1,
              city: billing.city,
              state: billing.state,
              postal_code: billing.postcode,
              country: "AU",
            },
          },
        },
      },
    });
    if (payError) {
      setError(payError.message ?? "Payment failed.");
      setPaying(false);
      return;
    }
    // Payment succeeded — create the WooCommerce order.
    try {
      const res = await fetch("/api/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: orderRefs,
          billing,
          shipping: billing,
          paymentIntentId: paymentIntent?.id,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Order could not be recorded.");
      track("purchase", { currency: "AUD", value: charge, transaction_id: data.orderNumber });
      // Hand the confirmation up to the page BEFORE clearing the cart: clearing
      // flips the page's canPay gate and unmounts this component, so the page
      // must own the "order confirmed" screen for it to survive.
      onPaid?.(String(data.orderNumber));
      clear();
      setDone({ number: data.orderNumber });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Order failed after payment, we'll follow up.");
    } finally {
      setPaying(false);
    }
  }

  if (done) {
    return (
      <div className="border border-accent bg-accent/5 p-10 text-center">
        <p className="font-display uppercase tracking-wide text-2xl">Order confirmed</p>
        <p className="mt-3 text-ash">
          Thanks, your order <strong>#{done.number}</strong> is in. You&apos;ll get a confirmation email shortly.
        </p>
        <Link href="/all-equipment" className="btn btn-accent mt-8">
          Keep Shopping
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={pay} className="space-y-6">
      <h2 className="font-display uppercase tracking-wide text-lg">Payment</h2>
      {priceChanged && (
        <p className="text-sm border border-line bg-smoke px-4 py-3">
          Pricing updated since you added to cart. The current total is{" "}
          <strong>{aud.format(charge)}</strong> (was {aud.format(subtotal)}). You will be
          charged the current total.
        </p>
      )}
      <PaymentElement />
      {error && <p className="text-accent-600 text-sm">{error}</p>}
      <div className="flex flex-wrap gap-4">
        <button type="submit" disabled={!stripe || paying} className="btn btn-accent disabled:opacity-60">
          {paying ? "Processing…" : `Pay ${aud.format(charge)}`}
        </button>
        <button type="button" onClick={onBack} className="btn btn-out !text-ink">
          ← Back
        </button>
      </div>
      <p className="text-xs text-ash">Secured by Stripe. Your card details never touch our servers.</p>
    </form>
  );
}
