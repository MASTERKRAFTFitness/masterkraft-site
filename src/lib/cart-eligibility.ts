// Which carts can be paid for by card, in one testable place.
//
// THIS RULE USED TO BE `productId > 0` AND THAT IS NO LONGER WHAT IT MEANS.
// The original reasoning was sound: `resolveOrderLines` repriced a paid order
// against WooCommerce, so a line with no WooCommerce product could not be
// verified server-side, and letting one reach the card form would fail the order
// AFTER the card was captured.
//
// Repricing moved to the ERP. `resolveOrderLines` now looks a line up by its
// Unleashed ProductCode and prices it from there, returning before WooCommerce is
// ever consulted; the Woo path survives only for a line carrying no code at all.
// Orders are written into Unleashed too, and `buildSalesOrderPayload` THROWS on a
// line with no ProductCode. So the code is the handle that matters, and
// `productId` is now decoration.
//
// Keeping the old rule cost 557 of 1,345 sellable products - Apparel 97%,
// Strength 79% - which sold perfectly well through the quote flow but could not
// be bought by card for a reason that had stopped applying.
//
// STILL FAILS CLOSED. A code the ERP does not recognise makes
// `resolveOrderLines` throw, which happens at payment-intent time - BEFORE the
// card is charged - so the customer is sent to the quote flow rather than left
// with a payment and no order. The point was never `productId`; it was that
// every line must be re-pricable server-side, and now it is the code that says
// whether it is.

export type CartLine = {
  /** GST-inclusive, as the cart holds it. Zero means price on application. */
  price?: number;
  /** Unleashed ProductCode. The handle the server reprices and measures from. */
  sku?: string;
  /** WooCommerce product id, 0 for a line the old store never listed. */
  productId?: number;
};

/**
 * True when a single line can be verified and charged server-side.
 *
 * Price is checked as well as the code because a $0 line is "contact for
 * pricing" - it has a real ProductCode and still must not reach a card form.
 */
export function lineSellableByCard(line: CartLine): boolean {
  return (line.price ?? 0) > 0 && Boolean(line.sku?.trim());
}

/**
 * True when EVERY line can be. One unverifiable line sends the whole cart to the
 * quote flow, for the same reason freight fails a whole cart on one unmeasured
 * carton: charging for part of an order and sorting the rest out later is worse
 * than pricing none of it.
 */
export function cartSellableByCard(lines: CartLine[]): boolean {
  return lines.length > 0 && lines.every(lineSellableByCard);
}
