"use client";

import { useState } from "react";
import type { ContentSection } from "./ContentPage";

// Collapsible version of a content page's sections. Each heading is a
// concertina row that expands/collapses its body. First row open by default.
export default function AccordionSections({ sections }: { sections: ContentSection[] }) {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="divide-y divide-line border-t border-line">
      {sections.map((s, i) => {
        const isOpen = open === i;
        return (
          <div key={i}>
            <h2>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                className="w-full flex items-center justify-between gap-4 py-5 text-left group"
              >
                <span className="text-lg font-bold group-hover:text-accent-600 transition-colors">
                  {s.heading}
                </span>
                <span
                  aria-hidden
                  className={`shrink-0 text-2xl leading-none text-ash transition-transform duration-200 ${
                    isOpen ? "rotate-45 text-accent-600" : ""
                  }`}
                >
                  +
                </span>
              </button>
            </h2>
            <div className={`grid transition-all duration-200 ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
              <div className="overflow-hidden">
                <div className="pb-6 space-y-4">
                  {s.body.map((p, j) => (
                    <p key={j} className="text-ash leading-relaxed">
                      {p}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
