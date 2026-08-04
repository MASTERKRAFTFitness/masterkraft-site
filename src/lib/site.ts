// Canonical site URL. Override with NEXT_PUBLIC_SITE_URL once the real domain
// (e.g. https://masterkraft.com) is live.
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
  "https://masterkraft-site-pi.vercel.app";

export const SITE_NAME = "MASTERKRAFT";

// The partner portal is a separate app (one codebase, re-skinned per brand).
// Set NEXT_PUBLIC_PORTAL_URL to its domain (e.g. https://portal.masterkraft.com)
// to hand off Portal Login to it. Until then, links fall back to the on-site
// /wholesale-login placeholder so nothing breaks.
export const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL?.replace(/\/$/, "") || "";
export const portalLoginHref = PORTAL_URL || "/wholesale-login";
export const portalIsExternal = !!PORTAL_URL;
