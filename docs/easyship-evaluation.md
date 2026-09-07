# Easyship, evaluated against Australia Post

Measured 2026-09-05 against the live MasterKraft Easyship account (trial, Plus
plan, 13 days remaining) and the live Australia Post PAC key already in
production. Origin is the despatch warehouse, Thomastown VIC 3074, in every row.

**The Easyship figures below were read off the dashboard's Get a Quote screen by
hand, because the API token was not yet in `.env.local`.** Once it is, run
`npm run report:carriers` and trust that instead: it prices a real catalogue
sample across all six lanes and writes `reports/freight-carrier-comparison.md`.

Both carriers quote GST-inclusive, so these are directly comparable. Neither
figure carries our `FREIGHT_MARGIN_PERCENT` handling margin.

## The headline: they win opposite ends of the catalogue

| carton | lane | Australia Post | Easyship | winner |
|---|---|---|---|---|
| 1kg, 10 x 10 x 2 | Perth | **$10.20** | $17.70 (Aramex) | **AusPost, by $7.50** |
| 21kg, 63 x 53 x 35 | Melbourne | $30.70 | **$27.94** (Aramex) | Easyship, by $2.76 |
| 21kg, 63 x 53 x 35 | Perth | $149.45 | **$111.20** (CouriersPlease) | **Easyship, by $38.25** |
| 43kg, 150 x 60 x 60 | Sydney | *refused* | **$180.84** (TNT Road Express) | Easyship only |
| 100kg, 268 x 60 x 60 | Sydney | *refused* | **$342.83** (TNT Road Express) | Easyship only |
| 601kg, 200 x 100 x 120 | Sydney | *refused* | **$619.96** (TNT Road Express) | Easyship only |

The last three are the 107 bulky products (58% of the measured catalogue) that
hit "Calculated on quote" today. **Easyship prices the entire physical envelope
of the catalogue**, including the heaviest product on the books (`MCTMSP02`,
601kg) and the longest (`MEFRDB11`, 268cm). That is the finding that makes this
worth doing at all.

## Why the two ends behave differently

**Australia Post charges a flat national rate for small parcels and a steeply
zoned one above roughly 4kg.** From the 48 live PAC calls in
`reports/freight-carrier-comparison.csv`:

| product | kg | VIC | NSW | QLD | SA | WA | TAS |
|---|---|---|---|---|---|---|---|
| `MBSADO02` Station Markers | 1 | $10.20 | $10.20 | $10.20 | $10.20 | $10.20 | $10.20 |
| `MBRPPO02` | 4 | $25.95 | $35.55 | $39.15 | $35.55 | $54.45 | $39.45 |
| `MBSAHD01` | 21 | $30.70 | $70.70 | $85.70 | $70.70 | **$149.45** | $86.95 |

Distance costs AusPost nothing under about 2kg and a great deal at 21kg. Easyship
resells couriers that price on distance throughout, so it loses the flat-rate
game at the bottom and wins the zoned game at the top. **The crossover sits
somewhere between 1kg and 21kg and has not been measured yet** — `report:carriers`
will find it precisely once the token is in place.

This matters commercially because our lane mix is not evenly spread: VIC is 277
of 569 orders since 2020 and WA only 25. The short lane we ship most is the one
where the gap is narrowest.

## What this means for the build

**Keep both carriers.** The evidence does not support replacing Australia Post,
and it does not support ignoring Easyship:

- AusPost is meaningfully cheaper on light parcels, is already live, is already
  verified, and costs nothing per call.
- Easyship is cheaper on heavy parcels, much cheaper on long lanes, and is the
  only one of the two that will carry the bulky 58% at all.

So the build is a **carrier router**: resolve the cart's cartons server-side as
today, ask both carriers where both can carry, ask only Easyship where AusPost
refuses, and present the cheapest plus one faster option exactly as
`selectOptions()` does now. That is the refactor the bulky work needed no matter
who won the RFP, and it keeps the existing fail-soft behaviour intact.

Note that Easyship's Australian courier list does **not** include Australia Post
among its own accounts, so this is not a case of Easyship subsuming what we have.
Connecting our own AusPost account to Easyship is possible but is a paid-plan
feature and would put a marked-up reseller in front of a rate we already get
direct.

## What integration actually turned up (2026-09-05, after the router was built)

**The API works, and it prices the whole catalogue.** Verified live through
`quoteFreight()` itself, margin applied, Thomastown to a capital:

| cart | lane | result |
|---|---|---|
| 224cm barbell (`MWBBOL04`) | VIC | **$193.63** TNT Road Express, 1-3 days |
| 224cm barbell | WA | **$229.98** TNT Road Express |
| 1kg satchel | VIC | **$10.10** Aramex Domestic — beat AusPost's $11.73 |
| 21kg carton | WA | **$127.88** CouriersPlease — beat AusPost's $171.87 |

The barbell has never had an online price. It does now.

**Three things cost real time to discover, all recorded so nobody repeats them:**

1. **`category` is required, despite the schema calling it nullable.** Every call
   422s with "category can't be blank if hs_code is blank". Valid values are
   slugs from `GET /2024-09/item_categories`, an endpoint the rates documentation
   does not link. We send **`sport_leisure`**, which carries HS 9506910000 -
   "equipment for general physical exercise, gymnastics or athletics". That is
   the catalogue, exactly.
2. **The error body hides the useful part in `error.details`.** `error.message`
   alone is the useless "The request body content is not valid." The transport
   now joins both, because a rate call that fails while Australia Post succeeds
   is otherwise completely invisible - which is how the missing `category` went
   unnoticed until a cart had no second carrier to fall back on.
3. ~~**Easyship takes roughly 4 seconds per call.**~~ **Wrong — measured while
   calls were failing.** Re-measured 2026-09-06 against a working allowance:
   **693ms and 1136ms**. Fine for a checkout, and it is asked concurrently with
   Australia Post anyway, so it does not add to the other.

## ✅ Rates are STABLE across two identical calls (2026-09-06)

**Settled, and it was the risk that could break orders.** Two identical requests
for the 224cm barbell to Sydney, back to back:

```
call 1 (1136ms): TNT Road Express $162.81 | UPS Express Saver $163.69 | TNT Overnight $268.62 | ...
call 2  (693ms): TNT Road Express $162.81 | UPS Express Saver $163.69 | TNT Overnight $268.62 | ...
```

All six services, identical. So the display-then-charge pair does not drift, and
the 409-after-the-card-is-captured failure this was feared to cause does not
happen for these inputs. `src/lib/freight-cache.ts` remains the belt to that
braces - it removes the question entirely on a cache hit - but the underlying
carrier behaves.

**Two calls is not a guarantee**, only evidence. Nothing was measured across a
day boundary, a fuel-surcharge revision or a rate-card change, and `order/route.ts`
reading freight from PaymentIntent metadata is still the last line of defence.

## ⚠️ The trial's Rates allowance was exhausted, and has since reset

**Every Easyship call now returns `403 usage_limit`**, "API usage limit exceeded.
Please upgrade your plan or wait for your usage period to reset."

It took roughly 90 calls to get there, on 2026-09-05: 44 from one run of
`npm run report:carriers`, a dozen from `check:carriers`, the rest from
debugging the request shape. **That is not production traffic - it is one
afternoon of building.** But it does establish that the allowance is small enough
to hit without trying, and it is why `src/lib/freight-cache.ts` exists.

Consequences, in order of importance:

- **The checkout still works.** The router fails soft, so a 403 drops Easyship
  from the pool and Australia Post answers alone. Bulky carts revert to
  "Calculated on quote", exactly as before this work.
- **Which means the feature can die silently.** Nothing surfaces a 403 to anyone.
  Worth an alert before this carries real orders.
- **Rate stability is still unmeasured**, because the quota ran out mid-report.
  The cache makes it survivable either way - display and charge now come from one
  cached answer rather than two calls - but it is not the same as knowing.
- **The crossover weight is still unmeasured** for the same reason.

**The allowance came back on 2026-09-06** and Easyship is quoting normally again.
The crossover weight - where Australia Post stops being the cheaper carrier - is
STILL unmeasured, because the full `npm run report:carriers` costs ~44 calls and
exhausting the allowance a second time would be a poor trade for a number that
changes no behaviour: the router picks the cheaper of the two on every request
regardless of where the crossover sits.

## The first real consignment, priced (2026-09-06)

Set up in the dashboard against a genuine open order and **saved without buying**:
SO-00000823, REVL Mile End — one carton, `RFATSY02` Artificial Turf Black
(2m x 10m), 43kg, 200 x 45 x 45cm, Thomastown to 17 Montana Drive, Novar Gardens
SA 5040. Chosen off `npm run report:openorders` as the only open order that is
bulky, addressed, fully measured and a single line, so an invoice discrepancy
would have exactly one possible cause.

**The breakdown is the finding:**

| | |
|---|---|
| Shipping cost | A$157.48 |
| **Oversized surcharge** | **A$248.50** |
| Total excl. tax | A$405.98 |
| GST | A$40.60 |
| **Total** | **A$446.58** |
| **Chargeable weight** | **101.25kg**, method **Volumetric** |

Three things follow, in increasing order of how much they matter.

**1. Our integration is verified end to end.** `quoteFreight()` returned $513.57,
which is $446.58 x 1.15 to the cent. The router reproduces Easyship's own UI
exactly, through a completely independent path.

**2. The surcharge is 61% of the pre-tax cost, and the price is driven by SIZE,
not weight.** The item is 43kg and is billed as 101.25kg, because 200 x 45 x 45
is 0.405m3 and the volumetric divisor is **250kg per m3**. That is the same thing
`docs/freight-brief-bulky.md` found from the other direction: length drives this
catalogue more than weight, with 25% of the range oversize on length alone.

**3. TNT states on the quote that it may not be final:**

> "Additional handling fees may occur for the oversize & DG shipment"

That is the repricing risk, in the carrier's own words, before a dollar was
spent. Since the customer is charged at checkout, every such adjustment is
absorbed by us.

### What volumetric pricing costs across the whole bulky range

Measured against the committed snapshot using the 250kg/m3 divisor observed
above:

| | |
|---|---|
| Bulky products with usable cartons | 107 |
| **Billed on VOLUME rather than actual weight** | **38 (36%)** |
| Mean chargeable-to-actual ratio | **1.41x** |
| Median actual weight | 43kg |

The tail is worse than the mean:

| sku | actual | billed | ratio | carton |
|---|---|---|---|---|
| `MEFRBL03` Medicine Ball Rack, 5 ball | 16kg | **175kg** | **11.0x** | 162 x 84 x 51.5 |
| `MEFRBL02` Medicine Ball Rack, 10 ball | 18kg | 121kg | 6.7x | 166 x 55 x 53 |
| `ABPBSB-06` Plyometric Foam Stacker Box 24" | 13kg | 65kg | 5.0x | 85 x 100 x 30.5 |
| `MEFROP02` Olympic Weight Plate Tree | 16kg | 46kg | 2.8x | 140 x 65 x 20 |
| `MSWBFW01` Flat Utility Weight Bench Pro | 26kg | 72kg | 2.8x | 118 x 52.5 x 46.2 |

**A 16kg rack billed as 175kg is not an edge case, it is the shape of this
catalogue**: racks and rigs are large, light and mostly air. Any carrier pricing
on volume will do this. The number to negotiate with a bulky specialist is
therefore the DIVISOR, not the rate.

### Before that consignment is bought

- **A$446 is ~30% of the order value** ($1,500 ex GST). Worth one comparison call
  to Northline or Mainfreight on this exact consignment before accepting that
  bulky freight costs this much.
- **Residential Address was set to No**, because REVL Mile End is a business, but
  "17 Montana Drive" reads residential and a wrong call there is another
  surcharge. Confirm before booking.
- The account still needs a payment method; the balance is A$0.00.
- **When the invoice arrives, compare it against A$446.58.** That comparison is
  the entire point of the exercise and is still outstanding.

## Open questions this evaluation did NOT settle

1. ~~**Rate stability across our two calls.**~~ **ANSWERED 2026-09-06: stable.**
   See the section above. Also handled by
   the cache, which serves display and charge from one carrier answer, so they
   agree by construction. Still worth measuring, because a cache miss on a cold
   lambda falls back to two live calls. `report:carriers` makes two identical
   calls and compares them; it could not complete on 2026-09-05 because the quota
   ran out. `order/route.ts` reading freight from PaymentIntent metadata remains
   the last line of defence.
2. **Whether the invoice matches the quote.** Easyship documents charge
   adjustments for weight and size discrepancies, and we charge the customer at
   checkout, so any adjustment lands on us. $1/kg for 601kg Melbourne to Sydney is
   cheap for road freight and cheap rates on parcel-shaped contracts sometimes
   reprice on receipt.
3. **Whether Easyship is actually cheap for bulky.** Newly opened by the numbers
   above, and it now outranks the others. A 61% oversize surcharge and a 250kg/m3
   volumetric divisor may simply be a bad deal against the incumbents already in
   Unleashed. One comparison quote answers it.
4. **Tailgate and two-person delivery.** `docs/freight-brief-bulky.md` lists this
   as one of four things Australia Post cannot do. Easyship closes the other
   three — it carries bulky, it returns transit times, and it books and tracks —
   but its quote screen offers only a Residential toggle. A 601kg rig to a
   suburban gym with no dock is a real order and the rate above does not include
   anyone to unload it.
5. **Single-carrier concentration.** TNT returned the only rate on every bulky
   quote; Allied, Toll and CouriersPlease returned nothing at those sizes. "Easyship
   carries bulky" currently means "TNT carries bulky".

**The cheapest way to answer 2 and 3 is one real bulky consignment**, ideally to a
non-dock address, with the invoice checked against the quote.

## Account state as found

- Sender address already set and correct: 8/337-339 Settlement Rd, Thomastown
  3074 VIC — matches `FREIGHT_COLLECTION_POSTCODE`.
- An API integration named **"MASTERKRAFT Website"** exists with a production
  access token and the full standard scope list. Base URL
  `https://public-api.easyship.com`; rates live at `/2024-09/rates`.
- Australian couriers available: Allied Express, Aramex, CouriersPlease (13
  services), FedEx, Hubbed, TNT (5), Toll, UPS.
- **Free Plus trial, 13 days left, no payment method, A$0.00 balance, zero labels
  created.** Easyship's own warnings: exceeding the API allowance blocks access,
  and generating own-courier-account labels via the API requires a payment method.
- The Rates endpoint is a metered "advanced endpoint" with a monthly allowance and
  overage charges. We quote freight twice per order and again on every checkout
  address change, so this needs a cache before it goes live.

## Reproducing

```
npm run report:carriers
```

Needs `EASYSHIP_API_TOKEN` in `.env.local` alongside `AUSPOST_API_KEY`. Without
it the report still runs and gives the Australia Post baseline, marking every
Easyship column as unavailable. Sample size is capped deliberately because the
rates endpoint is metered; widen with `COMPARE_PARCEL_SAMPLE` and
`COMPARE_BULKY_SAMPLE`.
