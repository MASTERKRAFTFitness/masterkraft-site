"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";
import { useCart } from "@/components/cart/CartProvider";

const aud = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
const money = (n: number) => (n > 0 ? aud.format(n) : "Contact for pricing");

export default function CartDrawer() {
  const { items, subtotal, count, setQty, remove, drawerOpen, closeDrawer } = useCart();

  // Close on Escape; lock body scroll while open.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeDrawer();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [drawerOpen, closeDrawer]);

  return (
    <>
      <div
        className={`fixed inset-0 z-[70] bg-black/50 transition-opacity duration-300 ${
          drawerOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={closeDrawer}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-label="Shopping cart"
        aria-hidden={!drawerOpen}
        className={`fixed top-0 right-0 z-[80] h-full w-full max-w-md bg-white text-ink flex flex-col shadow-2xl transition-transform duration-300 ${
          drawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 h-16 border-b border-line shrink-0">
          <h2 className="font-display uppercase tracking-wide text-lg">
            Cart {count > 0 && <span className="text-ash">({count})</span>}
          </h2>
          <button onClick={closeDrawer} aria-label="Close cart" className="p-2 text-ash hover:text-ink">
            ✕
          </button>
        </div>

        {items.length === 0 ? (
          <div className="flex-1 grid place-items-center text-center px-6">
            <div>
              <p className="text-ash">Your cart is empty.</p>
              <Link href="/all-equipment" onClick={closeDrawer} className="btn btn-accent mt-6">
                Browse Equipment
              </Link>
            </div>
          </div>
        ) : (
          <>
            <ul className="flex-1 overflow-y-auto divide-y divide-line px-5">
              {items.map((item) => (
                <li key={item.id} className="flex gap-3 py-4">
                  <div className="relative h-20 w-20 shrink-0 bg-smoke border border-line">
                    {item.image && (
                      <Image src={item.image} alt={item.name} fill className="object-contain p-1.5" sizes="80px" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/product/${item.slug}`}
                      onClick={closeDrawer}
                      className="text-sm font-semibold leading-snug hover:text-accent-600 line-clamp-2"
                    >
                      {item.name}
                    </Link>
                    <p className="mt-1 font-mono text-xs text-ash">{money(item.price)}</p>
                    <div className="mt-2 flex items-center gap-3">
                      <div className="flex items-center border border-line font-mono text-sm">
                        <button aria-label="Decrease quantity" onClick={() => setQty(item.id, item.qty - 1)} className="w-8 h-8 grid place-items-center hover:text-accent">
                          −
                        </button>
                        <span className="w-7 text-center">{item.qty}</span>
                        <button aria-label="Increase quantity" onClick={() => setQty(item.id, item.qty + 1)} className="w-8 h-8 grid place-items-center hover:text-accent">
                          +
                        </button>
                      </div>
                      <button onClick={() => remove(item.id)} className="text-[11px] font-mono uppercase tracking-widest text-ash hover:text-accent">
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className="font-mono text-sm shrink-0">{money(item.price * item.qty)}</div>
                </li>
              ))}
            </ul>

            <div className="border-t border-line p-5 shrink-0 space-y-3">
              <div className="flex justify-between font-mono text-sm">
                <span className="text-ash">Subtotal (inc. GST)</span>
                <span className="font-semibold">{money(subtotal)}</span>
              </div>
              <Link href="/checkout" onClick={closeDrawer} className="btn btn-accent w-full">
                Checkout <span aria-hidden>→</span>
              </Link>
              <Link
                href="/cart"
                onClick={closeDrawer}
                className="block text-center text-xs font-mono uppercase tracking-widest text-ash hover:text-ink"
              >
                View Full Cart
              </Link>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
