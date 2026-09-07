import { NextResponse } from "next/server";
import { submitHubspotForm } from "@/lib/hubspot";
import { placeQuote } from "@/lib/orders";

// Quote request handler. Does two things when configured:
//   1. Emails the team (via Resend) — needs RESEND_API_KEY + QUOTE_FROM_EMAIL.
//   2. Records it in whichever order system is live — see lib/orders. Gated, so
//      test submissions never create junk orders, and separately gated again for
//      the ERP, where a quote in the order book is a commercial question rather
//      than a technical one.
// Every step degrades gracefully: an unconfigured/failed side-effect is logged
// but never blocks the customer's submission.

// `sku` is the Unleashed ProductCode. The ERP now carries sizes the old store
// never listed, so the code is the only identifier that is certain to mean
// something to whoever fulfils the quote.
type QuoteItem = { id: number; name: string; qty: number; price: number; sku?: string };
type QuoteContact = {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  location?: string;
  notes?: string;
};

const aud = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" });
const money = (n: number) => (n > 0 ? aud.format(n) : "POA");

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const { contact, items, subtotal } = (payload ?? {}) as {
    contact?: QuoteContact;
    items?: QuoteItem[];
    subtotal?: number;
  };

  if (!contact?.name || !contact?.email || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Name, email and at least one item are required." },
      { status: 400 }
    );
  }

  const [firstName, ...lastParts] = (contact.name ?? "").split(" ");
  const results = {
    email: await sendEmail(contact, items, subtotal ?? 0).catch((e) => {
      console.error("[quote] email failed", e);
      return "error" as const;
    }),
    order: await placeQuote(contact, items).catch((e) => {
      console.error("[quote] order failed", e);
      return "error" as const;
    }),
    hubspot: await submitHubspotForm(
      process.env.HUBSPOT_FORM_QUOTE,
      [
        { name: "firstname", value: firstName ?? "" },
        { name: "lastname", value: lastParts.join(" ") },
        { name: "email", value: contact.email ?? "" },
        { name: "phone", value: contact.phone ?? "" },
        { name: "company", value: contact.company ?? "" },
        { name: "message", value: `Quote request: ${items.map((i) => `${i.qty}× ${i.name}`).join(", ")}. Subtotal ${subtotal ?? 0}.${contact.notes ? ` Notes: ${contact.notes}` : ""}` },
      ],
      { pageName: "Quote Request" }
    ).catch((e) => {
      console.error("[quote] hubspot failed", e);
      return "error" as const;
    }),
  };

  console.log("[quote] processed", { customer: contact.email, items: items.length, ...results });
  return NextResponse.json({ ok: true, ...results });
}

async function sendEmail(
  contact: QuoteContact,
  items: QuoteItem[],
  subtotal: number
): Promise<"sent" | "skipped"> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.QUOTE_FROM_EMAIL; // e.g. "MasterKraft <quotes@masterkraft.com>"
  const to = process.env.QUOTE_TO_EMAIL || "hello@masterkraft.com";
  if (!apiKey || !from) return "skipped";

  const rows = items
    .map(
      (i) =>
        `<tr><td style="padding:6px 12px 6px 0">${escape(i.name)}${i.sku ? `<br><span style="color:#777;font:12px monospace">${escape(i.sku)}</span>` : ""}</td><td style="padding:6px 0;text-align:center">${i.qty}</td><td style="padding:6px 0;text-align:right">${money(i.price * i.qty)}</td></tr>`
    )
    .join("");

  const html = `
    <h2>New quote request</h2>
    <p><strong>${escape(contact.name ?? "")}</strong>${contact.company ? ` (${escape(contact.company)})` : ""}<br/>
    ${escape(contact.email ?? "")}${contact.phone ? ` · ${escape(contact.phone)}` : ""}<br/>
    ${contact.location ? `Delivery: ${escape(contact.location)}` : ""}</p>
    ${contact.notes ? `<p><em>${escape(contact.notes)}</em></p>` : ""}
    <table style="border-collapse:collapse;margin-top:12px"><tbody>${rows}</tbody></table>
    <p style="margin-top:12px"><strong>Indicative subtotal (inc. GST): ${money(subtotal)}</strong><br/>
    <span style="color:#666">Prices are indicative RRP. Confirm freight and final pricing.</span></p>
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: contact.email,
      subject: `Quote request: ${contact.name}${contact.company ? ` (${contact.company})` : ""}`,
      html,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}`);
  return "sent";
}

function escape(s: string) {
  return s.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c] || c);
}
