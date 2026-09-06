import { describe, expect, it } from "vitest";
import { cartSellableByCard, lineSellableByCard, type CartLine } from "@/lib/cart-eligibility";

const line = (over: Partial<CartLine> = {}): CartLine => ({
  price: 90.91,
  sku: "AMBXG01",
  productId: 403959,
  ...over,
});

describe("what makes a line payable by card", () => {
  it("accepts a line the server can reprice", () => {
    expect(lineSellableByCard(line())).toBe(true);
  });

  // THE CHANGE. An ERP-only size has productId 0 and used to be refused, because
  // repricing went to WooCommerce. It goes to the ERP now, and the code is what
  // it looks up - so the line is verifiable and can be charged.
  it("accepts an ERP-only line, which the old rule refused", () => {
    expect(lineSellableByCard(line({ productId: 0 }))).toBe(true);
    expect(lineSellableByCard(line({ productId: undefined }))).toBe(true);
  });

  // Without a code there is nothing to reprice against: the ERP cannot be asked,
  // and buildSalesOrderPayload throws on a line with no ProductCode.
  it("refuses a line with no ERP code, whatever its product id", () => {
    expect(lineSellableByCard(line({ sku: undefined }))).toBe(false);
    expect(lineSellableByCard(line({ sku: "   " }))).toBe(false);
  });

  // A real code, and still "contact for pricing".
  it("refuses a zero-priced line even with a good code", () => {
    expect(lineSellableByCard(line({ price: 0 }))).toBe(false);
    expect(lineSellableByCard(line({ price: undefined }))).toBe(false);
  });
});

describe("what makes a cart payable by card", () => {
  it("accepts a cart where every line is verifiable", () => {
    expect(cartSellableByCard([line(), line({ sku: "MWWLATT01", productId: 0 })])).toBe(true);
  });

  // Same reasoning as freight failing a whole cart on one unmeasured carton:
  // charging for part of an order and sorting the rest out later is worse.
  it("refuses the whole cart for one unverifiable line", () => {
    expect(cartSellableByCard([line(), line({ sku: undefined })])).toBe(false);
    expect(cartSellableByCard([line(), line({ price: 0 })])).toBe(false);
  });

  it("refuses an empty cart", () => {
    expect(cartSellableByCard([])).toBe(false);
  });
});
