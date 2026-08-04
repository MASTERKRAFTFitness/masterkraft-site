"use client";

import Link from "next/link";
import { useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { trackAddToCart } from "@/lib/analytics";

export type Variant = {
  id: number;
  label: string;
  priceLabel: string;
  priceValue: number;
  inStock: boolean;
  stockQty?: number;
  image?: string;
};

export default function VariantSelector({
  productId,
  productName,
  productSlug,
  variants,
}: {
  productId: number;
  productName: string;
  productSlug: string;
  variants: Variant[];
}) {
  const { add } = useCart();
  const [selectedId, setSelectedId] = useState(
    (variants.find((v) => v.inStock) ?? variants[0])?.id
  );
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const selected = variants.find((v) => v.id === selectedId) ?? variants[0];
  if (!selected) return null;

  return (
    <div>
      {/* Price + stock for the selected variant */}
      <div className="flex items-baseline gap-3 font-mono text-2xl">
        <span className="text-ink">{selected.priceLabel}</span>
      </div>
      <p className="mt-2 text-xs font-mono uppercase tracking-widest text-ash">
        {selected.inStock
          ? selected.stockQty && selected.stockQty > 0
            ? `${selected.stockQty} in stock`
            : "In stock"
          : "Made to order"}{" "}
        · Prices inc. GST
      </p>

      {/* Variant options */}
      <div className="mt-6">
        <p className="font-mono text-xs uppercase tracking-widest text-ash mb-2">Options</p>
        <div className="flex flex-wrap gap-2">
          {variants.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setSelectedId(v.id)}
              className={`px-3 py-2 text-sm border transition-colors ${
                v.id === selectedId
                  ? "border-accent text-accent-600"
                  : "border-line text-ink hover:border-ash"
              } ${!v.inStock ? "opacity-60" : ""}`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Qty + add */}
      <div className="mt-8 flex flex-wrap items-center gap-4">
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
            const name = `${productName} — ${selected.label}`;
            add(
              {
                id: selected.id,
                productId,
                variationId: selected.id,
                slug: productSlug,
                name,
                image: selected.image,
                price: selected.priceValue,
              },
              qty
            );
            trackAddToCart({ id: selected.id, name, price: selected.priceValue }, qty);
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
