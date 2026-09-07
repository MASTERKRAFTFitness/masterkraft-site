// Head-to-head: what Australia Post charges versus what Easyship charges, over
// the SAME cartons and the SAME lanes.
//
//   npm run report:carriers
//     reports/freight-carrier-comparison.md
//     reports/freight-carrier-comparison.csv
//
// WHY THIS EXISTS. Easyship prices consignments Australia Post refuses outright
// (verified in their dashboard 2026-09-05: 601kg and 268cm both quoted). That
// settles COVERAGE. It does not settle PRICE. On the 79 products both carriers
// will carry, the question is whether an aggregator's pooled rate beats the
// direct PAC rate we already have for free. This measures it instead of guessing.
//
// APPLES TO APPLES, DELIBERATELY:
//   - Carrier RAW rates only. FREIGHT_MARGIN_PERCENT is ours and applies to
//     either carrier, so including it would just scale both sides by 1.15 and
//     make the gap look bigger than it is.
//   - Both sides are GST-inclusive. PAC publishes retail (see lib/freight.ts),
//     and Easyship's own quote screen labels every row "Incl. GST".
//   - One carton per row, never a consolidated cart, because that is how
//     itemsToParcels() actually ships them.
//
// THE EASYSHIP RATES ENDPOINT IS METERED. It is an "advanced endpoint" with a
// monthly plan allowance and per-call overage past it. So the sample is capped
// and every call is counted and printed. Widen it deliberately, not by accident.
import { writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { it } from "vitest";
import { allProducts, productsInCategory } from "@/lib/catalogue";
import { filterBrandSku, filterListable, type WcProduct } from "@/lib/woocommerce";
import {
  MAX_PARCEL_DIMENSION_CM,
  MAX_PARCEL_VOLUME_M3,
  MAX_PARCEL_WEIGHT_KG,
} from "@/lib/freight";

const MD = "reports/freight-carrier-comparison.md";
const CSV = "reports/freight-carrier-comparison.csv";

// vitest does not read .env.local, and this script is the only thing in the
// repo that needs BOTH carrier credentials at once.
// Parse the WHOLE file first so a duplicated key resolves the way Next.js
// resolves it - LAST occurrence wins - and only then fill in what the real
// environment has not already set. Reading top-down and keeping the first match
// is the obvious version and it is wrong: it made these scripts quote happily
// off a good token while the app, taking the last, used a broken one.
const env = new Map<string, string>();
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env.set(m[1], m[2].replace(/^["']|["']$/g, ""));
}
for (const [k, v] of env) if (!process.env[k]) process.env[k] = v;

const AUSPOST_KEY = process.env.AUSPOST_API_KEY;
const EASYSHIP_TOKEN = process.env.EASYSHIP_API_TOKEN;
const FROM_POSTCODE = process.env.FREIGHT_COLLECTION_POSTCODE ?? "3074";

// How many products to price on each side. Kept small on purpose: see the
// metering note above. Override for a wider read.
const PARCEL_SAMPLE = Number(process.env.COMPARE_PARCEL_SAMPLE ?? 8);
const BULKY_SAMPLE = Number(process.env.COMPARE_BULKY_SAMPLE ?? 6);

// The real destination mix, from Unleashed sales orders since 2020
// (docs/freight-brief-bulky.md). Used to weight the average so a Kalgoorlie
// outlier does not carry the same weight as the Melbourne lane that is a
// third of the book.
const LANES = [
  { city: "Melbourne", state: "VIC", postcode: "3000", orders: 277 },
  { city: "Sydney", state: "NSW", postcode: "2000", orders: 119 },
  { city: "Brisbane", state: "QLD", postcode: "4000", orders: 73 },
  { city: "Adelaide", state: "SA", postcode: "5000", orders: 69 },
  { city: "Perth", state: "WA", postcode: "6000", orders: 25 },
  { city: "Hobart", state: "TAS", postcode: "7000", orders: 6 },
];

type Row = { sku: string; name: string; kg: number; l: number; w: number; h: number; m3: number };
type Priced = { carrier: string; service: string; price: number; daysFrom?: number; daysTo?: number };

const num = (v: unknown) => {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const q = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
const implausible = (r: Row) => Math.max(r.l, r.w, r.h) > 300 || r.m3 > 3;
const isParcel = (r: Row) =>
  r.kg <= MAX_PARCEL_WEIGHT_KG &&
  Math.max(r.l, r.w, r.h) <= MAX_PARCEL_DIMENSION_CM &&
  r.m3 <= MAX_PARCEL_VOLUME_M3;

let auspostCalls = 0;
let easyshipCalls = 0;

/** Cheapest Australia Post service for one carton, or null with a reason. */
async function quoteAusPost(r: Row, toPostcode: string): Promise<Priced | string> {
  if (!AUSPOST_KEY) return "no AUSPOST_API_KEY";
  // PAC will not price it, and asking anyway just burns a call for a 4xx.
  if (!isParcel(r)) return "over parcel limits";
  const params = new URLSearchParams({
    from_postcode: FROM_POSTCODE,
    to_postcode: toPostcode,
    length: String(Math.ceil(r.l)),
    width: String(Math.ceil(r.w)),
    height: String(Math.ceil(r.h)),
    weight: String(r.kg),
  });
  auspostCalls++;
  try {
    const res = await fetch(
      `https://digitalapi.auspost.com.au/postage/parcel/domestic/service.json?${params}`,
      { headers: { Accept: "application/json", "AUTH-KEY": AUSPOST_KEY } }
    );
    const body = await res.json().catch(() => null);
    if (!res.ok || body?.error) {
      return `HTTP ${res.status}: ${body?.error?.errorMessage ?? "no body"}`;
    }
    const list = body?.services?.service;
    const services = (Array.isArray(list) ? list : list ? [list] : [])
      .map((s: { code?: string; name?: string; price?: string }) => ({
        service: String(s.name ?? s.code ?? "?"),
        price: Number(s.price ?? 0),
      }))
      .filter((s: { price: number }) => Number.isFinite(s.price) && s.price > 0)
      .sort((a: { price: number }, b: { price: number }) => a.price - b.price);
    if (!services.length) return "no services";
    return { carrier: "Australia Post", service: services[0].service, price: services[0].price };
  } catch (e) {
    return e instanceof Error ? e.message : "fetch failed";
  }
}

/**
 * Cheapest Easyship rate for one carton, or null with a reason.
 *
 * Easyship prices a WHOLE consignment in one call - `parcels` is an array - but
 * this asks for one carton at a time so the figures line up row-for-row with the
 * Australia Post column. The consignment-in-one-call win is real and is the
 * reason to prefer them; it is just not what is being measured here.
 */
async function quoteEasyship(
  r: Row,
  lane: (typeof LANES)[number]
): Promise<Priced | string> {
  if (!EASYSHIP_TOKEN) return "no EASYSHIP_API_TOKEN";
  const body = {
    origin_address: {
      line_1: process.env.FREIGHT_COLLECTION_LINE1 ?? "8/337-339 Settlement Rd",
      city: process.env.FREIGHT_COLLECTION_CITY ?? "Thomastown",
      state: process.env.FREIGHT_COLLECTION_STATE ?? "VIC",
      postal_code: FROM_POSTCODE,
      country_alpha2: "AU",
    },
    destination_address: {
      line_1: "1 George St",
      city: lane.city,
      state: lane.state,
      postal_code: lane.postcode,
      country_alpha2: "AU",
    },
    incoterms: "DDU",
    parcels: [
      {
        total_actual_weight: r.kg,
        box: { length: Math.ceil(r.l), width: Math.ceil(r.w), height: Math.ceil(r.h) },
        items: [
          {
            description: r.name.slice(0, 200),
            // Required in practice despite being nullable in the schema: without
            // a category slug or an hs_code every call 422s. Slugs come from
            // GET /2024-09/item_categories; sport_leisure is HS 9506910000.
            category: "sport_leisure",
            sku: r.sku,
            quantity: 1,
            actual_weight: r.kg,
            dimensions: { length: Math.ceil(r.l), width: Math.ceil(r.w), height: Math.ceil(r.h) },
            declared_currency: "AUD",
            // Rating only needs a positive value; this is not a customs entry.
            declared_customs_value: 100,
            origin_country_alpha2: "AU",
          },
        ],
      },
    ],
  };
  easyshipCalls++;
  try {
    const res = await fetch("https://public-api.easyship.com/2024-09/rates", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${EASYSHIP_TOKEN}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      // Print the whole body on the first failure: the request shape is the
      // thing most likely to be wrong, and a bare status code says nothing.
      return `HTTP ${res.status}: ${JSON.stringify(json)?.slice(0, 300) ?? "no body"}`;
    }
    const rates = (json?.rates ?? []) as {
      total_charge?: number;
      courier_service?: { name?: string };
      min_delivery_time?: number;
      max_delivery_time?: number;
    }[];
    const usable = rates
      .filter((x) => Number.isFinite(Number(x.total_charge)) && Number(x.total_charge) > 0)
      .sort((a, b) => Number(a.total_charge) - Number(b.total_charge));
    if (!usable.length) return "no rates";
    const best = usable[0];
    return {
      carrier: "Easyship",
      service: String(best.courier_service?.name ?? "?"),
      price: Number(best.total_charge),
      daysFrom: best.min_delivery_time,
      daysTo: best.max_delivery_time,
    };
  } catch (e) {
    return e instanceof Error ? e.message : "fetch failed";
  }
}

/** Evenly spread a sample across a sorted list, so it is not all featherweights. */
const spread = <T,>(list: T[], n: number): T[] =>
  list.length <= n
    ? list
    : Array.from({ length: n }, (_, i) => list[Math.round((list.length - 1) * (i / (n - 1)))]);

it("compares Australia Post against Easyship", async () => {
  const clearance = new Set(productsInCategory(356).map((p) => p.id));
  const served = allProducts().filter(
    (p) => filterListable([p]).length > 0 && (clearance.has(p.id) || filterBrandSku([p]).length > 0)
  );

  const all: Row[] = served.map((p: WcProduct) => {
    const l = num(p.dimensions?.length);
    const w = num(p.dimensions?.width);
    const h = num(p.dimensions?.height);
    return { sku: p.sku ?? "", name: p.name, kg: num(p.weight), l, w, h, m3: (l * w * h) / 1e6 };
  });

  const usable = all.filter((r) => r.kg && r.l && r.w && r.h && !implausible(r));
  const parcels = spread(
    usable.filter(isParcel).sort((a, b) => a.kg - b.kg),
    PARCEL_SAMPLE
  );
  const bulky = spread(
    usable.filter((r) => !isParcel(r)).sort((a, b) => a.kg - b.kg),
    BULKY_SAMPLE
  );

  type Result = {
    row: Row;
    segment: "parcel" | "bulky";
    lane: (typeof LANES)[number];
    ap: Priced | string;
    es: Priced | string;
  };
  const results: Result[] = [];

  // Rate stability, answered as a side effect: the checkout prices freight to
  // DISPLAY it and the payment-intent route prices it again to CHARGE it. If a
  // rate moves between two identical calls, the second one 409s an order whose
  // card is already captured. Two calls, same inputs, compared.
  let stability = "not tested";
  if (EASYSHIP_TOKEN && parcels.length) {
    const a = await quoteEasyship(parcels[0], LANES[0]);
    const b = await quoteEasyship(parcels[0], LANES[0]);
    stability =
      typeof a === "string" || typeof b === "string"
        ? `could not test (${typeof a === "string" ? a : b})`
        : a.price === b.price
          ? `STABLE - two identical calls both returned $${a.price.toFixed(2)}`
          : `**UNSTABLE** - $${a.price.toFixed(2)} then $${b.price.toFixed(2)}`;
  }

  for (const [segment, rows] of [
    ["parcel", parcels],
    ["bulky", bulky],
  ] as const) {
    for (const row of rows) {
      for (const lane of LANES) {
        const [ap, es] = await Promise.all([
          quoteAusPost(row, lane.postcode),
          quoteEasyship(row, lane),
        ]);
        results.push({ row, segment, lane, ap, es });
      }
    }
  }

  const both = results.filter(
    (r) => typeof r.ap !== "string" && typeof r.es !== "string"
  ) as (Result & { ap: Priced; es: Priced })[];

  // Weighted by lane volume, so the average reflects the book we actually ship.
  const weightOf = (l: (typeof LANES)[number]) => l.orders;
  const totalWeight = both.reduce((s, r) => s + weightOf(r.lane), 0);
  const wAp = both.reduce((s, r) => s + r.ap.price * weightOf(r.lane), 0) / (totalWeight || 1);
  const wEs = both.reduce((s, r) => s + r.es.price * weightOf(r.lane), 0) / (totalWeight || 1);
  const esWins = both.filter((r) => r.es.price < r.ap.price).length;

  const esOnly = results.filter((r) => typeof r.ap === "string" && typeof r.es !== "string");
  const neither = results.filter((r) => typeof r.ap === "string" && typeof r.es === "string");

  const money = (n: number) => `$${n.toFixed(2)}`;
  const cell = (p: Priced | string) => (typeof p === "string" ? `_${p}_` : money(p.price));

  const md = `# Australia Post versus Easyship

Generated by \`npm run report:carriers\`. Carrier RAW rates, GST-inclusive, before
our ${process.env.FREIGHT_MARGIN_PERCENT ?? 15}% handling margin. One carton per row, from ${FROM_POSTCODE}.

API calls made: **${auspostCalls} Australia Post, ${easyshipCalls} Easyship**.
Easyship's rates endpoint is metered against a monthly plan allowance.

## Verdict on the overlap

These are the ${parcels.length} sampled products **both** carriers will carry. This is the
only fair price comparison; everything below it is about coverage.

| | |
|---|---|
| Quotes where both priced | ${both.length} |
| Easyship cheaper | ${esWins} of ${both.length} (${both.length ? ((esWins / both.length) * 100).toFixed(0) : 0}%) |
| Weighted average, Australia Post | **${money(wAp)}** |
| Weighted average, Easyship | **${money(wEs)}** |
| Difference | **${wEs > wAp ? "+" : ""}${money(wEs - wAp)}** (${wAp ? (((wEs - wAp) / wAp) * 100).toFixed(0) : 0}%) |

Averages are weighted by real destination mix since 2020: ${LANES.map((l) => `${l.state} ${l.orders}`).join(", ")}.

## Rate stability

${stability}

The checkout prices freight twice - once to show the customer, once server-side
in \`payment-intent/route.ts\` to charge the card. A rate that moves between those
two calls fails the order after the card is captured.

## Coverage Australia Post does not have

${esOnly.length} of the sampled quotes were priced by Easyship and refused by Australia Post.
This is the ${bulky.length} bulky products, the segment that hits "Calculated on quote" today.

| sku | product | kg | carton cm | lane | Easyship | service | days |
|---|---|---|---|---|---|---|---|
${
  esOnly
    .slice(0, 30)
    .map((r) => {
      const es = r.es as Priced;
      return `| ${r.row.sku} | ${r.row.name} | ${r.row.kg} | ${r.row.l} x ${r.row.w} x ${r.row.h} | ${r.lane.state} | ${money(es.price)} | ${es.service} | ${es.daysFrom ?? "?"}-${es.daysTo ?? "?"} |`;
    })
    .join("\n") || "_none_"
}

${neither.length > 0 ? `**${neither.length} quotes neither carrier would price.** Those stay on the quote flow.\n` : ""}
## Every quote

| segment | sku | product | kg | carton cm | lane | Australia Post | Easyship | delta |
|---|---|---|---|---|---|---|---|---|
${results
  .map((r) => {
    const delta =
      typeof r.ap !== "string" && typeof r.es !== "string"
        ? `${r.es.price > r.ap.price ? "+" : ""}${money(r.es.price - r.ap.price)}`
        : "-";
    return `| ${r.segment} | ${r.row.sku} | ${r.row.name} | ${r.row.kg} | ${r.row.l} x ${r.row.w} x ${r.row.h} | ${r.lane.state} | ${cell(r.ap)} | ${cell(r.es)} | ${delta} |`;
  })
  .join("\n")}
`;

  writeFileSync(MD, md);
  writeFileSync(
    CSV,
    [
      "segment,sku,product,weight_kg,length_cm,width_cm,height_cm,lane_state,lane_postcode,auspost_price,auspost_service,easyship_price,easyship_service,easyship_days_from,easyship_days_to,delta",
      ...results.map((r) => {
        const ap = typeof r.ap === "string" ? { price: "", service: r.ap } : r.ap;
        const es =
          typeof r.es === "string"
            ? { price: "", service: r.es, daysFrom: "", daysTo: "" }
            : r.es;
        const delta =
          typeof r.ap !== "string" && typeof r.es !== "string"
            ? (r.es.price - r.ap.price).toFixed(2)
            : "";
        return [
          r.segment,
          q(r.row.sku),
          q(r.row.name),
          r.row.kg,
          r.row.l,
          r.row.w,
          r.row.h,
          r.lane.state,
          r.lane.postcode,
          ap.price,
          q(ap.service),
          es.price,
          q(es.service),
          es.daysFrom ?? "",
          es.daysTo ?? "",
          delta,
        ].join(",");
      }),
    ].join("\n")
  );

  console.log(
    `\ncompared ${both.length} head-to-head, easyship cheaper on ${esWins}` +
      `\nweighted avg: auspost ${money(wAp)} vs easyship ${money(wEs)}` +
      `\neasyship-only coverage: ${esOnly.length} quotes` +
      `\ncalls: ${auspostCalls} auspost, ${easyshipCalls} easyship` +
      `\nstability: ${stability}\n`
  );
}, 600_000);
