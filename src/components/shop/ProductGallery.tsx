"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useVariantSelection } from "@/components/shop/VariantSelection";
import type { WcImage } from "@/lib/woocommerce";

export default function ProductGallery({ images, name }: { images: WcImage[]; name: string }) {
  const [zoom, setZoom] = useState(false);

  // On a range page the gallery holds every size's photograph and the picker
  // says which one is being looked at, so the shown image is DERIVED from the
  // selection rather than owned here. A thumbnail click overrides it, and the
  // override is cleared the moment the shopper picks a different size — the
  // React "adjust state during render" pattern, not an effect.
  const selectedSrc = useVariantSelection()?.imageSrc;
  const [override, setOverride] = useState<number | null>(null);
  const [lastSelected, setLastSelected] = useState(selectedSrc);
  if (selectedSrc !== lastSelected) {
    setLastSelected(selectedSrc);
    setOverride(null);
  }
  const fromSelection = selectedSrc ? images.findIndex((img) => img.src === selectedSrc) : -1;
  const active = override ?? (fromSelection >= 0 ? fromSelection : 0);
  const main = images[active] ?? images[0];

  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setZoom(false);
      if (e.key === "ArrowRight") setOverride((active + 1) % images.length);
      if (e.key === "ArrowLeft") setOverride((active - 1 + images.length) % images.length);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [zoom, images.length, active]);

  return (
    <div>
      <button
        type="button"
        onClick={() => main && setZoom(true)}
        aria-label="Zoom image"
        className="relative block w-full aspect-square bg-[#e6e6e6] border border-line overflow-hidden cursor-zoom-in group"
      >
        {main ? (
          <Image
            src={main.src}
            alt={main.alt || name}
            fill
            className="object-contain p-6 transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 1024px) 100vw, 50vw"
            priority
          />
        ) : (
          <span className="absolute inset-0 grid place-items-center text-ash">No image</span>
        )}
      </button>

      {/* A range runs to 26 photographs, so the strip scrolls rather than
          truncating at 10 and hiding two thirds of the rack. */}
      {images.length > 1 && (
        <div className="mt-4 grid grid-cols-5 gap-3 max-h-64 overflow-y-auto pr-1">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setOverride(i)}
              aria-label={`View image ${i + 1}`}
              className={`relative aspect-square bg-[#e6e6e6] border overflow-hidden transition-colors ${
                i === active ? "border-accent" : "border-line hover:border-ash"
              }`}
            >
              <Image src={img.src} alt="" fill className="object-contain p-2" sizes="15vw" />
            </button>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {zoom && main && (
        <div
          className="fixed inset-0 z-[90] bg-black/90 flex items-center justify-center p-6"
          onClick={() => setZoom(false)}
          role="dialog"
          aria-label="Image viewer"
        >
          <button
            onClick={() => setZoom(false)}
            aria-label="Close"
            className="absolute top-5 right-6 text-white/80 hover:text-white text-3xl leading-none"
          >
            ✕
          </button>
          <div className="relative w-full h-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
            <Image src={main.src} alt={main.alt || name} fill className="object-contain" sizes="90vw" />
          </div>
          {images.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setOverride((active - 1 + images.length) % images.length); }}
                aria-label="Previous image"
                className="absolute left-4 top-1/2 -translate-y-1/2 h-12 w-12 flex items-center justify-center text-white/70 hover:text-white text-3xl"
              >
                ‹
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setOverride((active + 1) % images.length); }}
                aria-label="Next image"
                className="absolute right-4 top-1/2 -translate-y-1/2 h-12 w-12 flex items-center justify-center text-white/70 hover:text-white text-3xl"
              >
                ›
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
