// What a product page says about availability, from the two warehouses Unleashed
// holds stock in. Shared by the single-product block and the size picker so the
// two can never word the same stock differently.
//
// MELBOURNE IS "IN STOCK". It is the only warehouse an order ships from without
// a container in between, so `stock` (Melbourne) alone decides inStock across
// the site — cards, the schema and the Merchant feed included. CHINA stock is
// real and orderable, but it is a lead time, not a dispatch, and saying "in
// stock" for it promised next-week delivery on goods still on the water.
//
// The lead time is the business's figure (22 Oct 2026), not the ERP's: Unleashed
// records where stock sits, not how long it takes to arrive. Change it here.
export const CHINA_LEAD_TIME = "6–8 weeks";

export type StockLabel = {
  /** The line under the price. */
  text: string;
  /** The suffix on a size in the picker, empty when it ships now. */
  optionSuffix: string;
};

/**
 * `inStock` is passed separately because a snapshot-backed product can be in
 * stock with no ERP quantity to show (enrich() falls back to WooCommerce's
 * stock_status), and that has always read "In stock" rather than a number.
 */
export function stockLabel(
  melbourne: number | undefined,
  china: number | undefined,
  inStock = !!melbourne && melbourne > 0
): StockLabel {
  if (inStock) {
    return { text: melbourne && melbourne > 0 ? `${melbourne} in stock` : "In stock", optionSuffix: "" };
  }
  if (china && china > 0) {
    return {
      text: `Overseas stock · ships in ${CHINA_LEAD_TIME}`,
      optionSuffix: ` (ships in ${CHINA_LEAD_TIME})`,
    };
  }
  return { text: "Made to order", optionSuffix: " (made to order)" };
}
