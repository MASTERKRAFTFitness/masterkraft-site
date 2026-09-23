// Canonical site URL. Override with NEXT_PUBLIC_SITE_URL once the real domain
// (e.g. https://masterkraft.com) is live.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "https://masterkraft-site-pi.vercel.app";

export const SITE_NAME = "MASTERKRAFT";

/**
 * A site-relative path made absolute, for the places a bare "/foo.jpg" is wrong.
 *
 * THE JSON-LD IS THE REASON THIS EXISTS. Google requires every URL in Product
 * structured data to be fully qualified, and after the 27 August image mirror
 * every product photograph is served from /product-images/<sku>-1.jpg — a path,
 * not a URL. next/image resolves those against the current origin and renders
 * them fine, which is why the breakage is invisible on the page and only shows
 * up as products missing from Google's free listings and rich results.
 *
 * Already-absolute inputs pass through untouched: variant photography still
 * comes straight from the Unleashed CDN, and prefixing that would 404.
 */
export function absoluteUrl(src: string | undefined | null): string {
  if (!src) return "";
  if (/^https?:\/\//i.test(src)) return src;
  // Protocol-relative (//cdn.example/x.jpg) is absolute apart from the scheme.
  if (src.startsWith("//")) return `https:${src}`;
  return `${SITE_URL}/${src.replace(/^\/+/, "")}`;
}

/**
 * The `priceValidUntil` for an Offer in Product structured data: a rolling date
 * one year out.
 *
 * A ROLLING DATE, NOT A FIXED ONE. Google treats a missing priceValidUntil as a
 * merchant-listing warning and a PAST one as an expired offer, so a date written
 * into the source is the worst of the three - it silently invalidates every
 * offer on the site the day it goes by, and nothing on the page changes to say
 * so. Recomputed per render (the product page is ISR, revalidate 600), it claims
 * only that the price is not scheduled to change, which is what is true of a
 * catalogue repriced from the ERP on every render.
 *
 * A FUNCTION, and not a module constant, because a constant would be evaluated
 * once when the server started and then held for the life of the process. It
 * lives here rather than inline in the page because reading the clock during
 * render is impure and react-hooks/purity rejects it there.
 */
export function priceValidUntil(now: number = Date.now()): string {
  return new Date(now + 365 * 86_400_000).toISOString().slice(0, 10);
}

// Search-engine indexing is OFF by default so the Vercel preview and any staging
// subdomain are never indexed. Set NEXT_PUBLIC_ALLOW_INDEX=true only on the final
// production domain at launch.
export const ALLOW_INDEX = process.env.NEXT_PUBLIC_ALLOW_INDEX === "true";

// The partner portal is a separate app (one codebase, re-skinned per brand).
// Set NEXT_PUBLIC_PORTAL_URL to its domain (e.g. https://portal.masterkraft.com)
// to hand off Portal Login to it. Until then, links fall back to the on-site
// /wholesale-login placeholder so nothing breaks.
export const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL?.replace(/\/$/, "") || "";
export const portalLoginHref = PORTAL_URL || "/wholesale-login";
export const portalIsExternal = !!PORTAL_URL;

// The FRANCHISOR portal is a different app again — head office's view of a whole
// network, not one gym's. Set NEXT_PUBLIC_FRANCHISOR_PORTAL_URL to the shared
// franchisor sign-in host (https://hq.portal.masterkraft.com); one link serves
// every brand, because that host resolves who the person is and sends them to
// their own brand's portal.
//
// Deliberately has NO on-site fallback, unlike PORTAL_URL above. There is no
// placeholder worth showing: a franchisor is a handful of named people at head
// office, invited by MasterKraft, and a sign-in form that cannot sign anyone in
// is worse for them than no link at all. Unset means the footer simply omits it
// — see Footer.tsx, which does the same for the Journal.
//
// Set this only once HQ_AUTH is on in the portal app, or the link lands on a
// form that tells everyone sign-in is not switched on yet.
export const FRANCHISOR_PORTAL_URL =
  process.env.NEXT_PUBLIC_FRANCHISOR_PORTAL_URL?.replace(/\/$/, "") || "";
export const franchisorLoginEnabled = !!FRANCHISOR_PORTAL_URL;

/**
 * Whether THIS hostname may be indexed.
 *
 * ALLOW_INDEX says the deployment is allowed to be indexed at all. But one
 * deployment answers on several hostnames (the real domain, the vercel.app URL,
 * web.test.masterkraft.com), and robots.txt is generated per deployment, so the
 * flag alone would invite Google to crawl staging too. An indexed staging copy
 * competing with the real domain is far more work to unpick than to prevent.
 *
 * Exported separately from the robots route so it can be tested without faking
 * a request.
 */
export function isIndexableHost(host: string | null | undefined): boolean {
  if (!ALLOW_INDEX || !host) return false;
  let canonical: string;
  try {
    canonical = new URL(SITE_URL).host.toLowerCase();
  } catch {
    // A malformed SITE_URL must never accidentally open the site up.
    return false;
  }
  const bare = canonical.replace(/^www\./, "");
  const seen = host.toLowerCase().split(":")[0];
  return seen === bare || seen === `www.${bare}`;
}
