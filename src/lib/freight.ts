// Live freight quoting at checkout, via Interparcel's Quote API.
//
// WHY THE API AND NOT THEIR WOOCOMMERCE PLUGIN. Their plugin registers a
// shipping method inside a WooCommerce shipping zone and prices the WooCommerce
// STOREFRONT checkout - the storefront this site replaced. Our checkout is our
// own page, so the plugin would price a checkout nobody uses. Their REST API is
// the integration point for a headless front end.
//
// Docs: https://au.interparcel.com/docs/api/quote/get-a-quote
//
// FAILS SOFT, ALWAYS. Every failure path - no API key, a product without carton
// dimensions, no compliant service, a network error - returns `ok: false` with a
// reason, and the checkout falls back to "Freight is calculated on quote". That
// is the honest answer and it matches the cart, the quote flow and the Shipping
// page. It must NEVER fall back to "Free": these are heavy goods and free
// freight would be a promise we cannot keep.

const QUOTE_URL = "https://api.interparcel.com/quote";
const GST = 1.1;

// Handling margin on top of the carrier's rate: packing labour, and the gap
// between a quote and the invoice that actually lands. 15% (Michael, 2026-08-20),
// overridable without a code change.
const DEFAULT_MARGIN_PERCENT = 15;

export type FreightAddress = {
  city: string;
  state?: string;
  postcode: string;
  country: string;
};

export type Parcel = {
  weight: number; // kg
  length: number; // cm
  width: number; // cm
  height: number; // cm
};

// One line of the cart, already resolved server-side against WooCommerce so the
// weights and dimensions cannot be tampered with by the client.
export type FreightItem = {
  sku: string;
  name: string;
  quantity: number;
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
};

export type FreightOption = {
  id: string;
  carrier: string;
  service: string;
  serviceLevel: string;
  /** GST-inclusive, margin applied - the number the customer is charged. */
  price: number;
  daysFrom?: number;
  daysTo?: number;
};

export type FreightQuote =
  | { ok: true; options: FreightOption[] }
  | {
      ok: false;
      reason: "not_configured" | "incomplete_dimensions" | "no_services" | "error";
      detail?: string;
      /** SKUs missing carton data, so the gap can be reported and fixed. */
      missing?: string[];
    };

type InterparcelService = {
  id?: string;
  carrier?: string;
  name?: string;
  service?: string;
  serviceLevel?: string;
  price?: number;
  currency?: string;
  taxable?: boolean;
  restrictions?: { maximumWeight?: number; maximumLength?: number };
  delivery?: { daysFrom?: number; daysTo?: number };
};

type InterparcelResponse = {
  status?: number; // 0 = success, 1 = error
  services?: InterparcelService[];
  errorMessage?: string;
  errorCode?: string;
};

export function marginPercent(): number {
  const v = parseFloat(process.env.FREIGHT_MARGIN_PERCENT ?? "");
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_MARGIN_PERCENT;
}

export function collectionAddress(): FreightAddress | null {
  const postcode = process.env.FREIGHT_COLLECTION_POSTCODE;
  const city = process.env.FREIGHT_COLLECTION_CITY;
  if (!postcode || !city) return null;
  return {
    city,
    state: process.env.FREIGHT_COLLECTION_STATE,
    postcode,
    country: process.env.FREIGHT_COLLECTION_COUNTRY ?? "Australia",
  };
}

// ONE PARCEL PER UNIT. Each product carries the dimensions of ITS OWN carton, so
// three barbells ship as three cartons rather than one impossible 63kg box. This
// is deliberately not "smart boxing" - Interparcel offer that on the plugin path,
// and consolidating cartons ourselves would mean inventing packing rules we have
// no data for.
export function itemsToParcels(items: FreightItem[]): {
  parcels: Parcel[];
  missing: string[];
} {
  const parcels: Parcel[] = [];
  const missing: string[] = [];
  for (const item of items) {
    const usable =
      item.weightKg > 0 && item.lengthCm > 0 && item.widthCm > 0 && item.heightCm > 0;
    if (!usable) {
      missing.push(item.sku);
      continue;
    }
    for (let i = 0; i < Math.max(1, Math.floor(item.quantity)); i++) {
      parcels.push({
        weight: item.weightKg,
        // The API takes integer cm; round UP so we never under-declare a carton.
        length: Math.ceil(item.lengthCm),
        width: Math.ceil(item.widthCm),
        height: Math.ceil(item.heightCm),
      });
    }
  }
  return { parcels, missing };
}

// The customer is shown the cheapest service and, if there is one, the fastest
// service that beats it on delivery time. Michael's call 2026-08-20: enough
// choice to sell an urgent order without turning the checkout into a rate table.
export function selectOptions(options: FreightOption[]): FreightOption[] {
  if (options.length <= 1) return options;
  const byPrice = [...options].sort((a, b) => a.price - b.price);
  const cheapest = byPrice[0];
  const speed = (o: FreightOption) => o.daysTo ?? o.daysFrom ?? Number.MAX_SAFE_INTEGER;
  const faster = byPrice
    .filter((o) => o.id !== cheapest.id && speed(o) < speed(cheapest))
    .sort((a, b) => speed(a) - speed(b) || a.price - b.price)[0];
  return faster ? [cheapest, faster] : [cheapest];
}

function priceFor(service: InterparcelService): number {
  const base = Number(service.price ?? 0);
  if (!Number.isFinite(base) || base <= 0) return 0;
  const withMargin = base * (1 + marginPercent() / 100);
  // VERIFY AGAINST A REAL QUOTE BEFORE GOING LIVE: `taxable` is read as "GST is
  // not already in this figure", so GST is added for display. Every price on
  // this site is GST-inclusive, so getting this backwards would undercharge by
  // 10%. There is no API key yet, so this has not been checked against a live
  // response - see LAUNCH.md.
  const withGst = service.taxable ? withMargin * GST : withMargin;
  return Math.round(withGst * 100) / 100;
}

export async function quoteFreight(
  items: FreightItem[],
  delivery: FreightAddress
): Promise<FreightQuote> {
  const apiKey = process.env.INTERPARCEL_API_KEY;
  const collection = collectionAddress();
  if (!apiKey || !collection) return { ok: false, reason: "not_configured" };

  const { parcels, missing } = itemsToParcels(items);
  // Fail the WHOLE cart, not just the line: quoting part of an order and
  // silently shipping the rest for nothing is worse than quoting none of it.
  if (missing.length > 0 || parcels.length === 0) {
    return { ok: false, reason: "incomplete_dimensions", missing };
  }

  let data: InterparcelResponse;
  try {
    const res = await fetch(QUOTE_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Interparcel-Auth": apiKey,
        "X-Interparcel-API-Version": "3",
      },
      body: JSON.stringify({ collection, delivery, parcels }),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, reason: "error", detail: `HTTP ${res.status}` };
    data = (await res.json()) as InterparcelResponse;
  } catch (e) {
    return { ok: false, reason: "error", detail: e instanceof Error ? e.message : "fetch failed" };
  }

  if (data.status !== 0) {
    return { ok: false, reason: "error", detail: data.errorMessage ?? data.errorCode };
  }

  const options: FreightOption[] = (data.services ?? [])
    .filter((s) => Number(s.price ?? 0) > 0)
    .map((s) => ({
      id: String(s.id ?? s.service ?? s.name ?? "service"),
      carrier: String(s.carrier ?? ""),
      service: String(s.service ?? s.name ?? ""),
      serviceLevel: String(s.serviceLevel ?? "standard"),
      price: priceFor(s),
      daysFrom: s.delivery?.daysFrom,
      daysTo: s.delivery?.daysTo,
    }))
    .filter((o) => o.price > 0);

  if (options.length === 0) return { ok: false, reason: "no_services" };
  return { ok: true, options: selectOptions(options) };
}
