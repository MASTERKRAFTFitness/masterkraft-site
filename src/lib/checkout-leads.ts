// Recording how far each checkout got, so an abandoned one can be followed up.
//
// SERVER ONLY, and written from public checkout routes, so the same two rules as
// blocked-log.ts apply: it CANNOT BREAK THE CHECKOUT (every failure is
// swallowed and logged, and writes are deferred with `after()`), and it CANNOT
// BE A WRITE AMPLIFIER (one row per checkout id, lengths capped, pruned at 90
// days by the RPC).
//
// See supabase/migrations/20261001_checkout_leads.sql for the why.

import { after } from "next/server";
import { adminDb } from "@/lib/admin-db";

export type CheckoutStatus = "quoted" | "payment_started" | "paid" | "quote_requested";

export type CheckoutLeadItem = { sku?: string; name: string; qty: number; price: number };

export type CheckoutLeadContact = {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
};

export type CheckoutLeadPatch = {
  status: CheckoutStatus;
  contact?: CheckoutLeadContact;
  delivery?: { city?: string; state?: string; postcode?: string };
  items?: CheckoutLeadItem[];
  subtotal?: number;
  freight?: { price: number | null; label?: string; reason?: string | null };
  orderNumber?: string;
};

const MAX = 256;
const MAX_ITEMS = 50;

function trim(value: unknown, max = MAX): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v ? v.slice(0, max) : null;
}

/** A browser-generated id: a UUID, or near enough. Anything else is ignored. */
export function validCheckoutId(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9-]{16,64}$/.test(value) ? value : null;
}

function cleanItems(items: CheckoutLeadItem[] | undefined) {
  if (!Array.isArray(items)) return null;
  return items.slice(0, MAX_ITEMS).map((i) => ({
    sku: trim(i?.sku, 64),
    name: trim(i?.name) ?? "",
    qty: Number.isFinite(i?.qty) ? Number(i.qty) : 0,
    price: Number.isFinite(i?.price) ? Number(i.price) : 0,
  }));
}

const num = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : null);

/** Record one step of one checkout. Never throws. A no-op without Supabase. */
export async function recordCheckoutLead(checkoutId: string, patch: CheckoutLeadPatch): Promise<void> {
  const db = adminDb();
  if (!db) return;
  try {
    const { error } = await db.rpc("record_checkout_lead", {
      p_checkout_id: checkoutId,
      p_status: patch.status,
      p_name: trim(patch.contact?.name),
      p_email: trim(patch.contact?.email),
      p_phone: trim(patch.contact?.phone, 64),
      p_company: trim(patch.contact?.company),
      p_suburb: trim(patch.delivery?.city),
      p_state: trim(patch.delivery?.state, 16),
      p_postcode: trim(patch.delivery?.postcode, 16),
      p_items: cleanItems(patch.items),
      p_subtotal: num(patch.subtotal),
      p_freight_price: num(patch.freight?.price),
      p_freight_label: trim(patch.freight?.label),
      p_freight_reason: trim(patch.freight?.reason ?? undefined, 64),
      p_order_number: trim(patch.orderNumber, 64),
    });
    if (error) console.error("[checkout-leads] could not record", patch.status, error.message);
  } catch (e) {
    console.error("[checkout-leads] could not record", patch.status, e);
  }
}

/**
 * Record without holding up the response. `after()` throws outside a request
 * scope (route tests call handlers directly), so that degrades to a detached
 * promise rather than an error - same as scheduleBlockedLog.
 */
export function scheduleCheckoutLead(checkoutId: unknown, patch: CheckoutLeadPatch): void {
  const id = validCheckoutId(checkoutId);
  if (!id) return;
  try {
    after(() => recordCheckoutLead(id, patch));
  } catch {
    void recordCheckoutLead(id, patch);
  }
}

export type CheckoutLeadRow = {
  checkout_id: string;
  status: CheckoutStatus;
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  items: { sku: string | null; name: string; qty: number; price: number }[];
  subtotal: number | null;
  freight_price: number | null;
  freight_label: string | null;
  freight_reason: string | null;
  order_number: string | null;
  notified_at: string | null;
  created_at: string;
  updated_at: string;
};

const COLUMNS =
  "checkout_id, status, name, email, phone, company, suburb, state, postcode, items, subtotal, " +
  "freight_price, freight_label, freight_reason, order_number, notified_at, created_at, updated_at";

/** Most recent checkouts first - the admin list. */
export async function recentCheckoutLeads(limit = 100): Promise<CheckoutLeadRow[]> {
  const db = adminDb();
  if (!db) return [];
  const { data, error } = await db
    .from("checkout_leads")
    .select(COLUMNS)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[checkout-leads] could not read", error);
    return [];
  }
  return (data ?? []) as unknown as CheckoutLeadRow[];
}

/**
 * Abandoned and not yet reported: still at quoted / payment_started, untouched
 * for `idleMinutes`, with an email to follow up on. Bounded to the last three
 * days so turning the cron on does not mail out the whole table's history.
 */
export async function abandonedCheckoutLeads(idleMinutes = 60, limit = 20): Promise<CheckoutLeadRow[]> {
  const db = adminDb();
  if (!db) return [];
  const now = Date.now();
  const { data, error } = await db
    .from("checkout_leads")
    .select(COLUMNS)
    .in("status", ["quoted", "payment_started"])
    .is("notified_at", null)
    .not("email", "is", null)
    .lt("updated_at", new Date(now - idleMinutes * 60_000).toISOString())
    .gt("updated_at", new Date(now - 3 * 24 * 60 * 60_000).toISOString())
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("[checkout-leads] could not read abandoned", error);
    return [];
  }
  return (data ?? []) as unknown as CheckoutLeadRow[];
}

export async function markCheckoutLeadNotified(checkoutId: string): Promise<void> {
  const db = adminDb();
  if (!db) return;
  const { error } = await db
    .from("checkout_leads")
    .update({ notified_at: new Date().toISOString() })
    .eq("checkout_id", checkoutId);
  if (error) console.error("[checkout-leads] could not mark notified", checkoutId, error.message);
}
