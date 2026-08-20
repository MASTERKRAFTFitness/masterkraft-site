# MasterKraft website — handover (2026-08-20)

New Next.js e-commerce site for masterkraft.com, headless: it reads catalogue,
price and stock from WooCommerce and Unleashed over their APIs, and does not use
the old WordPress storefront.

**The code side of the launch checklist is now clear.** Everything outstanding
needs a decision, a credential, or content. **Launch gates and env vars live in
`LAUNCH.md` - read that before any go-live work.**

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

To deploy without the gate (it is a safety net, not a law): `npx vercel --prod`.

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

`build:obsolete` refuses to write if fewer than 1,500 products come back, since a
short read would silently un-retire everything. `build:catalogue` refuses below
400 published products for the same reason: a short read would empty the shop.

**`build:catalogue` is now the most important of these.** The site serves product
data from `src/data/`, so a content edit in WordPress is invisible until the
snapshot is rebuilt and committed. Nothing rebuilds it automatically.

---

## 5. Freight (Interparcel)

**Built, not switched on.** Michael's call 2026-08-20: freight quoted at checkout,
cheapest service plus one faster option, carrier rate plus a **15% handling margin**.

**Do not install their WooCommerce plugin.** It registers a shipping method in a
WooCommerce shipping zone and prices the **WooCommerce storefront checkout** - the
storefront this site replaced. It would price a checkout nobody uses.

We use their REST API instead: `POST https://api.interparcel.com/quote`, with
`X-Interparcel-Auth` and `X-Interparcel-API-Version: 3`, sending collection and
delivery addresses and a parcels array of weight (kg) and L/W/H (cm). Service
levels include `pallet`, which matters because a rig is not a parcel.

- `src/lib/freight.ts` is the domain logic, `src/lib/freight-server.ts` resolves a
  cart against WooCommerce, and **both the quote route and the payment-intent route
  go through it**, so the price shown and the price charged cannot disagree.
- Weights and cartons are read server-side. **The client sends only which service
  was chosen, never what it costs.**
- **One parcel per unit**, using each product's own carton. Three barbells are three
  cartons, not one impossible 63kg box. Dimensions round up.
- **It fails soft in every direction and NEVER says "Free".** No key, a product with
  no carton dimensions, no compliant service or a dead API all produce "Calculated
  on quote" and charge goods only. Once freight IS configured, a cart that cannot be
  quoted goes to the quote flow rather than being charged an unknown delivery cost.

**Our data supports it: 85% of products are quotable** (94% carry a weight, 85% full
dimensions), and the WooCommerce dimensions are **shipping cartons, not assembled
size** - verified: the Functional Trainer is 30.5cm high flat-packed against 2,300mm
assembled. Units are cm and kg, which is what the API wants.

To switch on, see `LAUNCH.md` §1b. Needs `INTERPARCEL_API_KEY` and the despatch
warehouse address. **The GST reading of their `taxable` flag must be checked against
the first real quote** or freight undercharges by 10%.

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
| order into WooCommerce | built, `woo-orders.ts`, gated by `WC_WRITE_ENABLED` |
| WooCommerce → Unleashed | **already working** |
| fulfilment / labels | Interparcel Shipping Manager "Fetch Orders", no code |

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

## 8. Shipped 2026-08-20

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

## 9. Open / blocked, by owner

### Michael
- **Card checkout: live or quote-only.** Staging shows a **card form on a `pk_test`
  key**, which would reject a real card. `LAUNCH.md` used to claim the checkout was
  quote-only; it is not. `paymentsConfigured` is simply "a publishable key exists".
- **Interparcel API key + despatch warehouse address**, the only things stopping
  live freight quoting. Put the key in `.env.local` and in Vercel; it is
  server-side, so do not prefix it `NEXT_PUBLIC_`.
- **Void the two test orders** sitting in Unleashed (§6).
- **Form-delivery test** - needs a go-ahead, it emails the team and creates a real
  HubSpot contact.
- **Home gym photos.**

### Steve
- **Domain / DNS cutover, option A or B** (`LAUNCH.md` §2). The big gate:
  indexing, `NEXT_PUBLIC_SITE_URL` and the OG image colour all wait behind it.
- **Interparcel** want 10-20 example shipments before they will quote rates. The
  form was attached to their onboarding email. Real examples can be pulled from the
  catalogue rather than invented.
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
- **Two warranty fields** read "3 monthsmonths" (`MBPB3I101`, `MSCMDU01`). The typo
  is in the legacy `specification_text` blob, **not** the Warranty field, so anyone
  fixing it will look in the wrong place. The cheap fix is to type the correct
  warranty into the discrete Warranty field, which overrides the blob.
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

## 10. Reference: the WordPress side and the cutover

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

## 11. Env vars

Set and working: `WC_*`, `UNLEASHED_*`, `NEXT_PUBLIC_GA_ID` (G-86MEH5QL99),
`NEXT_PUBLIC_HUBSPOT_PORTAL_ID`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (**pk_test**),
`NEXT_PUBLIC_SITE_URL` (= web.test.masterkraft.com).

Not set: `NEXT_PUBLIC_ALLOW_INDEX` (correct for staging), `INTERPARCEL_API_KEY`,
`FREIGHT_COLLECTION_*`. Server secrets (HubSpot form GUIDs, Resend, Stripe secret,
WC write) remain unverifiable without a live test.

`FREIGHT_MARGIN_PERCENT` defaults to 15 in code; set it only to change that.

---

## 12. Conventions

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

## 13. Reference: brand, navigation, shop, content, REVL, resources

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

## 14. Reference: shipped 2026-08-17 (feedback round 3)

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
