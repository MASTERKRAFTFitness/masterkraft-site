// Recording what the outside world asks for and this site does not have.
//
// SERVER ONLY, and reached from a PUBLIC page — the 404 — which makes it the
// one thing in the codebase that writes to the database on an unauthenticated
// path. Two rules follow from that and neither is negotiable:
//
//   1. IT CANNOT BREAK THE PAGE. Every failure is swallowed. A visitor who has
//      already hit a dead link must not then meet a stack trace, and an outage
//      at Supabase must not take the 404 page down with it.
//   2. IT CANNOT BE A WRITE AMPLIFIER. Everything below exists to bound what an
//      anonymous request can put in the table: one row per path, a length cap,
//      and a filter for the paths that only ever come from scanners.
//
// See supabase/migrations/20260903_not_found_hits.sql for why this aggregates
// per path rather than logging per request.
//
// WHY THE CALLERS PASS A PATH INSTEAD OF READING ONE. The obvious home for this
// is `not-found.tsx`, reading the pathname from a header set in Proxy. It works,
// and it costs the entire site: a root not-found that reads `headers()` is a
// not-found that cannot be prerendered, and because ANY route can fall back to
// it, Next then renders every route on demand. Measured, not guessed — it took
// the build from 35 static routes to none. So the path is passed in by the two
// kinds of caller that already know it without asking the request: the catch-all
// route for URLs that match nothing, and the `notFound()` call sites, which have
// it in their params.
import { adminDb } from "@/lib/admin-db";

// Longer than any real URL this site ever served; anything past it is a probe
// or a mangled redirect chain, and truncating rather than rejecting would file
// a hundred distinct junk paths under one row.
const MAX_PATH = 512;

// A dead URL worth redirecting is a page somebody once linked to. These never
// were. WordPress-era probes (`/wp-login.php`), config-file fishing (`/.env`,
// `/.git/config`) and asset misses tell us nothing about lost traffic and are
// most of the volume by count, so they never reach the database.
//
// DELIBERATELY NOT "anything with a dot": `/sitemap_index.xml` and
// `/wp-sitemap.xml` are real URLs the old store published, and a search engine
// still asking for one is a fact worth having.
const NEVER_LOG =
  /(?:^\/(?:\.|wp-|cgi-bin|vendor|phpmyadmin|_next|api)\b)|(?:\.(?:php|aspx?|jsp|cgi|env|ini|sql|bak|old|log|ya?ml|toml|map|woff2?|ttf|css|js|png|jpe?g|gif|svg|webp|ico|mp4|pdf)$)/i;

/**
 * The path as it should be filed, or null if it should not be filed at all.
 *
 * Exported for the test: the filtering rules are the whole defence against an
 * anonymous write path, so they are asserted rather than trusted.
 */
export function normaliseNotFoundPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Proxy hands over a pathname, but a caller passing a full URL or a path with
  // a query attached must not create a second row for the same page.
  let path = raw.split("#")[0].split("?")[0].trim();
  if (!path.startsWith("/")) {
    try {
      path = new URL(path).pathname;
    } catch {
      return null;
    }
  }
  if (path.length > MAX_PATH) return null;
  // A trailing slash is the same page; Next redirects it before it ever gets
  // here, but a direct caller should not be able to double-count.
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  if (NEVER_LOG.test(path)) return null;
  return path;
}

/** Referrers and user agents are attacker-controlled strings; cap them too. */
function trim(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  const v = value.trim();
  return v ? v.slice(0, max) : null;
}

/**
 * Count one 404. Never throws, never blocks — call it inside `after()`.
 *
 * A no-op when the database is not configured, which is the same posture
 * admin-db takes: the site works without Supabase, it just cannot tell you
 * anything about its own dead links.
 */
export async function recordNotFound(
  rawPath: string | null | undefined,
  referrer?: string | null,
  userAgent?: string | null
): Promise<void> {
  const db = adminDb();
  if (!db) return;
  const path = normaliseNotFoundPath(rawPath);
  if (!path) return;
  try {
    const { error } = await db.rpc("record_not_found", {
      p_path: path,
      p_referrer: trim(referrer, 512),
      p_user_agent: trim(userAgent, 512),
    });
    // Logged, not thrown: a missing migration should be loud in the server log
    // and invisible to the visitor.
    if (error) console.error("[404log] could not record", path, error.message);
  } catch (e) {
    console.error("[404log] could not record", path, e);
  }
}

export type NotFoundRow = {
  path: string;
  hits: number;
  first_seen_at: string;
  last_seen_at: string;
  last_referrer: string | null;
  last_user_agent: string | null;
};

/** The busiest dead URLs — the ones a redirect would actually earn something. */
export async function busiestNotFound(limit = 100): Promise<NotFoundRow[]> {
  const db = adminDb();
  if (!db) return [];
  const { data, error } = await db
    .from("not_found_hits")
    .select("path, hits, first_seen_at, last_seen_at, last_referrer, last_user_agent")
    .order("hits", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[404log] could not read", error);
    return [];
  }
  return (data ?? []) as NotFoundRow[];
}
