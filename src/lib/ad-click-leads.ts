// Storing the Google ad click behind a lead or order. See lib/ad-click for why,
// and supabase/migrations/20261118_ad_click_leads.sql for the table.
//
// SERVER ONLY, written from public routes, so the checkout-leads rules apply:
// it CANNOT BREAK THE LEAD (every failure is swallowed and logged, writes are
// deferred with `after()`), and it writes nothing unless the browser sent a
// click id that passes cleanAdClick.

import { after } from "next/server";
import { adminDb } from "@/lib/admin-db";
import { cleanAdClick, type AdClick } from "@/lib/ad-click";

export type AdClickKind = "checkout" | "quote" | "brief";

export type AdClickLead = {
  kind: AdClickKind;
  /** The checkout id, or a fresh id for a quote or brief with none. */
  ref: string;
  email?: string;
  value?: number;
};

const REF_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

/** Record one lead's click. Never throws. A no-op without Supabase. */
export async function recordAdClickLead(lead: AdClickLead, click: AdClick): Promise<void> {
  const db = adminDb();
  if (!db) return;
  try {
    const email = typeof lead.email === "string" ? lead.email.trim().toLowerCase().slice(0, 256) : "";
    const { error } = await db.rpc("record_ad_click_lead", {
      p_kind: lead.kind,
      p_ref: lead.ref,
      p_gclid: click.gclid ?? null,
      p_gbraid: click.gbraid ?? null,
      p_wbraid: click.wbraid ?? null,
      p_clicked_at: click.clickedAt,
      p_consent: click.consent,
      p_email: email.includes("@") ? email : null,
      p_value: typeof lead.value === "number" && Number.isFinite(lead.value) && lead.value >= 0 ? lead.value : null,
    });
    if (error) console.error("[ad-click-leads] could not record", lead.kind, error.message);
  } catch (e) {
    console.error("[ad-click-leads] could not record", lead.kind, e);
  }
}

/**
 * Validate what the browser sent and record it without holding up the
 * response. Does nothing when there is no valid click or no usable ref.
 * `after()` throws outside a request scope (route tests), which degrades to a
 * detached promise - same as scheduleCheckoutLead.
 */
export function scheduleAdClickLead(lead: AdClickLead, rawClick: unknown): void {
  const click = cleanAdClick(rawClick);
  if (!click || !REF_PATTERN.test(lead.ref)) return;
  try {
    after(() => recordAdClickLead(lead, click));
  } catch {
    void recordAdClickLead(lead, click);
  }
}

export type AdClickLeadRow = {
  kind: AdClickKind;
  ref: string;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  clicked_at: string;
  consent: "granted" | "unspecified";
  email: string | null;
  value: number | null;
  exported_at: string | null;
  created_at: string;
  /** checkout_leads.status for a checkout or checkout-born quote, joined at read time. */
  checkout_status?: string | null;
  order_number?: string | null;
};

/** Leads with a click in the last `days`, newest first, with their checkout outcome. */
export async function recentAdClickLeads(days = 90, limit = 500): Promise<AdClickLeadRow[]> {
  const db = adminDb();
  if (!db) return [];
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from("ad_click_leads")
    .select("kind, ref, gclid, gbraid, wbraid, clicked_at, consent, email, value, exported_at, created_at")
    .gt("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[ad-click-leads] could not read", error.message);
    return [];
  }
  const rows = (data ?? []) as AdClickLeadRow[];
  const refs = [...new Set(rows.filter((r) => r.kind !== "brief").map((r) => r.ref))];
  if (!refs.length) return rows;
  const { data: checkouts, error: cErr } = await db
    .from("checkout_leads")
    .select("checkout_id, status, order_number, subtotal")
    .in("checkout_id", refs);
  if (cErr) console.error("[ad-click-leads] could not read checkouts", cErr.message);
  const byId = new Map((checkouts ?? []).map((c) => [c.checkout_id as string, c]));
  return rows.map((r) => {
    const c = r.kind === "brief" ? undefined : byId.get(r.ref);
    return { ...r, checkout_status: c?.status ?? null, order_number: c?.order_number ?? null };
  });
}

/** Stamp rows as uploaded, so the next export skips them. */
export async function markAdClickLeadsExported(keys: { kind: AdClickKind; ref: string }[]): Promise<void> {
  const db = adminDb();
  if (!db || !keys.length) return;
  const now = new Date().toISOString();
  for (const kind of ["checkout", "quote", "brief"] as const) {
    const refs = keys.filter((k) => k.kind === kind).map((k) => k.ref);
    if (!refs.length) continue;
    const { error } = await db.from("ad_click_leads").update({ exported_at: now }).eq("kind", kind).in("ref", refs);
    if (error) console.error("[ad-click-leads] could not mark exported", kind, error.message);
  }
}
