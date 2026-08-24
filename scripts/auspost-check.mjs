// Smoke-test the Australia Post rate API with the real key.
//
//   node scripts/auspost-check.mjs
//
// Quotes a real carton from the despatch warehouse to five destinations and
// prints the carrier's raw figure next to what we would charge. Use it to settle
// the one thing that cannot be checked without a live key: whether PAC prices
// already include GST. Cross-check a printed RAW figure against the published
// retail rate on auspost.com.au. If RAW matches the published price, GST is
// included and the default is right. If RAW is about 9% lower, set
// AUSPOST_PRICES_INCLUDE_GST=false.

import { readFileSync } from "node:fs";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const KEY = process.env.AUSPOST_API_KEY;
const FROM = process.env.FREIGHT_COLLECTION_POSTCODE;
const MARGIN = parseFloat(process.env.FREIGHT_MARGIN_PERCENT ?? "15");
const INC_GST = (process.env.AUSPOST_PRICES_INCLUDE_GST ?? "true").toLowerCase() !== "false";

if (!KEY) {
  console.error("AUSPOST_API_KEY is not set in .env.local — nothing to test.");
  process.exit(1);
}
if (!FROM) {
  console.error("FREIGHT_COLLECTION_POSTCODE is not set in .env.local.");
  process.exit(1);
}

// A real product that fits inside AusPost's parcel limits.
const PARCEL = { name: "Group Fitness Step", weight: 18, length: 45, width: 45, height: 37 };
const TO = [
  ["Melbourne", "3000"],
  ["Sydney", "2000"],
  ["Perth", "6000"],
  ["Hobart", "7000"],
  ["Kalgoorlie", "6430"],
];

console.log(`\n${PARCEL.name}: ${PARCEL.weight}kg, ${PARCEL.length}x${PARCEL.width}x${PARCEL.height}cm`);
console.log(`from ${FROM}, margin ${MARGIN}%, prices assumed ${INC_GST ? "GST-inclusive" : "ex-GST"}\n`);

let failures = 0;
for (const [city, postcode] of TO) {
  const params = new URLSearchParams({
    from_postcode: FROM,
    to_postcode: postcode,
    length: String(PARCEL.length),
    width: String(PARCEL.width),
    height: String(PARCEL.height),
    weight: String(PARCEL.weight),
  });
  const res = await fetch(
    `https://digitalapi.auspost.com.au/postage/parcel/domestic/service.json?${params}`,
    { headers: { Accept: "application/json", "AUTH-KEY": KEY } }
  );
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.error) {
    failures++;
    console.log(`${city.padEnd(12)} ${postcode}  ERROR ${res.status}: ${body?.error?.errorMessage ?? "no body"}`);
    continue;
  }
  const list = body?.services?.service;
  const services = Array.isArray(list) ? list : list ? [list] : [];
  if (!services.length) {
    console.log(`${city.padEnd(12)} ${postcode}  no services returned`);
    continue;
  }
  console.log(`${city} ${postcode}`);
  for (const s of services) {
    const raw = Number(s.price);
    const charged = Math.round(raw * (1 + MARGIN / 100) * (INC_GST ? 1 : 1.1) * 100) / 100;
    console.log(`   ${String(s.name).padEnd(38)} RAW $${raw.toFixed(2)}   we charge $${charged.toFixed(2)}`);
  }
  console.log("");
}
process.exit(failures ? 1 : 0);
