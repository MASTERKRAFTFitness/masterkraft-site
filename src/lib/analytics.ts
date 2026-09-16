// Lightweight event tracking. Fires GA4 events (when gtag is loaded), best-effort
// HubSpot custom behavioral events, and Opinly. No-ops until analytics load (after consent).
//
// OPINLY takes the conversions only, not the whole GA4 firehose, and it takes them
// in its OWN vocabulary: flat props, no `items` array, and the standard event
// names it scores as conversions (purchase, add_to_cart, generate_lead, sign_up).
// That is why the calls below are explicit per-event rather than a blind fan-out
// inside track() — a `view_item` or a site-search is not a conversion, and GA4's
// nested item payloads mean nothing to Opinly.
import { opinlyIdentify, opinlyTrack } from "@/lib/opinly";

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
  // `product_id`, not `sku`: this is the site's internal product id, which is
  // what every call site has. The ERP ProductCode lives on the cart item and is
  // not passed here — do not relabel this one as a SKU, they are different keys
  // and only the ERP one means anything outside this app.
  //
  // `value` is 0 for a "contact for pricing" product. That is real, not a gap:
  // those carry no price until they are quoted, and GA4 records them the same way.
  opinlyTrack("add_to_cart", {
    value: item.price * qty,
    currency: "AUD",
    product_id: String(item.id),
    name: item.name,
    quantity: qty,
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
  // `order.id` is the order NUMBER, and /api/order reports the same one to Opinly
  // server-side. Matching ids are what collapse the two into a single sale
  // instead of double-counting the revenue. Do not change one side alone.
  opinlyTrack("purchase", { value: order.value, currency: "AUD" }, order.id);
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
  opinlyTrack("generate_lead", { value, currency: "AUD", items: itemCount });
}

/**
 * An email handed over with no cart behind it — newsletter, waitlist, warranty,
 * contact. Opinly scores `sign_up` as a conversion in its own right, which on a
 * store that sells to a slow, quoted, high-ticket funnel is most of what a
 * campaign can be judged on before an order ever lands.
 *
 * `source` says which form it was, so one number does not hide four funnels.
 */
export function trackSignUp(source: string, email?: string) {
  track("sign_up", { method: source });
  identifyUser(email);
  opinlyTrack("sign_up", { source });
}

/**
 * An enquiry with no cart behind it — the contact form. Shares the `generate_lead`
 * name with trackLead above but carries NO `value`: that one reports a quoted
 * cart subtotal, and inventing a number here would corrupt the average deal size
 * the fitout funnel is judged on.
 */
export function trackEnquiry(source: string, email?: string) {
  track("generate_lead", { method: source });
  identifyUser(email);
  opinlyTrack("generate_lead", { source });
}

/**
 * Tie this browser to a person. Called wherever the customer hands us a real
 * email — checkout, quote request, the newsletter box. There is no login on this
 * storefront, so these forms ARE the identity surface; waiting for a signed-in
 * user would mean never identifying anyone.
 *
 * The first identify wins for the life of the browser, so this is deliberately
 * only called on submitted forms, never on keystrokes in an email field.
 */
export function identifyUser(email?: string, userId?: string) {
  opinlyIdentify(email, userId);
}
