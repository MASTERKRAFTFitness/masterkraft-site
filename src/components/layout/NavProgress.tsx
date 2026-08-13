"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// Signals "the site is thinking" during page navigations by switching the
// cursor to `progress` from the moment an internal link is clicked until the new
// route settles (pathname change). A safety timeout clears it if a click never
// results in navigation.
export default function NavProgress() {
  const pathname = usePathname();

  // Route settled -> stop showing the busy cursor.
  useEffect(() => {
    document.documentElement.classList.remove("nav-busy");
  }, [pathname]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || !href.startsWith("/") || a.getAttribute("target") === "_blank") return;
      if (href === pathname || href.startsWith("#")) return;
      document.documentElement.classList.add("nav-busy");
      clearTimeout(timer);
      timer = setTimeout(() => document.documentElement.classList.remove("nav-busy"), 5000);
    };
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      clearTimeout(timer);
    };
  }, [pathname]);

  return null;
}
