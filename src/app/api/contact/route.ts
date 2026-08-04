import { NextResponse } from "next/server";
import { submitHubspotForm } from "@/lib/hubspot";

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
