// Live freight quoting at checkout, via the Australia Post Postage Assessment
// Calculator (PAC) API.
//
// Docs: https://developers.auspost.com.au/apis/pac/reference/domestic-parcel-postage
//
// AUSTRALIA POST CAN ONLY CARRY PART OF THIS CATALOGUE, BY DESIGN. PAC prices
// parcels, and a parcel is capped at 22kg, 105cm on its longest side and 0.25
// cubic metres. Measured against the served catalogue on 2026-08-24: of the 246
// products with usable carton data, 111 fit those limits and 135 do not. Racks,
// rigs, machines and benches are pallet freight. Anything over the limits is NOT
// sent to AusPost and NOT guessed at - it returns `oversize` and the checkout
// falls back to "Freight is calculated on quote", which is the same path heavy
// goods already took before any of this was switched on.
//
// FAILS SOFT, ALWAYS. Every failure path - no API key, a product without carton
// dimensions, an over-limit carton, no common service, a network error - returns
// `ok: false` with a reason, and the checkout falls back to "calculated on
// quote". That is the honest answer and it matches the cart, the quote flow and
// the Shipping page. It must NEVER fall back to "Free": these are heavy goods
// and free freight would be a promise we cannot keep.

const SERVICE_URL = "https://digitalapi.auspost.com.au/postage/parcel/domestic/service.json";
const GST = 1.1;

// Handling margin on top of the carrier's rate: packing labour, and the gap
// between a quote and the invoice that actually lands. 15% (Michael, 2026-08-20),
// overridable without a code change.
const DEFAULT_MARGIN_PERCENT = 15;

// AusPost domestic parcel limits. A consignment breaching any of these is not a
// parcel and PAC will not price it.
export const MAX_PARCEL_WEIGHT_KG = 22;
export const MAX_PARCEL_DIMENSION_CM = 105;
export const MAX_PARCEL_VOLUME_M3 = 0.25;

// PAC prices ONE parcel per call, so a cart costs one call per distinct carton
// shape. Identical cartons are priced once and multiplied. These caps stop a
// large order turning into a burst of API calls mid-checkout; past them the
// order goes to the quote flow, where a human was going to price it anyway.
const MAX_DISTINCT_PARCELS = 8;
const MAX_TOTAL_PARCELS = 30;

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
      reason:
        | "not_configured"
        | "incomplete_dimensions"
        | "oversize"
        | "too_many_parcels"
        | "no_services"
        | "error";
      detail?: string;
      /** SKUs missing carton data, so the gap can be reported and fixed. */
      missing?: string[];
      /** SKUs too big or heavy for a parcel, i.e. pallet freight. */
      oversize?: string[];
    };

type PacService = {
  code?: string;
  name?: string;
  price?: string | number;
  max_extra_cover?: number;
};

type PacResponse = {
  services?: { service?: PacService | PacService[] };
  error?: { errorMessage?: string; message?: string };
};

export function marginPercent(): number {
  const v = parseFloat(process.env.FREIGHT_MARGIN_PERCENT ?? "");
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_MARGIN_PERCENT;
}

// AusPost publish RETAIL prices, which are GST-inclusive, so unlike the previous
// carrier we do NOT add GST. Every other price on this site is GST-inclusive, so
// this keeps freight consistent with the rest of the checkout.
//
// VERIFY AGAINST THE FIRST REAL QUOTE. If PAC turns out to return ex-GST figures
// for this account, set AUSPOST_PRICES_INCLUDE_GST=false rather than editing
// this file; getting it backwards undercharges freight by 10% on every order.
export function pricesIncludeGst(): boolean {
  return (process.env.AUSPOST_PRICES_INCLUDE_GST ?? "true").toLowerCase() !== "false";
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
// is deliberately not "smart boxing": consolidating cartons ourselves would mean
// inventing packing rules we have no data for.
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

/** True when a carton is outside what Australia Post will carry as a parcel. */
export function isOversize(p: Parcel): boolean {
  const volumeM3 = (p.length * p.width * p.height) / 1e6;
  return (
    p.weight > MAX_PARCEL_WEIGHT_KG ||
    Math.max(p.length, p.width, p.height) > MAX_PARCEL_DIMENSION_CM ||
    volumeM3 > MAX_PARCEL_VOLUME_M3
  );
}

/** SKUs in this cart that are pallet freight rather than parcels. */
export function oversizeSkus(items: FreightItem[]): string[] {
  return items
    .filter((i) =>
      isOversize({
        weight: i.weightKg,
        length: Math.ceil(i.lengthCm),
        width: Math.ceil(i.widthCm),
        height: Math.ceil(i.heightCm),
      })
    )
    .map((i) => i.sku);
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

// PAC's service list does not carry transit times, so indicative days come from
// AusPost's published delivery standards, keyed by service code. They are used
// ONLY to decide which service counts as "faster" in selectOptions - never to
// promise a date. Anything unrecognised sorts last, which is the safe direction.
const TRANSIT_DAYS: Record<string, { from: number; to: number }> = {
  AUS_PARCEL_REGULAR: { from: 2, to: 6 },
  AUS_PARCEL_REGULAR_SATCHEL_500G: { from: 2, to: 6 },
  AUS_PARCEL_COURIER: { from: 1, to: 1 },
  AUS_PARCEL_EXPRESS: { from: 1, to: 3 },
  AUS_PARCEL_EXPRESS_SATCHEL_500G: { from: 1, to: 3 },
};

function serviceLevelFor(code: string): string {
  if (/COURIER/i.test(code)) return "courier";
  if (/EXPRESS/i.test(code)) return "express";
  return "standard";
}

/** Apply the handling margin, and GST only if the carrier rate excludes it. */
function priceFor(base: number): number {
  if (!Number.isFinite(base) || base <= 0) return 0;
  const withMargin = base * (1 + marginPercent() / 100);
  const withGst = pricesIncludeGst() ? withMargin : withMargin * GST;
  return Math.round(withGst * 100) / 100;
}

const asArray = (s?: PacService | PacService[]): PacService[] =>
  Array.isArray(s) ? s : s ? [s] : [];

/** Price ONE carton. PAC takes a single parcel per call. */
async function quoteParcel(
  parcel: Parcel,
  fromPostcode: string,
  toPostcode: string,
  apiKey: string
): Promise<Map<string, { name: string; price: number }> | { error: string }> {
  const params = new URLSearchParams({
    from_postcode: fromPostcode,
    to_postcode: toPostcode,
    length: String(parcel.length),
    width: String(parcel.width),
    height: String(parcel.height),
    weight: String(parcel.weight),
  });
  let data: PacResponse;
  try {
    const res = await fetch(`${SERVICE_URL}?${params}`, {
      method: "GET",
      headers: { Accept: "application/json", "AUTH-KEY": apiKey },
      cache: "no-store",
    });
    // PAC returns its own error body with a 4xx, so read it before giving up.
    const body = (await res.json().catch(() => null)) as PacResponse | null;
    if (!res.ok) {
      return { error: body?.error?.errorMessage ?? body?.error?.message ?? `HTTP ${res.status}` };
    }
    data = body ?? {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "fetch failed" };
  }

  if (data.error) {
    return { error: data.error.errorMessage ?? data.error.message ?? "quote rejected" };
  }

  const out = new Map<string, { name: string; price: number }>();
  for (const s of asArray(data.services?.service)) {
    const code = String(s.code ?? "").trim();
    const price = Number(s.price ?? 0);
    if (!code || !Number.isFinite(price) || price <= 0) continue;
    out.set(code, { name: String(s.name ?? code), price });
  }
  return out;
}

export async function quoteFreight(
  items: FreightItem[],
  delivery: FreightAddress
): Promise<FreightQuote> {
  const apiKey = process.env.AUSPOST_API_KEY;
  const collection = collectionAddress();
  if (!apiKey || !collection) return { ok: false, reason: "not_configured" };

  const { parcels, missing } = itemsToParcels(items);
  // Fail the WHOLE cart, not just the line: quoting part of an order and
  // silently shipping the rest for nothing is worse than quoting none of it.
  if (missing.length > 0 || parcels.length === 0) {
    return { ok: false, reason: "incomplete_dimensions", missing };
  }

  // Pallet freight is not a parcel. Send it to the quote flow rather than to an
  // API that will reject it, so the customer gets the honest answer immediately.
  const oversize = oversizeSkus(items);
  if (oversize.length > 0) return { ok: false, reason: "oversize", oversize };

  if (parcels.length > MAX_TOTAL_PARCELS) {
    return { ok: false, reason: "too_many_parcels", detail: `${parcels.length} cartons` };
  }

  // Identical cartons are priced once and multiplied, so six of the same drop
  // pad is one API call rather than six.
  const groups = new Map<string, { parcel: Parcel; count: number }>();
  for (const p of parcels) {
    const key = `${p.weight}|${p.length}|${p.width}|${p.height}`;
    const g = groups.get(key);
    if (g) g.count++;
    else groups.set(key, { parcel: p, count: 1 });
  }
  if (groups.size > MAX_DISTINCT_PARCELS) {
    return { ok: false, reason: "too_many_parcels", detail: `${groups.size} carton types` };
  }

  const results = await Promise.all(
    [...groups.values()].map((g) =>
      quoteParcel(g.parcel, collection.postcode, delivery.postcode, apiKey).then((r) => ({
        r,
        count: g.count,
      }))
    )
  );

  // One bad carton fails the cart. A partial total would undercharge the order.
  for (const { r } of results) {
    if ("error" in r) return { ok: false, reason: "error", detail: r.error };
  }

  // Only services EVERY carton can travel on are offered, since the whole
  // consignment has to ship somehow. Prices are summed across cartons.
  const totals = new Map<string, { name: string; price: number }>();
  let first = true;
  for (const { r, count } of results) {
    const services = r as Map<string, { name: string; price: number }>;
    if (first) {
      for (const [code, s] of services) totals.set(code, { name: s.name, price: s.price * count });
      first = false;
      continue;
    }
    for (const code of [...totals.keys()]) {
      const s = services.get(code);
      if (!s) totals.delete(code);
      else totals.get(code)!.price += s.price * count;
    }
  }

  const options: FreightOption[] = [...totals.entries()]
    .map(([code, s]) => ({
      id: code,
      carrier: "Australia Post",
      service: s.name,
      serviceLevel: serviceLevelFor(code),
      price: priceFor(s.price),
      daysFrom: TRANSIT_DAYS[code]?.from,
      daysTo: TRANSIT_DAYS[code]?.to,
    }))
    .filter((o) => o.price > 0);

  if (options.length === 0) return { ok: false, reason: "no_services" };
  return { ok: true, options: selectOptions(options) };
}
