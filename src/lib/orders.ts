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
import { productBySku } from "@/lib/catalogue";
import { getUnleashedMap, lookupBySku } from "@/lib/unleashed";

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
  return orderBackend() === "unleashed"
    ? process.env.UNLEASHED_QUOTE_ORDERS === "true" && unleashedOrdersEnabled()
    : wooOrdersEnabled();
}

/**
 * Record a quote request in whichever order system is live, if either is.
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

  if (orderBackend() === "unleashed") {
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

  return createWooQuoteOrder(contact, items);
}

async function createWooQuoteOrder(
  contact: QuoteContactInput,
  items: QuoteItemInput[]
): Promise<"created" | "skipped"> {
  const key = process.env.WC_CONSUMER_KEY;
  const secret = process.env.WC_CONSUMER_SECRET;
  const store = process.env.WC_STORE_URL;
  if (!key || !secret || !store) return "skipped";

  // THE ID SENT HERE WAS WRONG. It was the CART KEY, which for a variant is the
  // variation id and for a size the old store never listed is a NEGATIVE hash —
  // neither of which is a product_id WooCommerce can attach a line to. Resolve
  // it from the ERP code against the snapshot instead, and drop a line we cannot
  // identify rather than posting a number that means something else.
  const line_items = items
    .map((i) => {
      const id = (i.sku ? productBySku(i.sku)?.id : undefined) ?? (i.id && i.id > 0 ? i.id : undefined);
      return id ? { product_id: id, quantity: Math.max(1, Math.floor(i.qty || 1)) } : null;
    })
    .filter((l): l is { product_id: number; quantity: number } => l !== null);
  if (line_items.length === 0) return "skipped";

  const [firstName, ...rest] = (contact.name ?? "").split(" ");
  const auth = "Basic " + Buffer.from(`${key}:${secret}`).toString("base64");
  const res = await fetch(`${store}/wp-json/wc/v3/orders`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json" },
    body: JSON.stringify({
      status: "pending",
      set_paid: false,
      billing: {
        first_name: firstName || contact.name,
        last_name: rest.join(" "),
        email: contact.email,
        phone: contact.phone,
        company: contact.company,
      },
      line_items,
      customer_note: `Website quote request.${contact.location ? ` Delivery: ${contact.location}.` : ""}${contact.notes ? ` Notes: ${contact.notes}` : ""}`,
    }),
  });
  if (!res.ok) throw new Error(`WC orders ${res.status}`);
  return "created";
}
