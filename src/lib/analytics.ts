// Lightweight event tracking. Fires GA4 events (when gtag is loaded) and best-effort
// HubSpot custom behavioral events. No-ops until analytics load (after consent).
type Params = Record<string, unknown>;

interface AnalyticsWindow extends Window {
  gtag?: (...args: unknown[]) => void;
  _hsq?: unknown[];
}

export function track(event: string, params: Params = {}): void {
  if (typeof window === "undefined") return;
  const w = window as AnalyticsWindow;
  if (typeof w.gtag === "function") w.gtag("event", event, params);
  if (Array.isArray(w._hsq)) {
    w._hsq.push(["trackCustomBehavioralEvent", { name: `pe_${event}`, properties: params }]);
  }
}

export function trackAddToCart(item: { id: number; name: string; price: number }, qty: number) {
  track("add_to_cart", {
    currency: "AUD",
    value: item.price * qty,
    items: [{ item_id: item.id, item_name: item.name, price: item.price, quantity: qty }],
  });
}

export function trackViewItem(item: { id: number; name: string; price: number }) {
  track("view_item", {
    currency: "AUD",
    value: item.price,
    items: [{ item_id: item.id, item_name: item.name, price: item.price }],
  });
}

export function trackBeginCheckout(
  items: { id: number; name: string; price: number; qty: number }[],
  value: number,
) {
  track("begin_checkout", {
    currency: "AUD",
    value,
    items: items.map((i) => ({
      item_id: i.id,
      item_name: i.name,
      price: i.price,
      quantity: i.qty,
    })),
  });
}
