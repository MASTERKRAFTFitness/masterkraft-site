#!/usr/bin/env node
// Rescue the WooCommerce order history into Supabase before the host is gone.
//
// Run:  npm run archive:orders              report what WOULD be written
//       ARCHIVE_WRITE=true npm run archive:orders
//
// Table: woo_orders_archive — see supabase/migrations/20260918_woo_orders_archive.sql
// Report: reports/woo-orders-archive.md
//
// WHY, BRIEFLY. 199 orders were placed through WooCommerce before the ERP order
// path took over on 6 September. Unleashed holds nothing before that date,
// lib/wc-admin.ts was deleted on 18 September, and the box holding them answers
// only on a pinned IP behind a certificate that expires 27 September and cannot
// renew. This is the last copy.
//
// IT READS THROUGH THE DNS PIN, like build-catalogue.mjs. masterkraft.com
// resolves to Vercel now; WC_STORE_PIN points this process at the old box.
// Do not "simplify" it to http on the bare IP: that host serves vhosts by name
// so the IP 404s, and it would put the consumer key on the wire in clear text.
//
// THE DRY RUN PRINTS NO CUSTOMER DATA. Every row here is somebody's name, home
// address, phone number and what they spent. The report counts and summarises;
// it never lists. The only place the records themselves land is the table, which
// has RLS on with no policies.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "./lib/store-dns-pin.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MD = join(ROOT, "reports/woo-orders-archive.md");
const TABLE = "woo_orders_archive";
const WRITE = process.env.ARCHIVE_WRITE === "true";

const env = {};
for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const need = (n) => {
  const v = process.env[n] ?? env[n];
  if (!v) throw new Error(`Missing ${n} (environment or .env.local)`);
  return v;
};

const STORE = need("WC_STORE_URL").replace(/\/$/, "");
const WC_AUTH =
  "Basic " +
  Buffer.from(`${need("WC_CONSUMER_KEY")}:${need("WC_CONSUMER_SECRET")}`).toString("base64");
const SUPA = need("SUPABASE_URL").replace(/\/$/, "");
const SUPA_KEY = need("SUPABASE_SERVICE_ROLE_KEY");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

/**
 * One page of orders, with the same retry policy the ERP gates learned today:
 * sequential, four attempts, backoff, retrying only what is worth retrying.
 * A dying host is exactly where a single 502 must not end the run.
 */
async function ordersPage(page) {
  const url =
    `${STORE}/wp-json/wc/v3/orders` +
    `?per_page=100&page=${page}&orderby=id&order=asc` +
    // status=any, because an archive that silently drops cancelled, refunded and
    // trashed orders is worse than no archive: those are precisely the ones
    // somebody rings up about later.
    `&status=any`;
  let lastError;
  for (const wait of [0, 2_000, 6_000, 15_000]) {
    if (wait) {
      console.error(`  page ${page}: ${lastError}, retrying in ${wait / 1000}s`);
      await sleep(wait);
    }
    try {
      const res = await fetch(url, { headers: { Authorization: WC_AUTH } });
      if (res.ok) {
        return { items: await res.json(), total: Number(res.headers.get("x-wp-total") ?? 0) };
      }
      lastError = `HTTP ${res.status}`;
      if (!RETRYABLE.has(res.status)) {
        throw new Error(`WooCommerce ${res.status} on orders page ${page} — not retryable.`);
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes("not retryable")) throw e;
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(`Gave up on orders page ${page}: ${lastError}`);
}

const num = (v) => {
  const n = parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : null;
};
/** WooCommerce sends local time with no zone. Treat it as UTC rather than guess. */
const ts = (v) => (v ? `${String(v).replace(" ", "T")}Z`.replace(/Z+$/, "Z") : null);

const row = (o) => ({
  order_number: String(o.number ?? o.id),
  wc_id: o.id ?? null,
  status: o.status ?? null,
  currency: o.currency ?? null,
  total: num(o.total),
  shipping_total: num(o.shipping_total),
  date_created: ts(o.date_created_gmt ?? o.date_created),
  date_paid: ts(o.date_paid_gmt ?? o.date_paid),
  payment_method: o.payment_method ?? null,
  payment_method_title: o.payment_method_title ?? null,
  transaction_id: o.transaction_id || null,
  customer_note: o.customer_note || null,
  billing: o.billing ?? null,
  shipping: o.shipping ?? null,
  line_items: o.line_items ?? [],
  // Verbatim. The columns above are a convenience over this, never a substitute.
  raw: o,
});

// --------------------------------------------------------------------- read

console.log(`Reading orders from ${STORE} …`);
const first = await ordersPage(1);
const reported = first.total;
const orders = [...first.items];
const pages = Math.max(1, Math.ceil(reported / 100));
for (let p = 2; p <= pages; p++) {
  const { items } = await ordersPage(p);
  orders.push(...items);
}

console.log(`${orders.length} orders read (store reports ${reported})`);

// A SHORT READ MUST NOT BECOME THE ARCHIVE. Same argument build-catalogue.mjs
// makes about products: this table is the only copy, so a partial pull that
// overwrites a fuller one is the worst outcome available. Upserts are keyed on
// order_number so a re-run repairs a gap, but only if the gap is noticed.
if (reported && orders.length < reported) {
  console.error(
    `REFUSING: ${orders.length} of ${reported} orders came back. A short read must not ` +
      `become the archive. Nothing written — run it again.`
  );
  process.exit(1);
}

const rows = orders.map(row);
const seen = new Set();
const duplicates = rows.filter((r) => (seen.has(r.order_number) ? true : (seen.add(r.order_number), false)));
if (duplicates.length) {
  console.error(`REFUSING: ${duplicates.length} duplicate order numbers; the primary key would silently drop them.`);
  process.exit(1);
}

// ------------------------------------------------------------------ summary
// Counts only. No names, no addresses, no order numbers.

const byStatus = {};
for (const r of rows) byStatus[r.status ?? "(none)"] = (byStatus[r.status ?? "(none)"] ?? 0) + 1;
const dated = rows.map((r) => r.date_created).filter(Boolean).sort();
const withTxn = rows.filter((r) => r.transaction_id).length;
const withLines = rows.reduce((n, r) => n + (r.line_items?.length ?? 0), 0);
const value = rows.reduce((n, r) => n + (r.total ?? 0), 0);

console.log(
  `  ${Object.entries(byStatus).map(([k, v]) => `${k} ${v}`).join(", ")}\n` +
    `  ${dated[0]?.slice(0, 10)} → ${dated.at(-1)?.slice(0, 10)}, ${withLines} line items, ` +
    `${withTxn} with a Stripe reference`
);

// -------------------------------------------------------------------- write

let wrote = 0;
if (WRITE) {
  for (let i = 0; i < rows.length; i += 100) {
    const slice = rows.slice(i, i + 100);
    const res = await fetch(`${SUPA}/rest/v1/${TABLE}?on_conflict=order_number`, {
      method: "POST",
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(slice),
    });
    if (!res.ok) {
      console.error(`Write failed at row ${i}: ${res.status} ${(await res.text()).slice(0, 300)}`);
      process.exit(1);
    }
    wrote += slice.length;
    console.log(`  wrote ${wrote}/${rows.length}`);
  }
} else {
  console.log("DRY RUN — ARCHIVE_WRITE=true to write. Nothing has been sent to Supabase.");
}

// ------------------------------------------------------------------- report

mkdirSync(dirname(MD), { recursive: true });
writeFileSync(
  MD,
  [
    "# The WooCommerce order history, archived",
    "",
    "Generated by `npm run archive:orders`. **Counts only — this file deliberately lists",
    "no order numbers, names or addresses.** Every row behind these numbers is a named",
    "customer's home address, phone number and what they spent.",
    "",
    `**${rows.length} orders**, ${dated[0]?.slice(0, 10)} to ${dated.at(-1)?.slice(0, 10)}, in the`,
    `Supabase table \`${TABLE}\` — RLS on, no policies, service role only.`,
    "",
    "**Why it exists.** These predate the ERP order path that took over on 6 September.",
    "Unleashed holds nothing before that date and the box that holds them answers only on",
    "a pinned IP, behind a certificate that expires 27 September and cannot renew. This is",
    "the last copy.",
    "",
    "| | |",
    "|---|---|",
    `| Orders | ${rows.length} |`,
    `| Line items | ${withLines} |`,
    `| With a Stripe reference | ${withTxn} |`,
    `| Combined value | ${value.toLocaleString("en-AU", { style: "currency", currency: "AUD" })} |`,
    `| Earliest | ${dated[0]?.slice(0, 10) ?? "—"} |`,
    `| Latest | ${dated.at(-1)?.slice(0, 10) ?? "—"} |`,
    "",
    "## By status",
    "",
    "| Status | Orders |",
    "|---|---|",
    ...Object.entries(byStatus)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `| ${k} | ${v} |`),
    "",
    "**`status=any`**, so cancelled, refunded and trashed orders are included. An archive",
    "that quietly dropped those would be missing precisely the ones somebody rings up about.",
    "",
    "## What is in a row",
    "",
    "Typed columns for the things worth querying — total, dates, status, the Stripe",
    "PaymentIntent — over a `raw` column holding the complete WooCommerce record. The",
    "columns are a guess about what a future question looks like; `raw` is the insurance",
    "that a wrong guess costs a JSON path rather than the data.",
    "",
    `_Last run: ${new Date().toISOString().slice(0, 16).replace("T", " ")}Z, ` +
      `${WRITE ? `${wrote} rows written` : "dry run, nothing written"}._`,
    "",
  ].join("\n")
);
console.log(`\nreports/woo-orders-archive.md written.`);
