import { NextResponse } from "next/server";
import { submitHubspotForm } from "@/lib/hubspot";

// Newsletter signups.
//
// HubSpot is the intended home for these, but it is NOT the only one. Unlike the
// contact and quote forms, this route used to talk to HubSpot and nothing else,
// so with `HUBSPOT_FORM_NEWSLETTER` unset - which it has been - every signup
// returned a cheerful `ok: true` to the subscriber and went nowhere but a log
// line. An address someone typed in is not something to lose because a form GUID
// was missing.
//
// So: whenever HubSpot does not confirm it took the submission, we email it
// instead. Same Resend credentials the quote form already uses.

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Last resort so a signup is never silently discarded. */
async function emailFallback(email: string, why: string): Promise<"sent" | "skipped" | "error"> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.QUOTE_FROM_EMAIL;
  const to = process.env.QUOTE_TO_EMAIL || "hello@masterkraft.com";
  if (!apiKey || !from) return "skipped";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `Newsletter signup: ${email}`,
        html: `<h2>Newsletter signup</h2>
          <p><strong>${escape(email)}</strong></p>
          <p style="color:#666">This arrived by email because HubSpot did not record it
          (${escape(why)}). Add the address to the list manually, and check
          <code>HUBSPOT_FORM_NEWSLETTER</code> is set.</p>`,
      }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}`);
    return "sent";
  } catch (e) {
    console.error("[newsletter] resend fallback failed", e);
    return "error";
  }
}

export async function POST(request: Request) {
  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const email = body.email;
  if (!email) {
    return NextResponse.json({ ok: false, error: "Email is required." }, { status: 400 });
  }

  const hubspot = await submitHubspotForm(
    process.env.HUBSPOT_FORM_NEWSLETTER,
    [{ name: "email", value: email }],
    { pageName: "Newsletter" }
  ).catch((e) => {
    console.error("[newsletter] hubspot failed", e);
    return "error" as const;
  });

  // "skipped" means no form GUID is configured; "error" means HubSpot rejected it.
  // Either way the address is not in HubSpot, so send it somewhere a human looks.
  const fallback = hubspot === "submitted" ? "not_needed" : await emailFallback(email, hubspot);

  console.log("[newsletter] received", { email, hubspot, fallback });

  // Still 200 to the subscriber: they typed a valid address and we have it. If
  // BOTH paths failed there is nothing they can do about it, but it must be
  // visible in the logs rather than presented as success in our own telemetry.
  if (hubspot !== "submitted" && fallback !== "sent") {
    console.error("[newsletter] NOT CAPTURED", { email, hubspot, fallback });
  }
  return NextResponse.json({ ok: true, hubspot, fallback });
}
