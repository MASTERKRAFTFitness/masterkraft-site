"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import BrandSpinner from "@/components/ui/BrandSpinner";

// Signals "the site is thinking" during page navigations: a `progress` cursor
// immediately, and the spinning MasterKraft wheel if the navigation takes long
// enough to be worth showing (a short delay avoids flashing it on instant,
// cached navigations). Everything clears once the new route settles.
export default function NavProgress() {
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const showTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const stop = () => {
    clearTimeout(showTimer.current);
    clearTimeout(safetyTimer.current);
    setBusy(false);
    document.documentElement.classList.remove("nav-busy");
  };

  // Route settled -> stop. Clearing the overlay IS the effect: the new pathname
  // arriving is the only signal that the navigation finished, and stop() also
  // clears two timers and a class on <html>. Nothing about it is derivable
  // during render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    stop();
  }, [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || !href.startsWith("/") || href.startsWith("#") || href === pathname) return;
      if (a.getAttribute("target") === "_blank") return;
      document.documentElement.classList.add("nav-busy");
      clearTimeout(showTimer.current);
      clearTimeout(safetyTimer.current);
      showTimer.current = setTimeout(() => setBusy(true), 140);
      safetyTimer.current = setTimeout(stop, 8000);
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      clearTimeout(showTimer.current);
      clearTimeout(safetyTimer.current);
    };
  }, [pathname]);

  if (!busy) return null;
  return (
    <div
      className="fixed inset-0 z-[200] grid place-items-center pointer-events-none"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="rounded-2xl bg-carbon/85 backdrop-blur-sm px-6 py-5 shadow-xl">
        <BrandSpinner size={44} />
      </div>
    </div>
  );
}
