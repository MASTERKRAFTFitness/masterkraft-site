// Abuse and spend controls for the public chat endpoint.
//
// The internal desk needed none of this: it sits behind a password and the
// people using it are on the payroll. A public endpoint that calls a metered
// model is different. Every request costs money, so the limits here exist to
// cap the bill, not to be polite about traffic.
//
// HONEST LIMITATION: this is per-instance memory. Vercel runs several lambda
// instances and recycles them, so a determined attacker spread across enough
// cold starts gets more than these numbers suggest. It raises the cost of abuse
// a long way above zero, which is worth having on day one, but the real fix is
// a shared store (Upstash Redis, or the Supabase project once it exists). Do not
// read these caps as a hard guarantee.

type Hit = { count: number; resetAt: number };

const MINUTE = 60_000;
const DAY = 24 * 60 * 60 * 1000;

// Per visitor. A real person asking about a rower sends maybe ten messages.
export const PER_MINUTE = 6;
export const PER_DAY = 40;
// Across everyone, per instance. A circuit breaker on the monthly bill rather
// than a per-user rule: if this trips, something is wrong and it should stop.
export const GLOBAL_PER_DAY = 2000;
// Failed order lookups before we stop answering them for this visitor. An order
// number plus the matching email is a guessing game we refuse to let anyone play.
export const ORDER_ATTEMPTS = 5;

const buckets = new Map<string, Hit>();

// Unbounded maps are how a long-lived instance turns into a memory leak.
function prune(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, hit] of buckets) {
    if (hit.resetAt <= now) buckets.delete(key);
  }
}

function bump(key: string, limit: number, windowMs: number, now: number) {
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  existing.count += 1;
  if (existing.count > limit) {
    return { ok: false, retryAfter: Math.ceil((existing.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
}

export type LimitVerdict = { ok: true } | { ok: false; reason: string; retryAfter: number };

export function checkMessageLimit(visitor: string, now = Date.now()): LimitVerdict {
  prune(now);

  const global = bump("global", GLOBAL_PER_DAY, DAY, now);
  if (!global.ok) {
    return {
      ok: false,
      retryAfter: global.retryAfter,
      reason: "The assistant is unavailable right now. Please use the contact form and the team will come back to you.",
    };
  }

  const perMinute = bump(`m:${visitor}`, PER_MINUTE, MINUTE, now);
  if (!perMinute.ok) {
    return { ok: false, retryAfter: perMinute.retryAfter, reason: "That is a lot of messages at once. Give it a moment and try again." };
  }

  const perDay = bump(`d:${visitor}`, PER_DAY, DAY, now);
  if (!perDay.ok) {
    return {
      ok: false,
      retryAfter: perDay.retryAfter,
      reason: "You have reached today's limit for the assistant. Please use the contact form and the team will help directly.",
    };
  }

  return { ok: true };
}

/** Counts a FAILED order lookup. Successful ones are not counted. */
export function recordOrderMiss(visitor: string, now = Date.now()): { blocked: boolean } {
  const result = bump(`o:${visitor}`, ORDER_ATTEMPTS, DAY, now);
  return { blocked: !result.ok };
}

export function orderLookupBlocked(visitor: string, now = Date.now()): boolean {
  const existing = buckets.get(`o:${visitor}`);
  if (!existing || existing.resetAt <= now) return false;
  return existing.count >= ORDER_ATTEMPTS;
}

/**
 * Who is asking. Vercel puts the real client first in x-forwarded-for; the rest
 * of the chain is proxies and must be ignored, or a spoofed header would mint a
 * fresh bucket on every request.
 */
export function visitorKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const first = forwarded.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip") || "unknown";
}

/** Test seam. Nothing in the app should call this. */
export function __resetLimits() {
  buckets.clear();
}
