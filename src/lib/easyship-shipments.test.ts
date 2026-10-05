import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  itemsToCartons,
  planShipments,
  shipmentBody,
  splitStreet,
  syncShipmentsToEasyship,
  type ShipmentOrder,
} from "@/lib/easyship-shipments";
import type { FreightItem } from "@/lib/freight";

// The first web order, SO-00000862, as it was keyed into Easyship by hand.
const deadBall: FreightItem = {
  sku: "AMDEHG01",
  name: "High Grip Dead Ball - 3kg",
  quantity: 1,
  weightKg: 3.5,
  lengthCm: 29,
  widthCm: 29,
  heightCm: 29,
};
// Over the parcel limits, so the checkout quotes it as its own consignment.
const barbell: FreightItem = {
  sku: "BAR224",
  name: "Olympic Barbell 224cm",
  quantity: 1,
  weightKg: 21,
  lengthCm: 224,
  widthCm: 10,
  heightCm: 10,
};

const order = (over: Partial<ShipmentOrder> = {}): ShipmentOrder => ({
  orderNumber: "SO-00000862",
  billing: {
    first_name: "Mirinda",
    last_name: "O'Gorman",
    email: "mirinda@example.com",
    phone: "+61451000000",
    address_1: "945 Park St",
    city: "Brunswick West",
    state: "VIC",
    postcode: "3055",
    country: "AU",
  },
  lines: [{ productId: 1, sku: "AMDEHG01", quantity: 1, unitPrice: 13.75, name: "High Grip Dead Ball - 3kg" }],
  items: [deadBall],
  freightOptionId: "easyship:svc-aramex",
  freightLabel: "Aramex Domestic",
  ...over,
});

describe("planning the shipments from the freight the customer bought", () => {
  it("preselects the Easyship courier for a single consignment", () => {
    const plans = planShipments(itemsToCartons([deadBall]), "easyship:svc-aramex");
    expect(plans).toHaveLength(1);
    expect(plans[0].courierServiceId).toBe("svc-aramex");
    expect(plans[0].cartons[0].sku).toBe("AMDEHG01");
  });

  // Australia Post and the freight matrix are not Easyship services, so there is
  // no courier to preselect. The shipment still goes in, for a person to check.
  it("creates one shipment with no courier when the freight was not Easyship", () => {
    for (const id of ["auspost:AUS_PARCEL_REGULAR", "matrix:mainfreight", "", undefined]) {
      const plans = planShipments(itemsToCartons([deadBall]), id);
      expect(plans).toHaveLength(1);
      expect(plans[0].courierServiceId).toBeUndefined();
    }
  });

  it("splits like the checkout did: bulky alone, parcels together, each with its courier", () => {
    const cartons = itemsToCartons([barbell, { ...deadBall, quantity: 2 }]);
    const plans = planShipments(cartons, "split:easyship:svc-tnt+auspost:AUS_PARCEL_REGULAR");
    expect(plans).toHaveLength(2);
    expect(plans[0].cartons.map((c) => c.sku)).toEqual(["BAR224"]);
    expect(plans[0].courierServiceId).toBe("svc-tnt");
    expect(plans[1].cartons.map((c) => c.sku)).toEqual(["AMDEHG01", "AMDEHG01"]);
    expect(plans[1].courierServiceId).toBeUndefined();
  });

  it("does not guess when the split no longer lines up with the cartons", () => {
    const plans = planShipments(itemsToCartons([deadBall]), "split:easyship:a+easyship:b");
    expect(plans).toEqual([{ cartons: itemsToCartons([deadBall]) }]);
  });

  it("reads through a whole-cart matrix price", () => {
    const plans = planShipments(itemsToCartons([barbell, deadBall]), "whole:easyship:svc-x");
    expect(plans).toHaveLength(1);
    expect(plans[0].cartons).toHaveLength(2);
    expect(plans[0].courierServiceId).toBe("svc-x");
  });
});

describe("Easyship's 35-character street lines", () => {
  it("leaves a short street alone", () => {
    expect(splitStreet("945 Park St")).toEqual({ line_1: "945 Park St" });
  });
  it("breaks a long street on a space, never inside a word", () => {
    const r = splitStreet("Unit 12, Building C, 1234 Very Long Industrial Boulevard");
    expect(r.line_1.length).toBeLessThanOrEqual(35);
    expect((r.line_2 ?? "").length).toBeLessThanOrEqual(35);
    expect(`${r.line_1} ${r.line_2}`).toBe("Unit 12, Building C, 1234 Very Long Industrial Boulevard");
  });
});

describe("the shipment request", () => {
  const origin = { contact_name: "MasterKraft", line_1: "8/337-339 Settlement Rd" };
  const dest = { contact_name: "Mirinda O'Gorman", line_1: "945 Park St" };

  it("never buys the label", () => {
    const plan = planShipments(itemsToCartons([deadBall]), "easyship:svc-aramex")[0];
    const body = shipmentBody(order(), plan, 0, 1, origin, dest);
    expect(body.shipping_settings).toEqual({ buy_label: false });
  });

  it("carries the order number, the courier and the real carton", () => {
    const plan = planShipments(itemsToCartons([deadBall]), "easyship:svc-aramex")[0];
    const body = shipmentBody(order(), plan, 0, 1, origin, dest);
    expect(body.order_data.platform_order_number).toBe("SO-00000862");
    expect(body.courier_settings).toEqual({ courier_service_id: "svc-aramex", allow_fallback: true });
    expect(body.parcels).toEqual([
      expect.objectContaining({
        total_actual_weight: 3.5,
        box: { length: 29, width: 29, height: 29 },
        items: [expect.objectContaining({ sku: "AMDEHG01", declared_customs_value: 13.75 })],
      }),
    ]);
    expect(body.set_as_residential).toBe(true);
  });

  it("numbers the consignments of a split order", () => {
    const plan = planShipments(itemsToCartons([deadBall]))[0];
    const body = shipmentBody(order(), plan, 1, 2, origin, dest);
    expect(body.order_data.platform_order_number).toBe("SO-00000862 (2/2)");
    expect(body.courier_settings).toEqual({});
  });

  it("treats an order to a company as a business address", () => {
    const plan = planShipments(itemsToCartons([deadBall]))[0];
    const body = shipmentBody(
      order({ billing: { ...order().billing, company: "Fernwood Pakenham" } }),
      plan,
      0,
      1,
      origin,
      dest
    );
    expect(body.set_as_residential).toBe(false);
  });
});

describe("syncing an order", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("EASYSHIP_SHIPMENT_SYNC", "true");
    vi.stubEnv("EASYSHIP_API_TOKEN", "test-token");
    vi.stubEnv("EASYSHIP_ORIGIN_PHONE", "+61400000000");
    vi.stubEnv("FREIGHT_COLLECTION_POSTCODE", "3074");
    vi.stubEnv("FREIGHT_COLLECTION_CITY", "Thomastown");
    vi.stubEnv("FREIGHT_COLLECTION_STATE", "VIC");
    vi.stubEnv("FREIGHT_COLLECTION_LINE1", "8/337-339 Settlement Rd");
    vi.stubEnv("QUOTE_TO_EMAIL", "team@example.com");
    vi.stubEnv("QUOTE_FROM_EMAIL", "MasterKraft <quotes@example.com>");
    vi.stubEnv("RESEND_API_KEY", "re_test");
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const easyshipCalls = () =>
    fetchMock.mock.calls.filter(([url]) => String(url).includes("easyship.com"));
  const emailCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).includes("resend.com"));

  it("does nothing until switched on", async () => {
    vi.stubEnv("EASYSHIP_SHIPMENT_SYNC", "");
    expect(await syncShipmentsToEasyship(order())).toEqual({
      status: "skipped",
      reason: "EASYSHIP_SHIPMENT_SYNC is off",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("creates the shipment and returns Easyship's id", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ shipment: { easyship_shipment_id: "ESAU1001" } }), { status: 201 })
    );
    expect(await syncShipmentsToEasyship(order())).toEqual({ status: "created", shipments: ["ESAU1001"] });
    const [url, init] = easyshipCalls()[0];
    expect(url).toBe("https://public-api.easyship.com/2024-09/shipments");
    const sent = JSON.parse(init.body);
    expect(sent.destination_address).toEqual(
      expect.objectContaining({
        contact_name: "Mirinda O'Gorman",
        line_1: "945 Park St",
        city: "Brunswick West",
        postal_code: "3055",
      })
    );
    expect(sent.origin_address).toEqual(
      expect.objectContaining({ postal_code: "3074", contact_email: "team@example.com" })
    );
    expect(emailCalls()).toHaveLength(0);
  });

  // The point of the whole module: a paid order whose shipment did not make it
  // must reach a person, not just a log.
  it("emails the team when Easyship refuses, naming the field", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { message: "The request body content is not valid.", details: ["destination_address.state is missing"] },
          }),
          { status: 422 }
        )
      )
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const r = await syncShipmentsToEasyship(order());
    expect(r).toEqual({
      status: "error",
      error: "The request body content is not valid. destination_address.state is missing",
      created: [],
      alerted: true,
    });
    const mail = JSON.parse(emailCalls()[0][1].body);
    expect(mail.subject).toBe("Add web order #SO-00000862 to Easyship by hand");
    expect(mail.to).toEqual(["team@example.com"]);
  });

  it("never throws, even when the network does", async () => {
    fetchMock.mockRejectedValue(new Error("socket hang up"));
    const r = await syncShipmentsToEasyship(order());
    expect(r).toEqual({ status: "error", error: "socket hang up", created: [], alerted: false });
  });

  it("reports what already exists when a split order fails part-way", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ shipment: { easyship_shipment_id: "ESAU2001" } }), { status: 201 })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "boom" }), { status: 500 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const r = await syncShipmentsToEasyship(
      order({
        items: [barbell, deadBall],
        freightOptionId: "split:easyship:svc-tnt+easyship:svc-aramex",
      })
    );
    expect(r).toEqual({ status: "error", error: "boom", created: ["ESAU2001"], alerted: true });
    expect(easyshipCalls()).toHaveLength(2);
    expect(JSON.parse(emailCalls()[0][1].body).html).toContain("ESAU2001");
  });

  it("refuses an address it cannot ship to rather than sending half of one", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const r = await syncShipmentsToEasyship(
      order({ billing: { ...order().billing, address_1: "" } })
    );
    expect(r).toMatchObject({ status: "error", error: "delivery address is incomplete" });
    expect(easyshipCalls()).toHaveLength(0);
  });
});
