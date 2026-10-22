import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

const upsert = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/lib/admin-db", () => ({ adminDb: () => ({ from: () => ({ upsert }) }) }));

const { POST } = await import("./route");

const SECRET = "webh_route_test";
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
function sign(secret = SECRET) {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ easyship_company_id: "c1" });
  return `${head}.${body}.${createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url")}`;
}
const event = {
  event_type: "shipment.label.created",
  data: { easyship_shipment_id: "ESAU1", platform_order_number: "SO-00000877", status: "success", tracking_number: "CP1" },
};
const req = (signature?: string, body: unknown = event) =>
  new Request("https://masterkraft.com/api/easyship/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", ...(signature ? { "x-easyship-signature": signature } : {}) },
    body: JSON.stringify(body),
  });

afterEach(() => {
  vi.unstubAllEnvs();
  upsert.mockClear();
});

describe("POST /api/easyship/webhook", () => {
  it("refuses everything until the secret is set", async () => {
    vi.stubEnv("EASYSHIP_WEBHOOK_SECRET", "");
    expect((await POST(req(sign()))).status).toBe(503);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("refuses an unsigned or wrongly signed event", async () => {
    vi.stubEnv("EASYSHIP_WEBHOOK_SECRET", SECRET);
    expect((await POST(req())).status).toBe(401);
    expect((await POST(req(sign("webh_wrong")))).status).toBe(401);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("stores a signed label event and answers 200", async () => {
    vi.stubEnv("EASYSHIP_WEBHOOK_SECRET", SECRET);
    const res = await POST(req(sign()));
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("acknowledges a signed event it does not use, so Easyship does not retry", async () => {
    vi.stubEnv("EASYSHIP_WEBHOOK_SECRET", SECRET);
    const res = await POST(req(sign(), { event_type: "credit.balance.low", resource_id: "x" }));
    expect(res.status).toBe(200);
  });
});
