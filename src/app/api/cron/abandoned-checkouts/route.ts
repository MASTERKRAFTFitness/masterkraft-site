// Abandoned checkouts, emailed to the team for a person to follow up.
//
// Schedule: vercel.json, every 30 minutes.
// Data:     lib/checkout-leads.ts, written by the checkout routes.
//
// WHY A PERSON AND NOT AN AUTOMATED EMAIL TO THE CUSTOMER. A recovery email to
// the shopper is a commercial message under the Spam Act, and a checkout is not
// consent to receive one. A phone call or a one-off reply from the team about
// the order they were placing is ordinary customer service, and for $200-$5,000
// gym equipment it is also the better recovery: the usual reason for leaving is
// a question about freight or fit that a person can answer.
//
// One email per checkout, once (notified_at). A checkout that comes back and
// re-quotes clears notified_at and is eligible again - see the migration.
import { NextResponse } from "next/server";
import {
  abandonedCheckoutLeads,
  markCheckoutLeadNotified,
  type CheckoutLeadRow,
} from "@/lib/checkout-leads";
import { internalRecipients } from "@/lib/notify-recipients";

export const dynamic = "force-dynamic";

const aud = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });

/** FAIL CLOSED, same as cron/erp-mirror: no CRON_SECRET, no run. */
function authorised(req: Request): { ok: true } | { ok: false; status: number; why: string } {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, status: 503, why: "CRON_SECRET is not set on this deployment." };
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return { ok: false, status: 401, why: "Unauthorised." };
  }
  return { ok: true };
}

function escape(s: string) {
  return s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] || c);
}

const STAGE: Record<string, string> = {
  quoted: "saw the freight price and left before payment",
  payment_started: "reached the card screen and did not pay",
};

function abandonedEmailHtml(row: CheckoutLeadRow): string {
  const items = (row.items ?? [])
    .map(
      (i) =>
        `<tr><td style="padding:4px 12px 4px 0">${escape(i.name)}${i.sku ? ` <span style="color:#777;font:12px monospace">${escape(i.sku)}</span>` : ""}</td><td style="padding:4px 12px;text-align:center">${i.qty}</td><td style="padding:4px 0;text-align:right">${aud.format(i.price * i.qty)}</td></tr>`
    )
    .join("");
  const freight =
    row.freight_price != null
      ? `${aud.format(row.freight_price)}${row.freight_label ? ` (${escape(row.freight_label)})` : ""}`
      : `could not be priced automatically${row.freight_reason ? ` (${escape(row.freight_reason)})` : ""}`;
  const where = [row.suburb, row.state, row.postcode].filter(Boolean).join(" ");
  return `
    <h2>Abandoned checkout</h2>
    <p>This customer ${STAGE[row.status] ?? "left the checkout"}. Worth a call or a personal reply.</p>
    <p><strong>${escape(row.name ?? "")}</strong>${row.company ? ` (${escape(row.company)})` : ""}<br/>
    ${escape(row.email ?? "")}${row.phone ? ` · ${escape(row.phone)}` : ""}<br/>
    ${where ? `Delivery: ${escape(where)}` : ""}</p>
    <table style="border-collapse:collapse;margin-top:12px"><tbody>${items}</tbody></table>
    <p style="margin-top:12px">Subtotal (inc. GST): <strong>${row.subtotal != null ? aud.format(row.subtotal) : "?"}</strong><br/>
    Freight shown: <strong>${freight}</strong></p>
    <p style="color:#666;font-size:12px">Last active ${new Date(row.updated_at).toLocaleString("en-AU", { timeZone: "Australia/Melbourne" })}.
    Prices are what their cart showed. Please contact them one-to-one about this order only, not to add them to marketing.</p>
  `;
}

async function send(row: CheckoutLeadRow, apiKey: string, from: string): Promise<boolean> {
  const value = row.subtotal != null ? ` ${aud.format(row.subtotal)}` : "";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: internalRecipients(),
      reply_to: row.email ?? undefined,
      subject: `Abandoned checkout:${value} - ${row.name || row.email}`,
      html: abandonedEmailHtml(row),
    }),
  });
  if (!res.ok) console.error("[cron/abandoned-checkouts] resend", res.status, await res.text().catch(() => ""));
  return res.ok;
}

export async function GET(req: Request) {
  const auth = authorised(req);
  if (!auth.ok) {
    console.warn(`[cron/abandoned-checkouts] refused: ${auth.why}`);
    return NextResponse.json({ ok: false, error: auth.why }, { status: auth.status });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.QUOTE_FROM_EMAIL;
  if (!apiKey || !from) {
    // Leave the rows un-notified so they go out once email is configured.
    console.error("[cron/abandoned-checkouts] RESEND_API_KEY / QUOTE_FROM_EMAIL not set; nothing sent");
    return NextResponse.json({ ok: false, error: "email not configured" }, { status: 503 });
  }

  const rows = await abandonedCheckoutLeads();
  let sent = 0;
  for (const row of rows) {
    if (await send(row, apiKey, from)) {
      await markCheckoutLeadNotified(row.checkout_id);
      sent++;
    }
  }
  console.log(`[cron/abandoned-checkouts] ${rows.length} abandoned, ${sent} emailed`);
  return NextResponse.json({ ok: true, abandoned: rows.length, emailed: sent });
}
