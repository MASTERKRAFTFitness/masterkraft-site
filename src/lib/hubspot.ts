// HubSpot Forms submission (server-side). Posts to the Forms Submissions API,
// which creates/updates a contact in HubSpot. Gated on env config so it degrades
// gracefully to a no-op until the portal + form GUIDs are provided.

import { LIVE_HOSTS } from "@/lib/live-host";

const PORTAL_ID = process.env.HUBSPOT_PORTAL_ID;

export type HubspotField = { name: string; value: string };

export async function submitHubspotForm(
  formGuid: string | undefined,
  fields: HubspotField[],
  opts: { pageName?: string; pageUri?: string; hutk?: string } = {}
): Promise<"submitted" | "skipped"> {
  if (!PORTAL_ID || !formGuid) return "skipped";

  const res = await fetch(
    `https://api.hsforms.com/submissions/v3/integration/submit/${PORTAL_ID}/${formGuid}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: fields.filter((f) => f.value),
        context: {
          pageName: opts.pageName,
          pageUri: opts.pageUri,
          ...(opts.hutk ? { hutk: opts.hutk } : {}),
        },
      }),
    }
  );
  if (!res.ok) throw new Error(`HubSpot ${res.status}`);
  return "submitted";
}

// ATTRIBUTION FOR A SERVER-SIDE SUBMIT.
//
// A Forms API call from the server carries none of the browser's context, so
// without these two HubSpot records every lead as a direct visit to a fixed
// path: no session history, no UTM tags, and "Offline sources" as the original
// source. A paid Instagram lead and a returning organic visitor look the same.
//
//   hutk    - the `hubspotutk` cookie. Ties the submission to the visitor's
//             tracked sessions, which is where HubSpot reads the original
//             source from. It only exists once the HubSpot script has loaded,
//             which is after cookie consent - so a declined visitor sends none
//             and nothing changes for them.
//   pageUri - the real page URL, query string included, so utm_* and fbclid
//             reach HubSpot.
//
// Both arrive from the browser, so both are checked before they are trusted.
// A forged value can only mislabel the forger's own lead, but the checks keep
// junk out of the CRM: the cookie must look like a HubSpot token, and the URL
// must be the expected page on the live domain.

const HUTK = /^[a-f0-9]{32}$/i;

/** The `hubspotutk` value if it looks like one, otherwise undefined. */
export function cleanHutk(value: unknown): string | undefined {
  const s = typeof value === "string" ? value.trim() : "";
  return HUTK.test(s) ? s : undefined;
}

/**
 * The page URL the browser reported, if it is `path` on the live domain;
 * otherwise `path` itself, which is what was sent before attribution existed.
 * Previews and localhost fall back on purpose, the same rule as the tracking
 * tags in lib/live-host.ts.
 */
export function cleanPageUri(value: unknown, path: string): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s || s.length > 2000) return path;
  try {
    const url = new URL(s);
    if (url.protocol !== "https:") return path;
    if (!LIVE_HOSTS.has(url.hostname.toLowerCase())) return path;
    if (url.pathname.replace(/\/$/, "") !== path) return path;
    url.hash = "";
    return url.toString();
  } catch {
    return path;
  }
}
