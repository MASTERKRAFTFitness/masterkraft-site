import Image from "next/image";
import Link from "next/link";
import { type WcProduct } from "@/lib/woocommerce";
import { type EnrichedProduct } from "@/lib/unleashed";

export default function ProductCard({
  product,
  enriched,
}: {
  product: WcProduct;
  enriched: EnrichedProduct;
}) {
  const img = product.images?.[0];
  return (
    <Link href={`/product/${product.slug}`} className="group flex flex-col">
      <div className="relative aspect-square overflow-hidden bg-smoke border border-line">
        {img ? (
          <Image
            src={img.src}
            alt={img.alt || product.name}
            fill
            className="object-contain p-4 transition-transform duration-500 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-ash text-xs">No image</div>
        )}
        {enriched.compareAtLabel && (
          <span className="absolute top-3 left-3 bg-accent text-white text-[10px] font-mono uppercase tracking-widest px-2 py-1">
            Sale
          </span>
        )}
        {enriched.inStock && (
          <span className="absolute top-3 right-3 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-ink/70">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> In stock
          </span>
        )}
      </div>
      <h3 className="mt-4 text-sm font-semibold leading-snug group-hover:text-accent-600 transition-colors line-clamp-2">
        {product.name}
      </h3>
      {product.sku && (
        <p className="mt-1 font-mono text-[11px] uppercase tracking-widest text-ash">{product.sku}</p>
      )}
      <div className="mt-1.5 flex items-baseline gap-2 font-mono text-sm">
        {enriched.compareAtLabel && (
          <span className="text-ash line-through">{enriched.compareAtLabel}</span>
        )}
        <span className="text-ink">{enriched.priceLabel}</span>
      </div>
    </Link>
  );
}
