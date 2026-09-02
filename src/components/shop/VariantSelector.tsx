"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { useVariantSelection } from "@/components/shop/VariantSelection";
import { trackAddToCart } from "@/lib/analytics";

export type Variant = {
  id: number; // cart key: the WooCommerce variation id, or a negative code hash
  code: string; // Unleashed ProductCode — what the warehouse picks
  label: string;
  priceLabel: string;
  priceValue: number;
  inStock: boolean;
  stockQty?: number;
  image?: string;
  wooProductId?: number;
  wooVariationId?: number;
};

export default function VariantSelector({
  productName,
  productSlug,
  variants,
}: {
  /** The range's own ERP name, e.g. "Rubber Hex Dumbbell". */
  productName: string;
  productSlug: string;
  variants: Variant[];
}) {
  const { add } = useCart();
  const selection = useVariantSelection();
  const [selectedId, setSelectedId] = useState(
    (variants.find((v) => v.inStock) ?? variants[0])?.id
  );
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  // A thumbnail click moves the SELECTION, not just the picture. Every
  // thumbnail on a range page is a size and is now captioned with it, so
  // clicking "12kg" and being left on 6kg — picture changed, price did not —
  // was the confusing half of the old behaviour.
  //
  // Adjusted during render rather than in an effect: this is derived state
  // catching up with a prop, which is the case React documents for it, and it
  // spares the extra paint on the wrong size an effect would give.
  const request = selection?.request;
  const [lastRequest, setLastRequest] = useState(request?.n ?? 0);
  if (request && request.n !== lastRequest) {
    setLastRequest(request.n);
    const hit = variants.find((v) => v.image === request.src);
    if (hit) setSelectedId(hit.id);
  }

  const selected = variants.find((v) => v.id === selectedId) ?? variants[0];

  // Point the gallery at the selected size's photograph. Ranges carry one per
  // size (26 for the Rubber Hex Dumbbells), so this is the difference between
  // "a dumbbell" and the 9kg the shopper is actually looking at.
  const selectedImage = selected?.image;
  const setImageSrc = selection?.setImageSrc;
  useEffect(() => {
    setImageSrc?.(selectedImage);
  }, [setImageSrc, selectedImage]);

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

      {/* Size picker. A dropdown rather than a row of chips: the ranges run to
          26 options, which as buttons is a wall that pushes the price and the
          add-to-cart below the fold on a phone. */}
      <div className="mt-6">
        <label
          htmlFor="variant-select"
          className="block font-mono text-xs uppercase tracking-widest text-ash mb-2"
        >
          Size
        </label>
        <div className="relative max-w-xs">
          <select
            id="variant-select"
            value={selectedId}
            onChange={(e) => setSelectedId(Number(e.target.value))}
            className="w-full appearance-none border border-line bg-white text-ink h-12 pl-4 pr-10 font-mono text-sm focus:outline-none focus:border-accent transition-colors cursor-pointer"
          >
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
                {v.priceValue > 0 ? ` — ${v.priceLabel}` : ""}
                {v.inStock ? "" : " (made to order)"}
              </option>
            ))}
          </select>
          <span
            aria-hidden
            className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-ash text-xs"
          >
            ▾
          </span>
        </div>
        <p className="mt-2 font-mono text-xs uppercase tracking-widest text-ash">
          Code: {selected.code}
        </p>
        <p className="mt-1 text-xs text-ash">
          {variants.length} {variants.length === 1 ? "option" : "options"} in this range
        </p>
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
            const name = `${productName} - ${selected.label}`;
            add(
              {
                id: selected.id,
                // Only a size the old store also sold can be re-priced against
                // WooCommerce at card checkout. 0 marks the rest as quote-only,
                // which the checkout gate reads — they still sell, and the ERP
                // code below is what the team fulfils from either way.
                productId: selected.wooProductId ?? 0,
                variationId: selected.wooVariationId,
                sku: selected.code,
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
