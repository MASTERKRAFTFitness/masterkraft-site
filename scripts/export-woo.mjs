#!/usr/bin/env node
// Cold export of everything the WooCommerce REST API will still give us.
//
// Run:  npm run export:woo
//
// WHY. Since the 27 August cutover the apex points at Vercel, so WordPress has
// no hostname: masterkraft.com/wp-json now answers from Vercel, not from the
// store. The install is still running and still serving on its own IP, and its
// certificate expires 27 September 2026, so there is a window and it is closing.
// Everything the business would otherwise lose with that server - the order
// history, the customer records, the coupons, the shipping and tax setup - lives
// only there. The product catalogue is already committed in src/data, but this
// takes the raw form of it too, so a restore never depends on our snapshot's
// shape.
//
// REACHES THE BOX BY IP, ON PURPOSE. Node cannot do curl's --resolve, so we
// request the IP directly and send Host: masterkraft.com. TLS is verified
// against the real hostname via the `servername` option, so this is NOT
// certificate-skipping: if the cert lapses, this script starts failing, which is
// the correct behaviour.
//
// PERSONAL DATA. orders.json and customers.json contain names, addresses, email
// addresses and phone numbers. The output directory is deliberately OUTSIDE this
// repo and must never be committed or pushed to GitHub.
//
// WHAT THIS CANNOT REACH. wp/v2 (pages, posts, media library) returns 401 to
// WooCommerce keys - those need a WordPress application password, not the store
// keys. Nor can it reach wp-config constants, cron jobs, .htaccess or the
// Unleashed sync credentials. Only a cPanel backup carries those, which is the
// open ask with Paul.

import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { request } from "node:https";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const IP = process.env.WC_ORIGIN_IP ?? "103.26.237.235";
const HOST = "masterkraft.com";

function env(name) {
  for (const line of readFileSync(join(ROOT, ".env.local"), "utf8").split("\n")) {
    const eq = line.indexOf("=");
    if (eq > 0 && line.slice(0, eq).trim() === name) {
      return line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    }
  }
  throw new Error(`Missing ${name} in .env.local`);
}

const AUTH =
  "Basic " + Buffer.from(`${env("WC_CONSUMER_KEY")}:${env("WC_CONSUMER_SECRET")}`).toString("base64");

// One request, to the IP, with SNI and Host set to the real hostname so the
// certificate still validates.
function get(path) {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: IP,
        servername: HOST,
        port: 443,
        path,
        method: "GET",
        headers: { Host: HOST, Authorization: AUTH, "User-Agent": "Mozilla/5.0", Accept: "application/json" },
        timeout: 60000,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () =>
          resolve({ status: res.statusCode, headers: res.headers, body }),
        );
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

// Serial, never parallel: this host refuses bursts (see mirror-product-images.mjs).
async function collect(endpoint, extra = "") {
  const out = [];
  for (let page = 1; ; page++) {
    const path = `/wp-json/wc/v3/${endpoint}?per_page=100&page=${page}${extra}`;
    let res;
    for (let attempt = 1; ; attempt++) {
      res = await get(path);
      if (res.status === 200 || attempt === 4) break;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
    if (res.status !== 200) throw new Error(`${endpoint} page ${page}: HTTP ${res.status} ${res.body.slice(0, 160)}`);
    const batch = JSON.parse(res.body);
    if (!Array.isArray(batch) || batch.length === 0) return out;
    out.push(...batch);
    const totalPages = Number(res.headers["x-wp-totalpages"] ?? 1);
    if (page >= totalPages) return out;
  }
}

const STAMP = process.env.EXPORT_STAMP ?? new Date().toISOString().slice(0, 10);
const OUT = process.env.WOO_EXPORT_DIR ?? join(process.env.HOME, "Desktop/masterkraft-woo-export", STAMP);
mkdirSync(OUT, { recursive: true });

function save(name, data) {
  const file = join(OUT, `${name}.json`);
  writeFileSync(file, JSON.stringify(data, null, 1));
  const kb = Math.round(statSync(file).size / 1024);
  const n = Array.isArray(data) ? data.length : Object.keys(data).length;
  console.log(`  ${name.padEnd(22)} ${String(n).padStart(5)} records  ${String(kb).padStart(6)} KB`);
  return { records: n, kb };
}

// Ordered cheapest-first so a failure surfaces before the long pulls.
const SETS = [
  ["coupons", "coupons"],
  ["taxes", "taxes"],
  ["shipping-zones", "shipping/zones"],
  ["product-attributes", "products/attributes"],
  ["product-categories", "products/categories"],
  ["product-tags", "products/tags"],
  ["customers", "customers"],
  ["orders", "orders"],
  ["products", "products"],
];

const manifest = { exportedAt: new Date().toISOString(), origin: `${HOST} @ ${IP}`, sets: {} };

console.log(`WooCommerce cold export -> ${OUT}\n`);
for (const [name, endpoint] of SETS) {
  // orders default to a status filter; ask for every status explicitly.
  const extra = endpoint === "orders" ? "&status=any" : "";
  const data = await collect(endpoint, extra);
  manifest.sets[name] = save(name, data);

  // Variations hang off each variable product and are not in /products.
  if (name === "products") {
    const variable = data.filter((p) => p.type === "variable");
    const byParent = {};
    let count = 0;
    for (const p of variable) {
      byParent[p.id] = await collect(`products/${p.id}/variations`);
      count += byParent[p.id].length;
    }
    manifest.sets["product-variations"] = save("product-variations", byParent);
    console.log(`  (${count} variations across ${variable.length} variable products)`);
  }
}

writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));
writeFileSync(
  join(OUT, "README.md"),
  `# WooCommerce cold export — ${STAMP}

Taken from the live WordPress install at \`${IP}\` (hostname \`${HOST}\`, which since the
27 August cutover resolves to Vercel, so this had to go direct to the origin).

**This directory contains personal data.** \`orders.json\` and \`customers.json\` hold names,
postal addresses, email addresses and phone numbers. Do not commit it, do not put it in the
repo, do not upload it anywhere that is not access controlled.

## What is here

Everything the WooCommerce REST API exposes to store keys. See \`manifest.json\` for counts.

## What is NOT here, and still needs a cPanel backup from Paul

- The WordPress media library, pages and posts (\`wp/v2\` returns 401 to store keys — those
  need a WordPress application password).
- \`wp-config.php\` constants, server cron jobs, \`.htaccess\`, and the Unleashed sync
  credentials.
- Payment gateway configuration and its Stripe/Afterpay/Zip callback setup.

Regenerate with \`npm run export:woo\` from the masterkraft-site repo.
`,
);
console.log(`\nmanifest + README written. Cert on that host expires 27 Sep 2026.`);
