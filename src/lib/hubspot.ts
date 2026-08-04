// HubSpot Forms submission (server-side). Posts to the Forms Submissions API,
// which creates/updates a contact in HubSpot. Gated on env config so it degrades
// gracefully to a no-op until the portal + form GUIDs are provided.

const PORTAL_ID = process.env.HUBSPOT_PORTAL_ID;

export type HubspotField = { name: string; value: string };

export async function submitHubspotForm(
  formGuid: string | undefined,
  fields: HubspotField[],
  opts: { pageName?: string; pageUri?: string } = {}
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
        },
      }),
    }
  );
  if (!res.ok) throw new Error(`HubSpot ${res.status}`);
  return "submitted";
}
