import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { handleEvent, orderNumberFrom, verifySignature } from "./easyship-webhook";

const SECRET = "webh_test_secret";
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
function jwt(claims: Record<string, unknown>, secret = SECRET, alg = "HS256") {
  const head = b64({ alg, typ: "JWT" });
  const body = b64(claims);
  const sig = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

describe("verifySignature", () => {
  it("accepts a token signed with the secret", () => {
    expect(verifySignature(jwt({ easyship_company_id: "c1" }), SECRET)).toEqual({ easyship_company_id: "c1" });
  });

  it("refuses the wrong secret, a tampered body, and no token", () => {
    expect(verifySignature(jwt({}, "webh_other"), SECRET)).toBeNull();
    const [h, , s] = jwt({ a: 1 }).split(".");
    expect(verifySignature(`${h}.${b64({ a: 2 })}.${s}`, SECRET)).toBeNull();
    expect(verifySignature(null, SECRET)).toBeNull();
    expect(verifySignature("not-a-jwt", SECRET)).toBeNull();
  });

  it("refuses any algorithm but HS256, including none", () => {
    expect(verifySignature(jwt({}, SECRET, "HS512"), SECRET)).toBeNull();
    expect(verifySignature(`${b64({ alg: "none" })}.${b64({})}.`, SECRET)).toBeNull();
  });

  it("refuses an expired token", () => {
    const now = Date.parse("2026-10-22T00:00:00Z");
    expect(verifySignature(jwt({ exp: now / 1000 - 60 }), SECRET, now)).toBeNull();
    expect(verifySignature(jwt({ exp: now / 1000 + 60 }), SECRET, now)).not.toBeNull();
  });
});

describe("orderNumberFrom", () => {
  it("reads the sales order the sync sent, with or without a split suffix", () => {
    expect(orderNumberFrom("SO-00000877")).toBe("SO-00000877");
    expect(orderNumberFrom("SO-00000877 (2/3)")).toBe("SO-00000877");
    expect(orderNumberFrom("#so-00000862")).toBe("SO-00000862");
  });

  it("ignores references that are not sales orders", () => {
    expect(orderNumberFrom("#100001")).toBeNull();
    expect(orderNumberFrom("")).toBeNull();
    expect(orderNumberFrom(undefined)).toBeNull();
  });
});

/** A stand-in for the bits of the Supabase client handleEvent touches. */
function fakeDb() {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const eq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn(() => ({ eq }));
  const db = { from: vi.fn(() => ({ upsert, update })) };
  return { db: db as never, upsert, update, eq };
}

// Shaped on Easyship's documented shipment.label.created payload.
const labelCreated = {
  event_type: "shipment.label.created",
  resource_type: "shipment",
  resource_id: "ESAU10000001",
  data: {
    easyship_shipment_id: "ESAU10000001",
    platform_order_number: "SO-00000877",
    status: "success",
    label_url: "https://goeasyship.s3.amazonaws.com/ESAU10000001_label.pdf",
    tracking_number: "CPAZ00012345",
    tracking_page_url: "https://www.trackmyshipment.co/shipment-tracking/ESAU10000001",
  },
};

describe("handleEvent", () => {
  it("stores a bought label against its sales order", async () => {
    const { db, upsert } = fakeDb();
    const r = await handleEvent(labelCreated, db);
    expect(r).toEqual({ status: "stored", orderNumber: "SO-00000877", shipment: "ESAU10000001" });
    expect(upsert.mock.calls[0][0]).toMatchObject({
      easyship_shipment_id: "ESAU10000001",
      order_number: "SO-00000877",
      tracking_number: "CPAZ00012345",
      tracking_page_url: "https://www.trackmyshipment.co/shipment-tracking/ESAU10000001",
    });
  });

  it("ignores a failed label and a shipment that is not a web order", async () => {
    const { db, upsert } = fakeDb();
    expect(await handleEvent({ ...labelCreated, data: { ...labelCreated.data, status: "failed" } }, db)).toMatchObject({ status: "ignored" });
    expect(await handleEvent({ ...labelCreated, data: { ...labelCreated.data, platform_order_number: "#100001" } }, db)).toMatchObject({ status: "ignored" });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("drops a tracking page that is not https", async () => {
    const { db, upsert } = fakeDb();
    await handleEvent({ ...labelCreated, data: { ...labelCreated.data, tracking_page_url: "javascript:alert(1)" } }, db);
    expect(upsert.mock.calls[0][0].tracking_page_url).toBeNull();
  });

  it("updates tracking status on a later event", async () => {
    const { db, update, eq } = fakeDb();
    await handleEvent(
      { event_type: "shipment.tracking.status.changed", data: { easyship_shipment_id: "ESAU10000001", status: "Delivered" } },
      db
    );
    expect(update.mock.calls[0]).toEqual([expect.objectContaining({ tracking_status: "Delivered" })]);
    expect(eq).toHaveBeenCalledWith("easyship_shipment_id", "ESAU10000001");
  });

  it("acknowledges events it does not use", async () => {
    const { db } = fakeDb();
    expect(await handleEvent({ event_type: "credit.balance.low", resource_id: "x" }, db)).toMatchObject({ status: "ignored" });
  });
});
