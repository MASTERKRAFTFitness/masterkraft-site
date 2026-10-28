"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { useVariantSelection } from "@/components/shop/VariantSelection";
import { trackAddToCart } from "@/lib/analytics";
import { stockLabel } from "@/lib/stock-label";
import { variantLine } from "@/lib/variant-line";

export type Variant = {
  id: number; // cart key: the WooCommerce variation id, or a negative code hash
  code: string; // Unleashed ProductCode — what the warehouse picks
  label: string;
  priceLabel: string;
  priceValue: number;
  inStock: boolean;
  stockQty?: number; // Melbourne
  stockChina?: number;
  image?: string;
  wooProductId?: number;
  wooVariationId?: number;
};

// The query string never changes under this component except by its own
// replaceState, so there is nothing to subscribe to.
const noSubscribe = () => () => {};

/**
 * The ERP code in `?size=`, upper-cased, or undefined. "" on the server: the
 * page is ISR-cached, so the server render cannot depend on the query, and
 * useSyncExternalStore swaps in the real value after hydration without a
 * mismatch.
 */
function useSizeParam(): string | undefined {
  const search = useSyncExternalStore(noSubscribe, () => window.location.search, () => "");
  return new URLSearchParams(search).get("size")?.toUpperCase() || undefined;
}

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
  // ?size=<ERP code> picks that size on arrival. It is the link Google
  // Shopping gives each size (lib/site.ts productUrl), so a click on the 4kg
  // lands on the 4kg rather than whatever the range opens on. Otherwise the
  // first size in stock. A shopper's own choice, once made, wins over both.
  const sizeParam = useSizeParam();
  const [chosenId, setSelectedId] = useState<number | undefined>(undefined);
  const selectedId =
    chosenId ??
    (variants.find((v) => v.code.toUpperCase() === sizeParam) ??
      variants.find((v) => v.inStock) ??
      variants[0])?.id;
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  // A click in the strip or the table moves the SELECTION, not just the
  // picture. Every thumbnail on a range page is a size and is captioned with
  // it, so clicking "12kg" and being left on 6kg — picture changed, price did
  // not — was the confusing half of the old gallery.
  //
  // Adjusted during render rather than in an effect: this is derived state
  // catching up with a prop, which is the case React documents for it, and it
  // spares the extra paint on the wrong size an effect would give.
  const request = selection?.request;
  const [lastRequest, setLastRequest] = useState(request?.n ?? 0);
  if (request && request.n !== lastRequest) {
    setLastRequest(request.n);
    const hit = variants.find((v) => v.code === request.code);
    if (hit) setSelectedId(hit.id);
  }

  const selected = variants.find((v) => v.id === selectedId) ?? variants[0];

  // Publish the selection: the gallery shows the right photograph — ranges
  // carry one per size, 26 for the Rubber Hex Dumbbells, so this is the
  // difference between "a dumbbell" and the 9kg the shopper is looking at —
  // and the size table highlights the right row.
  const selectedCode = selected?.code;
  const selectedImage = selected?.image;
  const setSelected = selection?.setSelected;
  useEffect(() => {
    setSelected?.(selectedCode, selectedImage);
  }, [setSelected, selectedCode, selectedImage]);

  // A size the shopper picks goes into the address, so a copied link opens on
  // it. Only once they have picked: arriving on the default leaves the URL bare.
  const chosen = chosenId !== undefined;
  useEffect(() => {
    if (!chosen || !selectedCode) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("size") === selectedCode) return;
    url.searchParams.set("size", selectedCode);
    window.history.replaceState(window.history.state, "", url);
  }, [chosen, selectedCode]);

  if (!selected) return null;

  return (
    <div>
      {/* Price + stock for the selected variant */}
      <div className="flex items-baseline gap-3 font-mono text-2xl">
        <span className="text-ink">{selected.priceLabel}</span>
      </div>
      <p className="mt-2 text-xs font-mono uppercase tracking-widest text-ash">
        {stockLabel(selected.stockQty, selected.stockChina, selected.inStock).text}{" "}
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
                {stockLabel(v.stockQty, v.stockChina, v.inStock).optionSuffix}
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
            // Built by lib/variant-line, which the size table's ADD also uses,
            // so the two paths cannot put the same size in the cart twice under
            // two different keys.
            const line = variantLine(productName, productSlug, selected);
            add(line, qty);
            trackAddToCart({ id: line.id, name: line.name, price: line.price }, qty);
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
