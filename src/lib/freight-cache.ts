// A small TTL cache in front of the carrier APIs.
//
// TWO REASONS IT EXISTS, and the second matters more than the first.
//
// 1. EASYSHIP'S RATES ENDPOINT IS METERED. It is an "advanced endpoint" with a
//    monthly plan allowance and per-call overage past it, and the allowance is
//    small enough to matter: a single run of `npm run report:carriers` exhausted
//    the trial's on 2026-09-05 and every later call came back
//    `403 usage_limit`. Meanwhile the checkout quotes the SAME cart twice per
//    order - once to display, once in payment-intent to charge - and again on
//    every address edit. Most of those calls ask an identical question.
//
// 2. IT MAKES THE PRICE SHOWN AND THE PRICE CHARGED THE SAME NUMBER. This is the
//    real prize. The browser sends only the option id, never the price, so
//    payment-intent re-quotes server-side; if the carrier's answer moved between
//    those two calls, the order is refused after the card is captured. Serving
//    both from one cached quote removes that failure mode instead of hoping the
//    carrier is deterministic. docs/easyship-evaluation.md lists rate stability
//    as unverified, and this is why that is survivable.
//
// IN MEMORY, PER INSTANCE. On Vercel each lambda has its own copy, so the hit
// rate is not what it would be on a shared store. The display-then-charge pair
// usually lands on the same warm instance and hits; a cold start misses and
// simply costs what it costs today. This is deliberately the simple version - if
// the miss rate turns out to hurt, the same interface can be backed by Supabase,
// which this project already has credentials for.
//
// NEVER CACHES A PRICE ACROSS A CONFIG CHANGE: the handling margin and both GST
// flags are part of the key, so editing FREIGHT_MARGIN_PERCENT cannot leave old
// prices being charged.

/** 15 minutes: longer than a checkout, far shorter than a carrier's rate card. */
const DEFAULT_TTL_SECONDS = 900;

/**
 * Failures are cached too, briefly. A carrier that is over its quota or down
 * stays that way for more than one request, and re-asking on every keystroke
 * burns the allowance that caused the problem. Short, because a cart that COULD
 * be quoted showing "calculated on quote" is a real cost to weigh against it.
 */
const DEFAULT_ERROR_TTL_SECONDS = 60;

/** Bounded so a busy day cannot grow this without limit. */
const MAX_ENTRIES = 500;

type Entry<T> = { value: T; expiresAt: number };

const store = new Map<string, Entry<unknown>>();

let hits = 0;
let misses = 0;

const seconds = (name: string, fallback: number): number => {
  const v = parseFloat(process.env[name] ?? "");
  return Number.isFinite(v) && v >= 0 ? v : fallback;
};

export const cacheTtlSeconds = () => seconds("FREIGHT_CACHE_TTL_SECONDS", DEFAULT_TTL_SECONDS);
export const cacheErrorTtlSeconds = () =>
  seconds("FREIGHT_CACHE_ERROR_TTL_SECONDS", DEFAULT_ERROR_TTL_SECONDS);

/** Read a live entry, or undefined. Expired entries are dropped on the way past. */
export function getCached<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) {
    misses++;
    return undefined;
  }
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    misses++;
    return undefined;
  }
  // Re-insert so the eviction below drops genuinely cold keys rather than merely
  // old ones: Map iterates in insertion order, so this moves it to the back.
  store.delete(key);
  store.set(key, entry);
  hits++;
  return entry.value as T;
}

export function setCached<T>(key: string, value: T, ttlSeconds: number): void {
  if (ttlSeconds <= 0) return; // caching switched off
  store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next();
    if (oldest.done) break;
    store.delete(oldest.value);
  }
}

/** For tests, and for anything that changes what a cached price would mean. */
export function clearFreightCache(): void {
  store.clear();
  hits = 0;
  misses = 0;
}

/**
 * Observability. The 403 that ended the trial allowance was invisible from the
 * outside, because the router fails soft and the checkout just said "calculated
 * on quote" - so knowing the hit rate is how anyone notices the cache is doing
 * its job, or that it is not.
 */
export function freightCacheStats(): {
  entries: number;
  hits: number;
  misses: number;
  hitRate: number;
} {
  const total = hits + misses;
  return { entries: store.size, hits, misses, hitRate: total ? hits / total : 0 };
}
