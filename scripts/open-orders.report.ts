// Which open sales orders are bulky, and which would make a clean freight test.
//
//   npm run report:openorders
//     reports/open-orders-freight.md
//
// Built to answer one question: of the orders sitting unshipped in Unleashed
// right now, which is the best candidate for a first real consignment through a
// new carrier? A good candidate is BULKY - because that is the half of the
// catalogue nobody has validated against an invoice - and SIMPLE, because a
// twelve-line fitout is a bad experiment.
//
// Cartons are resolved through refsToFreightItems(), the same path the checkout
// uses, so "bulky" here means exactly what the live quote means by it, including
// the ERP's Width/Depth/Height axis remap.
//
// READ-ONLY. It lists and measures; it books nothing and spends nothing.
import { createHmac } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";

const env = new Map<string, string>();
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env.set(m[1], m[2].replace(/^["']|["']$/g, ""));
}
for (const [k, v] of env) if (!process.env[k]) process.env[k] = v;

const { refsToFreightItems } = await import("@/lib/freight-server");
const { isOversize, MAX_PARCEL_WEIGHT_KG, MAX_PARCEL_DIMENSION_CM } = await import("@/lib/freight");
const { allProducts } = await import("@/lib/catalogue");

// SKU -> snapshot product id.
//
// refsToFreightItems() resolves a bare `sku` through getUnleashedMap(), which is
// wrapped in Next's unstable_cache and therefore returns {} outside a request
// context - i.e. always, in a script like this one. Passing the snapshot's
// productId takes the same path the checkout takes for a listed product and
// gets the committed carton data instead. ERP-only codes still come back
// unmeasured here; that is a limitation of running outside Next, not of the
// product record, so they are reported separately rather than called broken.
const idBySku = new Map<string, number>();
for (const p of allProducts()) {
  const sku = (p.sku ?? "").trim().toUpperCase();
  if (sku && !idBySku.has(sku)) idBySku.set(sku, p.id);
}

const OUT = "reports/open-orders-freight.md";
const out = (s: string) => process.stdout.write(`${s}\n`);

// Charge and service codes, not things in a box. They carry no carton and would
// otherwise show up as unmeasurable lines on every order.
const NON_PHYSICAL = /^(MKFR|MKINS|MKDEL|MKDISC|MKFDA)$/i;

const sign = (q: string) =>
  createHmac("sha256", process.env.UNLEASHED_API_KEY ?? "").update(q).digest("base64");

type OrderLine = { Product?: { ProductCode?: string }; OrderQuantity?: number };
type Order = {
  OrderNumber?: string;
  OrderStatus?: string;
  Customer?: { CustomerName?: string };
  DeliveryStreetAddress?: string;
  DeliveryCity?: string;
  DeliverySuburb?: string;
  DeliveryRegion?: string;
  DeliveryPostCode?: string;
  SalesOrderLines?: OrderLine[];
};

async function ordersWithStatus(status: string): Promise<Order[]> {
  const query = `pageSize=200&orderStatus=${status}`;
  const res = await fetch(`https://api.unleashedsoftware.com/SalesOrders/1?${query}`, {
    headers: {
      "api-auth-id": process.env.UNLEASHED_API_ID ?? "",
      "api-auth-signature": sign(query),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    out(`  ${status}: HTTP ${res.status}`);
    return [];
  }
  const json = (await res.json()) as { Items?: Order[] };
  return json.Items ?? [];
}

it("profiles the open orders for freight", async () => {
  const all: Order[] = [];
  for (const status of ["Parked", "Placed", "Backordered"]) {
    const items = await ordersWithStatus(status);
    for (const o of items) all.push({ ...o, OrderStatus: status });
  }

  type Profile = {
    order: Order;
    cartons: number;
    heaviest: number;
    longest: number;
    bulky: number;
    unmeasured: string[];
    lines: number;
  };

  const profiles: Profile[] = [];
  for (const order of all) {
    const physical = (order.SalesOrderLines ?? []).filter(
      (l) => l.Product?.ProductCode && !NON_PHYSICAL.test(l.Product.ProductCode)
    );
    if (physical.length === 0) continue;

    const items = await refsToFreightItems(
      physical.map((l) => {
        const sku = (l.Product?.ProductCode ?? "").trim();
        return {
          productId: idBySku.get(sku.toUpperCase()) ?? 0,
          sku,
          quantity: Math.max(1, Math.floor(l.OrderQuantity ?? 1)),
        };
      })
    );

    const measured = items.filter((i) => i.weightKg && i.lengthCm && i.widthCm && i.heightCm);
    const unmeasured = items.filter((i) => !measured.includes(i)).map((i) => i.sku);
    const bulky = measured.filter((i) =>
      isOversize({
        weight: i.weightKg,
        length: Math.ceil(i.lengthCm),
        width: Math.ceil(i.widthCm),
        height: Math.ceil(i.heightCm),
      })
    );

    profiles.push({
      order,
      lines: physical.length,
      cartons: measured.reduce((s, i) => s + i.quantity, 0),
      heaviest: Math.max(0, ...measured.map((i) => i.weightKg)),
      longest: Math.max(0, ...measured.map((i) => Math.max(i.lengthCm, i.widthCm, i.heightCm))),
      bulky: bulky.reduce((s, i) => s + i.quantity, 0),
      unmeasured,
    });
  }

  const addressed = (p: Profile) => Boolean(p.order.DeliveryPostCode?.trim());
  // A good test is bulky, addressed, fully measured, and SHORT. A twelve-line
  // fitout tells you less than one heavy machine, because when the invoice
  // disagrees you cannot tell which line caused it.
  const candidates = profiles
    .filter((p) => p.bulky > 0 && addressed(p) && p.unmeasured.length === 0)
    .sort((a, b) => a.lines - b.lines || a.cartons - b.cartons);

  const where = (o: Order) =>
    [o.DeliveryCity || o.DeliverySuburb, o.DeliveryRegion, o.DeliveryPostCode]
      .filter(Boolean)
      .join(" ");

  const row = (p: Profile) =>
    `| ${p.order.OrderNumber} | ${p.order.OrderStatus} | ${(p.order.Customer?.CustomerName ?? "?").slice(0, 34)} | ${where(p.order)} | ${p.lines} | ${p.cartons} | ${p.bulky} | ${p.heaviest}kg | ${p.longest}cm |`;

  const header =
    "| order | status | customer | destination | lines | cartons | bulky | heaviest | longest |\n|---|---|---|---|---|---|---|---|---|";

  const md = `# Open orders, profiled for freight

Generated by \`npm run report:openorders\` from Unleashed sales orders in Parked,
Placed and Backordered. Cartons resolved through \`refsToFreightItems()\`, so
"bulky" means exactly what the live checkout means: over ${MAX_PARCEL_WEIGHT_KG}kg,
over ${MAX_PARCEL_DIMENSION_CM}cm on a side, or over 0.25m3.

Read-only. Nothing here books or spends anything.

## Best candidates for a first real consignment

Bulky, addressed, fully measured, fewest lines first. A short order is a better
experiment: when the invoice disagrees with the quote, you can tell which carton
caused it.

${header}
${candidates.slice(0, 15).map(row).join("\n") || "| _none_ | | | | | | | | |"}

## Every open order with something physical on it

${header}
${profiles
  .sort((a, b) => b.bulky - a.bulky)
  .map(row)
  .join("\n")}

## Orders carrying a line with no carton data

Either the product record carries no carton, or the code is ERP-only and this
script cannot see it (see the note on \`unstable_cache\` in the source). Check a
few by hand before treating the list as a data-quality problem.

${
  profiles
    .filter((p) => p.unmeasured.length > 0)
    .slice(0, 20)
    .map((p) => `- \`${p.order.OrderNumber}\` — ${p.unmeasured.join(", ")}`)
    .join("\n") || "_none_"
}
`;

  writeFileSync(OUT, md);
  out(`\n${all.length} open orders, ${profiles.length} with physical lines`);
  out(`${candidates.length} are bulky, addressed and fully measured\n`);
  out(header.split("\n")[0]);
  for (const p of candidates.slice(0, 10)) out(row(p));
  out(`\nwritten to ${OUT}\n`);
}, 600_000);
