# MasterKraft website — handover (2026-08-20)

New Next.js e-commerce site for masterkraft.com, headless: it reads catalogue,
price and stock from WooCommerce and Unleashed over their APIs, and does not use
the old WordPress storefront.

**The code side of the launch checklist is now clear.** Everything outstanding
needs a decision, a credential, or content. **Launch gates and env vars live in
`LAUNCH.md` - read that before any go-live work.**

---

## 0. THE SITE IS LIVE (2026-08-27)

`https://masterkraft.com` serves this Next.js site. Cut over from WordPress on
27 August. Verified over real DNS: valid certificate covering apex and www, www
redirects to apex, `/admin` 404s, `robots.txt` indexable on the apex and still
`Disallow: /` on `web.test`. **Email survived**: MX and SPF untouched, nameservers
left on Netregistry deliberately, and a real message was received after the change.

**It launched as browse-and-quote.** `NEXT_PUBLIC_CHECKOUT_MODE=quote` is set, so
the card form is hidden and every cart goes to the quote flow. Two things have to
happen before card checkout returns, in either order:

1. **Stripe live keys** in Vercel Production. Still `pk_test` as at 27 August,
   confirmed by reading the deployed bundle. Michael sets these.
2. **Paul moves WooCommerce to a subdomain** (`docs/email-paul-subdomain.md`),
   then `WC_STORE_URL` changes and `NEXT_PUBLIC_CHECKOUT_MODE` is removed.

The buy path (payment-intent, order, freight quote) is the only thing that reads
the live store. Everything a visitor browses comes from the committed snapshot,
which is why the cutover could happen before Paul did anything.

**DNS, for reference:** apex A records at Vercel (`216.198.79.1`, `64.29.17.1`),
`www` CNAME to `cname.vercel-dns.com`, everything else untouched. Rollback is both
A records back to `103.26.237.235`. See `docs/dns-cutover.md`.

---

## 1. Start here

- Code: `~/Desktop/masterkraft-site`. Next.js 16 (App Router, Turbopack), TS, Tailwind.
- GitHub `MASTERKRAFTFitness/masterkraft-site`, branch `main`. Everything described
  here is committed, pushed and deployed to staging.
- Staging: `https://web.test.masterkraft.com` and `https://masterkraft-site-pi.vercel.app`.
  Both **noindex**, which is correct until launch.
- Dev server: use the preview tools, or `npm run dev` (:3100). A Fernwood portal
  sometimes squats :3100, so use another port if needed.

### DEPLOY

**A git push does NOT deploy.** Deploys are the Vercel CLI, from the project dir:

```bash
cd ~/Desktop/masterkraft-site && npm run deploy
```

That runs the **deploy gate** (`predeploy`) and then `vercel --prod`. The gate is
~60s and any step failing stops the deploy:

| step | catches |
|---|---|
| `check:snapshot` | src/data missing, truncated, or variations half-written (offline) |
| `test` | the 69 unit tests |
| `check:obsolete` | the committed ERP retirement list drifting from Unleashed |
| `check:catalogue` | the catalogue snapshot drifting from WooCommerce |

**`lint` is deliberately NOT in the gate.** The repo carries 21 pre-existing eslint
errors, so gating on it would block every deploy. Run it and compare against `HEAD`.

`check:snapshot` also runs as `prebuild`, so it fires on Vercel's build too. It is
offline on purpose: the point of the snapshot is that rendering does not depend on
WooCommerce being up, and a networked pre-build check would hand that back.

To deploy without the gate (it is a safety net, not a law):
`npx --yes vercel@latest deploy --prod --yes`. There is no local or global `vercel`
binary on this machine, so a bare `vercel --prod` fails with command-not-found.

If it says **"Not authorized"**, run `npx vercel login` first (Michael's account).
`NEXT_PUBLIC_*` vars are build-time inlined, so changing one in Vercel does nothing
until a redeploy. Claude cannot deploy or set Vercel env / DNS - surface those.

---

## 2. Traps that will cost you an afternoon

Each of these was hit for real. They look like bugs in our code and are not.

1. **A stale `.next` makes EVERY route 404.** `next dev` starts fine and serves the
   site's own 404 for `/` and everything else, with **no "Compiling…" lines**. It is
   a leftover production build. `rm -rf .next` and restart.
2. **Unleashed's `GET /Products` HIDES OBSOLETE PRODUCTS BY DEFAULT.** It returns
   1,092 items that all report `Obsolete:false`, which reads exactly like "this
   company never uses the flag". With `includeObsolete=true` it returns **1,892, of
   which 800 are obsolete**. A check written without that parameter passes
   vacuously - this session shipped that wrong conclusion before catching it. The
   field is `Obsolete`, not `IsObsolete`.
3. **Never use PyMuPDF's `doc.update_stream` to swap an image inside a PDF.** It
   replaces the bytes but leaves `/Filter` and `/ColorSpace` describing the OLD
   encoding, so a full-page image renders as a **solid black page**. The file size
   looks great and the document is ruined. Use `page.replace_image`.
4. **The WooCommerce host refuses bursts.** 20 parallel HEAD requests got 40 of 62
   rejected; serial GETs return 206 in ~20ms. `mirror-product-images.mjs` fetches
   one at a time on purpose - do not "optimise" it into a `Promise.all`.
5. **WooCommerce and Unleashed are both slow** (1.5-2.5s and ~2.5s per request, and
   Unleashed throttles concurrency). Never `await` independent fetches in sequence.
6. **`$$` in an RSC payload is not a bug.** React escapes a literal `$` by doubling
   it, so `"$$345.00"` in the flight data renders as `$345.00`. Check the rendered
   text before chasing it.
7. **Three different codes exist for the same Concept2 products**: named "C2 Rower
   Model D PM5 Black", SKU `SCRWAR04` in WooCommerce, `C2ROWERG` in Unleashed. No
   WooCommerce SKU starts with "C2"; four Unleashed codes do.

---

## 3. What decides whether a product appears

Four rules, all applied at one chokepoint in `src/lib/woocommerce.ts`. **If a
category shows 0 products, suspect these first.**

512 published products → **184 shown** (plus 36 Clearance; this was recorded as 37
on 2026-08-20, and three of the 39 raw Clearance products are ERP-retired).

The rules run against the **committed snapshot** in `src/data/`, not a live call
(§4). The snapshot is a faithful mirror of what the store published and holds NO
visibility rules, so these four are still the only thing deciding what appears.

1. **Brand SKU filter** (`BRAND_SKU_RE = /^(?:[MN]|SC)/i`). Only MasterKraft's own
   M/N products, plus the Concept2 range on `SC` SKUs. **Clearance opts out** via
   `getAllProductsByCategory(id, { brandFilter: false })` because its stock is
   A-prefixed ex-display.
2. **Other companies' brands** (`isForeignBrandSku`, `/^(?:S(?!C)|F)/i`). Snap and
   Fernwood never appear. `SC` is exempt by the negative lookahead, which is what
   keeps Concept2. This is separate from the brand filter because **Clearance runs
   with the brand filter off**, and because `getProductBySlug` had no brand filter
   at all - 149 Snap and Fernwood product pages were answering 200 on a direct URL
   and sitting in the sitemap.
3. **Obsolete, WordPress side.** `catalog_visibility: "hidden"` is the store's own
   "do not list this" switch, used both for withdrawn lines and for an old single
   listing superseded by its `-GROUP` product. 25 products.
4. **Obsolete, ERP side.** `src/lib/obsolete.ts` reads a **committed list** of 804
   retired Unleashed codes. 15 served products were retired in the ERP while
   WordPress still showed them, including the whole discontinued Selectorize range.

Anything caught by these is **absent from every listing, from search, from the
sitemap, and 404s on its own URL**. A missing `catalog_visibility` counts as
visible, so a caller that forgets the field shows too much rather than emptying a
page. `getProductById` is deliberately NOT filtered: it backs order creation, and
an order for an already-bought item must not fail because marketing hid it.

### Pricing

- **The WooCommerce `price` field is distorted by a wholesale plugin.** Always
  derive from `regular_price × 1.1` (GST). `getPricing`/`enrich` handle it.
- **Unleashed is the source of truth** for price and stock, unless the item is on
  WooCommerce sale (then the sale wins, which is how Clearance markdowns work).
- **SKUs differ between the two systems.** `src/lib/unleashed-aliases.ts` maps them.
  It has an auto-generated block plus a **`manualAliases` object** for matches the
  generator cannot find - the Concept2 range lives there, because "Model D" against
  "Row Erg with Standard Legs" is far below the 0.80 name-similarity gate. Manual
  entries are kept separate so regenerating cannot silently drop them.
- **Bundles** (`-GROUP` products) carry no price of their own; 20 of 23 have
  `regular_price: 0`. `getBundleFromPrice` reads the plugin's computed
  `bundle_price.regular_price.min` as a "From $X". **`priceValue` stays 0 on
  purpose** so a configurable range cannot be card-checked-out at the cost of its
  cheapest item.

---

## 4. Recurring jobs

**These are the maintenance cost of the site. Nothing reminds you.**

| when | run |
|---|---|
| **product content changes in WordPress** | **`npm run build:catalogue`, then commit `src/data/`** |
| checking whether the catalogue has drifted | `npm run check:catalogue` (exits 1 on drift, in the deploy gate) |
| proving the snapshot still answers like the store | `npm run verify:catalogue` (hits the network) |
| the ERP retires a product | `npm run build:obsolete`, then commit the JSON |
| checking whether it has drifted | `npm run check:obsolete` (exits 1 on drift, in the deploy gate) |
| the catalogue gains products | `npm run mirror:images`, then `npm run compress:assets` |
| the Dropbox manuals folder gains files | `node scripts/import-manuals.mjs` |
| product photos change | `python3 scripts/normalize-product-bg.py` |
| auditing product spec content | `npm run report:specs` (writes `reports/wc-spec-gaps.*`) |
| Interparcel need example shipments | `npm run report:freight` (writes `reports/interparcel-sample-shipments.*`) |

`build:obsolete` refuses to write if fewer than 1,500 products come back, since a
short read would silently un-retire everything. `build:catalogue` refuses below
400 published products for the same reason: a short read would empty the shop.

**`build:catalogue` is now the most important of these.** The site serves product
data from `src/data/`, so a content edit in WordPress is invisible until the
snapshot is rebuilt and committed. Nothing rebuilds it automatically.

---

## 5. Freight (Australia Post)

**LIVE in production.** `AUSPOST_API_KEY` and all four `FREIGHT_COLLECTION_*` are
set in Vercel Production, and the deployment serving the site is newer than they
are, so they are in the running build. Verified 2026-08-25. Carrier switched from
Interparcel to Australia Post (Michael, 2026-08-24).

(This line previously read "Built, not switched on — waiting on the API key only",
which was true when written and stale within hours. It caused a real
mis-reading: §5 and §7b said opposite things about whether freight worked.) Freight is quoted at checkout,
cheapest service plus one faster option, carrier rate plus a **15% handling margin**.

**Despatch origin is 3074, Thomastown VIC** (Michael, 2026-08-24). That was the
missing value that blocked every quote. It is in `.env.local`, which is gitignored,
so it also needs setting in Vercel.

### The bulky freight brief (2026-08-25)

`docs/freight-brief-bulky.md` plus `npm run report:bulky`. The RFP sent to
carriers for the half of the catalogue AusPost cannot carry. It documents the
LIVE AusPost integration as the spec to repeat, rather than describing a wishlist,
and carries a field-level data contract.

The requirement most rate APIs miss, and the one to keep loudest: **we price
freight twice**, once at checkout to display and again server-side in
`payment-intent/route.ts` when we charge the card, because the browser sends only
the service id and never the price. So a carrier's rate must reproduce for the
same inputs, or supply a redeemable quote token. A rate that drifts between those
two calls fails the order.

Also found while writing it: **Unleashed holds 923 sales shipments and only 43
carry a tracking number**; 886 have no `ShippingCompany`. Those fields exist and
are essentially unused, so we have no dispatch visibility in our own ERP.

### Australia Post prices a third of the catalogue, and that is expected

> **The "111 of 338" figure below is STALE.** Current, from `npm run report:bulky`:
> 79 of 186 measured products are parcel-carriable (42%), 107 are bulky (58%), out
> of 220 sellable. 33 carry no carton data at all. Trust the report, not the prose.


PAC prices parcels: 22kg, 105cm longest side, 0.25m³. Of 338 listed products, 246
carry usable carton data and **111 fit those limits**. 96 are over 22kg and 109 over
105cm. Racks, rigs, machines and benches are pallet freight and always were.

`quoteFreight` checks the limits **before** calling the API and returns `oversize`,
which the checkout renders as "Calculated on quote". **The heavy two-thirds still
need a second carrier** (Mainfreight / Freight Exchange, both already named on the
Shipping page). That is a commercial decision, not outstanding code.

**Correction to earlier versions of this doc:** the "85% quotable / 33 products
missing dimensions" figure was measured over a narrower set than the shop serves.
On the listed set it is **73% (246/338)**, with 92 products short: 55 have neither
weight nor dimensions, 37 have a weight but no dimensions. Bundles are not "none at
all" either; 27 of 47 carry dimensions, but those are `-GROUP` parents whose carton
is one representative unit, and they are all $0 "Contact for pricing" so they never
reach card checkout.

### How it hangs together

- `src/lib/freight.ts` is the domain logic and the AusPost transport,
  `src/lib/freight-server.ts` resolves a cart against WooCommerce, and **both the
  quote route and the payment-intent route go through it**, so the price shown and
  the price charged cannot disagree.
- Weights and cartons are read server-side. **The client sends only which service
  was chosen, never what it costs.**
- **One parcel per unit**, using each product's own carton. Identical cartons are
  priced once and multiplied, since PAC takes one parcel per call.
- **It fails soft in every direction and NEVER says "Free".** No key, missing carton
  data, an over-limit carton, no service common to every carton, or a dead API all
  produce "Calculated on quote" and charge goods only.
- `npm run check:auspost` smoke-tests the live key against five destinations.

### Two bugs fixed 2026-08-24 that would have bitten the moment freight went live

Both were harmless while freight was off, which is exactly why they survived:

- `src/app/api/order/route.ts` compared the Stripe amount against a **goods-only**
  total. A freight-bearing charge would have 409'd **after the card was captured**,
  leaving a paid customer with no order. It now reads the freight figure from the
  PaymentIntent metadata (written by our own server at intent creation) rather than
  re-quoting the carrier after payment.
- `src/lib/woo-orders.ts` hardcoded `free_shipping 0.00`, so Woo and Unleashed would
  have recorded zero freight on a charge that included it. It now writes the real
  figure, and when no freight was charged the line reads **"Freight quoted
  separately"** rather than "Free shipping", so nobody picking the order reads $0 as
  permission to ship for nothing.

🔎 **The `flat_rate` shipping line is new and needs one test order** to confirm the
WooCommerce → Unleashed sync still maps it (see §6, which verified the pipeline with
the old `free_shipping` line).

🔎 **Verify GST on the first real quote** or freight undercharges by 10%. See
`LAUNCH.md` §1b.

---

## 6. The order pipeline already reaches Unleashed

Verified 2026-08-20, not assumed. WooCommerce orders `490098`, `490100` and `490102`
appear in Unleashed as sales orders **under the same numbers** (Unleashed's own use
`SO-000008xx`). `LAUNCH.md` lists this as needing verification; it works.

| step | state |
|---|---|
| cart + checkout | built |
| freight quote | built, needs a key |
| payment (Stripe) | built, **test keys** |
| order into WooCommerce | built, `woo-orders.ts`, gated by `WC_WRITE_ENABLED` — **but see the key warning below** |
| WooCommerce → Unleashed | **already working** |
| fulfilment / labels | Interparcel Shipping Manager "Fetch Orders", no code |

**THE WOOCOMMERCE KEY IN `.env.local` IS READ-ONLY.** Proven 2026-08-21 by a real
`PUT /products/{id}`, which returned:

```
401 woocommerce_rest_authentication_error
"The API key provided does not have write permissions."
```

This is a launch blocker hiding behind a feature flag. `WC_WRITE_ENABLED=false`
today, so nothing tries to write and nothing fails. **The moment that flag is
turned on for launch, every order creation will 401 the same way** — the order
would be paid for via Stripe and then never reach WooCommerce, and so never reach
Unleashed. The three verified test orders (§6) were created before this key was
in place, so they do not prove the current credentials work.

Fix: WP Admin → WooCommerce → Settings → Advanced → REST API → create a key with
**Read/Write** permission, then set `WC_CONSUMER_KEY`/`WC_CONSUMER_SECRET` in both
`.env.local` and Vercel.

**RESOLVED later the same day, and it was worse than suspected** — see §7b. The
Vercel credentials were not merely read-only, they were dead: `getProductById`
returned null for every product, so card checkout was broken on the deployed site
and had been for some time. It hid because only the checkout path reads live
WooCommerce; everything a visitor browses comes from the snapshot, so the site
looked healthy. `WC_CONSUMER_SECRET` also held a `ck_` consumer key rather than a
`cs_` secret — same length, and invisible while the var was marked Sensitive.

**TWO TEST ORDERS ARE LIVE IN THE ERP.** `490100` ($856.90) and `490102` ($779.00),
"Test Buyer", 2026-08-10, `Placed` in Unleashed. They read as real demand and may
hold stock. **Void them before launch.**

---

## 7. Quality baseline (measured 2026-08-20)

Lighthouse, run locally because PageSpeed Insights 429s without an API key:

```bash
export CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
npx --yes lighthouse@12 "https://web.test.masterkraft.com/all-equipment" \
  --quiet --chrome-flags="--headless=new --no-sandbox" \
  --preset=desktop --output=json --output-path=./lh.json
```

| | Perf | A11y | Best practices | SEO |
|---|---|---|---|---|
| desktop | 97 | **100** | 100 | 69 |
| mobile | 96 | **100** | 100 | 69 |

Desktop LCP 0.8s, CLS 0, TBT 0ms. Mobile LCP 2.6s, CLS 0, TBT 50ms. **SEO 69 is
entirely "Page is blocked from indexing"**, correct for staging, and it lifts on its
own when `NEXT_PUBLIC_ALLOW_INDEX` is set.

The full pre-launch test pass (`LAUNCH.md` §3) has been run: catalogue filters, sort
and pagination, variable "From" pricing, Clearance markdowns, gallery, add to cart,
cart totals and freight copy, `Product` and `BreadcrumbList` JSON-LD, 404, favicon,
OG image, all 12 marketing pages, all 4 legacy redirects, mobile at 375x812. No
console errors.

---

## 7b. Shipped 2026-08-24

Freight went live, and finding out whether it worked turned up three bugs that had
nothing to do with freight. Every one of them was invisible from the code alone.

### Card checkout was broken on the deployed site

**The WooCommerce credentials in Vercel were dead.** `getProductById` returned null
for every product, so `payment-intent` answered "We couldn't price one or more
items" and nothing could be bought. It had presumably been broken for some time.

It was invisible because **product pages, categories and search all serve the
committed snapshot in `src/data/`** and only the checkout path reads live
WooCommerce. The site looked completely healthy. This is the "unverified Vercel
key" from §8 earlier the same day, now proven rather than suspected.

**Lesson worth keeping: set Vercel vars NON-sensitive where you can.** Sensitive
values cannot be read back, which is exactly why a dead key sat there unnoticed.
Reading them back immediately caught `WC_CONSUMER_SECRET` holding the consumer key
(`ck_`) rather than the secret (`cs_`) - same length, invisible any other way.

### WooCommerce was adding GST to a GST-inclusive freight charge

Test order `490118` was charged **$86.80** and recorded as **$90.48**, in both
WooCommerce and Unleashed. The shipping line sent the GST-inclusive $36.80 and the
store added another $3.68.

The line items three lines above already divide by GST and carry a comment saying
why. The shipping line did not. **Only an order that actually carries freight shows
this**, so nothing short of a real end-to-end test would have caught it.

### Newsletter signups were being discarded

`HUBSPOT_FORM_NEWSLETTER` has never existed. With no GUID `submitHubspotForm`
returns "skipped", and the route still returned `ok: true`, so subscribers saw a
thank-you and the address reached nothing but a log line. Unlike the contact and
quote forms there was no email fallback. There is now, with tests for all four
states.

### Also

- **Freight (Australia Post) is live and verified.** See §5.
- The checkout announced "Pricing updated since you added to cart" on every
  freight-bearing order, because it compared a freight-inclusive total against a
  goods-only subtotal. Nothing had repriced; the difference was the freight,
  itemised directly above the warning.
- The order confirmation read "#490118is in." JSX trimmed the space; the source
  looked right and the bundle did not. Now explicit.
- **Business address moved** to 8/337-339 Settlement Rd, Thomastown VIC 3074.
  Updated on `/privacy-policy` and `/returns`, along with the stale phone number
  there (now `(03) 9044 9575`, which every other surface already used).

  **⚠️ BLOCKED, NOT DONE: the WordPress side.** Michael could not get into
  wp-admin on 2026-08-24. Whoever has access needs to change three things, and
  the first affects tax and invoices, not just wording:
  1. **WooCommerce → Settings → General**, Store Address. WooCommerce calculates
     tax from this and prints it on invoices and packing slips. Clear the
     "Factory 2" line.
  2. **WooCommerce → Settings → Emails**, "Footer text" under Email template.
     Still reads `© 2021 — MASTERKRAFT / Factory 2, 73 Dohertys Road, Laverton
     North, VIC 3026`. Fix the year while there. Check "From" name and address
     on the same screen.
  3. **A PDF invoice plugin, if one is installed** (commonly WooCommerce PDF
     Invoices & Packing Slips), keeps its OWN shop address. If invoices are PDFs
     rather than plain emails, this is the one customers actually see.

  Then search wp-admin for `Dohertys` and `Laverton`: the address tends to also
  sit in a theme option or an old page. Most are invisible now the front end is
  headless, but anything feeding emails or PDFs still reaches customers.
- **The Woo → Unleashed sync is confirmed working with the new `flat_rate` shipping
  line.** Order 490118 reached Unleashed under the same number. §6 had only ever
  proven it with the old `free_shipping` line.

**Test order 490118 needs cancelling** in WooCommerce and Unleashed.

---

## 8. Shipped 2026-08-24 (earlier the same day)

12 commits, `e41431a` through `36e2ee0`. Dated 2026-08-21 in the original write-up;
that was wrong, it is the morning of the same day as §7b. All deployed and verified on
`web.test.masterkraft.com`.

### The site no longer reads WooCommerce to render anything

Product, variation and category data now comes from a **committed snapshot** in
`src/data/`, generated by `npm run build:catalogue`. Same argument `obsolete.ts`
already made about Unleashed: the store answers in 1.5-2.5s per request, refuses
bursts, and its content changes only when someone edits a product.

Proven, not assumed: a production build served with `WC_STORE_URL` pointed at a
dead host rendered every listing, search, product page and the sitemap with
unchanged counts. Warm renders are 0.014-0.09s against cold baselines of 19.2s
(`/equipment/strength`) and 7.3s (`/all-equipment`).

**The checkout path still reads the store live, on purpose.** `getProductById` and
`getVariation` run once per checkout, so the latency is affordable, and an order
must never be priced off a snapshot that is a content edit behind the store.

The snapshot holds **no visibility rules**. All four still run at the same
chokepoint in `woocommerce.ts`, so it cannot drift from what we serve. Two things
that caught us:

- **WooCommerce's `category=` matches descendants.** Filtering on the parent id
  alone silently dropped 7 products. `withDescendants()` reproduces it.
- `menu_order` is **0 on all 512 products**, so the "Featured" sort is
  WordPress's internal fallback, not a merchandising decision anyone made.

`catalogue-parity.test.ts` proves the snapshot answers the same questions the live
store does (32 assertions: category sets, sub-categories, search, variations,
`parseProductDetail` field-for-field). Skipped by default; run
`npm run verify:catalogue`.

### Deploys are gated

There was no gate before: no CI, no `vercel.json`, and nothing called
`check:obsolete`. `npm run deploy` now runs the checks first. See §1.

### 89 live content defects fixed

Products showing `Warranty: 12` now read `12 months`. The discrete Warranty field
held a bare number and, unlike Net/Gross weight, the renderer appends no unit.
Applied against the live store: 89 applied, 0 skipped, 0 failed, previous values
in `reports/warranty-fix-rollback.json`.

### Reports

- `reports/wc-spec-gaps.csv` — 783 items across 218 of 220 served products, with
  both competing values and the literal action. `npm run report:specs`.
- `reports/interparcel-sample-shipments.csv` — 15 real consignments for rate
  quoting. `npm run report:freight`.

### Two bugs found in our own checks

- `check:obsolete` diffed the whole `obsolete-skus.json`, including a
  `generatedFrom` product counter. It blocked a real deploy when the ERP grew
  from 1,892 to 1,942 products while all 804 retired codes were identical. Now
  compares the codes.
- The `deploy` script called a bare `vercel`, which does not exist on this
  machine. Now goes through `npx`.

---

## 9. Shipped 2026-08-20

19 commits, `b13c890` through `3453487`, all deployed to staging.

**Catalogue correctness**
- Obsolete products no longer served, both halves (25 WordPress-hidden + 15
  ERP-retired). Catalogue 224 → 184, sitemap 512 → 283 product URLs.
- Snap and Fernwood excluded everywhere, closing 149 directly-reachable pages.
- Concept2 mapped to its Unleashed codes: **the rower was priced at $1,375 against
  the ERP's $1,705**. Recovered $330, $330 and $88. Side effect: all three now read
  "Made to order", because Unleashed reports 0 available and it is the source of
  truth for stock.
- Bundles show a "From" price instead of "Contact for pricing" (20 products).

**Fixed**
- **Site search returned 0 results for "dumbbell", "barbell", "mat" and "rig".** It
  asked WooCommerce for one page of 24 and filtered afterwards, and the store's
  parallel S-prefixed range ranks first, so every row was filtered away. Now
  full-fetches then filters: dumbbell 22, barbell 38, mat 46, rack 63.
- Warranty text rendering "3 monthsmonths" and "Non-Wearable Partsmonths" on six
  products (`normalizeSpecUnits`). The source data in WordPress is still wrong.
- A pre-existing **soft 404** on `/product/[slug]`: a `loading.tsx` flushed the shell
  and a 200 before `notFound()` ran, so every unknown product URL returned the 404
  body under a 200 status. **Re-adding a loading file to that segment brings it back.**
- Three accessibility faults, including the closed cart drawer being keyboard
  reachable (`aria-hidden` does not remove children from the tab order; `inert` does).
- `/cart` and `/checkout` had the homepage title; they are client components, so each
  now has a segment layout carrying its own title and `noindex`.

**Performance** - independent fetches ran in series. Cold: `/equipment/strength`
60.1s → 19.2s, `/all-equipment` 18.4s → 7.3s. Warm is 0.01-0.03s.

**Images** - 203 products loaded photos from WordPress and would all have broken at
the domain cutover. All 374 mirrored into `/public`, then compressed 87MB → 24MB.

---

## 10. Open / blocked, by owner

### Michael
- **The Recovery Roller waitlist page (`/recovery-roller`) is built but MUST NOT be
  promoted yet.** Three things gate it, and two are promises the page makes:
  1. **`HUBSPOT_FORM_WAITLIST` does not exist.** Until it is created and set, every
     registration falls back to email. That path is built and tested, so nothing
     is lost, but the contact is not in HubSpot and the list cannot be pulled for
     the November send. The custom properties the route sends also need creating:
     `site_count`, `purchase_timeframe`, `opt_in_status`, `contact_source`,
     `source_campaign`.
  2. **Lead routing has no owner.** Build Kit doc 14 still routes enquiries to
     Adam, who has left. Registrations currently email `QUOTE_TO_EMAIL`.
  3. **Somebody has to actually send the spec sheet and pricing.** The page trades
     an operator's details for them. The list will be small and high value, so
     this is a personal send, not a campaign.
- **Is the Recovery Roller render approved for public use?** It is the hero of
  that page at a larger size than anywhere else, extracted from the design preview
  to `public/recovery-roller/roller-render.png`.
- ~~**THE LAUNCH BLOCKER: the WooCommerce key in Vercel.**~~ **RESOLVED 2026-08-24,
  see §7b.** It was worse than suspected: the Vercel credentials were dead rather
  than read-only, card checkout was broken on the deployed site, and
  `WC_CONSUMER_SECRET` held a `ck_` consumer key instead of a `cs_` secret. Kept
  here for the lesson: **set Vercel vars non-sensitive where you can**, because a
  value you cannot read back is a value nobody checks.
- **Card checkout: live or quote-only.** Staging shows a **card form on a `pk_test`
  key**, which would reject a real card. `LAUNCH.md` used to claim the checkout was
  quote-only; it is not. `paymentsConfigured` is simply "a publishable key exists".
- ~~**The Australia Post API key.**~~ **Done** — set in Vercel Production, and the
  live deployment is newer than it, so freight quoting is live. Verified
  2026-08-25.
- **A second carrier for the heavy two-thirds.** Australia Post prices 111 of 338
  listed products; racks, rigs, machines and benches are pallet freight. Commercial
  decision, not outstanding code.
- **Void the test orders** sitting in Unleashed: `490100` and `490102` (§6), plus
  `490118` from the 2026-08-24 freight test (§7b).
- **Form-delivery test** - needs a go-ahead, it emails the team and creates a real
  HubSpot contact.
- **The admin support desk needs three env vars before it exists in production**
  (§13b). `ANTHROPIC_API_KEY` from console.anthropic.com (billed per token,
  separate from any Claude subscription), plus `ADMIN_PASSWORD` and a random
  `ADMIN_SESSION_SECRET`. All three go in `.env.local` and Vercel Production.
  Until then `/admin` returns 404 everywhere, which is the intended safe state.
  No live model conversation has been run against it yet.
- ~~**Home gym photos.**~~ **Done 2026-08-25** - `/fitout/home-gym.jpg`, cropped from
  Michael's own garage setup. Worth knowing it is tonally different from its five
  siblings, which are professionally shot, dark and moody; this one is a bright,
  flat phone photo. It is real MasterKraft equipment and it beats the
  product-category placeholder it replaced, but if a styled home-gym shoot ever
  happens, this is the first tile to swap.

### Steve
- **Domain / DNS cutover, option A or B** (`LAUNCH.md` §2). The big gate:
  indexing, `NEXT_PUBLIC_SITE_URL` and the OG image colour all wait behind it.
- **The 15 example shipments are still useful, for a different carrier.**
  `reports/interparcel-sample-shipments.csv` was built for Interparcel, who are no
  longer the carrier. The consignments themselves are real catalogue weights and
  cartons spanning 1kg to 450kg, so they are exactly what a **pallet-freight**
  quote from Mainfreight or Freight Exchange needs. Regenerate with
  `npm run report:freight`; the origin is now known, so they are no longer
  originless.
- **28 products have specs that genuinely disagree** between the two content
  sources, and the page shows the discrete one, so these are wrong on the site
  now. Several are order-of-magnitude errors: `MCTMSP02` net weight 480 against
  180kg, and the C2 rower `SCRWAR04` assembled size `24,400 x 6,100` against
  `2,440 x 610 x 1,150`. Filter `reports/wc-spec-gaps.csv` to `issue=conflict`.
  Ten of them are weight disagreements, which is also why those products are held
  out of the freight samples: we will not quote a rate against a number we cannot
  stand behind. A wrong weight is now a wrong freight charge, not just wrong copy.
- `MRSPATT0X` (Rigs) in the manuals looks like a family code, not a real SKU -
  confirm the correct product name.

### Content, in WordPress
- **91 products have no features**: 64 in the main catalogue, 27 in Clearance. Full
  list with SKU, category and product link at `reports/wc-content-gaps.csv`.
  Concentrated in Equipment Storage 18, Body Weight 12, Packages 9, Barbells 8.
- **Hide one of each of the 5 duplicate bundle pairs** (`MWBBFUR-GROUP`,
  `MMDBRH-GROUP`, `MWWPCNB-GROUP`, `MMDEHG-GROUP`, `MWWPOU-GROUP`). Each duplicates
  a variable product that is priced from Unleashed, so the same product appears
  twice at two different prices. Reconciling two price sources is the wrong fix.
- **FIXED 2026-08-21: the 89 warranties that showed no unit.** Kept here because
  the cause is worth knowing: the discrete Warranty field held a bare number and,
  unlike Net/Gross weight, `parseProductDetail` appends no unit to it. If someone
  types `12` into that field again, the page will read `12`.
- **`ABPBSB04` (Plyometric Foam Stacker Box) has impossible carton dimensions**:
  `850 x 1000 x 305 cm`, ie 259 cubic metres. Millimetres typed into a centimetre
  field. It is the only one of 187 quotable products like this, so it is a typo
  rather than a units problem, but a cart containing it would ask Interparcel to
  quote a 259m3 consignment.
- ~~**89 products show a warranty with no unit.**~~ The product page renders
  `Warranty: 12` where it should read `12 months`: the discrete Warranty field holds
  a bare number, and unlike Net/Gross weight the renderer appends no unit to it. The
  blob has the full value, but the discrete field wins. **Customers see this today.**
  Found 2026-08-21 by `npm run report:specs`; every affected SKU is in the CSV with
  the exact value to type.
- **28 products have specs that genuinely disagree** between the discrete field and
  the blob, and the page shows the discrete one. Several are order-of-magnitude
  errors: `MCTMSP02` net weight 480 vs 180kg, `SCRWAR04` (C2 rower) assembled size
  `24,400 x 6,100` against the blob's `2,440 x 610 x 1,150`. These are wrong on the
  site right now.
- **26 warranty values read "3 monthsmonths"** in the served set (including
  `MBPB3I101` and `MSCMDU01`). The typo is in the legacy `specification_text` blob,
  **not** the Warranty field, so anyone fixing it will look in the wrong place. The
  cheap fix is to type the correct warranty into the discrete Warranty field, which
  overrides the blob. The site already repairs this at render time, so it is a
  source-data problem rather than a visible one.
- **The full spec punch list is `reports/wc-spec-gaps.csv`** (872 items across 218 of
  the 220 served products), with `reports/wc-spec-gaps-summary.md` for the counts.
  Regenerate with `npm run report:specs`. Each row carries the field, both competing
  values and the literal action to take. Only the 143 priority-1 items change what a
  customer sees; the rest is cleanup needed before `specification_text` can be
  retired. **Doing this work is worth it whether or not the content ever leaves
  WordPress** - it is the expensive, destination-independent half of any migration.
- **Create the C2 Bike Erg**, which exists in Unleashed as `C2BIKEERG` at $2,145
  inc-GST with no WooCommerce product. Then map it in `manualAliases`.
- **33 products have no carton dimensions**, including all 3 Concept2 ergs, and
  bundles have none at all. Any cart containing one falls back to a manual freight
  quote. Fixing this widens freight coverage past 85%.

### Assets
- **REVL studio assets** - Michael is contacting each club. Per club: 6-10 landscape
  photos of the fitted-out floor at full resolution (originals, not Instagram
  re-uploads), trading suburb and street address, opening year and whether it was
  our original fit-out or a later refit, written OK to use the photos, and the
  current Instagram handle. Nice to have: floor area in sqm, before/after shots.
  Drop into `/public/revl/ig/<slug>/` and wire via `IG_PHOTOS` in `revl.ts`.

### Known, deliberately not built
- **Freight service choice.** The server picks the cheapest and also returns the
  fastest, but letting the customer switch needs an address → options → payment
  step. Design it against real rates.
- **Smart boxing.** We send one parcel per unit rather than consolidating cartons,
  because we have no packing data. Interparcel offer it on the plugin path.

---

## 11. Reference: the WordPress side and the cutover

The site is headless but **WooCommerce is a WordPress plugin**: product data and any
remaining image files physically live in that install. You cannot run "WooCommerce
without WordPress" - keep it running as a hidden backend on a subdomain.

**Cutover requirement:** move WordPress to a subdomain, set its **Site Address** to
that subdomain so WC emits subdomain URLs, point `WC_STORE_URL` there, and add the
subdomain to `remotePatterns` in `next.config.ts`.

**The image exposure this created is now closed** - all product images are served
from `/public`, so nothing on the WordPress side can break them. The same is true of
the manuals, after the originals were lost from `wp-content/uploads/2021/03/` and
had to be rebuilt from Michael's Dropbox.

**So is the catalogue exposure.** Product data is now a committed snapshot (§4), so
no page a visitor loads calls WooCommerce. Verified by pointing `WC_STORE_URL` at a
dead host and serving a production build: every listing, search, product page and
the sitemap still rendered, with the same counts. What this buys at the cutover is
that a WordPress move can no longer take the shop down, and `WC_STORE_URL` only has
to be correct before the next `build:catalogue` or a checkout.

**Still true:** WordPress remains the place product content is edited, and the
checkout path (freight quote, order creation) reads and writes it live. Keep it
running. Dropping it altogether is a separate piece of work: it means finding a new
home for the editorial layer AND a new order book, because the WooCommerce order is
what syncs to Unleashed and what Interparcel's Shipping Manager fetches (§6).

---

## 12. Env vars

**`WC_CONSUMER_KEY`/`WC_CONSUMER_SECRET`: `.env.local` now holds the Read/Write
pair; Vercel's are unverified and probably not** - see §10, first item.

Set and working: `WC_*`, `UNLEASHED_*`, `NEXT_PUBLIC_GA_ID` (G-86MEH5QL99),
`NEXT_PUBLIC_HUBSPOT_PORTAL_ID`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (**pk_test**),
`NEXT_PUBLIC_SITE_URL` (= web.test.masterkraft.com).

Not set: `NEXT_PUBLIC_ALLOW_INDEX` (correct for staging), `INTERPARCEL_API_KEY`,
`FREIGHT_COLLECTION_*`. Server secrets (HubSpot form GUIDs, Resend, Stripe secret,
WC write) remain unverifiable without a live test.

`FREIGHT_MARGIN_PERCENT` defaults to 15 in code; set it only to change that.

**Admin console (new, 2026-08-25):** `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`
(32+ random hex), `ANTHROPIC_API_KEY`. All three are local-dev only right now and
**none is set in Vercel**, so `/admin` 404s in production until they are. See §13b.

---

## 13. Conventions

- **No em-dashes in copy.** Use commas or spaced hyphens.
- **REVL** always uppercase. No public email address on the site.
- Server components by default; `'use client'` only when needed.
- **Verify on staging after deploying. Do not ask the client to check.**
- Tests: `npx vitest run` (69). Lint and typecheck before committing; the repo has
  2 pre-existing lint errors, so compare against `HEAD` rather than expecting zero.
- Relevant memories: `reference_masterkraft_woocommerce`, `reference_masterkraft_brand`,
  `reference_masterkraft_revl_galleries`, `reference_masterkraft_deploy`,
  `reference_masterkraft_unleashed`.

---

## 13b. The admin support desk (`/admin`), built 2026-08-25

An internal console where a Claude agent answers product, stock, order and
delivery questions against the real systems, and drafts customer replies. Built
because the customer-facing admin work had no tooling at all: answering "is this
in stock and what does delivery cost" meant opening Unleashed, WooCommerce and
the AusPost calculator by hand.

**It is not customer-facing.** Nothing it writes reaches a customer without a
staff member approving it first.

### Getting in

`ADMIN_PASSWORD` + `ADMIN_SESSION_SECRET` are exchanged for a signed, 12-hour
cookie. There are no user accounts.

**It fails closed.** With either env var unset, `/admin` and `/admin/login` both
return 404 rather than opening. Verified by unsetting the secret: 404, restored:
307 to the login page. An unconfigured deploy therefore cannot leak order data or
expose a send-email tool, which is why it is safe that Vercel has neither var yet.

`src/proxy.ts` is the gate. Next 16 renamed Middleware to Proxy and the file must
sit at `src/proxy.ts`; a `middleware.ts` there is silently ignored. The proxy is
the optimistic check the Next docs describe, so `/api/admin/agent` re-verifies the
cookie itself rather than trusting it.

### What the agent can reach

| tool | source | notes |
|---|---|---|
| `search_catalogue`, `get_product` | committed snapshot + Unleashed | matches what a visitor sees |
| `check_stock` | Unleashed, **live** | ERP is the source of truth, inc-GST |
| `lookup_order`, `list_recent_orders` | WooCommerce, live, **read only** | `lib/wc-admin.ts` |
| `check_payment` | Stripe, via the order's `transaction_id` | refunds and disputes included |
| `check_shipment` | Unleashed `SalesShipments` | see the dispatch note below |
| `quote_freight` | Australia Post | same numbers the checkout charges |
| `send_reply`, `log_enquiry` | Resend, HubSpot | **write - approval required** |

### Two freshness tiers, on purpose

`getUnleashedMap()` is a 60-minute snapshot of the whole catalogue and stays that
way: rebuilding it costs ~16s and every listing page waits on it. That is right
for the shop, where stale-but-consistent is exactly what the visitor sees.

**The support desk reads live instead**, through `getLiveEntries()` in
`lib/unleashed.ts`. A staff member repeats these figures to a customer, so an
hour-old "one in stock" is a promise rather than a display, and `MCTMSP02` has
exactly 1. Unleashed filters server-side on `productCode` and answers in
150-600ms, verified 2026-08-25, so live costs almost nothing here.

`search_catalogue` still uses the cached map, because a search can span the
catalogue. Every tool result carries its own basis, and the system prompt forbids
quoting a price or stock figure from a search without confirming it first.

### Dispatch: "no tracking number" is the normal case

`check_shipment` reads `SalesShipments`, keyed on the same order number the
website uses (verified against 488906). Two field shapes bite: `ShippingCompany`
is an OBJECT (`{Guid, Name}`) and not a string, and `DispatchDate` is Microsoft
JSON date format.

**923 shipments exist and only 43 carry a tracking number**; 886 have no carrier
recorded, because dispatch paperwork is done in carrier portals and nothing
writes back. So the usual answer is a dispatch date with nothing against it. The
tool says so explicitly and the prompt forbids reading that as "lost" or "we do
not know if it shipped". This is the same gap the freight API spec asks a
provider to close.

It also separates three cases that look alike: dispatched, order exists but has
not shipped, and no such order. A typo must not read back to a customer as a
delayed delivery.

### Sizes are three different things

`assembled_size` (ACF meta, **millimetres**) is the built machine. `packing_size`
(ACF meta, **millimetres**) is the carton. `freight_carton`
(`WcProduct.dimensions`, **centimetres**) is the same carton, and exists only to
price delivery. Weight splits the same way: net is the machine, gross is machine
plus carton, and freight quotes on gross.

`get_product` returns all of them separately and never merges them, plus a
plausibility check that flags unit errors instead of letting the agent read them
out. `SCRWAR04` records its assembled length as 24,400mm, ten times the truth,
**and its freight carton inherited it as 2440cm**. That now fires three
`data_warnings`. `MCTMSP02` (net 480kg, gross 601kg) produces none, so the check
is not just noise.

Reads go through the same modules the public site uses, so the agent cannot quote
a price the shop does not show.

### The approval gate

The two write tools never execute in the tool loop. When Claude calls one, the
route emits an `approval` event instead and stops; the console renders the exact
payload with Approve and Decline. The conversation is held in the browser, and
the approved action is re-read from the `tool_use` block in that history, so
there is no session store to keep.

One consequence worth knowing: the Anthropic API needs every `tool_result` for an
assistant turn in a single message, so a turn that mixes reads with a pending
write re-runs its read tools when you approve. All read tools are idempotent, so
this is safe, just not free.

### Verified 2026-08-25 (not assumed)

Against live systems, through the running app:

- Unleashed: `MBCTMA01` $25.00 / 7 in stock, `MCTMSP02` $7,589.00 / 1,
  `SCRWAR04` $1,705.00 / 0.
- **`SCRWAR04` shows the Unleashed price is doing real work**: the WooCommerce
  fallback for the same product is $1,375.00. A $330 gap.
- AusPost: 2x `MBCTMA01` to Parramatta 2150 quoted $36.80 Parcel Post, which is
  exactly the freight charged on real order `490118`.
- WooCommerce orders: `490118`, `490117`, `490116` returned with contact,
  address and lines.
- Auth: unauthenticated `/admin` 307s to the login page, `/api/admin/agent`
  answers 401 JSON (not an HTML login page, which would have rendered into the
  chat), and the unconfigured case 404s.

`npm run build` passes, `npx vitest run` is 86 passed / 32 skipped, and lint is
unchanged at 21 errors + 2 warnings.

### The Anthropic account

**Create a MasterKraft organisation, on a MasterKraft email and card.** Not
Michael's personal account: this is an operating cost that should arrive addressed
to the business, and a support desk keyed to one person's card stops working the
day that person steps back. Whoever's address creates the org owns it, so use
`hello@masterkraft.com` or similar rather than a personal address.

**You do not need a second login.** One Anthropic login can belong to several
organisations and switch between them in the Console. So: create the MasterKraft
org from a MasterKraft mailbox, then invite Michael's existing login into it as an
admin. Ownership and recovery stay with the business, day-to-day management
happens from the login he already uses. Billing, API keys and usage are all
per-ORGANISATION, not per-login, which is the distinction that matters.

**The trap: a key from the wrong org works perfectly.** The app reads
`ANTHROPIC_API_KEY` and cannot tell which organisation issued it. Paste a personal
key into MasterKraft's Vercel and everything runs, the usage just bills the wrong
entity and there is no clean handover later. Nothing will warn you. Check the key
was issued in the MasterKraft workspace, not merely that the console answers.

**Issue the key inside a Workspace, and set a spend limit on it.** This is not
bookkeeping neatness. An agent is a program that spends money in a loop.
`MAX_TURNS` in the agent route caps one conversation at 12 model turns; nothing in
the code caps the month, and a workspace spend limit is the only thing that does.

**A leaked `ANTHROPIC_API_KEY` is a bill, not a breach.** It buys Claude tokens
and nothing else. It does not reach Unleashed, WooCommerce, HubSpot or Resend,
which hold their own credentials, and reaching the tools at all requires
`ADMIN_PASSWORD` first. Worth knowing, because it sets how paranoid to be.

Keep it Sensitive in Vercel, but **verify it the moment it is set**: load `/admin`
and ask one question. See §7b for why that instruction is here, a Sensitive var
holding the wrong value went unnoticed for weeks because nobody could read it back.

Rough cost, estimated and not measured: **$0.10 to $0.30 a conversation**, so
roughly **$60 to $180 a month** at twenty a day. The system prompt and tool
definitions are cached, so the variable cost is mostly tool results;
`list_recent_orders` is the expensive one at maybe 6k to 8k tokens of order JSON.
The lever if that lands badly is the model (`MODEL` in the agent route): Sonnet 5
is $3/$15 per MTok against Opus 5's $5/$25.

### Why it is not a Managed Agent

Anthropic can host the agent loop and a sandbox. That is the wrong shape here. The
tools ARE the app: `getUnleashedMap()`, `quoteFreight()` and `getOrder()` are
existing functions sharing the site's env vars and its `unstable_cache` layer.
Hosting the loop elsewhere means either reimplementing all of that or exposing
MasterKraft's ERP and order data over a public API for a sandbox to call. The loop
belongs next to the data it reads.

### Identity and audit

**Two modes, and the console says which one it is in.**

| | shared | supabase |
|---|---|---|
| trigger | `SUPABASE_*` unset | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` set |
| sign in | one shared `ADMIN_PASSWORD` | work email, six-digit code emailed via Resend |
| "who approved this" | **no answer** | recorded against a person |

Shared mode is kept deliberately, not as a leftover: it means a database outage
cannot lock the team out of their own order lookups, and the console worked
before the database existed. Both `/admin` and the login page state plainly when
they are in it, because in shared mode nothing is attributable.

**No passwords in identity mode.** Identity IS the work email, proven by a code.
Nothing to rotate, and when someone leaves the business their mailbox goes and so
does their access. Codes are six digits from the CSPRNG, hashed at rest, single
use, ten minute expiry, and burnt after five wrong guesses. Requesting a code
answers identically whether or not the address belongs to staff, so it cannot be
used to enumerate who works here.

**Bootstrap:** an empty `admin_users` table means nobody can sign in to create the
first user. `ADMIN_BOOTSTRAP_EMAILS` (comma separated, in Vercel) lists addresses
allowed to sign in before a row exists; the row is created on first successful
code entry. Kept out of the repo on purpose.

**What is recorded:** the conversation, every message, and one row per write the
agent proposed. The proposal row is written BEFORE anyone decides, so a proposal
nobody acted on still leaves a trace: `/admin/activity` shows those as **never
decided**, in the accent colour, because "the agent wanted to email a customer and
nobody said yes" is the case you most want to see.

Audit writes are best effort and never raise. An audit outage must not stop
someone looking up an order for a customer on the phone. The trade is explicit: a
gap in the record beats a console that stops working.

**Schema:** `supabase/migrations/20260825_admin_identity_and_audit.sql`. Plain
Postgres apart from the RLS block, so it runs anywhere. Every table has RLS on
with **no policies**, which denies anon and authenticated outright; only the
service role key reaches them, and only from server code.

> **NOT YET APPLIED.** The MasterKraft Supabase project (`pmydkwszkgjnolrcnenh`)
> lives in its own org, which this session's Supabase connection could not reach.
> Paste the migration into that project's SQL editor, then set `SUPABASE_URL`,
> `SUPABASE_SERVICE_ROLE_KEY` and `ADMIN_BOOTSTRAP_EMAILS`.
>
> The SQL was validated against a real Postgres inside a transaction that was
> rolled back: tables, foreign keys, the insert/approve flow and RLS all checked
> out, and nothing persisted.

### Still open

- **Identity mode is unverified end to end**, because the database does not exist
  yet. Shared mode was tested through the running app (wrong password 401, correct
  200, activity page reports no audit trail). The email-code path is built and
  typechecks, but no code has been sent or redeemed.
- Conversations are recorded but not yet re-openable in the UI. `/admin/activity`
  lists actions, not threads.

### Not verified

**`check_payment` end to end.** `STRIPE_SECRET_KEY` is empty in `.env.local`, so
the tool was only exercised down to its "not configured" branch. It does correctly
pull the PaymentIntent ref (`pi_3U7tPf...`) off order `490118`. **Note the trap:
per section 10 the deployed site runs test Stripe keys, and a test key cannot see
a live customer payment.** The tool reports which mode answered and says explicitly
not to tell a customer they have not paid on the strength of a miss.

**The model calls themselves.** `ANTHROPIC_API_KEY` was not available in the
session that built this, so the tool executors, the auth, the streaming route and
the UI are all proven, but no live conversation has run end to end. Expect to
shake out prompt-level behaviour on the first real use.

### Watch out

- **§13's lint note is stale.** It says 2 pre-existing lint errors; there are 21
  errors and 2 warnings, none in the admin code. Compare against `HEAD`, do not
  expect 2.
- Folders under `app/` starting with `_` are Next private folders and do not
  route. Cost 10 minutes here.
- The system prompt in `lib/agent/prompt.ts` sits behind a prompt-cache
  breakpoint. Keep it a byte-stable constant; interpolating anything per-request
  invalidates the cache on every call.
- `TOOL_DEFINITIONS` order is part of that same cached prefix. Appending is fine,
  reshuffling is not.
- The spec conflicts in §10 now matter more, not less. The agent will read a
  wrong weight out to a staff member and freight will price on it.

---

## 14. Reference: brand, navigation, shop, content, REVL, resources

All live. Preserved from earlier sessions because the reasoning still binds.
**Brand / design**
- **Accent = the brochure coral red** `#ef5350`, with `-600 #c73e37` and `-300 #f88a82`
  (8.4:1 on dark). One token trio in `src/app/globals.css`.
- **Buttons (`.btn-accent`) are filled with the BASE accent and use INK labels**, so they
  match the printed brochure exactly. White on `#ef5350` is only 3.49:1 and fails AA;
  ink on it is 5.41:1. **Do not switch the label back to white without darkening the
  fill again.** `-600` is still used where white/small text sits on the accent (cart
  count badge, eyebrow text on light backgrounds) and must stay dark enough for AA.
  History: magenta → blue → magenta+Hot Gradient → coral red `#f94d3f` →
  crimson `#f7373a` → **coral `#ef5350`** (2026-08-17), sampled from the vector fills in `MasterKraft_Franchise_Brochure_A5.pdf` (49 uses, the brochure accent).
  To recolour the whole site, change those 3 vars + OG image + Stripe colorPrimary
  (3 files: `globals.css`, `opengraph-image.tsx`, `StripeCheckout.tsx` — grep the old
  hexes to confirm none are left). Derive `-600`/`-300` by keeping the existing HSL
  deltas off the new base, then check `-600` clears 4.5:1 against white and `-300`
  clears 4.5:1 on `#0a0a0b`/`#111113`. **The OG image is build-time — the social
  preview keeps the old colour until a redeploy runs.**

**Navigation**
- **Header Equipment mega-menu** (`EquipmentMegaPanel` in `Header.tsx`): categories
  (left) → hovered category's **sub-categories** (middle) → category image (right).
  Sub-category data is a static map on `equipmentCategories` in `src/lib/nav.ts`
  (regenerate from `/products/categories?parent=<id>` when the taxonomy changes).
- **Sub-categories** also nested in the `/all-equipment` "Category" dropdown
  (`CategoryJumpNav`, fetched live via `getCategoryChildren`).

**Shop**
- **Clearance restored** (was emptied by the M/N filter) + **sale pricing**
  (crossed-out RRP + reduced price).
- **Product-image tiles = `#e6e6e6`** (sampled from the photos' flat grey bg). A few
  lines (Selectorize machines, some rigs) were shot on a different grey — normalized
  by **`scripts/normalize-product-bg.py`** (recolours to #e6e6e6, writes to
  `/public/product-bg/` + `src/lib/product-image-overrides.json`; applied at fetch
  time in woocommerce.ts). **Re-run the script when the catalogue changes.**

**Content pages**
- **Finance** (`src/app/finance/page.tsx`): 3 providers side-by-side with logos
  (Afterpay, Zip Money, GRENKE) + spec lists. Logos in `/public/finance/`.
- **Warranty + Shipping**: collapsible accordions (`ContentPage collapsible` +
  `AccordionSections.tsx`).
- **Delivery Information**: HubSpot form removed (now info-only).
- **Gym-fitouts** (`/fitout`): **Dubai removed**; **Canada + United States** added as
  "coming soon" (`comingSoonMarkets` in `locations.ts`).
- **Phone** shown as `+61 3 9044 9575` sitewide.

**REVL (`/revl-fitouts`)**
- Per-club **galleries now use real Instagram photos** of each studio (in
  `/public/revl/ig/<slug>/`, wired via `IG_PHOTOS` in `revl.ts`). Taipei = no
  account, gallery hidden. Each club page **links to its IG account** (`IG_HANDLES`).
  Handle map + harvest method in the memory `reference_masterkraft_revl_galleries`.

**Resources (`/resources`)**
- Replicated the old site: product-photo thumbnails + a **per-product popup**
  (`ResourcesList.tsx`) listing each manual. `src/lib/resource-docs.json` drives it.
- **RESOLVED 2026-08-17 — now 23 products / 55 documents, all hosted locally.**
  The old site's 24 manuals were 404 because the PDFs had been **deleted** from
  `wp-content/uploads/2021/03/` (proven: an image in that same folder still serves
  200, and a PDF in `2024/02` serves 200, so it was neither a folder purge nor a
  plugin rule). No Wayback snapshots existed. Michael supplied the originals from
  Dropbox, which turned out to hold far more than the missing 24 — maintenance
  guides, noise troubleshooting, treadmill how-tos, and assembly guides for 8
  products that never had any online.
- **`scripts/import-manuals.mjs` rebuilds the whole page** from the Dropbox folder:
  copies each doc to `public/manuals/<sku>-<label>.pdf`, pulls the product's real
  name + photo from WooCommerce (so folder names like "CHALK BOWL" become
  "Weightlifting Chalk Box"), and regenerates `resource-docs.json`. Idempotent —
  **re-run it whenever the Dropbox folder gains documents**, then delete any
  orphaned files in `public/manuals/` that the JSON no longer references.
- **Everything is served from `/public`, never hot-linked from WordPress**, so this
  cannot break again the way it did. ~80MB of PDFs now live in the repo. Two entries
  have no catalogue product behind them and use category images: `MERK153001`
  (Retail Rack) and `MRSPATT0X` (Rigs — looks like a family code, not a real SKU;
  confirm the correct name with Steve). The 8 single-document guides are labelled
  "Product Guide" because the PDFs could not be opened to classify them; that label
  is not user-visible (single-doc rows link straight to the file).

---

## 15. Reference: shipped 2026-08-17 (feedback round 3)

- **Concept2 ("C2") products now show.** The brand filter was `/^[MN]/i`; it is now
  `/^(?:[MN]|SC)/i`. See the brand-SKU note above for why `SC` is the right match.
  Catalogue 221 → 224. Verified in Cardio, in search, and on the product pages.
- **Product specs now render for 78 more products.** Those products keep their spec
  table in a legacy ACF HTML blob (`specification_text`) instead of the discrete
  `assembled_size_*` / `colour` / … fields the site read, so their spec table came out
  empty (this was the client's "still not pulling" report, e.g.
  `/product/3-in-1-foam-plyometric-box-34kg`). `parseSpecBlob()` in `woocommerce.ts`
  parses the blob; **discrete fields still win**, the blob only fills gaps. The markup
  is uniform across all 221 products that carry it (one "Assembled Size" heading, a
  fixed 9-label set, zero malformed rows). Covered by `src/lib/spec-blob.test.ts`.
- **REVL club states fixed — this was a real content error, not a label typo.**
  Brighton (trades in Hove) and Campbelltown are **both South Australian**, but the
  site used REVL Brighton as the *Melbourne* case study and REVL Campbelltown as the
  *Sydney* one. Melbourne now leads with REVL Collingwood, Sydney with REVL Bondi, and
  Adelaide gained a real local project (it had none, despite being REVL's biggest
  market). The Campbelltown case study itself said "Campbelltown, NSW".
- **Every city page now lists its REVL clubs.** New `revlClubsAu` + `revlClubsForRegion`
  in `src/lib/revl.ts`, rendered on `/gym-fitouts/[city]`. Verified against REVL's own
  locations directory: **SA 10, NSW 6, QLD 6, VIC 5**. Several clubs trade under a
  different suburb than their name (Brighton→Hove, Mile End→Torrensville,
  St Marys→Melrose Park), so both are stored and the suburb is shown in brackets.
  Albury and Mount Gambier sit under an "Also in [state]" heading. `revlNetwork`'s
  Australia list is now **derived** from `revlClubsAu` so the two cannot drift.
- **Accent recoloured** twice: to crimson `#f7373a`, then to the brochure coral `#ef5350` (see Brand / design below). Also fixed `.mk-glow`, which had a hardcoded `rgba(249,77,63)` left over from the ORIGINAL coral and so had silently stopped tracking the accent; it now uses `color-mix()` off `--color-accent`.
- **Buttons refilled with the exact brochure coral** (label switched to ink to keep AA).
- Added `reports/wc-content-gaps.csv` - the WooCommerce content punch list.
- Fixed "Request **a** Adelaide fit-out" (vowel cities).
