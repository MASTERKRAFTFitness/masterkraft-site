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
// SO: log always, and email for the three failures that do not fix themselves -
// an exhausted quota, a rejected credential, and a malformed request. A network
// blip is noise and resolves on its own; those three persist until a person acts.
//
// The third was added the hard way. On 2026-09-06 a 35-character limit on a
// street line meant Easyship rejected EVERY quote in production. It was logged,
// classified transient, and would never have been emailed - the site quietly
// served Australia Post alone and looked entirely healthy from outside.
//
// AND THEN IT OVERSHOT. That third rule matched "the request body content is not
// valid", which is the wrapper Easyship puts on every 422 - so an ordinary cart
// nobody can carry (two 300cm cartons; a half-typed address) arrived worded
// exactly like a broken deployment and sent the same "EVERY quote is affected,
// the carrier is switched off" mail. Steve got it repeatedly on 6-7 September
// while Easyship was answering normally. Hence `consignment`, tested first: the
// fault Easyship names lives in `details`, not in the wrapper. An alerter that
// cries outage over one cart is one nobody reads by the time it is right.
//
// THE COOLDOWN LIVES IN THE DATABASE, and the Map below is only a fast path.
// A module-scope Map is the right answer for one long-lived process and the
// wrong one on Vercel: every cold lambda starts empty, so "one mail per problem
// per six hours" was really one per problem per INSTANCE. See
// supabase/migrations/20260907_freight_alert_cooldown.sql.
//
// IT FAILS OPEN. If the database is unreachable, or not configured at all, the
// alert is sent. A duplicate mail is a nuisance; an alerter that goes quiet
// because a second system is down is the failure this whole file exists to
// prevent, and it would go quiet at exactly the moment things are broken.
//
// NEVER BLOCKS A QUOTE. Every call here is fire-and-forget and swallows its own
// errors. An alerting system that can slow down or break a checkout is worse
// than no alerting system.

import { adminDb } from "@/lib/admin-db";

/** How long to stay quiet after alerting about the same thing. */
const DEFAULT_COOLDOWN_MINUTES = 360; // 6 hours

export type CarrierFailure = "quota" | "auth" | "config" | "consignment" | "transient";

/**
 * Last time THIS INSTANCE emailed about each carrier+kind.
 *
 * Not the cooldown - `claimAlert` is. This only saves a database round trip on
 * an instance that has already been told no, and on a warm one it does most of
 * the work. It is deliberately kept even though the durable claim is
 * authoritative: the alerting path must stay cheap on a checkout request.
 */
const lastAlerted = new Map<string, number>();

const cooldownMs = (): number => {
  const v = parseFloat(process.env.FREIGHT_ALERT_COOLDOWN_MINUTES ?? "");
  return (Number.isFinite(v) && v >= 0 ? v : DEFAULT_COOLDOWN_MINUTES) * 60_000;
};

/**
 * What kind of failure this is, from the carrier's own words.
 *
 * Deliberately conservative: anything not clearly a quota, a credential or a
 * malformed request is `transient` and gets logged without waking anyone. A
 * false alarm at 2am costs more trust than it buys.
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
  // THIS CART, NOT THIS CARRIER - and it must be tested BEFORE `config`, because
  // Easyship words the two identically.
  //
  // "The request body content is not valid." is the wrapper on EVERY Easyship
  // 422, a genuinely malformed request and an unservable consignment alike. The
  // fault is in `details`, and matching the wrapper is what emailed Steve
  // repeatedly through 6-7 September about an outage that was not happening.
  //
  // Two 300 x 60 x 60cm cartons at 80kg is "No shipping solutions available
  // based on the information provided"; ONE of them prices fine, and both pass
  // isPlausibleCarton. It is one-parcel-per-unit meeting a quantity above one,
  // not a broken deployment. A blank destination state is the same shape: the
  // customer is still typing.
  //
  // Nothing is broken when this happens. The router drops the carrier for that
  // one quote, Australia Post still answers, and a consignment neither can carry
  // falls back to "Calculated on quote" - which is the right answer for a cart
  // that was always going to be priced by a person. So: log it, never mail it.
  if (d.includes("no shipping solutions") || d.includes("destination_address")) {
    return "consignment";
  }
  // A malformed request never fixes itself, and it fails EVERY quote rather than
  // some. Classified as needing a human after a 35-character street line silently
  // removed Easyship from production on 2026-09-06 - logged, but as "transient",
  // so nobody would have been told.
  //
  // `origin_address` and `parcels` faults stay here on purpose: those come from
  // OUR configuration and OUR carton data, so they recur until someone acts. The
  // bare wrapper stays too, as a last resort - a fault naming no field at all is
  // one we have never seen, and being woken for it beats losing a carrier
  // silently a second time.
  if (
    d.includes("not valid") ||
    d.includes("invalid_content") ||
    d.includes("too long") ||
    d.includes("can't be blank") ||
    d.includes("is required") ||
    d.includes("must be greater than")
  ) {
    return "config";
  }
  return "transient";
}

/**
 * Claim the right to send this alert, across every instance at once.
 *
 * Returns true when nobody has mailed about this carrier+kind inside the
 * cooldown. The decision is made by Postgres in a single statement, so two
 * lambdas noticing the same dead carrier cannot both decide they are first.
 *
 * FAILS OPEN, twice over: no database configured (local dev, and the site's
 * posture everywhere else that Supabase is optional) and a database that errors
 * both return true. See the note at the top of the file.
 */
async function claimAlert(carrier: string, kind: string, windowMs = cooldownMs()): Promise<boolean> {
  const db = adminDb();
  if (!db) return true;
  try {
    const { data, error } = await db.rpc("claim_freight_alert", {
      p_carrier: carrier,
      p_kind: kind,
      p_cooldown_seconds: windowMs / 1000,
    });
    // A missing migration should be loud in the log and harmless to the alert.
    if (error) {
      console.error("[freight-alert] cooldown unavailable, sending anyway", error.message);
      return true;
    }
    return data !== false;
  } catch (e) {
    console.error("[freight-alert] cooldown unavailable, sending anyway", e instanceof Error ? e.message : e);
    return true;
  }
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

  // `consignment` is logged and never mailed: it is one cart, not the carrier.
  if (kind === "transient" || kind === "consignment") return;

  const key = `${carrier}:${kind}`;
  const now = Date.now();
  const last = lastAlerted.get(key) ?? 0;
  if (now - last < cooldownMs()) return;
  lastAlerted.set(key, now);

  const subject =
    kind === "quota"
      ? `MasterKraft freight: ${carrier} has hit its API limit`
      : kind === "config"
        ? `MasterKraft freight: ${carrier} is rejecting our requests`
        : `MasterKraft freight: ${carrier} rejected our credentials`;

  const body =
    kind === "config"
      ? `${carrier} is refusing every freight quote because our request is malformed.\n\n` +
        `${detail}\n\n` +
        `This will not fix itself and it affects EVERY quote, not some. The other ` +
        `carrier is still answering and anything it cannot carry falls back to ` +
        `"Calculated on quote", so nothing is broken for customers - but that ` +
        `carrier is effectively switched off until someone acts.\n\n` +
        `Usually a configuration value rather than code. Then run: npm run check:carriers`
      : kind === "quota"
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
  // fails must never surface as a freight error - so the durable claim happens
  // in here rather than above, where awaiting it would put a database round trip
  // in front of a customer's freight quote.
  void (async () => {
    if (!(await claimAlert(carrier, kind))) return;
    await email(subject, body);
  })().catch((e) =>
    console.error("[freight-alert] could not send", e instanceof Error ? e.message : e)
  );
}

// ---------------------------------------------------------------------------
// A PRODUCT THE CHECKOUT CANNOT WEIGH.
//
// The other quiet failure. A product with no carton in Unleashed fails the whole
// cart as `incomplete_dimensions`, the customer is told freight cannot be
// worked out, and nothing anywhere says so. On 2026-10-07 a customer in Kaleen
// tried to buy a Concept2 RowErg twice, gave up, and it was found the next day
// by reading checkout_leads. About 40% of the listed catalogue had no carton at
// the time, so this is not a rare edge.
//
// ONE MAIL PER PRODUCT PER DAY, not per request. A customer retrying with a new
// address is the same gap, and so is the next customer an hour later. The day
// is per SKU, so a different product in the next cart still gets through. The
// claim reuses claim_freight_alert with carrier "catalogue" and the SKU as the
// kind, so it outlives a cold lambda exactly as the carrier alerts do.
//
// Same rules as above: logs always, never blocks the quote, fails open.
// ---------------------------------------------------------------------------

const DEFAULT_DIMENSIONS_COOLDOWN_HOURS = 24;

const dimensionsCooldownMs = (): number => {
  const v = parseFloat(process.env.FREIGHT_DIMENSIONS_ALERT_COOLDOWN_HOURS ?? "");
  return (Number.isFinite(v) && v >= 0 ? v : DEFAULT_DIMENSIONS_COOLDOWN_HOURS) * 3_600_000;
};

export type MissingDimensionsContext = {
  postcode?: string | null;
  state?: string | null;
  /** The checkout_leads row, when the browser sent one, so the cart can be followed up. */
  checkoutId?: string | null;
};

/**
 * Record that a cart could not be quoted because these SKUs have no carton, and
 * email whoever maintains Unleashed about the ones not already mailed today.
 *
 * Returns immediately. The email, if any, is sent in the background.
 */
export function reportMissingDimensions(skus: string[], context: MissingDimensionsContext = {}): void {
  const codes = [...new Set(skus.map((s) => s.trim().toUpperCase()).filter(Boolean))].sort();
  if (codes.length === 0) return;
  console.error(`[freight] no carton data for ${codes.join(", ")}`);

  const now = Date.now();
  const window = dimensionsCooldownMs();
  const fresh = codes.filter((code) => now - (lastAlerted.get(`catalogue:${code}`) ?? 0) >= window);
  if (fresh.length === 0) return;
  for (const code of fresh) lastAlerted.set(`catalogue:${code}`, now);

  void (async () => {
    const claimed: string[] = [];
    for (const code of fresh) if (await claimAlert("catalogue", code, window)) claimed.push(code);
    if (claimed.length === 0) return;

    const where = [context.postcode, context.state].filter(Boolean).join(" ");
    const subject =
      claimed.length === 1
        ? `MasterKraft freight: ${claimed[0]} has no carton, a checkout could not be quoted`
        : `MasterKraft freight: ${claimed.length} products have no carton, a checkout could not be quoted`;
    const body =
      `A customer${where ? ` delivering to ${where}` : ""} reached checkout and could not be ` +
      `given a freight price, because ${claimed.length === 1 ? "this product has" : "these products have"} ` +
      `no weight or box size in Unleashed:\n\n` +
      claimed.map((c) => `  ${c}`).join("\n") +
      `\n\nThe whole cart fails, not just the line, so they were told freight could not be ` +
      `worked out and most people leave at that point.\n\n` +
      `Fix: enter the weight (kg) and box Width / Height / Depth in CENTIMETRES on the product's ` +
      `Units of Measure row in Unleashed (the screen labels them "m"; every measured product uses cm). ` +
      `The site picks it up on the next hourly sync.\n\n` +
      (context.checkoutId
        ? `The cart is in checkout_leads as ${context.checkoutId}, with the customer's contact details if they gave them.\n\n`
        : "") +
      `You will not hear about the same product again for ${Math.round(window / 3_600_000)} hours.`;
    await email(subject, body);
  })().catch((e) =>
    console.error("[freight-alert] could not send", e instanceof Error ? e.message : e)
  );
}

/** For tests. Clears the in-process fast path only; the durable claim is in Postgres. */
export function clearAlertHistory(): void {
  lastAlerted.clear();
}
