// End-to-end smoke test of the two-carrier router, against BOTH live APIs.
//
//   npm run check:carriers
//
// Unlike report:carriers, which prices each carrier separately to compare them,
// this calls `quoteFreight()` itself - the exact function the checkout and the
// payment-intent route use. It answers the only question that matters once the
// credentials are in: does a real cart come back with a real price, and which
// carrier won it.
//
// Three carts, chosen to exercise all three branches of the router:
//   light  - Australia Post's flat satchel rate should win
//   heavy  - at the top of the parcel band, where Easyship starts to win
//   bulky  - over the parcel limits, so Australia Post is not even asked
//
// Writes straight to stdout, because this project's vitest reporter swallows
// console.log. Prints, and does not assert. There is no correct answer to hard-code: the
// point is to see two carriers competing and confirm neither is silently absent.
import { readFileSync } from "node:fs";
import { it } from "vitest";

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

// Imported AFTER the env is loaded, because the module reads credentials when
// the functions run and the collection address is read from process.env.
const { quoteFreight, freightConfigured, marginPercent } = await import("@/lib/freight");
const { freightCacheStats, cacheTtlSeconds } = await import("@/lib/freight-cache");

const out = (s: string) => process.stdout.write(`${s}\n`);

const CARTS = [
  {
    label: "light parcel (1kg satchel)",
    items: [
      { sku: "MBSADO02", name: "Station Markers", quantity: 1, weightKg: 1, lengthCm: 10, widthCm: 10, heightCm: 2 },
    ],
  },
  {
    label: "heavy parcel (21kg, top of the band)",
    items: [
      { sku: "MBSAHD01", name: "Heavy Bag", quantity: 1, weightKg: 21, lengthCm: 63, widthCm: 53, heightCm: 35 },
    ],
  },
  {
    label: "bulky (224cm barbell, over the parcel limits)",
    items: [
      { sku: "MWBBOL04", name: "Olympic Barbell", quantity: 1, weightKg: 21, lengthCm: 224, widthCm: 8, heightCm: 8 },
    ],
  },
];

const LANES = [
  { city: "Melbourne", state: "VIC", postcode: "3000", country: "Australia" },
  { city: "Perth", state: "WA", postcode: "6000", country: "Australia" },
];

it("quotes real carts through the router", async () => {
  if (!freightConfigured()) {
    out("\nNeither carrier is configured. Set AUSPOST_API_KEY and/or");
    out("EASYSHIP_API_TOKEN in .env.local, plus FREIGHT_COLLECTION_*.\n");
    return;
  }
  out(
    `\nAUSPOST_API_KEY ${process.env.AUSPOST_API_KEY ? "set" : "MISSING"}, ` +
      `EASYSHIP_API_TOKEN ${process.env.EASYSHIP_API_TOKEN ? "set" : "MISSING"}, ` +
      `margin ${marginPercent()}%\n`
  );

  for (const cart of CARTS) {
    for (const lane of LANES) {
      const q = await quoteFreight(cart.items, lane);
      const head = `${cart.label} -> ${lane.state}`.padEnd(52);
      if (!q.ok) {
        out(`${head} UNQUOTABLE: ${q.reason}${q.detail ? ` (${q.detail})` : ""}`);
        continue;
      }
      const carriers = new Set(q.options.map((o) => o.carrier));
      out(`${head} ${q.options.length} option(s) from ${[...carriers].join(", ")}`);
      for (const o of q.options) {
        const days = o.daysFrom || o.daysTo ? `${o.daysFrom ?? "?"}-${o.daysTo ?? "?"} days` : "no transit time";
        out(`    $${o.price.toFixed(2).padStart(8)}  ${o.carrier} ${o.service} (${days})  [${o.id}]`);
      }
    }
  }
  // Prove the cache: re-quote the FIRST cart and lane, which the loop above has
  // already priced. This is the display-then-charge pair the checkout makes
  // seconds apart, and it should cost nothing and return an identical number.
  const before = freightCacheStats();
  const t0 = Date.now();
  const again = await quoteFreight(CARTS[0].items, LANES[0]);
  const ms = Date.now() - t0;
  const after = freightCacheStats();
  out(
    `cache: ${after.entries} entries, ${after.hits} hits / ${after.misses} misses ` +
      `(${(after.hitRate * 100).toFixed(0)}%), ttl ${cacheTtlSeconds()}s`
  );
  out(
    `re-quote of "${CARTS[0].label}" -> ${LANES[0].state}: ${ms}ms, ` +
      `${after.hits > before.hits ? "SERVED FROM CACHE" : "went to the carrier"}` +
      (again.ok ? `, $${again.options[0].price.toFixed(2)}` : `, ${again.reason}`)
  );
  out("");
}, 300_000);
