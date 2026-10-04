// HubSpot Forms submission (server-side). Posts to the Forms Submissions API,
// which creates/updates a contact in HubSpot. Gated on env config so it degrades
// gracefully to a no-op until the portal + form GUIDs are provided.

const PORTAL_ID = process.env.HUBSPOT_PORTAL_ID;

export type HubspotField = { name: string; value: string };

// HubSpot's visitor cookie. THIS IS WHAT ATTRIBUTES A LEAD. A server-side
// submission without it arrives with no browsing history behind it, so HubSpot
// files the contact under "Offline sources" no matter which ad, email or search
// brought them - every paid-social lead would read as if it walked in off the
// street. With it, HubSpot stitches the submission to the visitor's tracked
// pageviews, original source and campaign included.
//
// The cookie only exists once HubSpot's script has run, and that script loads
// after cookie consent (CookieConsent), so reading it here never tracks anyone
// who declined.
//
// VALIDATED, NOT PASSED THROUGH. HubSpot rejects a submission whose hutk is not
// a real token, and a non-2xx throws in submitHubspotForm - a mangled cookie
// must cost us the attribution, never the lead.
const HUTK = /^[a-f0-9]{32}$/;

export function hubspotUtk(request: Request): string | undefined {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name !== "hubspotutk") continue;
    const value = rest.join("=").trim();
    return HUTK.test(value) ? value : undefined;
  }
  return undefined;
}

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
          // Omitted rather than sent empty: HubSpot treats "" as a bad token.
          ...(opts.hutk ? { hutk: opts.hutk } : {}),
        },
      }),
    }
  );
  if (!res.ok) throw new Error(`HubSpot ${res.status}`);
  return "submitted";
}
