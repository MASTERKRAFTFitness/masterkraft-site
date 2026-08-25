import { NextResponse } from "next/server";
import { submitHubspotForm } from "@/lib/hubspot";
import {
  CONTACT_SOURCE,
  NETWORK_OPERATOR_OPTIONS,
  SITE_COUNT_OPTIONS,
  SOURCE_CAMPAIGN,
  TIMEFRAME_OPTIONS,
} from "@/lib/recovery-roller";

// Recovery Roller waitlist.
//
// This list is small and high value, and the page makes two promises in exchange
// for the details: the specification, and pricing, before they go out generally.
// Losing a registration is therefore worse here than on any other form we run.
//
// So it follows the newsletter route's corrected shape rather than the contact
// route's: whenever HubSpot does not CONFIRM it took the submission, the lead is
// emailed to a human instead. `HUBSPOT_FORM_WAITLIST` does not exist yet, and
// with no GUID `submitHubspotForm` returns "skipped" - which is exactly how
// newsletter signups were silently discarded for months.

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Lead = {
  fullName: string;
  email: string;
  phone: string;
  company: string;
  siteCount: string;
  timeframe: string;
};

// HubSpot wants first/last separately. One-word names keep the whole string as
// the first name rather than inventing a surname.
function splitName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return { first: full.trim(), last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

async function sendEmail(subject: string, html: string, to: string): Promise<"sent" | "skipped" | "error"> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.QUOTE_FROM_EMAIL;
  if (!apiKey || !from) return "skipped";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}`);
    return "sent";
  } catch (e) {
    console.error("[waitlist] resend failed", e);
    return "error";
  }
}

/** Last resort so a registration is never silently discarded. */
function internalNotification(lead: Lead, why: string): string {
  const network = NETWORK_OPERATOR_OPTIONS.has(lead.siteCount);
  return `<h2>Recovery Roller waitlist${network ? " - NETWORK OPERATOR" : ""}</h2>
    <table cellpadding="6" style="border-collapse:collapse">
      <tr><td><strong>Name</strong></td><td>${escape(lead.fullName)}</td></tr>
      <tr><td><strong>Email</strong></td><td>${escape(lead.email)}</td></tr>
      <tr><td><strong>Mobile</strong></td><td>${escape(lead.phone)}</td></tr>
      <tr><td><strong>Gym or business</strong></td><td>${escape(lead.company)}</td></tr>
      <tr><td><strong>Sites</strong></td><td>${escape(lead.siteCount)}</td></tr>
      <tr><td><strong>Timeframe</strong></td><td>${escape(lead.timeframe)}</td></tr>
    </table>
    ${network ? `<p style="color:#c73e37"><strong>This is a network operator, not a single
      independent. Route to a person rather than the follow-up list.</strong></p>` : ""}
    <p style="color:#666">This arrived by email because HubSpot did not record it
    (${escape(why)}). Add the contact manually, and check <code>HUBSPOT_FORM_WAITLIST</code>
    is set.</p>`;
}

/** The confirmation the page promises. Sets the expectation honestly: no date. */
function confirmation(firstName: string): string {
  return `<p>Hi ${escape(firstName)},</p>
    <p>Thanks for registering. You are on the list.</p>
    <p>Here is what happens next. The full specification goes out the day it is
    finalised, and pricing follows. You will get both before they go out generally.</p>
    <p>In the meantime, if you want to talk about where a recovery offer fits on your
    floor, just reply to this email and it comes straight to us.</p>
    <p>Steve Callanan<br>Managing Director, MasterKraft<br>
    <em>Engineered for Fitness.</em></p>`;
}

export async function POST(request: Request) {
  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const lead: Lead = {
    fullName: (body.fullName ?? "").trim(),
    email: (body.email ?? "").trim(),
    phone: (body.phone ?? "").trim(),
    company: (body.company ?? "").trim(),
    siteCount: (body.siteCount ?? "").trim(),
    timeframe: (body.timeframe ?? "").trim(),
  };

  // Every field on the form is required, and consent is not optional.
  const missing = Object.entries(lead).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length || !body.consent) {
    return NextResponse.json(
      { ok: false, error: "Please complete every field and tick the consent box." },
      { status: 400 }
    );
  }
  // Reject values the form could not have produced, so the select options and
  // the HubSpot property remain in step.
  if (!SITE_COUNT_OPTIONS.includes(lead.siteCount) || !TIMEFRAME_OPTIONS.includes(lead.timeframe)) {
    return NextResponse.json({ ok: false, error: "Invalid selection." }, { status: 400 });
  }

  const { first, last } = splitName(lead.fullName);

  const hubspot = await submitHubspotForm(
    process.env.HUBSPOT_FORM_WAITLIST,
    [
      { name: "firstname", value: first },
      { name: "lastname", value: last },
      { name: "email", value: lead.email },
      { name: "phone", value: lead.phone },
      { name: "company", value: lead.company },
      { name: "site_count", value: lead.siteCount },
      { name: "purchase_timeframe", value: lead.timeframe },
      { name: "opt_in_status", value: "true" },
      { name: "contact_source", value: CONTACT_SOURCE },
      { name: "source_campaign", value: SOURCE_CAMPAIGN },
    ],
    { pageName: "Recovery Roller Waitlist", pageUri: "/recovery-roller" }
  ).catch((e) => {
    console.error("[waitlist] hubspot failed", e);
    return "error" as const;
  });

  const to = process.env.QUOTE_TO_EMAIL || "hello@masterkraft.com";
  const fallback =
    hubspot === "submitted"
      ? "not_needed"
      : await sendEmail(
          `Recovery Roller waitlist: ${lead.fullName} (${lead.company})`,
          internalNotification(lead, hubspot),
          to
        );

  // The confirmation is a promise the page made, so it is sent regardless of
  // where the lead was recorded. Its failure must not fail the registration.
  const confirmed = await sendEmail(
    "You are on the list for the Recovery Roller",
    confirmation(first),
    lead.email
  );

  console.log("[waitlist] received", {
    email: lead.email,
    siteCount: lead.siteCount,
    hubspot,
    fallback,
    confirmed,
  });

  if (hubspot !== "submitted" && fallback !== "sent") {
    console.error("[waitlist] NOT CAPTURED", { lead, hubspot, fallback });
    // Unlike a newsletter address, this person handed over a phone number in
    // exchange for a promise. If we have not captured it anywhere, saying "you
    // are on the list" would be a lie, so tell them to email us instead.
    return NextResponse.json(
      { ok: false, error: "We could not record your registration." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, hubspot, fallback, confirmed });
}
