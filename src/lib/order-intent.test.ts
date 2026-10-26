// The cart and buyer stored on a PaymentIntent are the ONLY record of an
// Afterpay or Zip order when the customer does not come back, so a round trip
// that drops or mangles anything is an order lost after the money was taken.
import { describe, expect, it } from "vitest";
import { chunked, orderIntentData, orderIntentMetadata, unchunked } from "@/lib/order-intent";

const billing = {
  first_name: "Sam",
  last_name: "Lee",
  email: "sam@example.com",
  phone: "0400 000 000",
  company: "Iron Gym",
  address_1: "1 Main St",
  city: "Pakenham",
  state: "VIC",
  postcode: "3810",
  country: "AU",
};

describe("order intent metadata", () => {
  it("round-trips the cart and the buyer", () => {
    const items = [
      { productId: 12, variationId: 34, quantity: 2, sku: "N-PLATE-20" },
      { productId: 0, quantity: 1, sku: "F-BENCH" },
    ];
    const meta = orderIntentMetadata({ items, billing, checkoutId: "abcdef0123456789", anonId: "anon-1" });
    expect(orderIntentData(meta)).toEqual({ items, billing, checkoutId: "abcdef0123456789", anonId: "anon-1" });
  });

  it("keeps every value inside Stripe's 500-character limit, however big the cart", () => {
    const items = Array.from({ length: 120 }, (_, i) => ({ productId: 1000 + i, quantity: 3, sku: `N-ITEM-${i}` }));
    const meta = orderIntentMetadata({ items, billing });
    expect(Object.values(meta).every((v) => v.length <= 500)).toBe(true);
    expect(Object.keys(meta).length).toBeLessThan(35);
    expect(orderIntentData(meta)?.items).toEqual(items);
  });

  it("refuses a cart too large to store rather than storing part of it", () => {
    const items = Array.from({ length: 1000 }, (_, i) => ({ productId: i, quantity: 1, sku: `N-LONG-CODE-${i}` }));
    expect(() => orderIntentMetadata({ items, billing })).toThrow(/too large/);
  });

  it("refuses a product code that would corrupt the packing", () => {
    expect(() => orderIntentMetadata({ items: [{ productId: 1, quantity: 1, sku: "A|B" }], billing })).toThrow();
  });

  it("reads an intent created before carts were stored as having none", () => {
    expect(orderIntentData({ source: "masterkraft-site", freight_amount: "40.00" })).toBeNull();
    expect(orderIntentData(null)).toBeNull();
  });

  it("will not build an order with no email to confirm it to", () => {
    const meta = orderIntentMetadata({ items: [{ productId: 1, quantity: 1 }], billing: { ...billing, email: "" } });
    expect(orderIntentData(meta)).toBeNull();
  });

  it("joins chunks in order", () => {
    const s = "x".repeat(1200) + "end";
    expect(unchunked(chunked("p", s), "p")).toBe(s);
  });
});
