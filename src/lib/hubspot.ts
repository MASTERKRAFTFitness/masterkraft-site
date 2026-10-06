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

// ---------------------------------------------------------------------------
// A paid web order as a HubSpot DEAL, through the CRM API.
//
// WHY A DEAL AS WELL AS THE FORM. The order form makes the buyer a contact, but
// a contact carries no money, so HubSpot's ad and campaign reports could say
// which ad found a buyer and never what they spent. A closed-won deal with the
// amount is what those reports total.
//
// The Forms API above needs no credentials; this does: a private app token
// (HubSpot → Settings → Integrations → Private apps) with the scopes
// crm.objects.contacts.write and crm.objects.deals.write. Without it, skipped.
//
// The contact is UPSERTED by email rather than searched for, because the order
// form submission runs alongside and HubSpot processes it asynchronously, so a
// search here would usually find no one. Email is HubSpot's contact key, so the
// form and the upsert land on the same contact whichever arrives first.
const CRM = "https://api.hubapi.com/crm/v3/objects";
const DEAL_TO_CONTACT = 3; // HubSpot-defined association type: deal → contact
const CRM_TIMEOUT_MS = 8000;

export type HubspotOrderDeal = {
  orderNumber: string;
  email: string;
  firstName?: string;
  lastName?: string;
  /** What the customer paid, GST and freight included. */
  amount: number;
  description?: string;
};

export async function createHubspotOrderDeal(d: HubspotOrderDeal): Promise<"submitted" | "skipped"> {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token || !d.email) return "skipped";

  const contact = await crm<{ results: { id: string }[] }>(token, "/contacts/batch/upsert", {
    inputs: [
      {
        idProperty: "email",
        id: d.email,
        properties: {
          email: d.email,
          // Omitted when empty, so a blank never overwrites a name already held.
          ...(d.firstName ? { firstname: d.firstName } : {}),
          ...(d.lastName ? { lastname: d.lastName } : {}),
        },
      },
    ],
  });
  const contactId = contact.results?.[0]?.id;
  if (!contactId) throw new Error("HubSpot contact upsert returned no id");

  await crm(token, "/deals", {
    properties: {
      dealname: `Web order #${d.orderNumber}`,
      amount: d.amount.toFixed(2),
      pipeline: process.env.HUBSPOT_ORDER_PIPELINE || "default",
      dealstage: process.env.HUBSPOT_ORDER_DEALSTAGE || "closedwon",
      closedate: new Date().toISOString(),
      ...(d.description ? { description: d.description } : {}),
    },
    associations: [
      {
        to: { id: contactId },
        types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: DEAL_TO_CONTACT }],
      },
    ],
  });
  return "submitted";
}

async function crm<T = unknown>(token: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${CRM}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(CRM_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HubSpot CRM ${res.status}`);
  return (await res.json()) as T;
}
