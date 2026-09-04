// Which system an order is written into, and the one shape the route sees.
//
// There are two backends during the move off WooCommerce, and exactly one of
// them is live at a time. The route should not know which — it verifies the
// payment, reprices the cart, and places the order. So the choice, the two
// result shapes and the PaymentIntent bookkeeping all collapse to here.
//
// DEFAULT IS UNCHANGED. Without UNLEASHED_WRITE_ENABLED this is WooCommerce
// doing exactly what it did before, through one more function call. The ERP path
// cannot switch on by accident: it needs that flag, a write-scoped API key, and
// a customer account, and it throws rather than improvising any of them.
import {
  createWooOrder,
  ordersEnabled as wooOrdersEnabled,
  type CreateOrderInput,
} from "@/lib/woo-orders";
import {
  createUnleashedOrder,
  ordersEnabled as unleashedOrdersEnabled,
} from "@/lib/unleashed-orders";

export type OrderBackend = "woocommerce" | "unleashed";

/**
 * The ERP wins when it is switched on. Not a fallback chain in either
 * direction: writing an order to the wrong system is worse than not writing it,
 * because nobody goes looking for an order that reported success.
 */
export function orderBackend(): OrderBackend {
  return unleashedOrdersEnabled() ? "unleashed" : "woocommerce";
}

export function orderingEnabled(): boolean {
  return orderBackend() === "unleashed" ? unleashedOrdersEnabled() : wooOrdersEnabled();
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
  if (orderBackend() === "unleashed") {
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

  const o = await createWooOrder(input);
  return {
    id: String(o.id),
    orderNumber: String(o.number),
    status: o.status,
    total: parseFloat(o.total),
    backend: "woocommerce",
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
