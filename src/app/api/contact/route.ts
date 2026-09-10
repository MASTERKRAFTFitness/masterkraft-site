import { NextResponse } from "next/server";
import { submitHubspotForm } from "@/lib/hubspot";
import { RATE_LIMITED_MESSAGE, checkFormSubmission } from "@/lib/form-guard";

export async function POST(request: Request) {
  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  const { firstName, lastName, email, phone, company, topic, message } = body;
  if (!email || !message) {
    return NextResponse.json({ ok: false, error: "Email and message are required." }, { status: 400 });
  }

  // Bot filter. Quieter than the warranty form only because this route does not
  // email anyone - the junk lands in HubSpot instead, where it is someone's job
  // to clear out rather than the MD's inbox.
  const verdict = checkFormSubmission(request, body, {
    form: "contact",
    fields: {
      firstName: firstName ?? "",
      lastName: lastName ?? "",
      company: company ?? "",
      message: message ?? "",
    },
  });
  if (!verdict.ok) {
    console.warn("[contact] blocked", { reason: verdict.reason, detail: verdict.detail });
    if (verdict.reason === "rate_limit") {
      return NextResponse.json({ ok: false, error: RATE_LIMITED_MESSAGE }, { status: 429 });
    }
    return NextResponse.json({ ok: true, hubspot: "skipped" });
  }

  const hubspot = await submitHubspotForm(
    process.env.HUBSPOT_FORM_CONTACT,
    [
      { name: "firstname", value: firstName ?? "" },
      { name: "lastname", value: lastName ?? "" },
      { name: "email", value: email },
      { name: "phone", value: phone ?? "" },
      { name: "company", value: company ?? "" },
      { name: "enquiry_type", value: topic || "Something else" },
      { name: "message", value: message },
    ],
    { pageName: "Contact" }
  ).catch((e) => {
    console.error("[contact] hubspot failed", e);
    return "error" as const;
  });

  console.log("[contact] received", { email, hubspot });
  return NextResponse.json({ ok: true, hubspot });
}
