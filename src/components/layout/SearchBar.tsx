"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";

type Suggestion = { slug: string; name: string; image: string | null };

export default function SearchBar({ solid }: { solid: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else {
      setQuery("");
      setSuggestions([]);
    }
  }, [open]);

  // Debounced typeahead
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search-suggest?q=${encodeURIComponent(query.trim())}`);
        const data = await res.json();
        setSuggestions(data.results ?? []);
      } catch {
        setSuggestions([]);
      }
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query]);

  function goToResults(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = query.trim();
    if (q) {
      track("search", { search_term: q });
      router.push(`/search?q=${encodeURIComponent(q)}`);
      setOpen(false);
    }
  }

  function pick(slug: string) {
    router.push(`/product/${slug}`);
    setOpen(false);
  }

  return (
    <>
      <button
        aria-label="Search"
        onClick={() => setOpen((v) => !v)}
        className={`transition-colors ${solid ? "text-ash hover:text-ink" : "text-white/80 hover:text-white"}`}
      >
        <SearchIcon />
      </button>

      {open && (
        <div className="absolute inset-x-0 top-full bg-white text-ink border-t border-line shadow-lg">
          <form onSubmit={goToResults} className="container-mk py-4 flex items-center gap-3">
            <SearchIcon />
            <input
              ref={inputRef}
              type="search"
              aria-label="Search equipment"
              placeholder="Search equipment…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 py-2 text-base focus:outline-none placeholder:text-ash/70"
              onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
            />
            <button type="submit" className="btn btn-accent">
              Search
            </button>
            <button type="button" aria-label="Close search" onClick={() => setOpen(false)} className="text-ash hover:text-ink px-2">
              ✕
            </button>
          </form>

          {suggestions.length > 0 && (
            <ul className="container-mk pb-4 -mt-1 divide-y divide-line/70">
              {suggestions.map((s) => (
                <li key={s.slug}>
                  <button
                    onClick={() => pick(s.slug)}
                    className="w-full flex items-center gap-3 py-2.5 text-left hover:text-accent-600 transition-colors"
                  >
                    <span className="relative h-10 w-10 shrink-0 bg-smoke border border-line">
                      {s.image && <Image src={s.image} alt="" fill className="object-contain p-1" sizes="40px" />}
                    </span>
                    <span className="text-sm line-clamp-1">{s.name}</span>
                  </button>
                </li>
              ))}
              <li>
                <button
                  onClick={() => {
                    track("search", { search_term: query.trim() });
                    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
                    setOpen(false);
                  }}
                  className="w-full py-3 text-left font-mono text-xs uppercase tracking-widest text-accent-600 hover:text-accent"
                >
                  See all results for “{query.trim()}” →
                </button>
              </li>
            </ul>
          )}
        </div>
      )}
    </>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" strokeLinecap="round" />
    </svg>
  );
}
