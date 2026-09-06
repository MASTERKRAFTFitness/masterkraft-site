// Lightweight event tracking. Fires GA4 events (when gtag is loaded) and best-effort
// HubSpot custom behavioral events. No-ops until analytics load (after consent).
type Params = Record<string, unknown>;

// GOOGLE ADS CONVERSIONS. A GA4 event is not one: Ads only counts an action
// addressed to a conversion it owns, as `AW-XXXXXXXXX/<label>`. The ID is the
// account's, the labels are per-action, and both come from Ads > Goals >
// Conversions > the action's tag setup. Read at module load, so a change needs
// a redeploy — the same deal as NEXT_PUBLIC_GA_ID.
//
// UNSET IS A WORKING STATE, not a broken one. With no ID, or no label for the
// action, the conversion call is skipped and the GA4 event still fires. That is
// what lets this ship before the Ads account has the numbers in it.
const ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID;
const ADS_PURCHASE_LABEL = process.env.NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL;
const ADS_LEAD_LABEL = process.env.NEXT_PUBLIC_GOOGLE_ADS_LEAD_LABEL;

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

/**
 * One Google Ads conversion. Separate from track() because it is addressed
 * differently — `send_to` names the conversion action, and Ads ignores an event
 * without it — and because it must not reach HubSpot, which has its own funnel.
 */
function adsConversion(label: string | undefined, params: Params = {}): void {
  if (typeof window === "undefined") return;
  if (!ADS_ID || !label) return;
  const w = window as AnalyticsWindow;
  if (typeof w.gtag !== "function") return;
  w.gtag("event", "conversion", { send_to: `${ADS_ID}/${label}`, currency: "AUD", ...params });
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

/**
 * A paid card order. THE ONE THE ADS BIDDING LEARNS FROM.
 *
 * transaction_id is not decoration: it is how Ads discards a duplicate when the
 * confirmation is reloaded or the tag fires twice, and a purchase counted twice
 * teaches the bidder the wrong price for a click.
 */
export function trackPurchase(order: { id: string; value: number }) {
  track("purchase", { currency: "AUD", value: order.value, transaction_id: order.id });
  adsConversion(ADS_PURCHASE_LABEL, { value: order.value, transaction_id: order.id });
}

/**
 * A submitted quote. Counted as its own conversion action rather than folded in
 * with purchases, because it is worth something quite different: this is the
 * fitout funnel's front door, and a quote is a lead, not revenue. `value` is the
 * cart subtotal — an indication of size, not money taken.
 */
export function trackLead(value: number, itemCount: number) {
  track("generate_lead", { currency: "AUD", value, items: itemCount });
  adsConversion(ADS_LEAD_LABEL, { value });
}
