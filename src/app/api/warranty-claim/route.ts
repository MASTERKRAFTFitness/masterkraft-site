import { NextResponse } from "next/server";
import { submitHubspotForm } from "@/lib/hubspot";

// Warranty claims.
//
// This follows the waitlist route's shape, NOT the contact route's. A contact
// enquiry that goes missing costs a lead; a warranty claim that goes missing is
// a customer with broken equipment who believes they have lodged it and is
// waiting on us. So whenever HubSpot does not CONFIRM it took the submission,
// the claim is emailed to a human instead, and if neither lands we say so on
// screen rather than showing a receipt we cannot honour.
//
// HUBSPOT_FORM_WARRANTY does not exist yet. With no GUID `submitHubspotForm`
// returns "skipped", which is exactly the case the email fallback covers, so
// the form is safe to ship before the HubSpot side is built.

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Claim = {
  fullName: string;
  email: string;
  phone: string;
  company: string;
  product: string;
  sku: string;
  orderRef: string;
  purchaseDate: string;
  fault: string;
};

function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return { first: full.trim(), last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

async function sendEmail(
  subject: string,
  html: string,
  to: string,
  replyTo?: string
): Promise<"sent" | "skipped" | "error"> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.QUOTE_FROM_EMAIL;
  if (!apiKey || !from) return "skipped";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}`);
    return "sent";
  } catch (e) {
    console.error("[warranty] resend failed", e);
    return "error";
  }
}

function internalNotification(c: Claim, why: string): string {
  return `<h2>Warranty claim</h2>
    <table cellpadding="6" style="border-collapse:collapse">
      <tr><td><strong>Name</strong></td><td>${escape(c.fullName)}</td></tr>
      <tr><td><strong>Email</strong></td><td>${escape(c.email)}</td></tr>
      <tr><td><strong>Phone</strong></td><td>${escape(c.phone)}</td></tr>
      <tr><td><strong>Gym or business</strong></td><td>${escape(c.company) || "-"}</td></tr>
      <tr><td><strong>Product</strong></td><td>${escape(c.product)}</td></tr>
      <tr><td><strong>Product code</strong></td><td>${escape(c.sku) || "-"}</td></tr>
      <tr><td><strong>Order reference</strong></td><td>${escape(c.orderRef) || "-"}</td></tr>
      <tr><td><strong>Purchase date</strong></td><td>${escape(c.purchaseDate) || "-"}</td></tr>
    </table>
    <h3>Reported fault</h3>
    <p style="white-space:pre-wrap">${escape(c.fault)}</p>
    <p style="color:#666">This arrived by email because HubSpot did not record it
    (${escape(why)}). Log it manually, and check <code>HUBSPOT_FORM_WARRANTY</code> is set.</p>`;
}

function confirmation(firstName: string, c: Claim): string {
  return `<p>Hi ${escape(firstName)},</p>
    <p>We have received your warranty claim and it is with our team.</p>
    <table cellpadding="6" style="border-collapse:collapse">
      <tr><td><strong>Product</strong></td><td>${escape(c.product)}</td></tr>
      ${c.sku ? `<tr><td><strong>Product code</strong></td><td>${escape(c.sku)}</td></tr>` : ""}
      ${c.orderRef ? `<tr><td><strong>Order reference</strong></td><td>${escape(c.orderRef)}</td></tr>` : ""}
    </table>
    <p>What happens next: we will review the fault against the warranty terms and come
    back to you. If we need photographs or more detail to assess it, we will ask.</p>
    <p>If anything changes in the meantime, or you have images to send, just reply to
    this email and it comes straight to us.</p>
    <p>MasterKraft<br><em>Engineered for Fitness.</em></p>`;
}

export async function POST(request: Request) {
  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const claim: Claim = {
    fullName: (body.fullName ?? "").trim(),
    email: (body.email ?? "").trim(),
    phone: (body.phone ?? "").trim(),
    company: (body.company ?? "").trim(),
    product: (body.product ?? "").trim(),
    sku: (body.sku ?? "").trim(),
    orderRef: (body.orderRef ?? "").trim(),
    purchaseDate: (body.purchaseDate ?? "").trim(),
    fault: (body.fault ?? "").trim(),
  };

  // Company, product code, order reference and purchase date are genuinely
  // optional: a claim should never be blocked because someone cannot find their
  // paperwork. Everything needed to identify and contact them is required.
  const required: (keyof Claim)[] = ["fullName", "email", "phone", "product", "fault"];
  const missing = required.filter((k) => !claim[k]);
  if (missing.length) {
    return NextResponse.json(
      { ok: false, error: "Please complete your details, the product and the fault." },
      { status: 400 }
    );
  }

  const { first, last } = splitName(claim.fullName);

  const hubspot = await submitHubspotForm(
    process.env.HUBSPOT_FORM_WARRANTY,
    [
      { name: "firstname", value: first },
      { name: "lastname", value: last },
      { name: "email", value: claim.email },
      { name: "phone", value: claim.phone },
      { name: "company", value: claim.company },
      { name: "enquiry_type", value: "Warranty claim" },
      {
        name: "message",
        value:
          `Product: ${claim.product}\nCode: ${claim.sku || "-"}\n` +
          `Order ref: ${claim.orderRef || "-"}\nPurchased: ${claim.purchaseDate || "-"}\n\n${claim.fault}`,
      },
    ],
    { pageName: "Warranty Claim", pageUri: "/warranty" }
  ).catch((e) => {
    console.error("[warranty] hubspot failed", e);
    return "error" as const;
  });

  const to = process.env.QUOTE_TO_EMAIL || "hello@masterkraft.com";
  const fallback =
    hubspot === "submitted"
      ? "not_needed"
      : await sendEmail(
          `Warranty claim: ${claim.fullName} - ${claim.product}`,
          internalNotification(claim, hubspot),
          to,
          claim.email
        );

  // Sent regardless of where the claim was recorded; its failure must not fail
  // the claim itself.
  const confirmed = await sendEmail(
    "We have received your warranty claim",
    confirmation(first, claim),
    claim.email
  );

  console.log("[warranty] received", { email: claim.email, product: claim.product, hubspot, fallback, confirmed });

  if (hubspot !== "submitted" && fallback !== "sent") {
    console.error("[warranty] NOT CAPTURED", { claim, hubspot, fallback });
    return NextResponse.json(
      {
        ok: false,
        error:
          "We could not lodge your claim just now. Please email hello@masterkraft.com with your " +
          "product and the fault, and we will pick it up from there.",
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, hubspot, confirmed });
}
