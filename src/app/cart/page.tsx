"use client";

import Image from "next/image";
import Link from "next/link";
import { useCart } from "@/components/cart/CartProvider";

const aud = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
const money = (n: number) => (n > 0 ? aud.format(n) : "Contact for pricing");

export default function CartPage() {
  const { items, subtotal, setQty, remove, ready } = useCart();

  return (
    <>
      <div className="bg-carbon text-white pt-32 pb-12">
        <div className="container-mk">
          <p className="font-mono text-xs tracking-widest text-accent uppercase mb-3">Your Cart</p>
          <h1 className="text-4xl lg:text-5xl font-bold">Cart</h1>
        </div>
      </div>

      <section className="container-mk py-16">
        {!ready ? null : items.length === 0 ? (
          <div className="text-center max-w-md mx-auto py-10">
            <p className="text-ash text-lg">Your cart is empty.</p>
            <Link href="/all-equipment" className="btn btn-accent mt-8">
              Browse Equipment <span aria-hidden>→</span>
            </Link>
          </div>
        ) : (
          <div className="grid lg:grid-cols-[1.6fr_1fr] gap-12">
            {/* Line items */}
            <ul className="divide-y divide-line border-y border-line">
              {items.map((item) => (
                <li key={item.id} className="flex gap-4 py-6">
                  <div className="relative h-24 w-24 shrink-0 bg-smoke border border-line">
                    {item.image && (
                      <Image src={item.image} alt={item.name} fill className="object-contain p-2" sizes="96px" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/product/${item.slug}`}
                      className="font-semibold leading-snug hover:text-accent-600 transition-colors line-clamp-2"
                    >
                      {item.name}
                    </Link>
                    <p className="mt-1 font-mono text-sm text-ash">{money(item.price)} each</p>

                    <div className="mt-3 flex items-center gap-4">
                      <div className="flex items-center border border-line font-mono text-sm">
                        <button
                          aria-label="Decrease quantity"
                          onClick={() => setQty(item.id, item.qty - 1)}
                          className="w-9 h-9 grid place-items-center hover:text-accent transition-colors"
                        >
                          −
                        </button>
                        <span className="w-8 text-center">{item.qty}</span>
                        <button
                          aria-label="Increase quantity"
                          onClick={() => setQty(item.id, item.qty + 1)}
                          className="w-9 h-9 grid place-items-center hover:text-accent transition-colors"
                        >
                          +
                        </button>
                      </div>
                      <button
                        onClick={() => remove(item.id)}
                        className="text-xs font-mono uppercase tracking-widest text-ash hover:text-accent transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className="text-right font-mono shrink-0">
                    {money(item.price * item.qty)}
                  </div>
                </li>
              ))}
            </ul>

            {/* Summary */}
            <aside className="lg:sticky lg:top-28 h-fit border border-line p-6">
              <h2 className="font-display uppercase tracking-wide text-lg mb-5">Order Summary</h2>
              <div className="flex justify-between font-mono text-sm py-2 border-b border-line">
                <span className="text-ash">Subtotal (inc. GST)</span>
                <span>{money(subtotal)}</span>
              </div>
              <p className="mt-4 text-xs text-ash leading-relaxed">
                Freight and lead times are confirmed on quote. Items shown as &ldquo;Contact
                for pricing&rdquo; are quoted on request. Prices are indicative RRP inc. GST.
              </p>
              <Link href="/checkout" className="btn btn-accent w-full mt-6">
                Request a Quote <span aria-hidden>→</span>
              </Link>
              <Link
                href="/all-equipment"
                className="block text-center mt-4 text-xs font-mono uppercase tracking-widest text-ash hover:text-ink transition-colors"
              >
                Continue Shopping
              </Link>
            </aside>
          </div>
        )}
      </section>
    </>
  );
}
