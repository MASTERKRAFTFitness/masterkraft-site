// After-order notifications. The property that matters most is that none of it
// can throw: by the time it runs the customer has paid and the order exists.
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const submitHubspotForm = vi.fn();
vi.mock("@/lib/hubspot", () => ({
  submitHubspotForm: (...a: unknown[]) => submitHubspotForm(...a),
}));

const { notifyOrderPlaced } = await import("@/lib/order-notify");

const order = {
  orderNumber: "SO-00000999",
  billing: {
    first_name: "Sam",
    last_name: "Buyer",
    email: "sam@example.com",
    phone: "0400000000",
    address_1: "1 Test St",
    city: "Richmond",
    state: "VIC",
    postcode: "3121",
  },
  lines: [{ productId: 1, sku: "MK-1", quantity: 2, unitPrice: 50, name: "Band <heavy>" }],
  freight: { amount: 11.73, carrier: "Australia Post", service: "Extra small" },
  chargedTotal: 111.73,
};

const env = { ...process.env };
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  submitHubspotForm.mockReset().mockResolvedValue("submitted");
  process.env.RESEND_API_KEY = "re_test";
  process.env.QUOTE_FROM_EMAIL = "MasterKraft <orders@masterkraft.com>";
  process.env.QUOTE_TO_EMAIL = "hello@masterkraft.com,ops@masterkraft.com";
  delete process.env.HUBSPOT_FORM_ORDER;
  process.env.HUBSPOT_FORM_QUOTE = "quote-guid";
});
afterEach(() => {
  process.env = { ...env };
  vi.unstubAllGlobals();
});

const sent = () => fetchMock.mock.calls.map((c) => JSON.parse(c[1].body));

describe("notifyOrderPlaced", () => {
  it("emails the customer and the team, and records the buyer in HubSpot", async () => {
    const r = await notifyOrderPlaced(order);
    expect(r).toEqual({ customerEmail: "sent", teamEmail: "sent", hubspot: "sent" });

    const [customer, team] = sent();
    expect(customer.to).toEqual(["sam@example.com"]);
    expect(customer.reply_to).toBe("hello@masterkraft.com");
    expect(customer.subject).toContain("SO-00000999");
    expect(customer.html).toContain("1 Test St");
    expect(customer.html).toContain("Band &lt;heavy&gt;");
    expect(customer.html).toContain("111.73");

    expect(team.to).toEqual(["hello@masterkraft.com", "ops@masterkraft.com"]);
    expect(team.reply_to).toBe("sam@example.com");

    const [guid, fields] = submitHubspotForm.mock.calls[0];
    expect(guid).toBe("quote-guid");
    expect(fields).toContainEqual({ name: "email", value: "sam@example.com" });
  });

  it("prefers a dedicated order form in HubSpot when one is configured", async () => {
    process.env.HUBSPOT_FORM_ORDER = "order-guid";
    await notifyOrderPlaced(order);
    expect(submitHubspotForm.mock.calls[0][0]).toBe("order-guid");
  });

  it("never throws when every side effect fails", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 500 }));
    submitHubspotForm.mockRejectedValue(new Error("HubSpot 400"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(notifyOrderPlaced(order)).resolves.toEqual({
      customerEmail: "error",
      teamEmail: "error",
      hubspot: "error",
    });
    spy.mockRestore();
  });

  it("skips email quietly when Resend is not configured", async () => {
    delete process.env.RESEND_API_KEY;
    const r = await notifyOrderPlaced(order);
    expect(r.customerEmail).toBe("skipped");
    expect(r.teamEmail).toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
