# Bulky freight brief

The RFP we send to freight providers for the bulky half of the catalogue.

**This file is INTERNAL. The provider-facing version is deliberately narrower.**
Keep it that way: this doc holds the working numbers and our own weak spots, the
published brief holds only what a provider needs to quote and build.

**Regenerate the figures before sending it to anyone new:**

```
npm run report:bulky
```

That writes `reports/bulky-freight-profile.md` and `.csv` from the committed
catalogue snapshot, using the same parcel thresholds the live checkout enforces
(`lib/freight.ts`). The CSV is the "full 107 item list" the brief offers carriers.

> Re-verified after the `fac4ca6` snapshot refresh on 2026-08-25: unchanged.
> 107 bulky, 601kg / 268cm / 1.12m3. The provider spec and its PDF are still accurate.

## The numbers, as at 2026-08-25

| | |
|---|---|
| Sellable products | 220 |
| With usable carton data | 186 |
| **Parcel, carried by Australia Post today** | **79 (42%)** |
| **Bulky, no carrier** | **107 (58%)** |
| No carton data at all | 33 |
| Carton data implausible | 1 (`ABPBSB04`, recorded as 259m3) |
| Median bulky weight | 43kg |
| Heaviest | 601kg (`MCTMSP02`) |
| Longest side | 268cm (`MEFRDB11`) |
| Over 100kg, mechanical handling | 24 (22%) |
| Over 2m, may not fit a pallet | 15 (14%) |

**Length drives this more than weight.** Only 17% fall out of parcel on weight
alone; 25% on length alone and 57% on more than one reason. Racks, rigs and
barbells are long rather than heavy, so a deadweight-only rate card does not fit.

> **Section 5 of `HANDOFF.md` says "Australia Post prices 111 of 338 listed
> products". That is stale.** It predates snapshot changes. The current figure is
> 79 of 186 measured (220 sellable). Trust `npm run report:bulky`, not the prose.

## Volume and lanes, from Unleashed

- **~18 orders per month**, averaged over the last 12 complete months (212 total).
  Busiest month on record was 82. Seasonal, weighted to fitout projects.
- Single collection origin: **Thomastown VIC 3074**.
- Destination mix across all sales orders since 2020: VIC 277, NSW 119, QLD 73,
  SA 69, WA 25, TAS 6, Singapore 11. `DeliveryRegion` is recorded inconsistently
  ("VIC" vs "VICTORIA"), so treat as indicative.
- Not every order is bulky, so 18/month is the **ceiling** on bulky consignments,
  not the count. We say so in the brief rather than letting a carrier assume.

## What we already have

`ShippingCompanies` in Unleashed already lists Northline, Kube Transport, Civic
Transport, Expeditors, Plane 2 Sea, Freight Exchange, Mainfreight, Australia Post,
Agile Logistics and OIA Global. `DeliveryMethods` are **Hand Unload Delivery** and
**Tailgate Delivery**.

So this is not a greenfield tender. We already move bulky freight. What no
incumbent does is talk to the website or write back to the ERP.

## The finding that shapes the Unleashed section

**Unleashed holds 923 sales shipments. Only 43 carry a tracking number, and 886
have no `ShippingCompany` set.** The fields exist and are almost entirely empty,
because dispatch happens in carrier portals and nothing writes back. We have no
dispatch visibility in our own ERP.

The integration ask is therefore concrete: populate `SalesShipments` with
`ShippingCompany`, `TrackingNumber`, `DispatchDate`, `NumberOfPackages`,
`ShipmentWeight`, `ShipmentStatus` against the existing `OrderNumber`.

Note: a carrier's name has to exist in `ShippingCompanies` before it can be set.

## The integration spec is "repeat Australia Post"

The brief documents the live AusPost integration and asks carriers to match it,
rather than describing an abstract wishlist. The rules that carry over:

- One parcel per unit, no consolidation (we have no packing data to do it honestly)
- Dimensions rounded up to integer cm, never under declared
- One call per carton today, because PAC prices a single parcel per request. **A
  carrier that prices a whole consignment in one call is a direct latency win.**
- Whole cart fails together if any line lacks carton data
- Handling margin applied by us (`FREIGHT_MARGIN_PERCENT`, default 15)
- GST handled explicitly by config, because getting it backwards undercharges
  every order by 10%
- Two options shown: cheapest, plus the fastest that beats it
- Typed failure reasons, never an empty list

Where AusPost falls short and a bulky carrier must do better:

1. Refuses 58% of the catalogue by design.
2. **No transit times in the rating response.** We hardcode published standards
   and use them only to rank services, never to promise a date.
3. No tailgate / residential / two-person concept, because parcels do not need one.
4. Rating only. Nothing is booked through it, which is why the ERP is empty.

## Deliberately NOT in the provider-facing brief

Trimmed on Michael's call, 2026-08-25, on the principle that a provider gets what
they need and nothing more. If a future edit reintroduces any of this, it is a
regression, not an improvement:

| Withheld | Why |
|---|---|
| **Any carrier name**, current or historical | We are tendering to these people. Naming incumbents tells a bidder who they are pricing against. |
| **The handling margin** | Our markup is not a provider's business. |
| **"Not a greenfield tender"** framing | Revealed our position for no gain. |
| **The 923 shipments / 43 tracking numbers stat** | The ASK (populate these fields) is what a provider needs. How empty our ERP is today is not. |
| **The 33 unmeasured products and the one bad record** | See the caveat below. |
| Parcel-versus-bulky percentages | 107 products is the number they quote against. The split reveals more than it helps. |
| Inconsistent `DeliveryRegion` data | Destination mix is given as percentages instead. |

**One reservation, recorded rather than argued.** Dropping the data-gaps
disclosure is a defensible commercial call, but a provider will hit the 33
unmeasured products during onboarding, and hearing it from us first would have
cost nothing. If a bidder gets close, consider mentioning it before they find it.

## Scope: the provider document is API ONLY

Narrowed 2026-08-25. It is a technical integration spec, not a tender. Everything
commercial lives in this file and goes to a provider some other way, if at all:
consignment profile and weight bands, lanes, volumes, handling and tailgate
pricing, the rate-card fallback, and the commercial response checklist.

What stays is the five calls (rate, book, status webhook, consignment lookup,
ERP write), the field contract, error and status code requirements, auth,
sandbox, network access, and the input limits.

The physical extremes survive, but reframed: 601kg, 268cm and 1.12m3 appear as
**values the API must accept** rather than as a catalogue profile. A provider
whose API rejects a 601kg line item needs to know that before integration, not
after.

## The provider-facing document

`docs/freight-api-spec.html` is the source. It is the same file published as the
artifact, and it carries a `@media print` block so it renders to a clean A4 PDF
without a second design.

```
export CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
npm run brief:pdf
```

Writes `reports/MasterKraft-Freight-API.pdf`, 8 pages A4. The PDF is not
committed because it is regenerable and the HTML is the source of truth. Edit the
HTML, never the PDF, or the web and paper versions drift.

The print block forces the light palette with `!important`, because the
dark-scheme rule uses `:root:not([data-theme="light"])` and outranks a bare
`:root`. It also unwraps the horizontally-scrolling table containers, which are
right on screen and would clip on paper.

**Contact details on the brief are the published switchboard number only.** The
site has no public email address (see conventions), so there is no address on it.
If a named contact should receive responses, add one before sending.

## Before sending

- [ ] Re-run `npm run report:bulky` and check the numbers still match
- [ ] Attach `reports/bulky-freight-profile.csv` for anyone pricing the full range
- [ ] Check nothing from the "Deliberately NOT in the provider-facing brief"
      table has crept back in
- [ ] The 33 unmeasured products are currently NOT disclosed. If a bidder gets
      close, decide whether to raise it before they find it
