// The cart reminder: one email, the morning after an abandoned checkout, to a
// shopper who asked for it.
//
// WHY ONLY THOSE WHO ASKED (Michael, 2026-10-22). A recovery email is a
// commercial message under the Spam Act, and a checkout is not consent to one -
// which is why cron/abandoned-checkouts tells the team rather than the customer.
// The checkout now has an UNTICKED "Email me my cart if I don't finish" box; a
// tick is express consent, recorded on the checkout (reminder_opt_in), and only
// those checkouts get this email. The team alert carries on for everyone.
//
// THE NEXT MORNING, from 9am Melbourne time, for a checkout last touched on an
// earlier day. Late-night shoppers are not emailed at 1am, and someone who
// leaves at lunch hears from us once they have slept on it.
//
// ONE PER CHECKOUT, claimed BEFORE sending (reminded_at) and released if the
// send fails, the same pattern as shipped-notices: two overlapping runs cannot
// both email, and a failure retries on the next run. A re-quote does not clear
// it. The email says it is the only one, and it is.
//
// WHAT THE SPAM ACT ASKS OF THE EMAIL ITSELF: who sent it (MasterKraft Pty Ltd,
// ABN, contact address) and a working unsubscribe, honoured for good. Unsubscribe
// adds the address to cart_reminder_optouts, which every run checks, so ticking
// the box on a later checkout does not undo it.
import { createHmac, timingSafeEqual } from "node:crypto";
import { adminDb } from "@/lib/admin-db";
import { primaryRecipient } from "@/lib/notify-recipients";
import { SITE_URL } from "@/lib/site";
import type { CheckoutLeadRow } from "@/lib/checkout-leads";

const TIMEOUT_MS = 8000;
const ZONE = "Australia/Melbourne";
/** The morning starts at 9, and nothing goes out after 6pm - it waits for tomorrow. */
const SEND_FROM_HOUR = 9;
const SEND_UNTIL_HOUR = 18;
/**
 * How many days back a checkout can be and still be reminded. Two, so one
 * missed morning (a failed deploy, a Resend outage) still catches up, while a
 * week-old cart is left alone rather than chased.
 */
const LOOKBACK_DAYS = 2;

const aud = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });

/** Hour of day in Melbourne, 0-23. */
export function melbourneHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-AU", { timeZone: ZONE, hour: "numeric", hourCycle: "h23" }).format(now)
  );
}

/** The instant today began in Melbourne (local midnight), daylight saving included. */
export function melbourneDayStart(now: Date): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-AU", {
      timeZone: ZONE,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, Number(p.value)])
  );
  const localAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const offset = localAsUtc - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day) - offset);
}

/** Whether a reminder run should send anything at all right now. */
export function inSendWindow(now: Date): boolean {
  const h = melbourneHour(now);
  return h >= SEND_FROM_HOUR && h < SEND_UNTIL_HOUR;
}

/** The range of last-activity times a run reminds: earlier days, not too long ago. */
export function reminderRange(now: Date): { after: Date; before: Date } {
  const before = melbourneDayStart(now);
  return { after: new Date(before.getTime() - LOOKBACK_DAYS * 86_400_000), before };
}

// ---- Unsubscribe ----------------------------------------------------------

// Keyed on the checkout id, not the email, so no address travels in the link.
// Signed with CRON_SECRET (already set wherever the cron runs) under its own
// label, so the signature is useless for anything but this.
function signingKey(): string | null {
  return process.env.CRON_SECRET || null;
}

export function unsubscribeToken(checkoutId: string, key = signingKey()): string | null {
  if (!key) return null;
  return createHmac("sha256", key).update(`cart-reminder-unsubscribe:${checkoutId}`).digest("base64url");
}

export function validUnsubscribeToken(checkoutId: string, token: string, key = signingKey()): boolean {
  const expected = unsubscribeToken(checkoutId, key);
  if (!expected) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function unsubscribeUrl(checkoutId: string, key = signingKey()): string | null {
  const token = unsubscribeToken(checkoutId, key);
  if (!token) return null;
  return `${SITE_URL}/api/cart-reminder/unsubscribe?c=${encodeURIComponent(checkoutId)}&t=${token}`;
}

/**
 * Stop reminders for whoever owns this checkout: this one, and every later one.
 * Returns false only when the checkout is unknown.
 */
export async function unsubscribeCheckout(checkoutId: string): Promise<boolean> {
  const db = adminDb();
  if (!db) throw new Error("Supabase is not configured");
  const { data, error } = await db
    .from("checkout_leads")
    .select("email")
    .eq("checkout_id", checkoutId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return false;
  const { error: offError } = await db
    .from("checkout_leads")
    .update({ reminder_opt_in: false })
    .eq("checkout_id", checkoutId);
  if (offError) throw new Error(offError.message);
  const email = (data as { email: string | null }).email?.trim().toLowerCase();
  if (email) {
    const { error: optError } = await db
      .from("cart_reminder_optouts")
      .upsert({ email }, { onConflict: "email", ignoreDuplicates: true });
    if (optError) throw new Error(optError.message);
  }
  return true;
}

// ---- The email ------------------------------------------------------------

function escape(s: string) {
  return s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] || c);
}

function firstName(full: string | null): string | null {
  return full?.trim().split(/\s+/)[0] || null;
}

export function reminderEmail(row: CheckoutLeadRow, unsubscribe: string): { subject: string; html: string } {
  const name = firstName(row.name);
  const cell = "padding:6px 12px 6px 0";
  const rows = (row.items ?? [])
    .map(
      (i) =>
        `<tr><td style="${cell}">${escape(i.name)}</td><td style="${cell};text-align:center">${i.qty}</td><td style="padding:6px 0;text-align:right">${aud.format(i.price * i.qty)}</td></tr>`
    )
    .join("");
  const where = [row.suburb, row.state, row.postcode].filter(Boolean).join(" ");
  const freight =
    row.freight_price != null
      ? `Delivery${where ? ` to ${escape(where)}` : ""}: <strong>${aud.format(row.freight_price)}</strong>`
      : `Delivery${where ? ` to ${escape(where)}` : ""}: we'll confirm the price with you`;
  const contact = primaryRecipient();
  const html = `
    <p>${name ? `Hi ${escape(name)},` : "Hi,"}</p>
    <p>You started a checkout with MasterKraft and didn't get to finish. Here's your cart, as you asked.</p>
    ${rows ? `<table style="border-collapse:collapse;margin-top:12px"><tbody>${rows}</tbody></table>` : ""}
    <p style="margin-top:12px">${row.subtotal != null ? `Subtotal (inc. GST): <strong>${aud.format(row.subtotal)}</strong><br/>` : ""}${freight}</p>
    <p><a href="${SITE_URL}/cart" style="display:inline-block;padding:10px 18px;background:#111;color:#fff;text-decoration:none;border-radius:4px">Finish your order</a></p>
    <p>Your cart is saved on the device you used. If you're on a different one, or you have a question about freight, sizing or anything else, just reply to this email and we'll help.</p>
    <p>MasterKraft</p>
    <p style="color:#888;font-size:12px;margin-top:24px">
      You're getting this because you ticked "Email me my cart if I don't finish" at checkout.
      It's the only reminder we'll send for this cart.
      <a href="${escape(unsubscribe)}" style="color:#888">Unsubscribe from cart reminders</a>.<br/>
      MasterKraft Pty Ltd · ABN 84 659 220 274 · <a href="${SITE_URL}" style="color:#888">${escape(SITE_URL.replace(/^https?:\/\//, ""))}</a> · ${escape(contact)}
    </p>
  `;
  return { subject: "Your MasterKraft cart", html };
}

// ---- The run --------------------------------------------------------------

export type ReminderResult = {
  ok: boolean;
  error?: string;
  skipped?: string;
  candidates: number;
  sent: number;
  optedOut: number;
  failed: number;
};

const COLUMNS =
  "checkout_id, status, name, email, phone, company, suburb, state, postcode, items, subtotal, " +
  "freight_price, freight_label, freight_reason, order_number, notified_at, reminder_opt_in, reminded_at, " +
  "created_at, updated_at";

async function resend(msg: {
  to: string[];
  reply_to: string;
  subject: string;
  html: string;
  headers: Record<string, string>;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.QUOTE_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("RESEND_API_KEY / QUOTE_FROM_EMAIL not set");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, ...msg }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text().catch(() => "")}`);
}

/** One pass: remind every opted-in checkout abandoned on an earlier day. */
export async function sendCartReminders(now = new Date()): Promise<ReminderResult> {
  const result: ReminderResult = { ok: true, candidates: 0, sent: 0, optedOut: 0, failed: 0 };
  if (!inSendWindow(now)) return { ...result, skipped: "outside 9am-6pm Melbourne" };
  const db = adminDb();
  if (!db) return { ...result, ok: false, error: "Supabase is not configured" };
  if (!process.env.RESEND_API_KEY || !process.env.QUOTE_FROM_EMAIL) {
    return { ...result, ok: false, error: "RESEND_API_KEY / QUOTE_FROM_EMAIL not set" };
  }
  if (!signingKey()) return { ...result, ok: false, error: "CRON_SECRET not set, so no unsubscribe link" };

  const { after, before } = reminderRange(now);
  const { data, error } = await db
    .from("checkout_leads")
    .select(COLUMNS)
    .eq("reminder_opt_in", true)
    .is("reminded_at", null)
    .in("status", ["quoted", "payment_started"])
    .not("email", "is", null)
    .gte("updated_at", after.toISOString())
    .lt("updated_at", before.toISOString())
    // Newest first, so someone with two abandoned carts gets the later one.
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) return { ...result, ok: false, error: error.message };
  const rows = (data ?? []) as unknown as CheckoutLeadRow[];
  result.candidates = rows.length;
  if (rows.length === 0) return result;

  const emails = [...new Set(rows.map((r) => r.email!.trim().toLowerCase()))];
  const { data: outs, error: outError } = await db
    .from("cart_reminder_optouts")
    .select("email")
    .in("email", emails);
  // Unknown opt-outs mean we cannot honour them, so send nothing this run.
  if (outError) return { ...result, ok: false, error: outError.message };
  const optedOut = new Set((outs ?? []).map((o: { email: string }) => o.email));

  // One email per address per run, even if they abandoned two checkouts.
  const emailed = new Set<string>();
  for (const row of rows) {
    const email = row.email!.trim().toLowerCase();
    if (optedOut.has(email)) {
      result.optedOut++;
      continue;
    }
    if (emailed.has(email)) {
      // Covered by the email just sent. Marked, so the next run does not send it.
      await db.from("checkout_leads").update({ reminded_at: now.toISOString() }).eq("checkout_id", row.checkout_id);
      continue;
    }

    // Claim first. No row back means another run got here first.
    const { data: claimed, error: claimError } = await db
      .from("checkout_leads")
      .update({ reminded_at: now.toISOString() })
      .eq("checkout_id", row.checkout_id)
      .is("reminded_at", null)
      .select("checkout_id");
    if (claimError || !claimed?.length) continue;

    try {
      const unsubscribe = unsubscribeUrl(row.checkout_id)!;
      const { subject, html } = reminderEmail(row, unsubscribe);
      await resend({
        to: [row.email!.trim()],
        reply_to: primaryRecipient(),
        subject,
        html,
        headers: {
          "List-Unsubscribe": `<${unsubscribe}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });
      emailed.add(email);
      result.sent++;
    } catch (e) {
      console.error("[cart-reminders] send failed", row.checkout_id, e instanceof Error ? e.message : e);
      result.failed++;
      await db.from("checkout_leads").update({ reminded_at: null }).eq("checkout_id", row.checkout_id);
    }
  }
  return result;
}
