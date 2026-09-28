// What happens after a card order exists: the customer's confirmation email,
// the team's "new web order" email, and the buyer as a HubSpot contact.
//
// Until 2026-09-28 none of this existed. The checkout told the customer "you'll
// get a confirmation email shortly" and nothing sent one, and a paying customer
// never reached HubSpot, while a quote request did. Found by a test order on
// production that took real money and left no trace outside Stripe and the ERP.
//
// NONE OF THIS MAY FAIL AN ORDER. By the time it runs the card is charged and
// the order is written, so every step is caught, logged and reported as a
// result, never thrown. A slow Resend or HubSpot is cut off by a timeout rather
// than holding a paid customer's confirmation screen.
import type { OrderAddress, OrderLine } from "@/lib/order-lines";
import { internalRecipients, primaryRecipient } from "@/lib/notify-recipients";
import { submitHubspotForm } from "@/lib/hubspot";

export type PlacedOrderNotice = {
  orderNumber: string;
  billing: OrderAddress;
  shipping?: OrderAddress;
  lines: OrderLine[];
  freight: { amount: number; service?: string; carrier?: string };
  chargedTotal: number;
  customerNote?: string;
};

type StepResult = "sent" | "skipped" | "error";

const TIMEOUT_MS = 8000;
const aud = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });

export async function notifyOrderPlaced(order: PlacedOrderNotice): Promise<{
  customerEmail: StepResult;
  teamEmail: StepResult;
  hubspot: StepResult;
}> {
  const [customerEmail, teamEmail, hubspot] = await Promise.all([
    guard("customer email", () => sendCustomerEmail(order)),
    guard("team email", () => sendTeamEmail(order)),
    guard("hubspot", () => submitOrderToHubspot(order)),
  ]);
  return { customerEmail, teamEmail, hubspot };
}

async function guard(step: string, fn: () => Promise<"sent" | "skipped">): Promise<StepResult> {
  try {
    return await fn();
  } catch (e) {
    console.error(`[order-notify] ${step} failed`, e);
    return "error";
  }
}

// ---------------------------------------------------------------------------

async function sendCustomerEmail(o: PlacedOrderNotice): Promise<"sent" | "skipped"> {
  const to = o.billing.email;
  if (!to) return "skipped";
  const name = o.billing.first_name?.trim();
  const html = `
    <p>${name ? `Hi ${escape(name)},` : "Hi,"}</p>
    <p>Thanks for your order with MasterKraft. We've received your payment and your order
    <strong>#${escape(o.orderNumber)}</strong> is being prepared.</p>
    ${orderTable(o)}
    ${addressBlock("Delivering to", o.shipping?.address_1 ? o.shipping : o.billing)}
    <p>We'll be in touch when it ships. If anything looks wrong, just reply to this email.</p>
    <p>MasterKraft</p>
  `;
  return resend({
    to: [to],
    reply_to: primaryRecipient(),
    subject: `Your MasterKraft order #${o.orderNumber}`,
    html,
  });
}

async function sendTeamEmail(o: PlacedOrderNotice): Promise<"sent" | "skipped"> {
  const b = o.billing;
  const html = `
    <h2>New web order #${escape(o.orderNumber)}</h2>
    <p><strong>${escape(fullName(b))}</strong>${b.company ? ` (${escape(b.company)})` : ""}<br/>
    ${escape(b.email ?? "")}${b.phone ? ` · ${escape(b.phone)}` : ""}</p>
    ${o.customerNote ? `<p><em>${escape(o.customerNote)}</em></p>` : ""}
    ${orderTable(o)}
    ${addressBlock("Ship to", o.shipping?.address_1 ? o.shipping : b)}
    <p style="color:#666">Paid by card through Stripe. The sales order is in Unleashed.</p>
  `;
  return resend({
    to: internalRecipients(),
    reply_to: b.email,
    subject: `Web order #${o.orderNumber}: ${fullName(b) || b.email} (${aud.format(o.chargedTotal)})`,
    html,
  });
}

// HubSpot's "Website Order (API)" form, built for this on 2026-09-28. It holds
// exactly these five fields, so company rides in the message rather than as a
// field the form does not define. NOT the quote form as a fallback: in HubSpot
// that is a club fit-out form with no email field, so it cannot make a contact.
async function submitOrderToHubspot(o: PlacedOrderNotice): Promise<"sent" | "skipped"> {
  const b = o.billing;
  const items = o.lines.map((l) => `${l.quantity}× ${l.name}`).join(", ");
  const r = await submitHubspotForm(
    process.env.HUBSPOT_FORM_ORDER,
    [
      { name: "firstname", value: b.first_name ?? "" },
      { name: "lastname", value: b.last_name ?? "" },
      { name: "email", value: b.email ?? "" },
      { name: "phone", value: b.phone ?? "" },
      {
        name: "message",
        value:
          `Web order #${o.orderNumber} (paid ${aud.format(o.chargedTotal)}): ${items}.` +
          (b.company ? ` Company: ${b.company}.` : ""),
      },
    ],
    { pageName: "Web Order" },
  );
  return r === "submitted" ? "sent" : "skipped";
}

// ---------------------------------------------------------------------------

async function resend(msg: {
  to: string[];
  reply_to?: string;
  subject: string;
  html: string;
}): Promise<"sent" | "skipped"> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.QUOTE_FROM_EMAIL;
  if (!apiKey || !from || msg.to.length === 0) return "skipped";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, ...msg }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}`);
  return "sent";
}

function orderTable(o: PlacedOrderNotice): string {
  const cell = "padding:6px 12px 6px 0";
  const rows = o.lines
    .map(
      (l) =>
        `<tr><td style="${cell}">${escape(l.name)}${l.sku ? `<br><span style="color:#777;font:12px monospace">${escape(l.sku)}</span>` : ""}</td><td style="${cell};text-align:center">${l.quantity}</td><td style="padding:6px 0;text-align:right">${aud.format(l.unitPrice * l.quantity)}</td></tr>`
    )
    .join("");
  const freightLabel = [o.freight.carrier, o.freight.service].filter(Boolean).join(" ") || "Freight";
  const freightRow =
    o.freight.amount > 0
      ? `<tr><td style="${cell}">${escape(freightLabel)}</td><td></td><td style="padding:6px 0;text-align:right">${aud.format(o.freight.amount)}</td></tr>`
      : "";
  return `
    <table style="border-collapse:collapse;margin-top:12px"><tbody>${rows}${freightRow}
    <tr><td style="${cell}"><strong>Total paid (inc. GST)</strong></td><td></td><td style="padding:6px 0;text-align:right"><strong>${aud.format(o.chargedTotal)}</strong></td></tr>
    </tbody></table>`;
}

function addressBlock(label: string, a: OrderAddress): string {
  const parts = [
    fullName(a),
    a.company,
    a.address_1,
    [a.city, a.state, a.postcode].filter(Boolean).join(" "),
  ].filter((p): p is string => Boolean(p && p.trim()));
  if (parts.length === 0) return "";
  return `<p><strong>${label}</strong><br/>${parts.map(escape).join("<br/>")}</p>`;
}

function fullName(a: OrderAddress): string {
  return [a.first_name, a.last_name].filter(Boolean).join(" ").trim();
}

function escape(s: string) {
  return s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] || c);
}
