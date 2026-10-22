"use client";

import { formatClose, formatLandingShort } from "@/lib/indie-iron";
import { useWindows } from "./useWindows";

const DAY = 86_400_000;

/** Hero countdown to the next window close. Colours follow --clock-* when the parent sets them. */
export default function WindowClock() {
  const { windows, now } = useWindows(1);
  const next = windows?.[0];
  const left = next ? Math.max(0, next.closesAt.getTime() - now) : 0;
  const days = Math.floor(left / DAY);
  const hours = Math.floor((left % DAY) / 3_600_000);

  return (
    <div aria-live="polite" className="text-center">
      <p className="font-mono text-[0.72rem] font-bold uppercase tracking-[0.16em] text-[var(--clock-accent,var(--ii-cobalt))]">
        {next ? `${next.name} closes in` : "Next window closes in"}
      </p>
      <p className="ii-display mt-2 text-[4.5rem] leading-[0.9] tabular-nums text-[var(--clock-ink,var(--ii-graphite))]">
        {/* A fixed-width placeholder until the browser has the date, so nothing shifts. */}
        {next ? days : "--"}
        <span className="ml-2 text-[1.4rem] tracking-[0.06em]">{days === 1 ? "DAY" : "DAYS"}</span>
      </p>
      {next && days < 3 && (
        <p className="mt-1 font-mono text-sm text-[var(--clock-ink,var(--ii-graphite))]">and {hours} hours</p>
      )}
      <p className="mt-3 font-mono text-[0.8rem] leading-relaxed text-[var(--clock-muted,var(--color-ash))]">
        Closes <b className="text-[var(--clock-ink,var(--ii-graphite))]">{next ? formatClose(next) : "…"}</b>
        <br />
        On your floor <b className="text-[var(--clock-ink,var(--ii-graphite))]">{next ? formatLandingShort(next) : "…"}</b>
      </p>
    </div>
  );
}
