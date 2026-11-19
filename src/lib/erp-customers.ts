// The Supabase copy of Unleashed's customers (erp_customers), and the reads the
// checkout makes against it.
//
// SERVER ONLY. Uses the service role key through adminDb().
//
// Why it exists is in supabase/migrations/20261118_erp_customers.sql: matching a
// web buyer to their Unleashed customer by asking Unleashed took 3-37 seconds.
// This is a cache. Unleashed stays the customer master, and nothing here is
// ever written back to it.
import { adminDb } from "@/lib/admin-db";
import { pages } from "@/lib/erp-mirror";

/** An Unleashed customer, as much of one as matching needs. */
export type RawCustomer = {
  Guid: string;
  CustomerCode: string;
  CustomerName?: string | null;
  Email?: string | null;
  CustomerType?: string | null;
  Obsolete?: boolean | null;
};

/** Lower-case and trimmed; a trailing "." is a typo staff left on some records. */
export function normaliseEmail(e: string | null | undefined): string {
  return String(e ?? "").trim().toLowerCase().replace(/\.+$/, "");
}

/**
 * How far back an hourly refresh reads, past the newest change it already has.
 * Generous on purpose: Unleashed's search lagged a fresh create on 18 Nov, and
 * re-reading two hours of changes costs one page.
 */
const OVERLAP_MS = 2 * 3_600_000;

/** Past this, the copy is too old to trust for "this buyer is new". */
export const STALE_AFTER_MS = 48 * 3_600_000;

export type CustomerRow = {
  guid: string;
  code: string;
  name: string | null;
  email: string | null;
  obsolete: boolean;
  source: "sync" | "checkout";
  modified_at: string | null;
  synced_at: string;
};

type UnleashedCustomer = RawCustomer & { LastModifiedOn?: string | null };

/** Unleashed serialises dates as /Date(ms)/. */
export function unleashedDate(v: string | null | undefined): string | null {
  const ms = /\/Date\((-?\d+)/.exec(v ?? "")?.[1];
  return ms ? new Date(Number(ms)).toISOString() : null;
}

export function toRow(c: UnleashedCustomer, now: string, source: CustomerRow["source"] = "sync"): CustomerRow | null {
  if (!c.Guid || !c.CustomerCode?.trim()) return null;
  return {
    guid: c.Guid,
    code: c.CustomerCode.trim(),
    name: c.CustomerName?.trim() || null,
    email: normaliseEmail(c.Email) || null,
    obsolete: Boolean(c.Obsolete),
    source,
    modified_at: unleashedDate(c.LastModifiedOn),
    synced_at: now,
  };
}

export type CustomerRefresh = {
  ok: boolean;
  reason?: string;
  full: boolean;
  since: string | null;
  read: number;
  written: number;
  ms: number;
};

/**
 * Read Unleashed customers changed since the newest one held (less an overlap),
 * or all of them with `full`, and upsert them by Guid.
 *
 * A customer made obsolete is a change, so it arrives and is marked. A customer
 * DELETED in Unleashed does not; it lingers here until a full refresh, and a
 * match on it would point an order at a Guid Unleashed refuses, which falls back
 * to the shared account. Annoying, not harmful.
 */
export async function refreshErpCustomers({ full = false, write = false } = {}): Promise<CustomerRefresh> {
  const started = Date.now();
  const base = { full, since: null as string | null, read: 0, written: 0 };
  const db = adminDb();
  if (!db) return { ok: false, reason: "Supabase is not configured", ...base, ms: Date.now() - started };
  if (!process.env.UNLEASHED_API_ID || !process.env.UNLEASHED_API_KEY) {
    return { ok: false, reason: "Unleashed is not configured", ...base, ms: Date.now() - started };
  }

  let since: string | null = null;
  if (!full) {
    const { data, error } = await db
      .from("erp_customers")
      .select("modified_at")
      .eq("source", "sync")
      .not("modified_at", "is", null)
      .order("modified_at", { ascending: false })
      .limit(1);
    if (error) return { ok: false, reason: `erp_customers: ${error.message}`, ...base, ms: Date.now() - started };
    const newest = data?.[0]?.modified_at as string | undefined;
    // An empty table is a first run: read everything.
    if (newest) since = new Date(new Date(newest).getTime() - OVERLAP_MS).toISOString().slice(0, 19);
  }

  const customers = await pages<UnleashedCustomer>("Customers", since ? `&modifiedSince=${since}` : "");
  const now = new Date().toISOString();
  const rows = customers.map((c) => toRow(c, now)).filter((r): r is CustomerRow => r !== null);

  let written = 0;
  if (write) {
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await db.from("erp_customers").upsert(chunk, { onConflict: "guid" });
      if (error) {
        return { ok: false, reason: `erp_customers upsert: ${error.message}`, full, since, read: rows.length, written, ms: Date.now() - started };
      }
      written += chunk.length;
    }
  }
  return { ok: true, full, since, read: rows.length, written, ms: Date.now() - started };
}

// ---------------------------------------------------------------------------
// What the checkout asks.
// ---------------------------------------------------------------------------

export type CustomerIndex = {
  /** Every non-obsolete customer holding this email, by Guid and code. */
  byEmail(email: string): Promise<RawCustomer[]>;
  /** Codes starting with this prefix, any case, obsolete included (a code stays taken). */
  codesLike(prefix: string): Promise<string[]>;
  /** Record a customer the checkout just created, so the next order finds it. */
  remember(c: RawCustomer): Promise<void>;
};

/**
 * The copy, or why it can't be used. Refuses an empty or stale copy: a copy
 * that has stopped refreshing would call every recent buyer "new" and create a
 * duplicate of each.
 */
export async function customerIndex(now = Date.now()): Promise<CustomerIndex | { unavailable: string }> {
  const db = adminDb();
  if (!db) return { unavailable: "Supabase is not configured" };
  const { data, error } = await db
    .from("erp_customers")
    .select("synced_at")
    .eq("source", "sync")
    .order("synced_at", { ascending: false })
    .limit(1);
  if (error) return { unavailable: `customer copy unreadable (${error.message})` };
  const last = data?.[0]?.synced_at as string | undefined;
  if (!last) return { unavailable: "the customer copy is empty" };
  if (now - new Date(last).getTime() > STALE_AFTER_MS) {
    return { unavailable: `the customer copy was last refreshed ${last.slice(0, 16)}` };
  }

  return {
    async byEmail(email) {
      const { data, error } = await db
        .from("erp_customers")
        .select("guid, code, name, email, obsolete")
        .eq("email", normaliseEmail(email))
        .eq("obsolete", false);
      if (error) throw new Error(`erp_customers: ${error.message}`);
      return (data ?? []).map((r) => ({
        Guid: r.guid as string,
        CustomerCode: r.code as string,
        CustomerName: r.name as string | null,
        Email: r.email as string | null,
        Obsolete: r.obsolete as boolean,
      }));
    },
    async codesLike(prefix) {
      // Letters only reach here (customerCodeBase), so no LIKE metacharacters.
      const { data, error } = await db.from("erp_customers").select("code").ilike("code", `${prefix}%`);
      if (error) throw new Error(`erp_customers: ${error.message}`);
      return (data ?? []).map((r) => r.code as string);
    },
    async remember(c) {
      const row = toRow(c, new Date().toISOString(), "checkout");
      if (!row) return;
      const { error } = await db.from("erp_customers").upsert(row, { onConflict: "guid" });
      if (error) console.error(`[erp-customers] could not record ${row.code}: ${error.message}`);
    },
  };
}
