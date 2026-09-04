// The SalesOrder body, asserted without an ERP to send it to. These are the
// rules that decide what the warehouse picks and what the books record, so they
// are pinned here rather than discovered on the first live write.
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  buildSalesOrderPayload,
  buildComments,
  resolveCustomer,
  customerStrategy,
  ordersEnabled,
  checkTotalAgainstCharge,
  type CreateUnleashedOrderInput,
} from "@/lib/unleashed-orders";
import type { UnleashedMap } from "@/lib/unleashed";

const erp: UnleashedMap = {
  MMDBRH12: { price: 55, stock: 4, name: "Rubber Hex Dumbbell - 10kg", guid: "g-dumbbell", sellable: true },
  MBCTMA01: { price: 900, stock: 1, name: "Multi Adjustable Bench", sellable: true }, // no guid cached
};

const billing = {
  first_name: "Dana",
  last_name: "Okafor",
  email: "dana@example.com",
  phone: "0400 000 000",
  address_1: "12 Example St",
  city: "Brunswick",
  state: "VIC",
  postcode: "3056",
};

const base: CreateUnleashedOrderInput = {
  billing,
  lines: [{ productId: 0, sku: "MMDBRH12", quantity: 2, unitPrice: 55, name: "Rubber Hex Dumbbell - 10kg" }],
  paymentIntentId: "pi_test_123",
};

const build = (i: CreateUnleashedOrderInput) =>
  buildSalesOrderPayload(i, { CustomerCode: "WEB" }, erp, {
    guid: "order-guid",
    now: new Date("2026-09-04T00:00:00.000Z"),
  });

const env = { ...process.env };
beforeEach(() => {
  delete process.env.UNLEASHED_CUSTOMER_STRATEGY;
  delete process.env.UNLEASHED_WEB_CUSTOMER_CODE;
  delete process.env.UNLEASHED_FREIGHT_CODE;
  delete process.env.UNLEASHED_WRITE_ENABLED;
});
afterEach(() => {
  process.env = { ...env };
});

describe("GST goes in ex, and adds back up", () => {
  it("submits ex-GST unit prices that reconcile to the inc-GST charge", () => {
    const p = build(base) as Record<string, number | unknown[]>;
    const line = (p.SalesOrderLines as Record<string, number>[])[0];
    // 55 inc GST -> 50 ex GST. Two of them.
    expect(line.UnitPrice).toBe(50);
    expect(line.LineTotal).toBe(100);
    expect(line.LineTax).toBe(10);
    expect(p.SubTotal).toBe(100);
    expect(p.TaxTotal).toBe(10);
    // and back to what the card was charged
    expect(p.Total).toBe(110);
  });

  it("keeps a price that does not divide cleanly reconciling to the cent", () => {
    const p = build({
      ...base,
      lines: [{ productId: 0, sku: "MMDBRH12", quantity: 3, unitPrice: 58, name: "x" }],
    }) as Record<string, number>;
    expect(p.Total).toBe(174); // 3 x 58 inc GST, however the ex-GST split falls
  });
});

describe("lines identify a product the warehouse can pick", () => {
  it("sends the Guid and the code together when both are known", () => {
    const line = ((build(base) as Record<string, unknown[]>).SalesOrderLines as Record<string, unknown>[])[0];
    expect(line.Product).toEqual({ Guid: "g-dumbbell", ProductCode: "MMDBRH12" });
  });

  it("still sends the code when no Guid was cached", () => {
    const p = build({
      ...base,
      lines: [{ productId: 0, sku: "MBCTMA01", quantity: 1, unitPrice: 900, name: "x" }],
    }) as Record<string, unknown[]>;
    expect((p.SalesOrderLines as Record<string, unknown>[])[0].Product).toEqual({
      ProductCode: "MBCTMA01",
    });
  });

  it("refuses a line with no ERP code rather than sending an unpickable order", () => {
    expect(() =>
      build({ ...base, lines: [{ productId: 5, quantity: 1, unitPrice: 10, name: "x" }] })
    ).toThrow(/no ERP ProductCode/);
  });

  it("refuses a code the ERP does not know", () => {
    expect(() =>
      build({ ...base, lines: [{ productId: 0, sku: "NOPE", quantity: 1, unitPrice: 10, name: "x" }] })
    ).toThrow(/does not know ProductCode NOPE/);
  });
});

describe("freight is a line, and never a free one", () => {
  it("adds a freight line when freight was charged", () => {
    process.env.UNLEASHED_FREIGHT_CODE = "FREIGHT01";
    const p = build({ ...base, freight: { amount: 36.8, carrier: "AusPost", service: "Parcel" } }) as Record<
      string,
      number | unknown[]
    >;
    const lines = p.SalesOrderLines as Record<string, unknown>[];
    expect(lines).toHaveLength(2);
    expect(lines[1].Product).toEqual({ ProductCode: "FREIGHT01" });
    expect(lines[1].Comments).toBe("AusPost Parcel");
    // 110 goods + 36.80 freight, both inc GST
    expect(p.Total).toBe(146.8);
  });

  it("adds NO line when freight was not charged, rather than a $0 one", () => {
    // A $0 freight line on heavy goods reads as "ship it for nothing".
    const p = build(base) as Record<string, unknown[]>;
    expect(p.SalesOrderLines).toHaveLength(1);
    expect(buildComments(base)).toMatch(/FREIGHT NOT CHARGED/);
  });

  it("refuses to guess a freight code when one is needed", () => {
    expect(() => build({ ...base, freight: { amount: 36.8 } })).toThrow(/UNLEASHED_FREIGHT_CODE/);
  });
});

describe("the buyer survives a shared customer account", () => {
  it("writes who bought it into Comments, where a picker will read it", () => {
    const c = buildComments(base);
    expect(c).toContain("Dana Okafor");
    expect(c).toContain("dana@example.com");
    expect(c).toContain("0400 000 000");
    expect(c).toContain("pi_test_123");
  });

  it("puts the delivery address in the flat fields Unleashed expects", () => {
    const p = build(base) as Record<string, string>;
    expect(p.DeliveryName).toBe("Dana Okafor");
    expect(p.DeliverySuburb).toBe("Brunswick");
    expect(p.DeliveryRegion).toBe("VIC");
    expect(p.DeliveryPostCode).toBe("3056");
    expect(p.DeliveryCountry).toBe("Australia");
  });

  it("ships to the shipping address when one differs from billing", () => {
    const p = build({
      ...base,
      shipping: { ...billing, first_name: "Site", last_name: "Contact", city: "Geelong" },
    }) as Record<string, string>;
    expect(p.DeliveryName).toBe("Site Contact");
    expect(p.DeliverySuburb).toBe("Geelong");
  });

  it("lands as Parked, not into picking", () => {
    expect((build(base) as Record<string, string>).OrderStatus).toBe("Parked");
  });

  it("carries the payment reference as CustomerRef, so a bank line reconciles", () => {
    expect((build(base) as Record<string, string>).CustomerRef).toBe("pi_test_123");
  });
});

describe("the customer decision is a decision, not a default", () => {
  it("defaults to the shared account strategy", () => {
    expect(customerStrategy()).toBe("generic");
  });

  it("refuses to invent a web customer when none is configured", async () => {
    await expect(resolveCustomer(billing)).rejects.toThrow(/UNLEASHED_WEB_CUSTOMER_CODE/);
  });

  it("uses the configured account once one exists", async () => {
    process.env.UNLEASHED_WEB_CUSTOMER_CODE = "WEBSALES";
    await expect(resolveCustomer(billing)).resolves.toEqual({ CustomerCode: "WEBSALES" });
  });

  it("refuses the strategies nobody has chosen yet", async () => {
    process.env.UNLEASHED_CUSTOMER_STRATEGY = "match-email";
    await expect(resolveCustomer(billing)).rejects.toThrow(/not implemented yet/);
  });
});

describe("it is off until somebody turns it on", () => {
  it("is disabled by default", () => {
    expect(ordersEnabled()).toBe(false);
  });

  it("warns rather than throws when the recorded total misses the charge", () => {
    const warn = console.warn;
    const seen: string[] = [];
    console.warn = (m: string) => seen.push(m);
    checkTotalAgainstCharge(110, 86.8, "SO-1");
    console.warn = warn;
    expect(seen[0]).toMatch(/total mismatch/);
  });
});
