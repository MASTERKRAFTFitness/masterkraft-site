// THE GOOGLE AD CLICK BEHIND A LEAD OR AN ORDER.
//
// WHY. Google Ads counts a conversion only when the browser tag fires it AND the
// visitor accepted cookies. On this site most visitors never press Accept, so
// from 27 Oct to 18 Nov 2026 GA4 saw about 37 paid sessions against roughly 250
// ad clicks, and Ads recorded zero conversions while the site was taking orders
// and quote requests. The tag cannot see those people; the server can.
//
// HOW. When a visitor lands from an ad, Google appends a click id to the URL:
// `gclid` on most clicks, `gbraid` / `wbraid` from iOS apps and web-to-app. We
// keep it in this browser for 90 days (Google's upload window), send it with the
// quote, checkout or fitout brief, and the server stores it beside the lead
// (lib/ad-click-leads). /admin/ad-clicks then exports a CSV that Ads imports as
// offline conversions — counted against the click, with no cookie needed.
//
// CONSENT. A visitor who pressed Decline is not tracked this way either: the id
// is not stored, a stored one is cleared on Decline (see CookieConsent), and
// nothing is sent. A visitor who has not answered is sent as "unspecified"; one
// who accepted, as "granted". The export uses that to avoid counting twice — see
// lib/ad-offline-export.
//
// THIS FILE IS SHARED. The parsing and cleaning below run on the server too, as
// the trust boundary for what the browser sends; the localStorage helpers no-op
// on the server.

export const AD_CLICK_KEY = "mk_ad_click";
// Must match CookieConsent's KEY. Read here rather than imported, because
// CookieConsent is a client component and this file is imported by API routes.
const CONSENT_KEY = "mk_cookie_consent";

/** Google accepts an offline conversion up to 90 days after the click. */
export const AD_CLICK_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export type AdConsent = "granted" | "unspecified";

export type AdClick = {
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  /** When the visitor landed from the ad, ISO 8601. */
  clickedAt: string;
  consent: AdConsent;
};

// Real click ids are URL-safe base64-ish strings, typically 50-100 characters.
// Anything outside this shape is not one, and is not stored or sent on.
const ID_PATTERN = /^[A-Za-z0-9_-]{10,250}$/;
const ID_KEYS = ["gclid", "gbraid", "wbraid"] as const;

function cleanId(value: unknown): string | undefined {
  return typeof value === "string" && ID_PATTERN.test(value) ? value : undefined;
}

/** The click ids in a query string, or null when it carries none. */
export function clickIdsFrom(search: string): Pick<AdClick, "gclid" | "gbraid" | "wbraid"> | null {
  const params = new URLSearchParams(search.slice(0, 4000));
  const ids: Pick<AdClick, "gclid" | "gbraid" | "wbraid"> = {};
  for (const key of ID_KEYS) {
    const v = cleanId(params.get(key));
    if (v) ids[key] = v;
  }
  return Object.keys(ids).length ? ids : null;
}

/**
 * What the browser sent, validated. Runs on the SERVER: ids must look like ids,
 * the click must be inside the 90-day window and not in the future, and consent
 * must be one of the two values the browser is allowed to send. Null otherwise.
 */
export function cleanAdClick(value: unknown, now = Date.now()): AdClick | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const ids: Pick<AdClick, "gclid" | "gbraid" | "wbraid"> = {};
  for (const key of ID_KEYS) {
    const id = cleanId(v[key]);
    if (id) ids[key] = id;
  }
  if (!Object.keys(ids).length) return null;
  const at = typeof v.clickedAt === "string" ? Date.parse(v.clickedAt) : NaN;
  // A minute of slack for a browser clock running a little fast.
  if (!Number.isFinite(at) || at > now + 60_000 || at < now - AD_CLICK_DAYS * DAY_MS) return null;
  const consent: AdConsent = v.consent === "granted" ? "granted" : "unspecified";
  return { ...ids, clickedAt: new Date(at).toISOString(), consent };
}

// ---- browser only ----------------------------------------------------------

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null; // blocked storage, private mode
  }
}

function consentChoice(s: Storage): "accepted" | "declined" | null {
  const v = s.getItem(CONSENT_KEY);
  return v === "accepted" || v === "declined" ? v : null;
}

/**
 * Keep the click id from the landing URL. Called once per page load. A newer
 * click replaces an older one, which is also how Google attributes (last click).
 * Does nothing for a visitor who declined cookies.
 */
export function captureAdClick(search = typeof window === "undefined" ? "" : window.location.search): void {
  const s = storage();
  if (!s) return;
  try {
    if (consentChoice(s) === "declined") return;
    const ids = clickIdsFrom(search);
    if (!ids) return;
    s.setItem(AD_CLICK_KEY, JSON.stringify({ ...ids, clickedAt: new Date().toISOString() }));
  } catch {
    // Storage full or blocked: the lead still goes through, just unattributed.
  }
}

/** Forget the click. Called when the visitor presses Decline. */
export function clearAdClick(): void {
  try {
    storage()?.removeItem(AD_CLICK_KEY);
  } catch {
    // nothing to do
  }
}

/**
 * The stored click, ready to send with a form, or undefined when there is none,
 * it has expired, or the visitor declined. Undefined (not null) so it simply
 * drops out of JSON.stringify.
 */
export function readAdClick(): AdClick | undefined {
  const s = storage();
  if (!s) return undefined;
  try {
    const choice = consentChoice(s);
    if (choice === "declined") return undefined;
    const raw = JSON.parse(s.getItem(AD_CLICK_KEY) ?? "null");
    const click = cleanAdClick({ ...raw, consent: choice === "accepted" ? "granted" : "unspecified" });
    if (!click) s.removeItem(AD_CLICK_KEY);
    return click ?? undefined;
  } catch {
    return undefined;
  }
}
