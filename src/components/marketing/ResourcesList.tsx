"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type Manual = { label: string; download: string | null; external?: boolean };
export type ResourceProduct = { name: string; sub: string; thumb: string | null; manuals: Manual[] };

export default function ResourcesList({ products }: { products: ResourceProduct[] }) {
  const [open, setOpen] = useState<ResourceProduct | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const Row = ({ p }: { p: ResourceProduct }) => (
    <>
      <span className="relative w-20 h-20 shrink-0 bg-[#e6e6e6] border border-line overflow-hidden">
        {p.thumb && <Image src={p.thumb} alt={p.name} fill className="object-contain p-2" sizes="80px" />}
      </span>
      <span className="flex-1 min-w-0 text-left">
        <span className="block font-semibold leading-snug group-hover:text-accent-600 transition-colors">
          {p.name}
        </span>
        {p.sub && (
          <span className="block font-mono text-[11px] uppercase tracking-widest text-ash mt-1">{p.sub}</span>
        )}
      </span>
      <span className="shrink-0 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-ink group-hover:text-accent-600 transition-colors">
        Download <span aria-hidden>→</span>
      </span>
    </>
  );

  return (
    <>
      <div className="grid md:grid-cols-2 gap-x-12">
        {products.map((p) =>
          p.manuals.length === 1 ? (
            <a
              key={p.name}
              href={p.manuals[0].download ?? "/contact"}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-5 py-5 border-b border-line"
            >
              <Row p={p} />
            </a>
          ) : (
            <button
              key={p.name}
              type="button"
              onClick={() => setOpen(p)}
              className="group flex items-center gap-5 py-5 border-b border-line w-full"
            >
              <Row p={p} />
            </button>
          )
        )}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[90] bg-black/60 flex items-center justify-center p-4"
          onClick={() => setOpen(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`${open.name} manuals`}
        >
          <div
            className="relative bg-white w-full max-w-2xl p-8 sm:p-12 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setOpen(null)}
              aria-label="Close"
              className="absolute top-4 right-4 h-9 w-9 grid place-items-center bg-smoke hover:bg-line text-ink text-xl leading-none"
            >
              ✕
            </button>
            <div className="text-center">
              <MkMark />
              <h2 className="mt-6 text-3xl font-bold">{open.name}</h2>
              <p className="mt-2 text-ash">Product Manuals &amp; Assembly Guides</p>
            </div>
            <ul className="mt-10 divide-y divide-line border-t border-line">
              {open.manuals.map((m) => (
                <li key={m.label} className="flex items-center justify-between gap-4 py-4">
                  <span className="font-medium">
                    {open.name} {m.label}
                  </span>
                  <a
                    href={m.download ?? "/contact"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs uppercase tracking-widest underline decoration-accent-600 underline-offset-4 hover:text-accent-600 transition-colors shrink-0"
                  >
                    Download
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

function MkMark() {
  return (
    <svg width="64" height="64" viewBox="0 0 51 51" className="mx-auto text-ink" fill="currentColor" aria-hidden>
      <circle cx="25.5" cy="25.5" r="25.5" fill="currentColor" />
      <text x="25.5" y="33" textAnchor="middle" fontSize="22" fontWeight="700" fill="#fff" fontFamily="sans-serif">
        M
      </text>
    </svg>
  );
}
