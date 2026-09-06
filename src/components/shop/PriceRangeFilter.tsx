"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function PriceRangeFilter({ min, max }: { min?: string; max?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [lo, setLo] = useState(min ?? "");
  const [hi, setHi] = useState(max ?? "");

  function apply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const p = new URLSearchParams(params.toString());
    if (lo) p.set("min", lo);
    else p.delete("min");
    if (hi) p.set("max", hi);
    else p.delete("max");
    p.delete("page");
    router.push(`${pathname}?${p.toString()}`);
  }

  function clear() {
    const p = new URLSearchParams(params.toString());
    p.delete("min");
    p.delete("max");
    p.delete("page");
    setLo("");
    setHi("");
    router.push(`${pathname}${p.toString() ? `?${p.toString()}` : ""}`);
  }

  const active = min || max;

  return (
    <form onSubmit={apply} className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-ash">
      <span>Price</span>
      <input
        type="number"
        min="0"
        inputMode="numeric"
        value={lo}
        onChange={(e) => setLo(e.target.value)}
        placeholder="Min"
        className="w-20 border border-line py-2 px-2 text-ink focus:outline-none focus:border-accent"
        aria-label="Minimum price"
      />
      <span>–</span>
      <input
        type="number"
        min="0"
        inputMode="numeric"
        value={hi}
        onChange={(e) => setHi(e.target.value)}
        placeholder="Max"
        className="w-20 border border-line py-2 px-2 text-ink focus:outline-none focus:border-accent"
        aria-label="Maximum price"
      />
      <button type="submit" className="border border-ink px-3 py-2 text-ink hover:bg-ink hover:text-white transition-colors">
        Go
      </button>
      {active && (
        <button type="button" onClick={clear} className="text-ash hover:text-accent transition-colors">
          Clear
        </button>
      )}
    </form>
  );
}
