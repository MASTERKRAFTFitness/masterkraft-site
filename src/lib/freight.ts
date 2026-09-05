// Live freight quoting at checkout, across TWO carriers, priced against each
// other on every request.
//
//   Australia Post, via the Postage Assessment Calculator (PAC)
//     https://developers.auspost.com.au/apis/pac/reference/domestic-parcel-postage
//   Easyship, a reseller fronting TNT, Aramex, CouriersPlease, Allied and others
//     https://developers.easyship.com/reference/rates_request
//
// WHY BOTH, AND NOT ONE. They win opposite ends of this catalogue, measured
// 2026-09-05 (docs/easyship-evaluation.md). Australia Post charges a FLAT
// national rate for small parcels - 1kg to Perth is the same $10.20 as 1kg to
// Melbourne - and Easyship cannot beat that, quoting $17.70 for the same carton.
// Above roughly 4kg AusPost turns steeply zoned and loses badly: a 21kg carton to
// Perth is $149.45 against Easyship's $111.20. And above the parcel limits
// Australia Post does not compete at all, because it refuses outright.
//
// So neither carrier is redundant, and the cheapest answer depends on the carton
// and the lane. Both are asked in PARALLEL, their options are pooled, and
// selectOptions() picks from the pool. The customer sees the winner, not the
// routing.
//
// THE PARCEL LIMITS ARE AUSTRALIA POST'S ONLY. PAC prices parcels, capped at
// 22kg, 105cm on the longest side and 0.25 cubic metres. Of the 186 products with
// usable carton data, 79 fit and 107 do not - racks, rigs, machines and benches
// are freight, not parcels. An over-limit carton is NOT sent to PAC and NOT
// guessed at; it simply means Australia Post is not a candidate. Easyship carries
// the whole catalogue envelope, verified to 601kg and 268cm, so those carts now
// get a real price instead of "calculated on quote".
//
// FAILS SOFT, ALWAYS. Every failure path - no credentials, a product without
// carton dimensions, an over-limit carton with no second carrier to take it, no
// common service, a network error - returns `ok: false` with a reason, and the
// checkout falls back to "calculated on quote". That is the honest answer and it
// matches the cart, the quote flow and the Shipping page. It must NEVER fall back
// to "Free": these are heavy goods and free freight would be a promise we cannot
// keep. One carrier failing is not a failure; both failing is.
//
// PRICED TWICE, DELIBERATELY. The checkout quotes to DISPLAY and
// payment-intent/route.ts quotes again to CHARGE, because the browser sends only
// the option id and never the price. Option ids are therefore namespaced by
// carrier and must stay stable for identical inputs, or the re-quote fails to
// match and the order is refused after the card is captured.

import {
  cacheErrorTtlSeconds,
  cacheTtlSeconds,
  getCached,
  setCached,
} from "@/lib/freight-cache";

const SERVICE_URL = "https://digitalapi.auspost.com.au/postage/parcel/domestic/service.json";
const EASYSHIP_RATES_URL = "https://public-api.easyship.com/2024-09/rates";
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

// PAC prices ONE parcel per call, so a cart costs one AusPost call per distinct
// carton shape. Identical cartons are priced once and multiplied. These caps stop
// a large order turning into a burst of API calls mid-checkout; past them the
// order goes to the quote flow, where a human was going to price it anyway.
//
// Easyship needs no such cap: it prices a whole consignment in ONE call, which is
// the latency win docs/freight-brief-bulky.md asked carriers for. MAX_DISTINCT
// therefore gates Australia Post only, while MAX_TOTAL stays a sanity limit on
// the consignment itself and applies to both.
const MAX_DISTINCT_PARCELS = 8;
const MAX_TOTAL_PARCELS = 30;

export type FreightAddress = {
  city: string;
  state?: string;
  postcode: string;
  country: string;
  /**
   * Street line. Australia Post rates on postcodes alone and ignores this, but
   * Easyship's schema requires a line_1 on both ends. Optional here because the
   * checkout collects the suburb and postcode BEFORE the street, and we want a
   * freight figure on screen at that point rather than after the full address.
   */
  line1?: string;
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

// Easyship's own quote screen labels every row "Incl. GST" on this account
// (verified 2026-09-05), so the default matches Australia Post's: do NOT add GST
// on top. Same escape hatch, same reason - getting it backwards undercharges
// every freight-bearing order by 10%.
export function easyshipPricesIncludeGst(): boolean {
  return (process.env.EASYSHIP_PRICES_INCLUDE_GST ?? "true").toLowerCase() !== "false";
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
    line1: process.env.FREIGHT_COLLECTION_LINE1,
  };
}

/**
 * True once freight can be quoted at all: an origin, and at least ONE carrier
 * with credentials.
 *
 * Exported so freight-server.ts decides "is freight part of this order" with the
 * same rule the router uses to decide who to ask. They drifted once already -
 * gating on the Australia Post key alone would silently skip freight on an
 * Easyship-only deployment and charge goods with no delivery.
 */
export function freightConfigured(): boolean {
  return (
    collectionAddress() !== null &&
    Boolean(process.env.AUSPOST_API_KEY || process.env.EASYSHIP_API_TOKEN)
  );
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
  // "Road Express" is a road service, not an express one - TNT's cheapest and
  // slowest. Checked BEFORE the express rule, which would otherwise label the
  // standard bulky service as premium and mislead the customer.
  if (/ROAD/i.test(code)) return "standard";
  if (/COURIER/i.test(code)) return "courier";
  if (/EXPRESS|OVERNIGHT/i.test(code)) return "express";
  return "standard";
}

/**
 * Apply the handling margin, and GST only if the carrier rate excludes it.
 *
 * `includesGst` is per CARRIER, not global: the two are configured separately
 * because they are separate accounts and either could change independently.
 */
function priceFor(base: number, includesGst: boolean): number {
  if (!Number.isFinite(base) || base <= 0) return 0;
  const withMargin = base * (1 + marginPercent() / 100);
  const withGst = includesGst ? withMargin : withMargin * GST;
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

/**
 * Every Australia Post option for a whole consignment, or a typed failure.
 *
 * PAC prices one parcel per call, so this fans out over distinct carton shapes
 * and sums. Only services EVERY carton can travel on survive, because the whole
 * consignment has to ship somehow and a service one carton cannot use is not a
 * service we can sell.
 */
async function quoteAusPost(
  parcels: Parcel[],
  collection: FreightAddress,
  delivery: FreightAddress,
  apiKey: string
): Promise<FreightOption[] | { error: string }> {
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
    return { error: `${groups.size} carton types` };
  }

  const results = await Promise.all(
    [...groups.values()].map((g) =>
      quoteParcel(g.parcel, collection.postcode, delivery.postcode, apiKey).then((r) => ({
        r,
        count: g.count,
      }))
    )
  );

  // One bad carton fails this carrier. A partial total would undercharge the
  // order, so it is better to let the other carrier answer alone.
  for (const { r } of results) {
    if ("error" in r) return { error: r.error };
  }

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

  const includesGst = pricesIncludeGst();
  return [...totals.entries()]
    .map(([code, s]) => ({
      id: `auspost:${code}`,
      carrier: "Australia Post",
      service: s.name,
      serviceLevel: serviceLevelFor(code),
      price: priceFor(s.price, includesGst),
      daysFrom: TRANSIT_DAYS[code]?.from,
      daysTo: TRANSIT_DAYS[code]?.to,
    }))
    .filter((o) => o.price > 0);
}

type EasyshipRate = {
  total_charge?: number | string;
  courier_service?: { id?: string; name?: string };
  min_delivery_time?: number;
  max_delivery_time?: number;
};

/**
 * Easyship names a service as "TNT - Road Express", one string carrying both the
 * carrier and the service. Split it so the customer sees "TNT" as the carrier
 * rather than "Easyship", which is a billing relationship they have no reason to
 * care about. Anything without the separator is shown whole.
 */
function splitEasyshipService(name: string): { carrier: string; service: string } {
  const at = name.indexOf(" - ");
  if (at <= 0) return { carrier: name.trim() || "Easyship", service: name.trim() };
  return { carrier: name.slice(0, at).trim(), service: name.slice(at + 3).trim() };
}

/**
 * Every Easyship option for a whole consignment, or a typed failure.
 *
 * ONE CALL FOR THE WHOLE CART. `parcels` is an array, so unlike PAC there is no
 * fan-out and no per-carton summing: the returned `total_charge` already covers
 * the consignment. This is the single biggest reason to have them.
 */
async function quoteEasyship(
  parcels: Parcel[],
  collection: FreightAddress,
  delivery: FreightAddress,
  token: string
): Promise<FreightOption[] | { error: string }> {
  // Easyship requires a street line at both ends. Rating is driven by the
  // suburb, postcode and the carton, so a placeholder keeps a quote on screen
  // while the customer is still typing their address. It is never used to
  // dispatch anything - booking a real consignment will carry the real address.
  const line = (a: FreightAddress) => a.line1?.trim() || "1 Main St";
  const body = {
    origin_address: {
      line_1: line(collection),
      city: collection.city,
      state: collection.state ?? "",
      postal_code: collection.postcode,
      country_alpha2: "AU",
    },
    destination_address: {
      line_1: line(delivery),
      city: delivery.city,
      state: delivery.state ?? "",
      postal_code: delivery.postcode,
      country_alpha2: "AU",
    },
    // Domestic only, so there is nothing to collect at a border. Stated rather
    // than omitted so the rate never comes back carrying an import duty line.
    incoterms: "DDU",
    parcels: parcels.map((p) => ({
      total_actual_weight: p.weight,
      box: { length: p.length, width: p.width, height: p.height },
      items: [
        {
          description: "Gym equipment",
          // REQUIRED, despite the schema calling it nullable: Easyship rejects
          // the whole request with 422 unless an item carries a `category` slug
          // or an `hs_code`. Slugs come from GET /2024-09/item_categories, and
          // `sport_leisure` maps to HS 9506910000 - "equipment for general
          // physical exercise, gymnastics or athletics" - which is the catalogue.
          category: "sport_leisure",
          quantity: 1,
          actual_weight: p.weight,
          dimensions: { length: p.length, width: p.width, height: p.height },
          declared_currency: "AUD",
          // The schema demands a positive value. This is a DOMESTIC rating call,
          // so nothing is declared to customs and the figure does not reach a
          // carrier. It would have to become the real line value before turning
          // Easyship's insurance on, which prices off declared value.
          declared_customs_value: 100,
          origin_country_alpha2: "AU",
        },
      ],
    })),
  };

  let json: { rates?: EasyshipRate[] } | null;
  try {
    const res = await fetch(EASYSHIP_RATES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const parsed = (await res.json().catch(() => null)) as
      | {
          rates?: EasyshipRate[];
          error?: { message?: string; details?: string[] };
          message?: string;
        }
      | null;
    if (!res.ok) {
      // `details` is where Easyship names the offending FIELD; `message` is the
      // useless "The request body content is not valid." on its own. Keep both,
      // because a rate call that fails while the other carrier succeeds is
      // otherwise invisible - which is exactly how the missing `category` above
      // went unnoticed until a cart had no second carrier to fall back on.
      const details = Array.isArray(parsed?.error?.details)
        ? parsed.error.details.join("; ")
        : "";
      const message = parsed?.error?.message ?? parsed?.message ?? `HTTP ${res.status}`;
      return { error: details ? `${message} ${details}` : message };
    }
    json = parsed;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "fetch failed" };
  }

  const includesGst = easyshipPricesIncludeGst();
  return (json?.rates ?? [])
    .map((r) => {
      const id = String(r.courier_service?.id ?? "").trim();
      const name = String(r.courier_service?.name ?? "").trim();
      const { carrier, service } = splitEasyshipService(name);
      return {
        id: `easyship:${id}`,
        carrier,
        service,
        // Unlike PAC, Easyship returns real transit times, so serviceLevel is
        // read off the name only to label the option, never to invent a date.
        serviceLevel: serviceLevelFor(name),
        price: priceFor(Number(r.total_charge), includesGst),
        daysFrom: r.min_delivery_time,
        daysTo: r.max_delivery_time,
      };
    })
    .filter((o) => o.id !== "easyship:" && o.price > 0);
}

/**
 * The cache key: everything that can change the ANSWER, and nothing else.
 *
 * Cartons are sorted, so two carts holding the same boxes in a different order
 * share one entry. The handling margin and both GST flags are included because
 * they change the number we return, and a cached price that outlived a margin
 * change would be charged.
 *
 * `line1` is deliberately EXCLUDED. Carriers rate on the suburb and postcode,
 * not the street, and the checkout quotes while the customer is still typing
 * their address - keying on it would miss on every keystroke and cost exactly
 * the calls this exists to save. If a carrier is ever added that prices off the
 * street, this is the line that has to change.
 */
function cacheKey(parcels: Parcel[], collection: FreightAddress, delivery: FreightAddress): string {
  const boxes = parcels
    .map((p) => `${p.weight}x${p.length}x${p.width}x${p.height}`)
    .sort()
    .join(",");
  const to = [delivery.postcode, delivery.city, delivery.state ?? "", delivery.country]
    .map((v) => v.trim().toLowerCase())
    .join("|");
  const config = `${marginPercent()}|${pricesIncludeGst()}|${easyshipPricesIncludeGst()}`;
  return `${collection.postcode}>${to}>${boxes}>${config}`;
}

/**
 * How long an answer is worth remembering.
 *
 * The three reasons decided locally, before any carrier is asked, cost nothing
 * to recompute and must NOT be cached: they depend on configuration and cart
 * contents that change between requests, and a stale `not_configured` would keep
 * freight switched off after the credentials arrived.
 */
function cacheableFor(quote: FreightQuote): number {
  if (quote.ok) return cacheTtlSeconds();
  if (
    quote.reason === "not_configured" ||
    quote.reason === "incomplete_dimensions" ||
    quote.reason === "too_many_parcels"
  ) {
    return 0;
  }
  return cacheErrorTtlSeconds();
}

/**
 * Price a consignment with every carrier that can carry it, and return the best
 * of the pooled options.
 *
 * The two carriers are asked CONCURRENTLY, so having a second one costs no extra
 * latency - the request takes as long as the slower carrier, not the sum. A
 * carrier that fails is dropped and the other one still answers; only an empty
 * pool is a failure.
 */
export async function quoteFreight(
  items: FreightItem[],
  delivery: FreightAddress
): Promise<FreightQuote> {
  const auspostKey = process.env.AUSPOST_API_KEY;
  const easyshipToken = process.env.EASYSHIP_API_TOKEN;
  const collection = collectionAddress();
  if (!collection || !freightConfigured()) return { ok: false, reason: "not_configured" };

  const { parcels, missing } = itemsToParcels(items);
  // Fail the WHOLE cart, not just the line: quoting part of an order and
  // silently shipping the rest for nothing is worse than quoting none of it.
  if (missing.length > 0 || parcels.length === 0) {
    return { ok: false, reason: "incomplete_dimensions", missing };
  }

  if (parcels.length > MAX_TOTAL_PARCELS) {
    return { ok: false, reason: "too_many_parcels", detail: `${parcels.length} cartons` };
  }

  // Checked AFTER the local validations, so a key is only ever built for a cart
  // that would actually reach a carrier.
  const key = cacheKey(parcels, collection, delivery);
  const cached = getCached<FreightQuote>(key);
  if (cached) return cached;

  // An over-limit carton does not fail the cart any more - it just rules
  // Australia Post out. PAC would reject the request, so asking is a wasted call
  // and a slower checkout.
  const oversize = oversizeSkus(items);
  const askAusPost = Boolean(auspostKey) && oversize.length === 0;
  const askEasyship = Boolean(easyshipToken);

  const [ap, es] = await Promise.all([
    askAusPost
      ? quoteAusPost(parcels, collection, delivery, auspostKey as string)
      : Promise.resolve(null),
    askEasyship
      ? quoteEasyship(parcels, collection, delivery, easyshipToken as string)
      : Promise.resolve(null),
  ]);

  const options: FreightOption[] = [];
  const errors: string[] = [];
  for (const r of [ap, es]) {
    if (r === null) continue;
    if ("error" in r) errors.push(r.error);
    else options.push(...r);
  }

  // Nothing could carry it. Say WHY in the most useful order: an over-limit
  // consignment with no carrier for it is "oversize", which the checkout turns
  // into the honest "ships as freight" message. A carrier that broke is an
  // error. Everything else genuinely had no service to offer.
  const failure = (): FreightQuote => {
    if (oversize.length > 0 && !askEasyship) return { ok: false, reason: "oversize", oversize };
    if (errors.length > 0) return { ok: false, reason: "error", detail: errors.join("; ") };
    if (oversize.length > 0) return { ok: false, reason: "oversize", oversize };
    return { ok: false, reason: "no_services" };
  };

  const quote: FreightQuote =
    options.length > 0 ? { ok: true, options: selectOptions(options) } : failure();

  setCached(key, quote, cacheableFor(quote));
  return quote;
}
