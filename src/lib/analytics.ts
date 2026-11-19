// Lightweight event tracking. Fires GA4 events (when gtag is loaded), best-effort
// HubSpot custom behavioral events, Google Ads and Meta conversions. gtag is on
// the page for every visitor (Consent Mode: cookieless until Accept); HubSpot and
// Meta no-op until consent.
//
// Opinly's browser pixel was removed 29 Oct 2026: its publishable key was
// rejected ("Invalid API key") on every call, so it recorded nothing.
import { GOOGLE_ADS_ID, GOOGLE_ADS_LEAD_LABEL, GOOGLE_ADS_PURCHASE_LABEL } from "@/lib/google-ads";

type Params = Record<string, unknown>;

// GOOGLE ADS CONVERSIONS. A GA4 event is not one: Ads only counts an action
// addressed to a conversion it owns, as `AW-XXXXXXXXX/<label>`. The ID and the
// labels live in lib/google-ads (pinned in code, env overrides), read at module
// load. An action with no label is skipped and its GA4 event still fires.
const ADS_ID = GOOGLE_ADS_ID;
const ADS_PURCHASE_LABEL = GOOGLE_ADS_PURCHASE_LABEL;
const ADS_LEAD_LABEL = GOOGLE_ADS_LEAD_LABEL;

interface AnalyticsWindow extends Window {
  gtag?: (...args: unknown[]) => void;
  _hsq?: unknown[];
  fbq?: (...args: unknown[]) => void;
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
 *
 * ENHANCED CONVERSIONS. When the form gave us an email it is set as `user_data`
 * just before the conversion, which is what both Ads actions are configured to
 * read ("managed through Google tag"). gtag normalises and SHA-256 hashes it in
 * the browser, so the address itself never leaves the page, and under Consent
 * Mode it is dropped entirely until the visitor accepts (ad_user_data).
 */
function adsConversion(label: string | undefined, params: Params = {}, email?: string): void {
  if (typeof window === "undefined") return;
  if (!ADS_ID || !label) return;
  const w = window as AnalyticsWindow;
  if (typeof w.gtag !== "function") return;
  const address = email?.trim().toLowerCase();
  if (address && address.includes("@")) w.gtag("set", "user_data", { email: address });
  w.gtag("event", "conversion", { send_to: `${ADS_ID}/${label}`, currency: "AUD", ...params });
}

/**
 * One Meta (Instagram/Facebook) conversion.
 *
 * Separate from track() for the same reason adsConversion is: Meta has its own
 * queue (`fbq`), its own event vocabulary, and must not receive HubSpot's or
 * GA4's. `fbq` only exists once the pixel has loaded, which is AFTER the visitor
 * accepts cookies - see CookieConsent - so this is a no-op for anyone who has
 * declined or not yet answered. That is the intended behaviour, not a gap.
 *
 * NO PIXEL LOADED IS A WORKING STATE. Off masterkraft.com, or before consent,
 * `fbq` never exists and this does nothing - the Lead event is simply not sent.
 */
function metaConversion(event: string, params: Params = {}): void {
  if (typeof window === "undefined") return;
  const w = window as AnalyticsWindow;
  if (typeof w.fbq !== "function") return;
  w.fbq("track", event, params);
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
export function trackPurchase(order: { id: string; value: number; email?: string }) {
  track("purchase", { currency: "AUD", value: order.value, transaction_id: order.id });
  adsConversion(ADS_PURCHASE_LABEL, { value: order.value, transaction_id: order.id }, order.email);
}

/**
 * A submitted quote. Counted as its own conversion action rather than folded in
 * with purchases, because it is worth something quite different: this is the
 * fitout funnel's front door, and a quote is a lead, not revenue. `value` is the
 * cart subtotal — an indication of size, not money taken.
 */
export function trackLead(value: number, itemCount: number, email?: string) {
  track("generate_lead", { currency: "AUD", value, items: itemCount });
  adsConversion(ADS_LEAD_LABEL, { value }, email);
}

/**
 * An email handed over with no cart behind it — newsletter, waitlist, warranty,
 * contact.
 *
 * `source` says which form it was, so one number does not hide four funnels.
 */
export function trackSignUp(source: string) {
  track("sign_up", { method: source });
}

/**
 * An enquiry with no cart behind it — the fitout brief, the contact form. Shares
 * the `generate_lead` name with trackLead above but carries NO `value`: that one
 * reports a quoted cart subtotal, and inventing a number here would corrupt the
 * average deal size the fitout funnel is judged on.
 *
 * IT DOES FIRE THE ADS CONVERSION, without a value. The fitout brief is the
 * conversion /fitout-solution exists to produce — it is where the header's primary CTA
 * lands — so an Ads campaign pointed at that page has to be able to see it, or
 * the bidder is optimising toward clicks it cannot score. Sharing ADS_LEAD_LABEL
 * with trackLead is deliberate: both are leads, and Ads should count them
 * together. What must NOT be shared is the value, which is why none is sent.
 */
export function trackEnquiry(source: string, email?: string, opts: { adsLead?: boolean } = {}) {
  track("generate_lead", { method: source });
  // `adsLead: false` keeps an enquiry that cannot become a sale out of the Ads
  // quote conversion. See countsAsAdsLead in lib/enquiry-type.
  if (opts.adsLead !== false) adsConversion(ADS_LEAD_LABEL, {}, email);
  // Meta's standard `Lead`. Named exactly that because Meta only optimises
  // toward events it recognises - a custom name would leave campaigns bidding
  // on link clicks, which is most of the value of paid social gone.
  metaConversion("Lead", { content_name: source });
}
