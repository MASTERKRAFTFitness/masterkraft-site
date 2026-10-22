import { NextResponse } from "next/server";
import { submitHubspotForm } from "@/lib/hubspot";
import { RATE_LIMITED_MESSAGE, checkFormSubmission } from "@/lib/form-guard";
import { internalRecipients } from "@/lib/notify-recipients";
import { scheduleBlockedLog } from "@/lib/blocked-log";
import { visitorKey } from "@/lib/agent/rate-limit";
import {
  BRANDING_OPTIONS,
  NOT_SURE_WINDOW,
  PRODUCT_OPTIONS,
  SITE_OPTIONS,
  STATE_OPTIONS,
} from "@/lib/indie-iron";

// Indie Iron sign-up, from the form on /indie-iron.
//
// Same shape as the Recovery Roller waitlist: the guard, then HubSpot, then the
// team. It differs in one way. Every sign-up is emailed to the team, not only
// when HubSpot fails, because a new member gym is a lead someone should call,
// and the brief asks for Steve and Michael to be told each time.
//
// HUBSPOT_FORM_INDIE_IRON is the GUID of "Website Indie Iron (API)". Until it is
// set, submitHubspotForm returns "skipped" and the team email is the only record,
// so it says so in the email.
//
// OWNER AND LIFECYCLE ARE NOT SET HERE. The Forms API silently drops any field
// the form does not define, and HubSpot's form editor will not put Contact owner
// or Lifecycle Stage on a form at all. Both belong to a HubSpot workflow
// triggered by a submission of this form, the way the website enquiry
// lifecycle workflows already work. Consent is not sent either: this portal has
// no `opt_in_status` property (the waitlist route's copy of it is dropped too).

/** What the window select can send: a round label, "Not sure", or nothing. */
const WINDOW_SHAPE = /^(Founding round|Autumn|Winter|Spring|Summer) \(closes \d{1,2} [A-Z][a-z]{2} \d{4}\)$/;

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type SignUp = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  state: string;
  sites: string;
  window: string;
  products: string[];
  branding: string;
  message: string;
};

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
    console.error("[indie-iron] resend failed", e);
    return "error";
  }
}

function teamNotification(s: SignUp, hubspot: string): string {
  const row = (k: string, v: string) =>
    `<tr><td><strong>${k}</strong></td><td>${escape(v || "-")}</td></tr>`;
  return `<h2>New Indie Iron member: ${escape(s.company)}</h2>
    <table cellpadding="6" style="border-collapse:collapse">
      ${row("Name", `${s.firstName} ${s.lastName}`)}
      ${row("Email", s.email)}
      ${row("Mobile", s.phone)}
      ${row("Gym", s.company)}
      ${row("State", s.state)}
      ${row("Sites", s.sites)}
      ${row("Window", s.window)}
      ${row("Products", s.products.join(", "))}
      ${row("Branding", s.branding)}
      ${row("Anything else", s.message)}
    </table>
    <p>They were promised member pricing and the order form for that window
    <strong>within one business day</strong>.</p>
    ${
      hubspot === "submitted"
        ? `<p style="color:#666">Recorded in HubSpot (Website Indie Iron form).</p>`
        : `<p style="color:#c73e37"><strong>HubSpot did NOT record this (${escape(hubspot)}).</strong>
           Add the contact manually, and check <code>HUBSPOT_FORM_INDIE_IRON</code> is set.</p>`
    }`;
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  const s: SignUp = {
    firstName: str("firstName"),
    lastName: str("lastName"),
    email: str("email"),
    phone: str("phone"),
    company: str("company"),
    state: str("state"),
    sites: str("sites"),
    window: str("window"),
    products: Array.isArray(body.products) ? body.products.map(String) : [],
    branding: str("branding"),
    message: str("message").slice(0, 2000),
  };

  const required = ["firstName", "lastName", "email", "phone", "company", "state"] as const;
  if (required.some((k) => !s[k]) || !s.products.length || body.consent !== true) {
    return NextResponse.json(
      { ok: false, error: "Please complete the required fields and tick the consent box." },
      { status: 400 }
    );
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.email)) {
    return NextResponse.json({ ok: false, error: "Please check your email address." }, { status: 400 });
  }
  // Values the form could not have produced. Keeps the HubSpot enumerations clean.
  const bad =
    !STATE_OPTIONS.includes(s.state) ||
    (s.sites && !SITE_OPTIONS.includes(s.sites)) ||
    (s.window && s.window !== NOT_SURE_WINDOW && !WINDOW_SHAPE.test(s.window)) ||
    (s.branding && !BRANDING_OPTIONS.some((b) => b.value === s.branding)) ||
    s.products.some((p) => !PRODUCT_OPTIONS.includes(p));
  if (bad) {
    return NextResponse.json({ ok: false, error: "Invalid selection." }, { status: 400 });
  }

  const verdict = checkFormSubmission(request, body, {
    form: "indie-iron",
    fields: { firstName: s.firstName, lastName: s.lastName, company: s.company, message: s.message },
  });
  if (!verdict.ok) {
    console.warn("[indie-iron] blocked", { reason: verdict.reason, detail: verdict.detail });
    scheduleBlockedLog({
      form: "indie-iron",
      reason: verdict.reason,
      detail: verdict.detail,
      visitor: visitorKey(request),
      name: `${s.firstName} ${s.lastName}`,
      email: s.email,
      message: s.message || undefined,
    });
    if (verdict.reason === "rate_limit") {
      return NextResponse.json({ ok: false, error: RATE_LIMITED_MESSAGE }, { status: 429 });
    }
    return NextResponse.json({ ok: true, hubspot: "skipped", notified: "skipped" });
  }

  const hubspot = await submitHubspotForm(
    process.env.HUBSPOT_FORM_INDIE_IRON,
    [
      { name: "firstname", value: s.firstName },
      { name: "lastname", value: s.lastName },
      { name: "email", value: s.email },
      { name: "phone", value: s.phone },
      { name: "company", value: s.company },
      { name: "state", value: s.state },
      { name: "indie_iron_sites", value: s.sites },
      { name: "indie_iron_window", value: s.window },
      // Multiple-checkbox properties take their values semicolon-separated.
      { name: "indie_iron_products", value: s.products.join(";") },
      { name: "indie_iron_branding", value: s.branding },
      { name: "message", value: s.message },
      { name: "indie_iron_member", value: "true" },
    ],
    { pageName: "Indie Iron", pageUri: "/indie-iron" }
  ).catch((e) => {
    console.error("[indie-iron] hubspot failed", e);
    return "error" as const;
  });

  const notified = await sendEmail(
    `Indie Iron sign-up: ${s.company} (${s.state})`,
    teamNotification(s, hubspot),
    internalRecipients(),
    s.email
  );

  console.log("[indie-iron] received", { email: s.email, window: s.window, hubspot, notified });

  if (hubspot !== "submitted" && notified !== "sent") {
    console.error("[indie-iron] NOT CAPTURED", { signUp: s, hubspot, notified });
    // "You're in" would be a lie if the sign-up is recorded nowhere.
    return NextResponse.json({ ok: false, error: "We could not record your sign-up." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, hubspot, notified });
}
