import { NextResponse } from "next/server";
import { submitHubspotForm } from "@/lib/hubspot";

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

  console.log("[newsletter] received", { email, hubspot });
  return NextResponse.json({ ok: true, hubspot });
}
