"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import ProductCard from "./ProductCard";
import { type WcProduct } from "@/lib/woocommerce";
import { type EnrichedProduct } from "@/lib/unleashed";

type Item = { product: WcProduct; enriched: EnrichedProduct };
const KEY = "mk_product_view";

function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}
function ListIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

export default function ProductListing({ items, total }: { items: Item[]; total: number }) {
  const [view, setView] = useState<"grid" | "list">("grid");
  useEffect(() => {
    const v = localStorage.getItem(KEY);
    if (v === "list" || v === "grid") setView(v);
  }, []);
  const choose = (v: "grid" | "list") => {
    setView(v);
    localStorage.setItem(KEY, v);
  };

  const btn = (active: boolean) =>
    `p-2 border transition-colors ${active ? "border-accent text-accent-600" : "border-line text-ash hover:border-ash"}`;

  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <p className="font-mono text-xs tracking-widest text-ash uppercase">
          {total} product{total === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => choose("grid")} className={btn(view === "grid")}>
            <GridIcon />
          </button>
          <button type="button" aria-label="List view" aria-pressed={view === "list"} onClick={() => choose("list")} className={btn(view === "list")}>
            <ListIcon />
          </button>
        </div>
      </div>

      {view === "grid" ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-10">
          {items.map(({ product, enriched }) => (
            <ProductCard key={product.id} product={product} enriched={enriched} />
          ))}
        </div>
      ) : (
        <ul className="border-t border-line">
          {items.map(({ product, enriched }) => (
            <li key={product.id} className="border-b border-line">
              <Link href={`/product/${product.slug}`} className="flex items-center gap-4 sm:gap-6 py-4 group">
                <div className="relative w-20 h-20 shrink-0 bg-smoke border border-line">
                  {product.images?.[0] ? (
                    <Image src={product.images[0].src} alt={product.images[0].alt || product.name} fill className="object-contain p-1.5" sizes="80px" />
                  ) : (
                    <div className="absolute inset-0 grid place-items-center text-ash text-[10px]">No image</div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold leading-snug group-hover:text-accent-600 transition-colors line-clamp-2">
                    {product.name}
                  </h3>
                  {product.sku && (
                    <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-ash">{product.sku}</p>
                  )}
                </div>
                <div className="shrink-0 text-right font-mono text-sm">
                  {enriched.compareAtLabel && (
                    <span className="block text-ash line-through text-xs">{enriched.compareAtLabel}</span>
                  )}
                  <span className="text-ink">{enriched.priceLabel}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
