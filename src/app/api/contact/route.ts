import { NextResponse } from "next/server";
import { submitHubspotForm } from "@/lib/hubspot";
import { RATE_LIMITED_MESSAGE, checkFormSubmission } from "@/lib/form-guard";
import { ENQUIRY_TOPICS, hubspotEnquiryType, toEnquiryKind } from "@/lib/enquiry-type";
import { internalRecipients } from "@/lib/notify-recipients";

// The general enquiry form on /contact/enquiry.
//
// THIS ROUTE NOW EMAILS, AND ON EVERY ACCEPTED SUBMISSION.
//
// It used to be the only public form on the site that notified nobody: the lead
// went to HubSpot and stopped there, and whether anyone saw it depended on
// someone remembering to open the portal. On 11 September that cost us a real
// question about functional trainer dimensions - a lead who wanted a measurement
// before buying, sitting unread in the CRM because no inbox was ever told.
//
// So this follows the fitout brief's shape rather than the newsletter's: the
// email is NOT a fallback for when HubSpot fails, it is the notification, and it
// sends whether HubSpot took the lead or not. HubSpot remains the system of
// record; email is how a human finds out in time to reply the same day.
//
// Reply-To is the enquirer, so answering is a reply rather than a copy-paste.
// Who receives it is `QUOTE_TO_EMAIL` - a list, see lib/notify-recipients.ts -
// so adding or removing someone is an env change, not a deploy.

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The prose version of the topic, for a subject line a person reads.
 *
 * The wire carries a slug (`equipment`, `fitout`), which is right for HubSpot
 * and wrong for an inbox. A blank topic is possible - the select ships with no
 * option chosen - and reads better as "General enquiry" than as the catch-all
 * option's own label.
 */
function topicLabel(raw: string | null | undefined): string {
  if (!(raw ?? "").trim()) return "General enquiry";
  const kind = toEnquiryKind(raw);
  return ENQUIRY_TOPICS.find((t) => t.value === kind)?.label ?? "General enquiry";
}

async function sendEmail(
  subject: string,
  html: string,
  to: string[],
  replyTo?: string
): Promise<"sent" | "skipped" | "error"> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.QUOTE_FROM_EMAIL;
  if (!apiKey || !from) return "skipped";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}`);
    return "sent";
  } catch (e) {
    console.error("[contact] resend failed", e);
    return "error";
  }
}

type Enquiry = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  topic: string;
  message: string;
};

/**
 * The notification.
 *
 * Contact details first and big, because the whole point of this email is that
 * someone can act on it from the notification alone - on a phone, without
 * opening HubSpot. The message is last and unescaped-newline-preserving, since
 * that is the part worth reading in full.
 */
function internalNotification(e: Enquiry, hubspot: string): string {
  const name = [e.firstName, e.lastName].filter(Boolean).join(" ");
  return `<h2>Enquiry — ${escape(topicLabel(e.topic))}</h2>
    <p style="font-size:15px">
      <strong>${escape(name) || "No name"}</strong>${e.company ? ` — ${escape(e.company)}` : ""}<br>
      <a href="mailto:${escape(e.email)}">${escape(e.email)}</a>${
        e.phone ? ` · <a href="tel:${escape(e.phone)}">${escape(e.phone)}</a>` : ""
      }
    </p>
    <h3>What they asked</h3>
    <p style="white-space:pre-wrap;font-size:15px">${escape(e.message)}</p>
    <p style="color:#666">Reply to this email and it goes to them directly.
    HubSpot: ${escape(hubspot)}.</p>`;
}

export async function POST(request: Request) {
  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const enquiry: Enquiry = {
    firstName: (body.firstName ?? "").trim(),
    lastName: (body.lastName ?? "").trim(),
    email: (body.email ?? "").trim(),
    phone: (body.phone ?? "").trim(),
    company: (body.company ?? "").trim(),
    topic: (body.topic ?? "").trim(),
    message: (body.message ?? "").trim(),
  };

  if (!enquiry.email || !enquiry.message) {
    return NextResponse.json({ ok: false, error: "Email and message are required." }, { status: 400 });
  }

  // Bot filter. This route now emails a human on every submission, so the guard
  // is doing the same job here that it does on the warranty form: keeping a
  // form-filler out of somebody's inbox rather than merely out of the CRM.
  const verdict = checkFormSubmission(request, body, {
    form: "contact",
    fields: {
      firstName: enquiry.firstName,
      lastName: enquiry.lastName,
      company: enquiry.company,
      message: enquiry.message,
    },
  });
  if (!verdict.ok) {
    console.warn("[contact] blocked", { reason: verdict.reason, detail: verdict.detail });
    if (verdict.reason === "rate_limit") {
      return NextResponse.json({ ok: false, error: RATE_LIMITED_MESSAGE }, { status: 429 });
    }
    // The ordinary success shape, and nothing sent anywhere. A bot that thinks it
    // succeeded moves on; one that is told what tripped it tunes around it.
    return NextResponse.json({ ok: true, hubspot: "skipped", notified: "skipped" });
  }

  const hubspot = await submitHubspotForm(
    process.env.HUBSPOT_FORM_CONTACT,
    [
      { name: "firstname", value: enquiry.firstName },
      { name: "lastname", value: enquiry.lastName },
      { name: "email", value: enquiry.email },
      { name: "phone", value: enquiry.phone },
      { name: "company", value: enquiry.company },
      { name: "enquiry_type", value: hubspotEnquiryType(enquiry.topic) },
      { name: "message", value: enquiry.message },
    ],
    { pageName: "Contact" }
  ).catch((e) => {
    console.error("[contact] hubspot failed", e);
    return "error" as const;
  });

  // Sent after HubSpot, not alongside it, so the notification can say whether the
  // lead is in the CRM. Whoever reads it then knows if it needs adding by hand.
  const subject = `Enquiry: ${[enquiry.firstName, enquiry.lastName].filter(Boolean).join(" ") || enquiry.email}${
    enquiry.company ? ` (${enquiry.company})` : ""
  } — ${topicLabel(enquiry.topic)}`;
  const notified = await sendEmail(
    subject,
    internalNotification(enquiry, hubspot),
    internalRecipients(),
    enquiry.email
  );

  console.log("[contact] received", { email: enquiry.email, hubspot, notified });

  // Still 200 to the visitor either way: they typed a real enquiry and there is
  // nothing they can do about our plumbing. But if BOTH destinations failed, the
  // enquiry reached nobody, and that must be loud in the logs rather than
  // recorded as a success in our own telemetry.
  if (hubspot !== "submitted" && notified !== "sent") {
    console.error("[contact] NOT CAPTURED", { email: enquiry.email, hubspot, notified });
  }
  return NextResponse.json({ ok: true, hubspot, notified });
}
