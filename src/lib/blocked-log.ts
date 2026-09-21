// Writing down the enquiries the bot filter stopped.
//
// SERVER ONLY, and reached from PUBLIC, unauthenticated form routes — the same
// position not-found-log.ts is in, and the same two rules apply:
//
//   1. IT CANNOT BREAK THE FORM. Every failure is swallowed. A Supabase outage
//      must not turn a blocked submission into a 500, and must not change what
//      the visitor sees. Call it inside `after()` so it never delays the reply.
//   2. IT CANNOT BE A WRITE AMPLIFIER. Rate-limit verdicts are refused outright
//      (see below), lengths are capped, and the table prunes itself at 30 days.
//
// WHY: three of the guard's four verdicts are silent by design — honeypot,
// too_fast and gibberish return an ordinary success and send nothing, because
// telling a form-filler which layer caught it is how it learns to dodge that
// layer. The cost is that a false positive is indistinguishable from success
// from every side. On 20 September a lead could not be traced at all: HubSpot
// empty, Resend empty, and the only record was a Vercel log line that had
// already rolled. This is that missing record.
//
// See supabase/migrations/20260921_blocked_submissions.sql.

import { after } from "next/server";
import { adminDb } from "@/lib/admin-db";
import type { SpamReason } from "@/lib/form-guard";

/** Long enough to judge a submission by; short enough to bound an anonymous write. */
const MAX_SHORT = 256;
const MAX_MESSAGE = 4000;

/**
 * Which verdicts are worth a row.
 *
 * NOT rate_limit, deliberately. It is the one verdict the visitor is told about
 * — RATE_LIMITED_MESSAGE hands them an address to email — so nothing is lost
 * silently and there is nothing to rescue. It is also the one that repeats on
 * every subsequent request once a cap is hit, which on a public path is how a
 * flood becomes unbounded writes.
 */
const LOGGED: ReadonlySet<SpamReason> = new Set<SpamReason>([
  "honeypot",
  "too_fast",
  "gibberish",
]);

export function shouldLogBlocked(reason: SpamReason): boolean {
  return LOGGED.has(reason);
}

function trim(value: string | null | undefined, max: number): string | null {
  if (!value) return null;
  const v = String(value).trim();
  return v ? v.slice(0, max) : null;
}

export type BlockedSubmission = {
  form: string;
  reason: SpamReason;
  detail?: string;
  visitor?: string;
  name?: string;
  email?: string;
  message?: string;
};

/**
 * Record one silently-blocked submission. Never throws, never blocks.
 *
 * A no-op when Supabase is not configured, matching admin-db's posture: the site
 * works without it, it just cannot tell you who it turned away.
 */
export async function recordBlocked(sub: BlockedSubmission): Promise<void> {
  if (!shouldLogBlocked(sub.reason)) return;
  const db = adminDb();
  if (!db) return;
  try {
    const { error } = await db.rpc("record_blocked_submission", {
      p_form: trim(sub.form, 64) ?? "unknown",
      p_reason: sub.reason,
      p_detail: trim(sub.detail, MAX_SHORT),
      p_visitor: trim(sub.visitor, 64),
      p_name: trim(sub.name, MAX_SHORT),
      p_email: trim(sub.email, MAX_SHORT),
      p_message: trim(sub.message, MAX_MESSAGE),
    });
    // Logged, not thrown: a missing migration should be loud in the server log
    // and invisible to the visitor.
    if (error) console.error("[blocked-log] could not record", sub.form, error.message);
  } catch (e) {
    console.error("[blocked-log] could not record", sub.form, e);
  }
}

export type BlockedRow = {
  id: number;
  form: string;
  reason: SpamReason;
  detail: string | null;
  visitor: string | null;
  name: string | null;
  email: string | null;
  message: string | null;
  created_at: string;
};

/**
 * The most recent blocks, newest first — the list to scan when someone says
 * they filled the form in and never heard back.
 */
export async function recentBlocked(limit = 100): Promise<BlockedRow[]> {
  const db = adminDb();
  if (!db) return [];
  const { data, error } = await db
    .from("blocked_submissions")
    .select("id, form, reason, detail, visitor, name, email, message, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[blocked-log] could not read", error);
    return [];
  }
  return (data ?? []) as BlockedRow[];
}

/**
 * Record a block without making the caller think about scheduling.
 *
 * `after()` defers the write until the response has been sent, which is what we
 * want in production — but it THROWS when there is no request scope, and a
 * route handler called directly (every route test does this) has none. An
 * exception here would break the very form this is meant to protect, so the
 * absence of a scope degrades to a detached promise instead of an error.
 *
 * Returns nothing and awaits nothing: the caller must never be held up by it.
 */
export function scheduleBlockedLog(sub: BlockedSubmission): void {
  if (!shouldLogBlocked(sub.reason)) return;
  try {
    after(() => recordBlocked(sub));
  } catch {
    void recordBlocked(sub);
  }
}
