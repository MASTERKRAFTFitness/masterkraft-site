"use client";

// EVERY SIZE AT ONCE, priced and addable — the same table the franchisee
// catalogue shows, on the storefront.
//
// The dropdown is still the buy control for someone who wants one dumbbell. It
// is the wrong shape for the other job these pages do: a gym fitting out a rack
// is comparing 26 weights and buying eight of them, and a dropdown makes that
// 26 openings and no way to see two prices side by side.
//
// PRICES ARE INC-GST HERE, unlike the franchisee catalogue's ex-GST column. The
// storefront quotes inc-GST everywhere — the picker, the cards, the cart — and a
// page that mixed the two conventions would be read wrong by someone comparing
// a row against the price above it.
import { useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { useVariantSelection } from "@/components/shop/VariantSelection";
import type { Variant } from "@/components/shop/VariantSelector";
import { trackAddToCart } from "@/lib/analytics";
import { variantLine } from "@/lib/variant-line";

export default function SizeTable({
  productName,
  productSlug,
  variants,
}: {
  productName: string;
  productSlug: string;
  variants: Variant[];
}) {
  const { add } = useCart();
  const selection = useVariantSelection();
  const [justAdded, setJustAdded] = useState<string | null>(null);

  if (variants.length < 2) return null;

  return (
    <section>
      <h2 className="font-mono text-xs uppercase tracking-widest text-ash">
        Available sizes ({variants.length})
      </h2>

      {/* Scrolls in its own box rather than running the page to 26 rows tall,
          and keeps the header in view while it does. overflow-x as well as -y
          because this now sits in half a grid column, not the full width. */}
      <div className="mt-4 max-h-[30rem] overflow-auto border border-line">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 bg-[#f6f6f6] z-10">
            <tr className="font-mono text-[11px] uppercase tracking-widest text-ash">
              <th scope="col" className="px-3 py-3 font-normal">
                Size
              </th>
              <th scope="col" className="px-3 py-3 font-normal">
                Code
              </th>
              <th scope="col" className="px-3 py-3 font-normal">
                Availability
              </th>
              <th scope="col" className="px-3 py-3 font-normal text-right">
                Price inc GST
              </th>
              <th scope="col" className="px-3 py-3">
                <span className="sr-only">Add to cart</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => {
              const live = selection?.code === v.code;
              return (
                <tr
                  key={v.id}
                  className={`border-t border-line transition-colors ${
                    live ? "bg-accent/5" : "hover:bg-[#fafafa]"
                  }`}
                >
                  {/* The size cell selects, so the table drives the picture and
                      the picker above it rather than sitting apart from them. */}
                  <th scope="row" className="px-3 py-2.5 font-normal">
                    <button
                      type="button"
                      onClick={() => selection?.requestSize(v.code)}
                      aria-current={live ? "true" : undefined}
                      className={`font-mono text-sm hover:text-accent-600 transition-colors ${
                        live ? "text-accent-600" : "text-ink"
                      }`}
                    >
                      {v.label}
                    </button>
                  </th>
                  <td className="px-3 py-2.5 font-mono text-[11px] uppercase tracking-widest text-ash">
                    {v.code}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px] uppercase tracking-widest text-ash">
                    {v.inStock ? (
                      <span className="inline-flex items-center gap-1.5 text-ink/70">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                        {v.stockQty && v.stockQty > 0 ? `${v.stockQty} in stock` : "In stock"}
                      </span>
                    ) : (
                      "Made to order"
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-sm">{v.priceLabel}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        const line = variantLine(productName, productSlug, v);
                        add(line, 1);
                        trackAddToCart({ id: line.id, name: line.name, price: line.price }, 1);
                        setJustAdded(v.code);
                        setTimeout(
                          () => setJustAdded((c) => (c === v.code ? null : c)),
                          2000
                        );
                      }}
                      className="border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide hover:border-accent hover:text-accent-600 transition-colors"
                    >
                      {justAdded === v.code ? "Added" : "Add"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
