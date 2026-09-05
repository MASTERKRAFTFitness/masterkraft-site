// Tell a human when a carrier stops answering.
//
// THE FAILURE THIS EXISTS FOR IS A QUIET ONE. The freight router fails soft on
// purpose: a carrier that errors is dropped from the pool and the other one
// still answers, so the checkout carries on and nobody sees a stack trace. That
// is the right behaviour for a customer and a terrible one for us, because the
// day Easyship stops responding is the day the bulky half of the catalogue
// quietly goes back to "Calculated on quote" with no outward sign at all.
//
// It has already happened once. On 2026-09-05 the Easyship trial's Rates
// allowance ran out mid-afternoon and every call returned `403 usage_limit`. The
// site kept quoting Australia Post, the checkout kept working, and the only
// reason it was noticed is that someone happened to be running the report.
//
// SO: log always, and email for the two failures that do not fix themselves -
// an exhausted quota and a rejected credential. A network blip is noise and
// resolves on its own; those two persist until a person acts.
//
// NEVER BLOCKS A QUOTE. Every call here is fire-and-forget and swallows its own
// errors. An alerting system that can slow down or break a checkout is worse
// than no alerting system.

/** How long to stay quiet after alerting about the same thing. */
const DEFAULT_COOLDOWN_MINUTES = 360; // 6 hours

export type CarrierFailure = "quota" | "auth" | "transient";

/** Last time each carrier+kind was emailed about, so a busy hour sends one mail. */
const lastAlerted = new Map<string, number>();

const cooldownMs = (): number => {
  const v = parseFloat(process.env.FREIGHT_ALERT_COOLDOWN_MINUTES ?? "");
  return (Number.isFinite(v) && v >= 0 ? v : DEFAULT_COOLDOWN_MINUTES) * 60_000;
};

/**
 * What kind of failure this is, from the carrier's own words.
 *
 * Deliberately conservative: anything not clearly a quota or a credential is
 * `transient` and gets logged without waking anyone. A false alarm at 2am costs
 * more trust than it buys.
 */
export function classifyFailure(detail: string): CarrierFailure {
  const d = detail.toLowerCase();
  if (d.includes("usage limit") || d.includes("usage_limit") || d.includes("quota")) {
    return "quota";
  }
  if (
    d.includes("unauthor") ||
    d.includes("invalid api") ||
    d.includes("invalid token") ||
    d.includes("forbidden") ||
    d.includes("http 401")
  ) {
    return "auth";
  }
  return "transient";
}

async function email(subject: string, body: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.QUOTE_FROM_EMAIL;
  const to = process.env.FREIGHT_ALERT_EMAIL ?? process.env.QUOTE_TO_EMAIL;
  if (!apiKey || !from || !to) return; // logging still happened; that is enough
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text: body,
    }),
  });
  if (!res.ok) console.error("[freight-alert] Resend rejected the alert", res.status);
}

/**
 * Record that a carrier failed, and wake someone if it will not fix itself.
 *
 * Returns immediately. The email, if any, is sent in the background.
 */
export function reportCarrierFailure(carrier: string, detail: string): void {
  const kind = classifyFailure(detail);
  console.error(`[freight] ${carrier} failed (${kind}): ${detail}`);

  if (kind === "transient") return;

  const key = `${carrier}:${kind}`;
  const now = Date.now();
  const last = lastAlerted.get(key) ?? 0;
  if (now - last < cooldownMs()) return;
  lastAlerted.set(key, now);

  const subject =
    kind === "quota"
      ? `MasterKraft freight: ${carrier} has hit its API limit`
      : `MasterKraft freight: ${carrier} rejected our credentials`;

  const body =
    kind === "quota"
      ? `${carrier} is refusing freight quotes because the API allowance is used up.\n\n` +
        `${detail}\n\n` +
        `Nothing is broken for customers - the other carrier still answers and anything ` +
        `it cannot carry falls back to "Calculated on quote". But the bulky half of the ` +
        `catalogue has no online price until the allowance resets or the plan is upgraded.\n\n` +
        `Check the plan, then run: npm run check:carriers`
      : `${carrier} rejected our API credentials, so it is not quoting freight.\n\n` +
        `${detail}\n\n` +
        `Check the token is present and correct in Vercel Production, then run: ` +
        `npm run check:carriers`;

  // Fire and forget. A checkout must never wait on an alert, and an alert that
  // fails must never surface as a freight error.
  void email(subject, body).catch((e) =>
    console.error("[freight-alert] could not send", e instanceof Error ? e.message : e)
  );
}

/** For tests. */
export function clearAlertHistory(): void {
  lastAlerted.clear();
}
