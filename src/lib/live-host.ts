// Is this page being served to the public, on the real domain?
//
// The tracking tags (Opinly, GA4, Google Ads, HubSpot, Meta) load only when it
// is. On 1 October a checkout test on localhost:3417 reported itself to the
// live Opinly as a real visitor with an Add to cart and a $225 Lead, and
// trackLead also fires a Google Ads lead conversion - a local test can feed the
// numbers the business reads and the bidding that spends its money.
//
// THE HOSTNAME, NOT AN ENV VAR. `vercel env pull` writes VERCEL_ENV="production"
// into .env.local, so an env-based switch is "on" on every developer machine
// that has pulled - exactly where it needs to be off. The browser's hostname
// cannot be pulled by accident. Preview deployments (*.vercel.app) are off too,
// which is right: nobody reviewing a PR is a customer.

export const LIVE_HOSTS: ReadonlySet<string> = new Set(["masterkraft.com", "www.masterkraft.com"]);

/** True only in a browser on the public domain. Always false on the server. */
export function isLiveHost(hostname?: string): boolean {
  const host = hostname ?? (typeof window === "undefined" ? "" : window.location.hostname);
  return LIVE_HOSTS.has(host.toLowerCase());
}
