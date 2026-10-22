"use client";

import { useMemo, useSyncExternalStore } from "react";
import { upcomingWindows, type BuyWindow } from "@/lib/indie-iron";

// The current minute, as an external store. Snapshots are rounded to the minute
// so they stay stable between React's reads, and the server snapshot is null.
const MINUTE = 60_000;
const subscribe = (tick: () => void) => {
  const t = setInterval(tick, 10_000);
  return () => clearInterval(t);
};
const getMinute = () => Math.floor(Date.now() / MINUTE) * MINUTE;
const getServerMinute = () => null;

/**
 * The open buy windows, computed in the browser.
 *
 * The page is static, so anything computed at build time would freeze the
 * calendar on the day of the deploy. This returns null on the server and while
 * hydrating (so the markup matches), then the real list, and re-checks as the
 * clock moves so a page left open rolls past a close on its own.
 */
export function useWindows(count = 4): { windows: BuyWindow[] | null; now: number } {
  const now = useSyncExternalStore(subscribe, getMinute, getServerMinute);
  const windows = useMemo(() => (now === null ? null : upcomingWindows(new Date(now), count)), [now, count]);
  return { windows, now: now ?? 0 };
}
