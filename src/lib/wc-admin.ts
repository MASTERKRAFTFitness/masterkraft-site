// Order reads for the internal console.
//
// lib/woocommerce.ts is the catalogue layer and deliberately serves products
// from the committed snapshot. Orders have no snapshot and never will, so this
// is a separate, always-live reader. READ ONLY - nothing here writes to the store.

const BASE = `${process.env.WC_STORE_URL}/wp-json/wc/v3`;

function authHeader() {
  const ck = process.env.WC_CONSUMER_KEY ?? "";
  const cs = process.env.WC_CONSUMER_SECRET ?? "";
  return "Basic " + Buffer.from(`${ck}:${cs}`).toString("base64");
}

export function ordersConfigured(): boolean {
  return Boolean(process.env.WC_STORE_URL && process.env.WC_CONSUMER_KEY && process.env.WC_CONSUMER_SECRET);
}

export type WcOrderLine = {
  name: string;
  sku?: string;
  quantity: number;
  total: string;
};

export type WcOrder = {
  id: number;
  number: string;
  status: string;
  currency: string;
  total: string;
  shipping_total?: string;
  date_created?: string;
  date_paid?: string | null;
  payment_method_title?: string;
  customer_note?: string;
  billing?: Record<string, string>;
  shipping?: Record<string, string>;
  line_items?: WcOrderLine[];
};

async function wcGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: authHeader(), Accept: "application/json" },
    cache: "no-store", // an order status is the one thing that must never be stale
  });
  if (!res.ok) throw new Error(`WooCommerce ${res.status} on ${path}`);
  return res.json() as Promise<T>;
}

/**
 * Look up one order. WooCommerce order numbers and internal ids are the same
 * value on this store (verified against 490098/490100/490102), but a plugin can
 * decouple them, so a failed id lookup falls back to a search.
 */
export async function getOrder(reference: string): Promise<WcOrder | null> {
  const digits = reference.replace(/[^0-9]/g, "");
  if (digits) {
    const direct = await wcGet<WcOrder>(`/orders/${digits}`).catch(() => null);
    if (direct?.id) return direct;
  }
  const found = await wcGet<WcOrder[]>(
    `/orders?search=${encodeURIComponent(reference)}&per_page=5`
  ).catch(() => [] as WcOrder[]);
  return found.find((o) => o.number === reference) ?? found[0] ?? null;
}

export async function listRecentOrders(limit = 10, status?: string): Promise<WcOrder[]> {
  const capped = Math.min(Math.max(1, limit), 25);
  const query = `/orders?per_page=${capped}&orderby=date&order=desc${
    status ? `&status=${encodeURIComponent(status)}` : ""
  }`;
  return wcGet<WcOrder[]>(query).catch(() => []);
}

/** Compact an order down to what the agent needs, so a tool result stays small. */
export function summariseOrder(o: WcOrder) {
  return {
    number: o.number,
    id: o.id,
    status: o.status,
    placed: o.date_created,
    paid: o.date_paid ?? null,
    total: `${o.currency ?? "AUD"} ${o.total}`,
    freight: o.shipping_total ?? null,
    payment: o.payment_method_title ?? null,
    customer: [o.billing?.first_name, o.billing?.last_name].filter(Boolean).join(" ") || null,
    email: o.billing?.email ?? null,
    phone: o.billing?.phone ?? null,
    company: o.billing?.company || null,
    ship_to: [o.shipping?.address_1, o.shipping?.city, o.shipping?.state, o.shipping?.postcode]
      .filter(Boolean)
      .join(", ") || null,
    note: o.customer_note || null,
    lines: (o.line_items ?? []).map((l) => ({
      name: l.name,
      sku: l.sku || null,
      qty: l.quantity,
      total: l.total,
    })),
  };
}
