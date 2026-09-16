// Opinly web analytics — the browser half.
//
// The pixel is loaded from the root layout on every page, unconditionally —
// deliberately NOT behind the cookie banner that gates GA4/Ads/HubSpot.
//
// Everything here still has to survive the pixel never arriving: an ad-blocker,
// a network failure or a CSP will leave `window.opinly` undefined forever, and
// these calls sit inside a paid checkout. Every export below no-ops in that case
// rather than throwing.
//
// Nothing in here is called directly by components. lib/analytics is the one
// front door for events; this module is the Opinly sink behind it.

/** The key is publishable and write-only — it is meant to ship in client code. */
export const OPINLY_KEY =
  process.env.NEXT_PUBLIC_OPINLY_KEY || "pk-p-8neHzEr-N5O7M4c_XHO-qHpwTOeAf5AYS4rVG";

export const OPINLY_SRC = "https://static.opinly.ai/p.js";

type Props = Record<string, unknown>;

type OpinlyApi = {
  /** Per-browser anonymous id, persisted in local storage. Links server events to this visit. */
  anonId?: string;
  identify?: (traits: { email?: string; userId?: string }) => void;
  track?: (event: string, properties?: Props, opts?: { externalEventId?: string }) => void;
  page?: () => void;
};

interface OpinlyWindow extends Window {
  opinly?: OpinlyApi;
}

function api(): OpinlyApi | null {
  if (typeof window === "undefined") return null;
  return (window as OpinlyWindow).opinly ?? null;
}

/**
 * The visitor's anonymous id, or undefined if the pixel never loaded.
 *
 * Send this to the server with anything the server will report on the visitor's
 * behalf. Without it (or an email) Opinly cannot tie the event back to the
 * session that earned it, and the revenue lands in "direct".
 */
export function opinlyAnonId(): string | undefined {
  return api()?.anonId;
}

/**
 * Link this browser to a person. First identification wins — later calls with a
 * different email are ignored by the pixel, so call it with the customer's real
 * email and not, say, a placeholder.
 */
export function opinlyIdentify(email?: string, userId?: string): void {
  if (!email && !userId) return;
  try {
    api()?.identify?.({ ...(email ? { email } : {}), ...(userId ? { userId } : {}) });
  } catch {
    // Analytics must never take a page down with it.
  }
}

/**
 * One event. `externalEventId` is what dedupes a browser event against the
 * server event for the same order — pass the order number on BOTH sides.
 */
export function opinlyTrack(event: string, properties: Props = {}, externalEventId?: string): void {
  try {
    api()?.track?.(event, properties, externalEventId ? { externalEventId } : undefined);
  } catch {
    // As above.
  }
}
