"use client";

import { useEffect, useRef, useState } from "react";

// Animates a numeric stat counting up the first time it scrolls into view.
// Values with a leading number animate (e.g. "229", "72hr" -> counts to 72 then
// keeps "hr"); non-numeric values (e.g. "Complete") render as-is.
export default function CountUp({ value, className }: { value: string; className?: string }) {
  const m = value.match(/^(\d[\d,]*)(.*)$/);
  const target = m ? parseInt(m[1].replace(/,/g, ""), 10) : null;
  const suffix = m ? m[2] : "";
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);
  const [display, setDisplay] = useState<string>(target === null ? value : `0${suffix}`);

  useEffect(() => {
    // Nothing to animate. The render below shows `value` directly in this case,
    // so there is no state to set here.
    if (target === null) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || started.current) return;
        started.current = true;
        io.disconnect();
        // Reduced motion still shows the number, it just arrives at once. Decided
        // here rather than up front so the stat appears when it scrolls into
        // view either way.
        if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
          setDisplay(`${target}${suffix}`);
          return;
        }
        const duration = 1300;
        const t0 = performance.now();
        const tick = (now: number) => {
          const p = Math.min(1, (now - t0) / duration);
          const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
          setDisplay(`${Math.round(eased * target)}${suffix}`);
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [target, suffix, value]);

  return (
    <span ref={ref} className={className}>
      {target === null ? value : display}
    </span>
  );
}
