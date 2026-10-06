// hubspotUtk decides whether a lead reaches HubSpot WITH its browsing history.
// Get it wrong one way and every paid lead files as "Offline sources"; get it
// wrong the other way and HubSpot rejects the submission outright.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHubspotOrderDeal, hubspotUtk } from "@/lib/hubspot";

const TOKEN = "0123456789abcdef0123456789abcdef";
const req = (cookie?: string) =>
  new Request("https://masterkraft.com/api/fitout-brief", {
    method: "POST",
    headers: cookie ? { cookie } : {},
  });

describe("hubspotUtk", () => {
  it("reads the token from among other cookies", () => {
    expect(hubspotUtk(req(`_ga=GA1.1.1; hubspotutk=${TOKEN}; __hssc=1`))).toBe(TOKEN);
  });

  it("is undefined for a visitor HubSpot never tracked", () => {
    expect(hubspotUtk(req())).toBeUndefined();
    expect(hubspotUtk(req("_ga=GA1.1.1"))).toBeUndefined();
  });

  it("drops a malformed token rather than letting HubSpot bounce the lead", () => {
    expect(hubspotUtk(req("hubspotutk=not-a-token"))).toBeUndefined();
    expect(hubspotUtk(req(`hubspotutk=${TOKEN}x`))).toBeUndefined();
  });

  it("does not match a cookie that merely ends in the same name", () => {
    expect(hubspotUtk(req(`xhubspotutk=${TOKEN}`))).toBeUndefined();
  });
});

// A paid order as a deal. What matters: it lands on the buyer's contact, closed
// won with what they paid, and does nothing at all without a token.
describe("createHubspotOrderDeal", () => {
  const env = { ...process.env };
  const fetchMock = vi.fn();
  const deal = {
    orderNumber: "SO-00000999",
    email: "sam@example.com",
    firstName: "Sam",
    lastName: "",
    amount: 111.7,
    description: "2× Band",
  };
  const bodies = () => fetchMock.mock.calls.map((c) => [c[0], JSON.parse(c[1].body)]);

  beforeEach(() => {
    process.env.HUBSPOT_ACCESS_TOKEN = "pat-test";
    fetchMock
      .mockReset()
      .mockResolvedValueOnce(Response.json({ results: [{ id: "501" }] }))
      .mockResolvedValueOnce(Response.json({ id: "9001" }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
  });

  it("upserts the contact by email, then creates a closed-won deal on it", async () => {
    expect(await createHubspotOrderDeal(deal)).toBe("submitted");
    const [[contactUrl, contact], [dealUrl, created]] = bodies();

    expect(contactUrl).toBe("https://api.hubapi.com/crm/v3/objects/contacts/batch/upsert");
    expect(contact.inputs[0]).toMatchObject({ idProperty: "email", id: "sam@example.com" });
    // A blank last name must not wipe one HubSpot already holds.
    expect(contact.inputs[0].properties).toEqual({ email: "sam@example.com", firstname: "Sam" });

    expect(dealUrl).toBe("https://api.hubapi.com/crm/v3/objects/deals");
    expect(created.properties).toMatchObject({
      dealname: "Web order #SO-00000999",
      amount: "111.70",
      pipeline: "default",
      dealstage: "closedwon",
      description: "2× Band",
    });
    expect(created.associations[0]).toEqual({
      to: { id: "501" },
      types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }],
    });
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer pat-test");
  });

  it("uses a configured pipeline and stage", async () => {
    process.env.HUBSPOT_ORDER_PIPELINE = "12345";
    process.env.HUBSPOT_ORDER_DEALSTAGE = "67890";
    await createHubspotOrderDeal(deal);
    expect(bodies()[1][1].properties).toMatchObject({ pipeline: "12345", dealstage: "67890" });
  });

  it("is skipped, with no request, until a token is set", async () => {
    delete process.env.HUBSPOT_ACCESS_TOKEN;
    expect(await createHubspotOrderDeal(deal)).toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws on a HubSpot error, for the caller to catch", async () => {
    fetchMock.mockReset().mockResolvedValue(new Response("forbidden", { status: 403 }));
    await expect(createHubspotOrderDeal(deal)).rejects.toThrow("HubSpot CRM 403");
  });
});
