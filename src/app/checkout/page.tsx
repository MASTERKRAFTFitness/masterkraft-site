"use client";

import Link from "next/link";
import { useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { track } from "@/lib/analytics";
import { paymentsConfigured } from "@/lib/stripe-client";
import StripeCheckout from "@/components/shop/StripeCheckout";

const aud = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
const money = (n: number) => (n > 0 ? aud.format(n) : "Contact for pricing");

const fieldClass =
  "w-full px-4 py-3 border border-line bg-white text-ink placeholder:text-ash/70 focus:outline-none focus:border-accent transition-colors";

export default function CheckoutPage() {
  const { items, subtotal, clear, ready } = useCart();
  // Card checkout when Stripe is configured AND every item has a real price.
  // Carts containing "Contact for pricing" items fall back to the quote flow.
  const canPay = paymentsConfigured && ready && items.length > 0 && items.every((i) => i.price > 0);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const contact = {
      name: `${form.get("firstName")} ${form.get("lastName")}`.trim(),
      email: String(form.get("email") ?? ""),
      phone: String(form.get("phone") ?? ""),
      company: String(form.get("company") ?? ""),
      location: String(form.get("location") ?? ""),
      notes: String(form.get("notes") ?? ""),
    };
    try {
      const res = await fetch("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact,
          items: items.map((i) => ({ id: i.id, name: i.name, qty: i.qty, price: i.price })),
          subtotal,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Something went wrong.");
      track("generate_lead", { currency: "AUD", value: subtotal, items: items.length });
      clear();
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="bg-carbon text-white pt-32 pb-12">
        <div className="container-mk">
          <p className="font-mono text-xs tracking-widest text-accent uppercase mb-3">Checkout</p>
          <h1 className="text-4xl lg:text-5xl font-bold">{canPay ? "Checkout" : "Request a Quote"}</h1>
        </div>
      </div>

      <section className="container-mk py-16">
        {canPay ? (
          <StripeCheckout />
        ) : done ? (
          <div className="max-w-lg mx-auto text-center border border-accent bg-accent/5 p-10">
            <p className="font-display uppercase tracking-wide text-2xl">Quote requested</p>
            <p className="mt-3 text-ash">
              Thanks - our team will confirm pricing, freight and lead times and be in touch
              shortly.
            </p>
            <Link href="/all-equipment" className="btn btn-accent mt-8">
              Keep Browsing
            </Link>
          </div>
        ) : !ready ? null : items.length === 0 ? (
          <div className="max-w-md mx-auto text-center py-10">
            <p className="text-ash text-lg">Your cart is empty.</p>
            <Link href="/all-equipment" className="btn btn-accent mt-8">
              Browse Equipment <span aria-hidden>→</span>
            </Link>
          </div>
        ) : (
          <div className="grid lg:grid-cols-[1.4fr_1fr] gap-12">
            {/* Details form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <h2 className="font-display uppercase tracking-wide text-lg mb-2">Your Details</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <input name="firstName" required aria-label="First name" placeholder="First name" className={fieldClass} />
                <input name="lastName" required aria-label="Last name" placeholder="Last name" className={fieldClass} />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <input name="email" required type="email" aria-label="Email" placeholder="Email" className={fieldClass} />
                <input name="phone" aria-label="Phone" placeholder="Phone" className={fieldClass} />
              </div>
              <input name="company" aria-label="Company / gym name" placeholder="Company / gym name" className={fieldClass} />
              <input name="location" aria-label="Delivery suburb / postcode" placeholder="Delivery suburb / postcode" className={fieldClass} />
              <textarea name="notes" rows={4} aria-label="Anything else we should know?" placeholder="Anything else we should know?" className={fieldClass} />

              {error && <p className="text-accent-600 text-sm">{error}</p>}

              <button type="submit" disabled={sending} className="btn btn-accent w-full sm:w-auto disabled:opacity-60">
                {sending ? "Sending…" : "Submit Quote Request"} <span aria-hidden>→</span>
              </button>
            </form>

            {/* Order summary */}
            <aside className="lg:sticky lg:top-28 h-fit border border-line p-6">
              <h2 className="font-display uppercase tracking-wide text-lg mb-5">Your Items</h2>
              <ul className="divide-y divide-line">
                {items.map((i) => (
                  <li key={i.id} className="flex justify-between gap-3 py-3 text-sm">
                    <span className="min-w-0">
                      <span className="line-clamp-1">{i.name}</span>
                      <span className="text-ash font-mono text-xs">× {i.qty}</span>
                    </span>
                    <span className="font-mono shrink-0">{money(i.price * i.qty)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between font-mono text-sm py-3 mt-2 border-t border-line">
                <span className="text-ash">Subtotal (inc. GST)</span>
                <span>{money(subtotal)}</span>
              </div>
              <p className="mt-3 text-xs text-ash leading-relaxed">
                This is a quote request, not a payment. Freight and final pricing are
                confirmed by our team.
              </p>
            </aside>
          </div>
        )}
      </section>
    </>
  );
}
