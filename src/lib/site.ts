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
