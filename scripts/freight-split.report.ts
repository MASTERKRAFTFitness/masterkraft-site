// The consignment split, measured against BOTH live carriers.
//
//   npm run check:split
//
// check:carriers proves the router answers. This proves the SPLIT: that a cart
// holding an over-limit carton is quoted as separate consignments and comes back
// cheaper than the one-consignment price it used to carry.
//
// The thing being guarded against is specific. TNT is the only carrier on this
// account that takes the bulky half of the catalogue, and it quotes
// single-parcel consignments ONLY - a second carton of any size drops it and
// leaves UPS Express, the dearest service in the pool. Measured 2026-09-11, the
// mixed cart below cost $450.00 whole and $249.07 split.
//
// Costs roughly 8 metered Easyship calls. Prints, and does not assert: the
// numbers move with the carriers, and the point is to see the split happening
// and the parcel-only cart NOT splitting.
import { readFileSync } from "node:fs";
import { it } from "vitest";

const env = new Map<string, string>();
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env.set(m[1], m[2].replace(/^["']|["']$/g, ""));
}
for (const [k, v] of env) if (!process.env[k]) process.env[k] = v;
// The production ceiling is not set locally; leave it off so nothing is hidden.
delete process.env.FREIGHT_MAX_AUTO_QUOTE;

const { quoteFreight } = await import("@/lib/freight");
const { clearFreightCache } = await import("@/lib/freight-cache");
const out = (s: string) => process.stdout.write(`${s}\n`);

const MEL = { city: "Melbourne", state: "VIC", postcode: "3000", country: "Australia", line1: "1 Test St" };
const marker = (q = 1) => ({ sku: "MBSADO02", name: "Station Markers", quantity: q, weightKg: 1, lengthCm: 10, widthCm: 10, heightCm: 2 });
const bag = (q = 1) => ({ sku: "MBSAHD01", name: "Heavy Bag", quantity: q, weightKg: 21, lengthCm: 63, widthCm: 53, heightCm: 35 });
const barbell = (q = 1) => ({ sku: "MWBBOL04", name: "Olympic Barbell", quantity: q, weightKg: 21, lengthCm: 224, widthCm: 8, heightCm: 8 });

const CARTS: [string, ReturnType<typeof marker>[]][] = [
  ["THE MIXED CART: 2 markers + 2 bags + 1 barbell", [marker(2), bag(2), barbell(1)]],
  ["1 marker + 1 barbell", [marker(1), barbell(1)]],
  ["2 barbells (pure bulky)", [barbell(2)]],
  ["parcels only: 2 markers + 2 bags (must be unchanged)", [marker(2), bag(2)]],
];

it("prices the split carts live", async () => {
  for (const [label, items] of CARTS) {
    clearFreightCache();
    const q = await quoteFreight(items, MEL);
    out(`\n${label}`);
    if (!q.ok) { out(`   UNQUOTABLE: ${q.reason}`); continue; }
    for (const o of q.options) {
      const days = o.daysFrom || o.daysTo ? `${o.daysFrom ?? "?"}-${o.daysTo ?? "?"}d` : "no transit time";
      out(`   $${o.price.toFixed(2).padStart(8)}  ${o.carrier} ${o.service} (${days})`);
      out(`   ${"".padStart(8)}  id ${o.id}`);
    }
  }

  // Display-then-charge, the pair that must agree.
  out("\n--- display-then-charge on the mixed cart ---");
  clearFreightCache();
  const a = await quoteFreight([marker(2), bag(2), barbell(1)], MEL);
  const b = await quoteFreight([marker(2), bag(2), barbell(1)], MEL);
  const same = JSON.stringify(a) === JSON.stringify(b);
  out(`   identical: ${same ? "YES" : "NO — DRIFT"}`);
  out("");
}, 300_000);
