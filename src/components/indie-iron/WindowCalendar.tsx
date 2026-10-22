"use client";

import { formatClose, formatLanding } from "@/lib/indie-iron";
import { useWindows } from "./useWindows";

/** The next four buy windows, the first marked open. */
export default function WindowCalendar() {
  const { windows } = useWindows(4);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {(windows ?? Array.from({ length: 4 }, () => null)).map((w, i) => (
        <article
          key={w?.id ?? i}
          className={`grid content-start gap-3 rounded-md bg-white p-5 ${
            i === 0 ? "border-2 border-[var(--ii-cobalt)]" : "border border-line"
          }`}
        >
          <span
            className={`justify-self-start rounded-sm px-2 py-1 font-mono text-[0.68rem] font-bold uppercase tracking-[0.1em] ${
              i === 0 ? "bg-[var(--ii-cobalt)] text-white" : "bg-[var(--ii-zinc)] text-[var(--ii-graphite)]"
            }`}
          >
            {i === 0 ? "Open now" : "Upcoming"}
          </span>
          <h3 className="ii-display text-[1.9rem] leading-none text-[var(--ii-graphite)]">
            {w?.name ?? " "}
          </h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
            <dt className="pt-0.5 font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ash">Closes</dt>
            <dd className="font-semibold tabular-nums">{w ? formatClose(w) : "…"}</dd>
            <dt className="pt-0.5 font-mono text-[0.68rem] uppercase tracking-[0.08em] text-ash">Lands</dt>
            <dd className="font-semibold tabular-nums">{w ? formatLanding(w) : "…"}</dd>
          </dl>
        </article>
      ))}
    </div>
  );
}
