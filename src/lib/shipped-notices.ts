// "Your order is on its way": the email the order confirmation promises.
//
// WHY THIS EXISTS, 2026-10-17. The confirmation says "We'll be in touch when it
// ships", and nothing did. SO-00000862 was dispatched on 13 Oct and the customer
// heard nothing; SO-00000873 (a foam roller) was the order that made it obvious.
//
// UNLEASHED IS THE SOURCE because it is the one place every dispatch lands,
// whichever carrier portal booked it (InterParcel, Freight Exchange, Capital
// Transport...). Easyship and Australia Post would each see only their own.
//
// MOST DISPATCHES HAVE NO TRACKING NUMBER. 6 of 58 between mid-August and
// 17 Oct carried one, because the number lives in the carrier portal and is only
// copied across by hand. So a shipment with a number is emailed at once, and one
// without is emailed anyway once it has been dispatched for a while: the promise
// was "we'll be in touch", not "we'll send a number". The team is told which went
// without, so the habit of filling it in can catch up.
//
// EASYSHIP FILLS THE GAP, 2026-10-22. A label bought in Easyship reports its
// number to /api/easyship/webhook, and withLabelTracking() uses it when the
// Unleashed shipment has none. Unleashed still decides WHEN: the email waits
// for the shipment to be marked Dispatched there.
//
// ONE EMAIL PER SHIPMENT, enforced by shipped_notices (see the migration): the
// row is claimed BEFORE sending and released if the send fails, so two
// overlapping runs cannot both email, and a failed send is retried next hour.
//
// THEN A REVIEW REQUEST, once per order, REVIEW_AFTER_DAYS (default 7) after
// dispatch, so it lands after the parcel has. It goes to EVERY website buyer
// with nothing offered for it: asking only the ones you expect to be happy, or
// rewarding a review, is against Google's review policy and the ACCC's
// guidance. It asks once and promotes nothing, so it stays a service follow-up.
// Off until GOOGLE_REVIEW_URL is set to the Business Profile's review link.
//
// OFF UNTIL SHIPPED_EMAILS_FROM IS SET. It is a date, and only shipments
// dispatched on or after it are emailed, so switching this on does not reach
// back and email customers whose parcels arrived weeks ago.
import { adminDb } from "@/lib/admin-db";
import { labelTrackingFor, type LabelTracking } from "@/lib/easyship-webhook";
import { internalRecipients, primaryRecipient } from "@/lib/notify-recipients";
import {
  getSalesOrder,
  getShipmentsModifiedSince,
  type DispatchedShipment,
} from "@/lib/unleashed";

const TIMEOUT_MS = 8000;
/** How far back each run looks. Long enough to ride out a week of failed runs. */
const LOOKBACK_DAYS = 14;
const DEFAULT_WAIT_HOURS = 24;
const DEFAULT_REVIEW_DAYS = 7;

/**
 * A shipment, plus Easyship's tracking page where its label was bought there.
 * The page works for every courier, so it beats a guessed carrier URL.
 */
export type NoticeShipment = DispatchedShipment & { trackingPageUrl?: string | null };

/**
 * Fill in the tracking Unleashed is missing from labels bought in Easyship
 * (easyship-webhook.ts). A number typed into Unleashed wins: someone chose it.
 *
 * A split order has a label per consignment but may be one Unleashed shipment,
 * so every number is given; a single tracking page only when there is one label.
 */
export function withLabelTracking(s: DispatchedShipment, labels: LabelTracking[] | undefined): NoticeShipment {
  if (s.trackingNumber || !labels?.length) return s;
  return {
    ...s,
    trackingNumber: labels.map((l) => l.trackingNumber).join(", "),
    trackingPageUrl: labels.length === 1 ? labels[0].trackingPageUrl : null,
  };
}

export type Decision =
  | { action: "send"; kind: "tracked" | "untracked" }
  | { action: "wait"; reason: string }
  | { action: "ignore"; reason: string };

/** The date from SHIPPED_EMAILS_FROM, or null when the feature is off. */
export function emailsFrom(raw = process.env.SHIPPED_EMAILS_FROM): Date | null {
  const v = raw?.trim();
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function waitHours(raw = process.env.SHIPPED_NO_TRACKING_WAIT_HOURS): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && raw?.trim() ? n : DEFAULT_WAIT_HOURS;
}

export function reviewAfterDays(raw = process.env.REVIEW_AFTER_DAYS): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 && raw?.trim() ? n : DEFAULT_REVIEW_DAYS;
}

/** The Business Profile review link, or null (review requests off). https only. */
export function reviewUrl(raw = process.env.GOOGLE_REVIEW_URL): string | null {
  const v = raw?.trim();
  if (!v) return null;
  try {
    return new URL(v).protocol === "https:" ? v : null;
  } catch {
    return null;
  }
}

/**
 * Whether this shipment's order is due its review request. The once-per-ORDER
 * rule is the table's job (review_requests), not this function's.
 */
export function reviewDue(
  s: DispatchedShipment,
  opts: { webCustomerCode: string; from: Date; now: Date; reviewDays: number }
): boolean {
  if (s.customerCode !== opts.webCustomerCode || s.status !== "Dispatched" || !s.dispatchedAt) return false;
  const dispatched = new Date(s.dispatchedAt);
  if (dispatched.toISOString().slice(0, 10) < opts.from.toISOString().slice(0, 10)) return false;
  return opts.now.getTime() - dispatched.getTime() >= opts.reviewDays * 86_400_000;
}

export function reviewEmail(
  orderNumber: string,
  buyerName: string | null,
  url: string
): { subject: string; html: string } {
  const name = firstName(buyerName);
  const html = `
    <p>${name ? `Hi ${escape(name)},` : "Hi,"}</p>
    <p>Your MasterKraft order <strong>#${escape(orderNumber)}</strong> should have arrived by now. We hope it's all as it should be.</p>
    <p>If you have a minute, we'd really value a review of how we went. It helps other people find us and tells us what to keep doing and what to fix.</p>
    <p><a href="${escape(url)}" style="display:inline-block;padding:10px 18px;background:#111;color:#fff;text-decoration:none;border-radius:4px">Leave a Google review</a></p>
    <p>And if anything isn't right with your order, please reply to this email first so we can sort it out.</p>
    <p>Thanks,<br/>MasterKraft</p>
    <p style="color:#888;font-size:12px">We only ask once per order.</p>
  `;
  return { subject: `How did we go with order #${orderNumber}?`, html };
}

/**
 * What to do with one shipment. Pure, so the rules are tested rather than read.
 *
 * Web orders only: a trade customer's dispatch is the sales team's
 * relationship, and an automated email from the website would be a surprise.
 */
export function decide(
  s: DispatchedShipment,
  opts: { webCustomerCode: string; from: Date; now: Date; waitHours: number }
): Decision {
  if (!s.customerCode || s.customerCode !== opts.webCustomerCode) {
    return { action: "ignore", reason: "not a website order" };
  }
  if (s.status !== "Dispatched") return { action: "wait", reason: `status ${s.status ?? "unknown"}` };
  if (!s.dispatchedAt) return { action: "wait", reason: "no dispatch date" };
  const dispatched = new Date(s.dispatchedAt);
  // DispatchDate is a calendar day at midnight UTC, so compare days, not
  // instants: a parcel sent on the start date must not miss out by hours.
  if (dispatched.toISOString().slice(0, 10) < opts.from.toISOString().slice(0, 10)) {
    return { action: "ignore", reason: "dispatched before SHIPPED_EMAILS_FROM" };
  }
  if (s.trackingNumber) return { action: "send", kind: "tracked" };
  const waited = (opts.now.getTime() - dispatched.getTime()) / 3_600_000;
  if (waited < opts.waitHours) return { action: "wait", reason: "no tracking number yet" };
  return { action: "send", kind: "untracked" };
}

/**
 * A tracking page, where the carrier's URL is known to take the number.
 *
 * Deliberately short. A guessed URL that 404s is worse than none, because the
 * customer then thinks the parcel is lost; without a link they still get the
 * carrier's name and the number to type into its site.
 */
export function trackingUrl(carrier: string | null, number: string | null): string | null {
  if (!number || /\s/.test(number)) return null;
  const c = (carrier ?? "").toLowerCase();
  if (c.includes("australia post") || c.includes("auspost") || c.includes("startrack")) {
    return `https://auspost.com.au/mypost/track/details/${encodeURIComponent(number)}`;
  }
  return null;
}

function escape(s: string) {
  return s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] || c);
}

function firstName(full: string | null): string | null {
  return full?.trim().split(/\s+/)[0] || null;
}

export function shippedEmail(
  s: NoticeShipment,
  buyerName: string | null
): { subject: string; html: string } {
  const name = firstName(buyerName ?? s.deliveryName);
  const cell = "padding:6px 12px 6px 0";
  const rows = s.lines
    .map(
      (l) =>
        `<tr><td style="${cell}">${escape(l.name ?? l.code ?? "Item")}${l.code ? `<br><span style="color:#777;font:12px monospace">${escape(l.code)}</span>` : ""}</td><td style="${cell};text-align:center">${l.qty}</td></tr>`
    )
    .join("");
  const url = s.trackingPageUrl || trackingUrl(s.carrier, s.trackingNumber);
  const number = s.trackingNumber ? escape(s.trackingNumber) : "";
  const tracking = s.trackingNumber
    ? `<p><strong>Tracking:</strong> ${s.carrier ? `${escape(s.carrier)} ` : ""}${url ? `<a href="${url}">${number}</a>` : number}</p>`
    : `<p>${s.carrier ? `It's travelling with ${escape(s.carrier)}. ` : ""}If you'd like a tracking number, just reply to this email and we'll send it through.</p>`;
  const html = `
    <p>${name ? `Hi ${escape(name)},` : "Hi,"}</p>
    <p>Good news: your MasterKraft order <strong>#${escape(s.orderNumber)}</strong> has been dispatched and is on its way.</p>
    ${tracking}
    ${rows ? `<table style="border-collapse:collapse;margin-top:12px"><tbody>${rows}</tbody></table>` : ""}
    ${s.deliverTo ? `<p><strong>Delivering to</strong><br/>${escape(s.deliveryName ?? "")}${s.deliveryName ? "<br/>" : ""}${escape(s.deliverTo)}</p>` : ""}
    <p>If anything isn't right when it arrives, reply to this email and we'll sort it out.</p>
    <p>MasterKraft</p>
  `;
  return { subject: `Your MasterKraft order #${s.orderNumber} is on its way`, html };
}

async function resend(msg: { to: string[]; reply_to?: string; subject: string; html: string }) {
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

export type RunResult = {
  ok: boolean;
  error?: string;
  checked: number;
  sent: { order: string; shipment: string; kind: "tracked" | "untracked" }[];
  reviews: string[];
  waiting: number;
  failed: { order: string; error: string }[];
};

/** One pass: find dispatched web orders, email each shipment once. */
export async function sendShippedNotices(now = new Date()): Promise<RunResult> {
  const empty = { checked: 0, sent: [], reviews: [], waiting: 0, failed: [] };
  const from = emailsFrom();
  if (!from) return { ok: true, error: "SHIPPED_EMAILS_FROM is not set; nothing sent", ...empty };
  const webCustomerCode = process.env.UNLEASHED_WEB_CUSTOMER_CODE?.trim();
  if (!webCustomerCode) return { ok: false, error: "UNLEASHED_WEB_CUSTOMER_CODE is not set", ...empty };
  const db = adminDb();
  if (!db) return { ok: false, error: "Supabase is not configured", ...empty };

  const reviewDays = reviewAfterDays();
  // The review is sent days after dispatch, so the window must reach back past
  // it with room to retry, or a shipment ages out before it is due.
  const lookbackDays = Math.max(LOOKBACK_DAYS, reviewDays + 7);
  const lookback = new Date(now.getTime() - lookbackDays * 86_400_000);
  const since = lookback > from ? lookback : from;
  const fromUnleashed = await getShipmentsModifiedSince(since.toISOString());
  // Easyship's tracking for web orders Unleashed has no number for. A failed
  // lookup costs the number, not the email, so it never stops the run.
  const labels = await labelTrackingFor(
    fromUnleashed.filter((s) => !s.trackingNumber && s.customerCode === webCustomerCode).map((s) => s.orderNumber),
    db
  ).catch((e) => {
    console.error("[shipped-notices] easyship labels lookup failed", e);
    return new Map<string, LabelTracking[]>();
  });
  const shipments = fromUnleashed.map((s) => withLabelTracking(s, labels.get(s.orderNumber)));
  const opts = { webCustomerCode, from, now, waitHours: waitHours() };

  const result: RunResult = { ok: true, checked: shipments.length, sent: [], reviews: [], waiting: 0, failed: [] };
  for (const s of shipments) {
    const d = decide(s, opts);
    if (d.action === "wait") result.waiting++;
    if (d.action !== "send" || !s.shipmentNumber) continue;

    // Claim first. A conflict means an earlier run already emailed it.
    const { data: claimed, error: claimError } = await db
      .from("shipped_notices")
      .upsert(
        { shipment_number: s.shipmentNumber, order_number: s.orderNumber, kind: d.kind, tracking_number: s.trackingNumber, carrier: s.carrier },
        { onConflict: "shipment_number", ignoreDuplicates: true }
      )
      .select("shipment_number");
    if (claimError) {
      result.failed.push({ order: s.orderNumber, error: `claim: ${claimError.message}` });
      continue;
    }
    if (!claimed?.length) continue;

    try {
      const order = await getSalesOrder(s.orderNumber);
      const to = order?.buyer.email;
      if (!to) throw new Error("no buyer email on the sales order");
      const { subject, html } = shippedEmail(s, order?.buyer.name ?? null);
      await resend({ to: [to], reply_to: primaryRecipient(), subject, html });
      await db.from("shipped_notices").update({ email: to, sent_at: new Date().toISOString() }).eq("shipment_number", s.shipmentNumber);
      result.sent.push({ order: s.orderNumber, shipment: s.shipmentNumber, kind: d.kind });
    } catch (e) {
      // Release the claim so the next run tries again.
      await db.from("shipped_notices").delete().eq("shipment_number", s.shipmentNumber);
      result.failed.push({ order: s.orderNumber, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const review = reviewUrl();
  if (review) {
    const due = shipments.filter((s) => reviewDue(s, { webCustomerCode, from, now, reviewDays }));
    for (const orderNumber of new Set(due.map((s) => s.orderNumber))) {
      // Same claim-then-send as above, keyed by ORDER: a split order gets one ask.
      const { data: claimed, error: claimError } = await db
        .from("review_requests")
        .upsert({ order_number: orderNumber }, { onConflict: "order_number", ignoreDuplicates: true })
        .select("order_number");
      if (claimError) {
        result.failed.push({ order: orderNumber, error: `review claim: ${claimError.message}` });
        continue;
      }
      if (!claimed?.length) continue;
      try {
        const order = await getSalesOrder(orderNumber);
        const to = order?.buyer.email;
        if (!to) throw new Error("no buyer email on the sales order");
        const { subject, html } = reviewEmail(orderNumber, order?.buyer.name ?? null, review);
        await resend({ to: [to], reply_to: primaryRecipient(), subject, html });
        await db.from("review_requests").update({ email: to, sent_at: new Date().toISOString() }).eq("order_number", orderNumber);
        result.reviews.push(orderNumber);
      } catch (e) {
        await db.from("review_requests").delete().eq("order_number", orderNumber);
        result.failed.push({ order: orderNumber, error: `review: ${e instanceof Error ? e.message : String(e)}` });
      }
    }
  }

  const untracked = result.sent.filter((x) => x.kind === "untracked");
  if (untracked.length || result.failed.length) {
    await resend({
      to: internalRecipients(),
      subject: `Shipped emails: ${untracked.length} without tracking, ${result.failed.length} failed`,
      html: `
        ${untracked.length ? `<p>These web orders were dispatched with no tracking number in Unleashed, so the customer was told it's on its way and to reply for tracking:</p><ul>${untracked.map((x) => `<li>${escape(x.order)} (${escape(x.shipment)})</li>`).join("")}</ul><p>Next time, buy the label in Easyship (its tracking number is picked up automatically) or paste the carrier's tracking number into the shipment in Unleashed, and it goes out with the email.</p>` : ""}
        ${result.failed.length ? `<p>These could not be emailed and will be retried next hour:</p><ul>${result.failed.map((x) => `<li>${escape(x.order)}: ${escape(x.error)}</li>`).join("")}</ul>` : ""}
      `,
    }).catch((e) => console.error("[shipped-notices] team email failed", e));
  }
  return result;
}
