"use client";

import Link from "next/link";
import { useState } from "react";
import { useCart, type CartItem } from "@/components/cart/CartProvider";
import { trackAddToCart } from "@/lib/analytics";

export default function AddToCartButton({ product }: { product: Omit<CartItem, "qty"> }) {
  const { add } = useCart();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4">
        {/* Quantity stepper */}
        <div className="flex items-center border border-line font-mono">
          <button
            type="button"
            aria-label="Decrease quantity"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            className="w-11 h-12 grid place-items-center hover:text-accent transition-colors"
          >
            −
          </button>
          <span className="w-10 text-center">{qty}</span>
          <button
            type="button"
            aria-label="Increase quantity"
            onClick={() => setQty((q) => q + 1)}
            className="w-11 h-12 grid place-items-center hover:text-accent transition-colors"
          >
            +
          </button>
        </div>

        <button
          type="button"
          className="btn btn-accent"
          onClick={() => {
            add(product, qty);
            trackAddToCart({ id: product.id, name: product.name, price: product.price }, qty);
            setAdded(true);
            setQty(1);
            setTimeout(() => setAdded(false), 2500);
          }}
        >
          Add to Cart <span aria-hidden>→</span>
        </button>

        <Link href="/contact" className="btn btn-out !text-ink">
          Enquire
        </Link>
      </div>

      {added && (
        <p className="mt-3 text-sm text-accent-600 font-mono">
          Added to cart ·{" "}
          <Link href="/cart" className="underline underline-offset-2">
            View cart
          </Link>
        </p>
      )}
    </div>
  );
}
