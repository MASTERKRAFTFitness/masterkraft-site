// Where an order is written, and the one shape the route sees. The route does
// not know which system that is — it verifies the payment, reprices the cart,
// and places the order.
//
// THERE IS ONLY THE ERP NOW, 2026-09-15. This chose between two backends while
// the move off WooCommerce was in progress, and defaulted to WooCommerce when
// UNLEASHED_WRITE_ENABLED was absent. That default was the hazard: production
// has UNLEASHED_WRITE_ENABLED=true and WC_WRITE_ENABLED=false, so the fallback
// could only have fired by losing the flag — and it would then have POSTed to
// WC_STORE_URL, which is this storefront, returning 404 AFTER the card was
// charged. An order written nowhere while the customer is told it succeeded is
// the worst outcome available, because nobody goes looking for it.
//
// So the choice is gone and the gate fails closed: no flag, no order, and no
// charge taken first. Turning the ERP path off is now a decision someone has to
// make, not something a missing variable does quietly.
import { type CreateOrderInput } from "@/lib/order-lines";
import {
  createUnleashedOrder,
  ordersEnabled as unleashedOrdersEnabled,
} from "@/lib/unleashed-orders";
import { getUnleashedMap, lookupBySku } from "@/lib/unleashed";

/**
 * Kept as a union rather than narrowed to "unleashed": PaymentIntents written
 * before the cutover still carry `order_backend: "woocommerce"` and
 * existingOrderOn has to keep reading them. Nothing PRODUCES that value now.
 */
export type OrderBackend = "woocommerce" | "unleashed";

export function orderingEnabled(): boolean {
  return unleashedOrdersEnabled();
}

export type PlacedOrder = {
  /**
   * The backend's own key: a numeric WooCommerce id, or an Unleashed Guid.
   * A STRING either way — the Guid is not a number, and the old route coerced
   * this with Number(), which would have turned every ERP order into NaN.
   */
  id: string;
  /** What the customer is shown and what reconciles a payment. */
  orderNumber: string;
  status: string;
  total: number;
  backend: OrderBackend;
};

export async function placeOrder(input: CreateOrderInput): Promise<PlacedOrder> {
  // FAIL CLOSED. The route checks orderingEnabled() before charging, so reaching
  // here with the flag off means the config changed mid-checkout. Throwing is
  // then the only honest answer: the alternative is telling a customer their
  // order exists when no system holds it.
  if (!unleashedOrdersEnabled()) {
    throw new Error("Order creation is disabled (UNLEASHED_WRITE_ENABLED)");
  }

  const o = await createUnleashedOrder(input);
  return {
    id: o.guid,
    // Unleashed assigns SO-000000nn on create. Falling back to the Guid keeps
    // the customer's confirmation from being blank if it ever does not.
    orderNumber: o.orderNumber || o.guid,
    status: o.status,
    total: o.total,
    backend: "unleashed",
  };
}

// ---------------------------------------------------------------------------
// PaymentIntent bookkeeping.
//
// The intent is where "did this payment already become an order" is recorded,
// and it is the only thing standing between a retried submit and a second order
// against one card charge. It has to keep working across the backend switch, in
// both directions, because intents created before a change are still in flight
// when it lands.
// ---------------------------------------------------------------------------

/** Written on the intent once the order exists. Backend-neutral. */
export function orderMetadata(order: PlacedOrder): Record<string, string> {
  return {
    order_backend: order.backend,
    order_id: order.id,
    order_number: order.orderNumber,
    // The old keys as well, while intents written before this change are still
    // live. Only meaningful for WooCommerce, where the id really is numeric.
    ...(order.backend === "woocommerce"
      ? { wc_order_id: order.id, wc_order_number: order.orderNumber }
      : {}),
  };
}

/**
 * The order already recorded against this payment, if there is one.
 *
 * Reads the neutral keys first and the WooCommerce ones after, so an intent
 * created before this shipped still short-circuits instead of minting a second
 * order for a card that has already been charged.
 */
export function existingOrderOn(
  metadata: Record<string, string> | null | undefined
): { id: string; orderNumber: string } | null {
  const m = metadata ?? {};
  const id = m.order_id || m.wc_order_id;
  if (!id) return null;
  return { id, orderNumber: m.order_number || m.wc_order_number || id };
}

// ---------------------------------------------------------------------------
// QUOTES
//
// A quote request is not a sale, and the site's real mechanism for one is the
// email to the team. Writing it into an order system as well is a convenience
// for whoever picks it up, and it has always been optional: the WooCommerce
// version created a `pending` order and has been dormant since WC_WRITE_ENABLED
// went false.
//
// SEPARATELY GATED, because "should a quote request appear in the ERP's order
// book" is a commercial question nobody has answered, and answering it wrong
// inflates the order book with speculation. UNLEASHED_QUOTE_ORDERS turns it on;
// without it the quote still emails and still reaches HubSpot, which is the
// behaviour today.
// ---------------------------------------------------------------------------

export type QuoteItemInput = {
  /** Cart key. NOT a product id — for a size the old store never listed it is a negative hash. */
  id?: number;
  /** Unleashed ProductCode. The only identifier certain to mean something. */
  sku?: string;
  name: string;
  qty: number;
};

export type QuoteContactInput = {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  location?: string;
  notes?: string;
};

export function quoteOrdersEnabled(): boolean {
  return process.env.UNLEASHED_QUOTE_ORDERS === "true" && unleashedOrdersEnabled();
}

/**
 * Record a quote request in the ERP, if that is switched on.
 *
 * Returns "skipped" rather than throwing when it is switched off: the customer's
 * submission must never fail because a side effect is unconfigured. The caller
 * already treats a thrown error the same way.
 */
export async function placeQuote(
  contact: QuoteContactInput,
  items: QuoteItemInput[]
): Promise<"created" | "skipped"> {
  if (!quoteOrdersEnabled()) return "skipped";

  const erp = await getUnleashedMap().catch(() => ({}));
  const lines = items
    .filter((i) => !!i.sku)
    .map((i) => {
      const entry = lookupBySku(erp, i.sku);
      return {
        productId: 0,
        sku: i.sku,
        quantity: Math.max(1, Math.floor(i.qty || 1)),
        // The ERP's price, never the client's. A quote carrying a number the
        // customer's browser supplied is a number nobody can stand behind.
        unitPrice: entry?.price ?? 0,
        name: entry?.name ?? i.name,
      };
    });
  if (lines.length === 0) return "skipped";

  const [first, ...rest] = (contact.name ?? "").split(" ");
  await createUnleashedOrder({
    billing: {
      first_name: first,
      last_name: rest.join(" "),
      email: contact.email,
      phone: contact.phone,
      company: contact.company,
    },
    lines,
    customerNote:
      `QUOTE REQUEST — not a sale.` +
      `${contact.location ? ` Delivery: ${contact.location}.` : ""}` +
      `${contact.notes ? ` Notes: ${contact.notes}` : ""}`,
  });
  return "created";
}
