import { NextResponse } from "next/server";
import { submitHubspotForm } from "@/lib/hubspot";
import { RATE_LIMITED_MESSAGE, checkFormSubmission } from "@/lib/form-guard";
import { internalRecipients, primaryRecipient } from "@/lib/notify-recipients";
import { scheduleBlockedLog } from "@/lib/blocked-log";
import { visitorKey } from "@/lib/agent/rate-limit";
import {
  MAX_FILES,
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  briefFullName,
  briefHubspotFields,
  briefLines,
  emptyBrief,
  humanBytes,
  type BriefAttachment,
  type FitoutBrief,
} from "@/lib/fitout-brief";

// The fitout brief from /contact's wizard.
//
// TWO DESTINATIONS, AND BOTH ARE LOAD-BEARING:
//
//   HubSpot gets the lead, so it enters the funnel and gets worked like any other.
//   The qualification answers ride inside `message` because the portal does not
//   define properties for them yet - see the note at the top of lib/fitout-brief.ts.
//
//   Email gets the brief AND the floor plans. This is not a fallback like the
//   warranty route's: HubSpot's Forms API takes no binary at all, so for a brief
//   with a plan attached, email is the ONLY way the plan reaches a human. It
//   therefore sends on every accepted submission, not just when HubSpot fails.
//
// This route takes multipart/form-data, not JSON, for the same reason - the plans
// are files. `brief` is one JSON part; the plans are repeated `plans` parts.
//
// WHEN NEITHER LANDS, IT SAYS SO. Same position as the warranty route: the
// visitor has just spent ninety seconds on five steps, and a receipt we cannot
// honour is worse than an honest failure with a phone number on it. That includes
// the wholly unconfigured case - no HUBSPOT_FORM_CONTACT and no RESEND_API_KEY
// means the brief went nowhere, and the form should not pretend otherwise.

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Attachment = BriefAttachment & { content: string };

/** Everything the wizard can send, coerced to the strings the brief promises. */
function readBrief(raw: unknown): FitoutBrief {
  const o = (raw ?? {}) as Record<string, unknown>;
  const str = (k: keyof FitoutBrief) => String(o[k] ?? "").trim();
  const list = (k: keyof FitoutBrief) =>
    Array.isArray(o[k]) ? (o[k] as unknown[]).map((v) => String(v).trim()).filter(Boolean) : [];
  return {
    ...emptyBrief,
    projectType: str("projectType"),
    stage: str("stage"),
    floorArea: str("floorArea"),
    areaUnit: str("areaUnit") || emptyBrief.areaUnit,
    ceilingHeight: str("ceilingHeight"),
    heightUnit: str("heightUnit") || emptyBrief.heightUnit,
    obstacles: list("obstacles"),
    zones: list("zones"),
    branding: str("branding"),
    budget: str("budget"),
    timeline: str("timeline"),
    firstName: str("firstName"),
    lastName: str("lastName"),
    company: str("company"),
    email: str("email"),
    phone: str("phone"),
    postcode: str("postcode"),
    message: str("message"),
  };
}

/**
 * The plans, base64'd for Resend.
 *
 * The client already enforces the same caps, so anything caught here came from
 * something other than our form. Over-cap files are DROPPED rather than
 * rejecting the whole brief: the answers are worth more than the attachment, and
 * losing a qualified lead over an oversized PDF would be the wrong trade. What
 * was dropped is named in the email so nobody wonders where the plan went.
 */
async function readPlans(files: File[]): Promise<{ kept: Attachment[]; dropped: string[] }> {
  const kept: Attachment[] = [];
  const dropped: string[] = [];
  let total = 0;

  for (const file of files) {
    if (kept.length >= MAX_FILES) {
      dropped.push(`${file.name} (over the ${MAX_FILES}-file limit)`);
      continue;
    }
    if (file.size > MAX_FILE_BYTES) {
      dropped.push(`${file.name} (${humanBytes(file.size)}, over the per-file limit)`);
      continue;
    }
    if (total + file.size > MAX_TOTAL_BYTES) {
      dropped.push(`${file.name} (would exceed the ${humanBytes(MAX_TOTAL_BYTES)} total)`);
      continue;
    }
    const buf = Buffer.from(await file.arrayBuffer());
    kept.push({ filename: file.name, size: file.size, content: buf.toString("base64") });
    total += file.size;
  }
  return { kept, dropped };
}

async function sendEmail(
  subject: string,
  html: string,
  to: string | string[],
  opts: { replyTo?: string; attachments?: Attachment[] } = {}
): Promise<"sent" | "skipped" | "error"> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.QUOTE_FROM_EMAIL;
  if (!apiKey || !from) return "skipped";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
        ...(opts.attachments?.length
          ? {
              attachments: opts.attachments.map((a) => ({
                filename: a.filename,
                content: a.content,
              })),
            }
          : {}),
      }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}`);
    return "sent";
  } catch (e) {
    console.error("[fitout-brief] resend failed", e);
    return "error";
  }
}

function internalNotification(
  brief: FitoutBrief,
  attachments: Attachment[],
  dropped: string[],
  hubspot: string
): string {
  const rows = briefLines(brief, attachments)
    .map(
      ([label, value]) =>
        `<tr><td valign="top"><strong>${escape(label)}</strong></td><td valign="top" style="white-space:pre-wrap">${escape(value)}</td></tr>`
    )
    .join("");

  return `<h2>Fitout brief — ${escape(brief.projectType || "type not given")}</h2>
    <p style="font-size:15px">
      <strong>${escape(briefFullName(brief) || "No name")}</strong>${
        brief.company ? ` — ${escape(brief.company)}` : ""
      }<br>
      <a href="mailto:${escape(brief.email)}">${escape(brief.email)}</a>
      ${brief.phone ? ` · ${escape(brief.phone)}` : ""}
    </p>
    <table cellpadding="6" style="border-collapse:collapse;font-size:14px">${rows}</table>
    ${
      attachments.length
        ? `<p style="color:#666">${attachments.length} floor plan${
            attachments.length === 1 ? "" : "s"
          } attached to this email.</p>`
        : `<p style="color:#666">No floor plan supplied.</p>`
    }
    ${
      dropped.length
        ? `<p style="color:#b00">Not attached: ${escape(dropped.join("; "))}.</p>`
        : ""
    }
    <p style="color:#666">HubSpot: ${escape(hubspot)}. This brief is emailed on every
    submission, because HubSpot cannot hold the floor plan.</p>`;
}

function confirmation(brief: FitoutBrief, attachments: Attachment[]): string {
  const rows = briefLines(brief, attachments)
    .map(
      ([label, value]) =>
        `<tr><td valign="top"><strong>${escape(label)}</strong></td><td valign="top" style="white-space:pre-wrap">${escape(value)}</td></tr>`
    )
    .join("");

  return `<p>Hi ${escape(brief.firstName) || "there"},</p>
    <p>Thanks for your fitout brief — it is with our design team now. We will come back
    to you within one business day with a concept for the space and an indicative price.</p>
    <h3>What you told us</h3>
    <table cellpadding="6" style="border-collapse:collapse;font-size:14px">${rows}</table>
    <p>If anything changes, or you have another plan or a photo of the space to send,
    just reply to this email and it comes straight to us.</p>
    <p>MasterKraft<br><em>Engineered for Fitness.</em></p>`;
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  let brief: FitoutBrief;
  try {
    brief = readBrief(JSON.parse(String(form.get("brief") ?? "{}")));
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request" }, { status: 400 });
  }

  // Only a name and an email are required, matching the wizard: everything else
  // is skippable by design, because a lead gathering concepts for next year
  // cannot answer half of it and should still reach us.
  if (!brief.firstName || !brief.email) {
    return NextResponse.json(
      { ok: false, error: "Please give us your name and email so we can reply." },
      { status: 400 }
    );
  }

  // The guard reads the honeypot and the fill time off a plain object, so the
  // multipart parts are flattened for it. Its gibberish heuristics get the typed
  // fields only - the tap-card answers come from a fixed list and cannot be junk.
  const guardBody: Record<string, unknown> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") guardBody[key] = value;
  }
  const verdict = checkFormSubmission(request, guardBody, {
    form: "fitout-brief",
    fields: {
      firstName: brief.firstName,
      lastName: brief.lastName,
      company: brief.company,
      message: brief.message,
    },
  });
  if (!verdict.ok) {
    console.warn("[fitout-brief] blocked", { reason: verdict.reason, detail: verdict.detail });
    // The three silent verdicts leave no other trace, so a wrongly-blocked
    // person can be found and answered. Deferred and detached, and it drops
    // rate_limit itself — see lib/blocked-log.ts.
    scheduleBlockedLog({
      form: "fitout-brief",
      reason: verdict.reason,
      detail: verdict.detail,
      visitor: visitorKey(request),
      name: briefFullName(brief),
      email: brief.email,
      message: brief.message,
    });
    if (verdict.reason === "rate_limit") {
      return NextResponse.json({ ok: false, error: RATE_LIMITED_MESSAGE }, { status: 429 });
    }
    // The ordinary success shape, and nothing sent anywhere. A bot that thinks it
    // succeeded moves on; one that is told what tripped it tunes around it.
    return NextResponse.json({ ok: true, hubspot: "skipped", notified: "skipped" });
  }

  const plans = form.getAll("plans").filter((p): p is File => p instanceof File && p.size > 0);
  const { kept, dropped } = await readPlans(plans);

  const hubspot = await submitHubspotForm(
    process.env.HUBSPOT_FORM_CONTACT,
    briefHubspotFields(brief, kept),
    { pageName: "Fitout Brief", pageUri: "/contact" }
  ).catch((e) => {
    console.error("[fitout-brief] hubspot failed", e);
    return "error" as const;
  });

  const to = internalRecipients();
  const subject =
    `Fitout brief: ${brief.projectType || "enquiry"}` +
    `${brief.company ? ` — ${brief.company}` : ""}` +
    `${brief.budget ? ` (${brief.budget})` : ""}`;

  // Sequential rather than Promise.all: the internal notification is the one that
  // must not be lost, so it is not racing the customer's receipt for the same
  // Resend rate limit.
  const notified = await sendEmail(
    subject,
    internalNotification(brief, kept, dropped, hubspot),
    to,
    { replyTo: brief.email, attachments: kept }
  );
  const confirmed = await sendEmail(
    "We have your fitout brief",
    confirmation(brief, kept),
    brief.email,
    // One inbox, not the whole notification list: a Reply-To naming everyone
    // turns the customer's reply into a group thread and leaks the internal
    // addresses to them. See lib/notify-recipients.ts.
    { replyTo: primaryRecipient() }
  );

  console.log("[fitout-brief] received", {
    email: brief.email,
    type: brief.projectType,
    budget: brief.budget,
    plans: kept.length,
    dropped: dropped.length,
    hubspot,
    notified,
    confirmed,
  });

  // A brief that reached neither HubSpot nor a human must not show a receipt we
  // cannot honour - the visitor has just spent ninety seconds on five steps.
  if (hubspot !== "submitted" && notified !== "sent") {
    console.error("[fitout-brief] NOT CAPTURED", { brief, hubspot, notified });
    return NextResponse.json(
      {
        ok: false,
        error:
          "We could not lodge that just now. Please call +61 3 9044 9575 or email hello@masterkraft.com and we will pick it up from there.",
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, hubspot, notified, confirmed });
}
