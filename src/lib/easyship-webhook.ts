// Easyship tells us when a label is bought, so its tracking number can reach the
// customer's "on its way" email.
//
// WHY, 2026-10-22. The shipped emails (shipped-notices.ts) read tracking numbers
// from Unleashed, where they are only ever pasted by hand: 6 of 58 shipments
// had one. Now that web orders land in Easyship's To Ship list
// (easyship-shipments.ts), a label bought there has its number at once, and
// Easyship POSTs it here as `shipment.label.created`.
//
// SIGNED, AND CHECKED. Every event carries an HS256 JWT in X-EASYSHIP-SIGNATURE,
// signed with the webhook's `webh_...` secret from the Easyship dashboard
// (Integrations -> API & Webhooks -> Webhooks). Anything that does not verify is
// refused, so nobody can plant a tracking number on a customer's order.
//
// ANSWER FAST, AND 2XX. Easyship retries a non-2XX thirty times a minute apart
// and then switches the webhook off, silently. So an event we do not care about
// is acknowledged, not rejected; only a bad signature or a missing secret is not.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type EasyshipEvent = {
  event_type?: string;
  resource_id?: string;
  data?: {
    easyship_shipment_id?: string;
    platform_order_number?: string;
    status?: string;
    label_url?: string;
    tracking_number?: string;
    tracking_page_url?: string;
  };
};

export type HandleResult =
  | { status: "stored"; orderNumber: string; shipment: string }
  | { status: "ignored"; reason: string };

/**
 * Verify an HS256 JWT against the webhook secret. Returns its claims, or null.
 *
 * Written out rather than pulled in as a library: it is one HMAC, and the only
 * algorithm accepted is the one Easyship uses, so a token claiming `none` or an
 * RSA algorithm cannot talk its way past.
 */
export function verifySignature(
  token: string | null | undefined,
  secret: string,
  now = Date.now()
): Record<string, unknown> | null {
  if (!token || !secret) return null;
  const parts = bare(token).split(".");
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts;
  try {
    const header = JSON.parse(Buffer.from(head, "base64url").toString("utf8")) as { alg?: string };
    if (header.alg !== "HS256") return null;
    const expected = createHmac("sha256", secret).update(`${head}.${body}`).digest();
    const given = Buffer.from(sig, "base64url");
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<string, unknown>;
    if (typeof claims.exp === "number" && claims.exp * 1000 < now) return null;
    return claims;
  } catch {
    return null;
  }
}

/** The token without a `Bearer ` prefix, which an HTTP header may carry. */
function bare(token: string): string {
  return token.trim().replace(/^Bearer\s+/i, "");
}

/**
 * Why a signature failed, safe to log: shapes and yes/no answers only, never the
 * secret, the signature or the claims' values.
 *
 * WHY, 2026-10-26. Easyship's own webhook test was refused as "bad signature"
 * and a bare 401 cannot say whether the secret saved in Vercel is stale or the
 * token is shaped differently from the docs. `macMatches` false with a
 * well-formed HS256 token means the secret is wrong; anything else is format.
 */
export function describeSignature(token: string | null | undefined, secret: string, now = Date.now()) {
  const out: Record<string, unknown> = {
    present: Boolean(token),
    length: token?.length ?? 0,
    bearer: /^\s*Bearer\s/i.test(token ?? ""),
    secretPrefix: secret.startsWith("webh_"),
    secretLength: secret.length,
  };
  if (!token) return out;
  const parts = bare(token).split(".");
  out.parts = parts.length;
  if (parts.length !== 3) return out;
  const [head, body, sig] = parts;
  const mac = (key: string) => {
    const expected = createHmac("sha256", key).update(`${head}.${body}`).digest();
    const given = Buffer.from(sig, "base64url");
    return given.length === expected.length && timingSafeEqual(given, expected);
  };
  try {
    const header = JSON.parse(Buffer.from(head, "base64url").toString("utf8")) as Record<string, unknown>;
    out.alg = header.alg;
    out.typ = header.typ;
  } catch {
    out.header = "unreadable";
  }
  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<string, unknown>;
    out.claimKeys = Object.keys(claims);
    if (typeof claims.exp === "number") out.expiresInSeconds = Math.round(claims.exp - now / 1000);
  } catch {
    out.claims = "unreadable";
  }
  out.macMatches = mac(secret);
  // In case Easyship signs with the secret minus its display prefix.
  if (secret.startsWith("webh_")) out.macMatchesWithoutPrefix = mac(secret.slice("webh_".length));
  return out;
}

/**
 * The Unleashed order number from the reference the site gave Easyship.
 *
 * easyship-shipments.ts sends "SO-00000877", or "SO-00000877 (1/2)" for one
 * consignment of a split order. A shipment keyed in by hand may carry a "#" or
 * anything at all, so only a sales order number is accepted.
 */
export function orderNumberFrom(platformOrderNumber: string | null | undefined): string | null {
  const m = (platformOrderNumber ?? "").toUpperCase().match(/SO-\d{4,}/);
  return m ? m[0] : null;
}

/** Store what one event tells us. Never throws for a well-formed but unwanted event. */
export async function handleEvent(event: EasyshipEvent, db: SupabaseClient): Promise<HandleResult> {
  const type = event.event_type ?? "";
  const d = event.data ?? {};
  const shipment = d.easyship_shipment_id || event.resource_id;
  if (!shipment) return { status: "ignored", reason: "no shipment id" };

  if (type === "shipment.label.created") {
    if (d.status && d.status !== "success") return { status: "ignored", reason: `label status ${d.status}` };
    const orderNumber = orderNumberFrom(d.platform_order_number);
    if (!orderNumber) return { status: "ignored", reason: "not a website sales order" };
    const { error } = await db.from("easyship_labels").upsert(
      {
        easyship_shipment_id: shipment,
        order_number: orderNumber,
        platform_order_number: d.platform_order_number ?? null,
        tracking_number: d.tracking_number?.trim() || null,
        tracking_page_url: httpsOrNull(d.tracking_page_url),
        label_url: httpsOrNull(d.label_url),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "easyship_shipment_id" }
    );
    if (error) throw new Error(`easyship_labels: ${error.message}`);
    return { status: "stored", orderNumber, shipment };
  }

  // Later progress on a label we already hold. A shipment we never saw a label
  // for has nothing to update, which is fine.
  if (type === "shipment.tracking.status.changed") {
    const patch: Record<string, string> = { updated_at: new Date().toISOString() };
    if (d.status) patch.tracking_status = d.status;
    if (d.tracking_number?.trim()) patch.tracking_number = d.tracking_number.trim();
    const url = httpsOrNull(d.tracking_page_url);
    if (url) patch.tracking_page_url = url;
    const { error } = await db.from("easyship_labels").update(patch).eq("easyship_shipment_id", shipment);
    if (error) throw new Error(`easyship_labels: ${error.message}`);
    return { status: "stored", orderNumber: orderNumberFrom(d.platform_order_number) ?? "", shipment };
  }

  return { status: "ignored", reason: `event ${type || "unknown"}` };
}

function httpsOrNull(raw: string | null | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;
  try {
    return new URL(v).protocol === "https:" ? v : null;
  } catch {
    return null;
  }
}

export type LabelTracking = { orderNumber: string; trackingNumber: string; trackingPageUrl: string | null };

/** The Easyship tracking held for these orders, keyed by order number. */
export async function labelTrackingFor(
  orderNumbers: string[],
  db: SupabaseClient
): Promise<Map<string, LabelTracking[]>> {
  const out = new Map<string, LabelTracking[]>();
  const wanted = [...new Set(orderNumbers.filter(Boolean))];
  if (wanted.length === 0) return out;
  const { data, error } = await db
    .from("easyship_labels")
    .select("order_number, tracking_number, tracking_page_url")
    .in("order_number", wanted)
    .not("tracking_number", "is", null)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`easyship_labels: ${error.message}`);
  for (const row of data ?? []) {
    const list = out.get(row.order_number) ?? [];
    list.push({ orderNumber: row.order_number, trackingNumber: row.tracking_number, trackingPageUrl: row.tracking_page_url });
    out.set(row.order_number, list);
  }
  return out;
}
