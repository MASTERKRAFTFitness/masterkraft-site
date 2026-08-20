# MasterKraft website — handover (2026-08-20)

New Next.js e-commerce site for masterkraft.com (headless WooCommerce + Unleashed).
This handoff reflects the state after a third feedback round. **Launch
gates + env vars live in `LAUNCH.md` — read that before any go-live work.**

## Repo / environments
- Code: `~/Desktop/masterkraft-site`. Next.js 16 (App Router, Turbopack), TS, Tailwind.
- Dev server: use the preview tools, or `npm run dev` (defaults to :3100). Note a
  Fernwood portal sometimes squats :3100 — run on another port (e.g. `-p 3102`).
- **A stale `.next` makes EVERY route 404.** Symptom: `next dev` starts fine and
  serves the site's own 404 page for `/` and everything else, with **no "Compiling …"
  lines** in the log. That is a leftover production build, not a routing bug. Fix:
  stop the server, `rm -rf .next`, restart. Don't debug it as a code problem.
- **Review/staging URLs:** `https://masterkraft-site-pi.vercel.app` and
  `https://web.test.masterkraft.com` (both **noindex** — see indexing gate below).
- GitHub: `MASTERKRAFTFitness/masterkraft-site`, branch `main`. Everything below is
  committed + pushed (main, deployed via the Vercel CLI).

## DEPLOY — read this first
- **A git push does NOT deploy Vercel prod.** Michael deploys from the project dir:
  ```bash
  cd ~/Desktop/masterkraft-site && npx vercel --prod
  ```
  It's CLI-deployed (not Git-connected). Project is linked via `.vercel/project.json`.
  If it says **"Not authorized"**, run `npx vercel login` first (Michael's account).
- `NEXT_PUBLIC_*` env vars are **build-time inlined** — changing them in Vercel does
  nothing until a redeploy. To confirm one landed, grep the deployed client chunks
  (`/_next/static/chunks/*.css` or `*.js`) for the literal value.
- Claude cannot deploy (auth is Michael's) or set Vercel env / DNS — surface those.

## Data flow (essential for edits)
- Product/category data: WooCommerce REST (`src/lib/woocommerce.ts`), creds in
  `.env.local` (`WC_STORE_URL`, `WC_CONSUMER_KEY/SECRET`).
- **PRICE QUIRK:** the WC `price` field is distorted by a wholesale plugin — always
  derive from `regular_price × 1.1` (GST). `getPricing`/`enrich` handle this.
- **Unleashed** = correct price/stock (`src/lib/unleashed.ts`); `enrich()` prefers
  Unleashed **unless** an item is on WooCommerce sale (then WC sale wins → clearance).
- **Brand SKU filter** (`filterBrandSku`, `BRAND_SKU_RE = /^(?:[MN]|SC)/i`): only
  MasterKraft's own M/N products show catalogue-wide, **plus the Concept2 ("C2")
  range**, which is named "C2 …" but carries `SC` SKUs (`SCRWAR04`, `SCSTAR03`,
  `SCSTACC04` — `SC` is used by nothing else). No SKU in the store actually starts
  with the characters "C2". **Clearance opts out** (A-prefixed SKUs) via
  `getAllProductsByCategory(id, { brandFilter: false })`. **If a category shows 0
  products, suspect this filter first.** Catalogue is 512 published products →
  **184 shown**: 224 pass the brand filter, then 25 are dropped as WooCommerce-hidden
  and 15 more as Unleashed-obsolete (see the obsolete-products section below).

## Shipped 2026-08-17 (feedback round 3) — committed, pushed AND deployed

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

## Shipped 2026-08-20 — obsolete products are no longer served

**The rule has two halves, because two systems retire products independently:
WooCommerce hides them and Unleashed marks them obsolete. Both are now honoured
everywhere. Catalogue 224 → 184.**

### The WordPress half: `catalog_visibility`

**WooCommerce's `catalog_visibility` is the store's own "do not list this"
switch, and the site now honours it everywhere.** It did not before: the
site filtered on `status: publish` only, so 25 products the WordPress storefront
deliberately hides were being listed on the new site.

The store retires a product two ways and both arrive as `hidden`:
1. **the line is withdrawn** (Wall Balls, Acoustic Underlay, Aerobic Weighted Bars), and
2. **an old single listing is superseded by its `-GROUP` variable product** (16 of
   the 25, e.g. `MMDBRH` "Rubber Hex Dumbbells" → the visible `MMDBRH-GROUP`), so
   the site was showing the same product twice.

Implemented in `src/lib/woocommerce.ts` as `isObsolete` / `filterListable` /
`filterSearchable`, applied at every fetch chokepoint (category, all-products,
search, featured, related, sitemap) and in `getProductBySlug`. Tests in
`src/lib/obsolete.test.ts`.

- **Catalogue 224 → 199. Sitemap 512 → 450 product URLs. Clearance unaffected (39).**
  No category is emptied. Biggest movers: Mixed Implements 37 → 22, Weightlifting
  34 → 28, Dumbbells 11 → 7.
- **A missing `catalog_visibility` counts as visible.** The field has to be asked
  for in `_fields`, so a caller that forgets it shows too much rather than
  silently emptying every listing. It is in `PRODUCT_FIELDS`.
- **`getProductById` is deliberately NOT filtered.** It backs order creation
  (`woo-orders.ts`); an order for an already-bought item must not fail because
  marketing hid the listing.
- **Obsolete product URLs now 404** instead of serving a page with a live
  add-to-cart button.

**Also fixed: a pre-existing SOFT 404 on `/product/[slug]`.** The segment had a
`loading.tsx`, which wraps it in Suspense and flushes the shell (and a `200`)
before `notFound()` runs. Every unknown OR obsolete product URL returned the 404
body under a **200 status**, which Google indexes as a real page. The skeleton
file is removed and the reason is commented in `page.tsx`. **Re-adding a
`loading.tsx` to that segment brings the soft 404 back.** Verified against a
production build: hidden and unknown slugs 404, valid products 200.

### The ERP half: Unleashed also retires products

**READ THIS BEFORE TOUCHING THE UNLEASHED CLIENT. `GET /Products` HIDES OBSOLETE
PRODUCTS BY DEFAULT.** The plain endpoint returns 1,092 items, every one of which
reports `Obsolete:false`, which reads exactly like "this company never uses the
flag". With **`includeObsolete=true`** it returns **1,892, of which 800 are
obsolete**. Any check written without the parameter passes vacuously - this
session made that mistake and shipped the wrong conclusion in `b13c890` before
catching it. The field is `Obsolete`, not `IsObsolete`. Same trap is documented
in `snap-portal-franchisee/scripts/check-obsolete.mjs`, which is what caught it.

**15 products the site was still serving are obsolete AND `IsSellable:false` in
Unleashed**, with WordPress still showing them: the entire discontinued
**Selectorize strength range** (11 machines: Lat Pulldown, Chest Press, Pec Deck,
Leg Curl, Arm Curl, Assisted Chin/Dip, Ab/Back Extension and so on), plus Glute
Ham Bench Pro, 2 artificial turf rolls and the custom-branding Impact-Lock tiles.

- `isObsoleteInUnleashed` / `filterUnleashedObsolete` in `unleashed.ts`, applied
  at the category, all-equipment, search, typeahead, related-rail and sitemap
  surfaces, plus a `notFound()` on the product page.
- **Catalogue 199 → 184. Sitemap 450 → 429.** Strength 28 → 17, Flooring 4 → 1,
  Clearance 39 → 36 (2 dead items, both zero stock).
- **Nothing sellable is hidden: zero obsolete products hold any Unleashed stock.**
  Checked explicitly, because Clearance exists to sell end-of-line stock and
  would be the wrong thing to filter. MFATSY01 turf reads `instock` in
  WooCommerce but has 0 in Unleashed, which is the source of truth for stock.
  If that ever stops being true, Clearance is the category to carve out first.
- **An unknown SKU is never obsolete.** Many catalogue products have no Unleashed
  match at all and must keep selling, so only an explicit flag retires anything.
- `fetchAllPages`' page guard was raised to 16: Products is **10 pages** with
  obsolete records included, against a previous cap of 8, so prices would have
  silently vanished.

## Shipped 2026-08-20 — listing pages were slow because fetches ran in series

Reported as "clicking on equipment takes a long time to load". Measured, not
guessed, and it predates the obsolete rule (staging showed the same).

**The cause is that both upstream APIs are slow, and we queued up requests
against them.** WooCommerce answers in **1.5 to 2.5s per request**; Unleashed
takes **~2.5s per page and throttles concurrency** (9 pages take 15.6s in
parallel, 37s in series). Against that, three things ran one `await` at a time:

- `/equipment/[category]` awaited the ERP map, then the sub-categories, then the
  category description, then the products. Four round trips in series.
- `/all-equipment` awaited the ERP map, then the dropdown groups, then the
  catalogue.
- `getAllProducts` / `getAllProductsByCategory` paged through WooCommerce **one
  page at a time** in a `for` loop, so the 512-product catalogue cost 6 serial
  requests. They now read `x-wp-totalpages` off page 1 and fetch the rest at once
  (`fetchAllPages` in `woocommerce.ts`), concatenated in page order so
  `menu_order` survives.
- `buildMap` in `unleashed.ts` fetched Products, then StockOnHand. Now
  concurrent; stock is collected into its own record and merged after, because
  otherwise StockOnHand could land first and be overwritten by the Products pass.

**Measured cold (empty cache), same machine, back to back:**

| Route | Before | After |
|---|---|---|
| `/equipment/strength` | 60.1s | 19.2s |
| `/all-equipment` | 18.4s | 7.3s |
| `/equipment/body-weight` | 6.7s | 5.0s |

**Warm, which is what almost every visitor gets: 0.01 to 0.03s.** `wcGet` caches
fetches for 10 min and the ERP map is `unstable_cache`d for 15, so only the first
request against a genuinely empty cache pays this (right after a deploy, or a
cold serverless region). Verified counts are unchanged after the refactor,
including Equipment Storage, which spans 2 WooCommerce pages: 44 both ways.

### Follow-up, same day: obsolescence moved out of the request path

**The obsolete list is now generated and committed, not fetched at runtime.**
`npm run build:obsolete` writes `src/lib/obsolete-skus.json` (804 codes) and
`npm run check:obsolete` reports drift without writing, exiting 1 so it can gate
a deploy. **RE-RUN `build:obsolete` WHEN THE ERP RETIRES A PRODUCT** or the site
keeps selling it. The generator refuses to write if fewer than 1,500 products
come back, since a short read would silently un-retire everything.

`src/lib/obsolete.ts` resolves a WooCommerce SKU against that list, through the
`unleashed-aliases` map so a retired product cannot slip through under its web
SKU. `woocommerce.ts` now applies **both halves of the rule in `isObsolete`**, so
every listing surface, the sitemap and `getProductBySlug` inherit it from one
place. The per-page filtering added earlier is gone, and `/api/search-suggest`
and the sitemap no longer block on the ERP map at all.

**Honest note on what this did and did not buy.** It did NOT measurably speed up
the cold map build. Dropping `includeObsolete` takes Products from 10 pages to 6,
but repeated timings ran 8.4s/10.9s/9.5s for ten pages against 9.4s/15.8s/24.2s
for six: **Unleashed throttles by request rate, so page count is not the lever**,
and the numbers get worse the more you probe it. What it does buy is that the
rule is deterministic, survives Unleashed being slow or down, and no longer runs
on two surfaces that never needed it.

**The ERP cache TTL is raised 15 min → 60 min** (`unstable_cache` in
`unleashed.ts`). That is the actual latency win: the ~10-20s cold build happens a
quarter as often. **The trade is that an ERP price or stock change can take up to
an hour to appear.** Lower it if stock accuracy starts mattering more than the
wait.

## Shipped 2026-08-20 — site search returned nothing for the commonest terms

`/search?q=dumbbell`, `?q=barbell`, `?q=mat` and `?q=rig` all reported **0
products found**. Pre-existing, not related to the obsolete rule: staging showed
the same before any of today's work.

**Cause:** `searchProducts` asked WooCommerce for **one page of 24** and applied
the brand-SKU filter **afterwards**. The store holds a parallel **S-prefixed
range with identical product names** (`SMDBRH` alongside `MMDBRH`), WooCommerce
ranks those first, so all 24 rows were filtered away and the page reported
nothing while dozens of matches sat further down the result set.

**Fix:** search now full-fetches, filters, then paginates in memory, the same
approach the category pages already use and for the same reason. Cheap now that
pagination runs in parallel.

| term | before | after |
|---|---|---|
| dumbbell | 0 | 22 |
| barbell | 0 | 38 |
| mat | 0 | 46 |
| rig | 0 | 15 |
| rack | 0 | 63 |
| kettlebell | 8 | 13 |

Terms that already worked are unchanged (bench 7, bumper 11, treadmill 2), and
pagination is correct (rack: 24 + 24 + 15 = 63). **The typeahead passes
`maxPages: 1`** — it fires per keystroke and only shows 6 suggestions, so it
takes one request (~1.7-2.0s uncached, instant after) rather than paying for
pages it will never display. It was returning nothing for "dumbbell" too.

## Shipped 2026-08-20 — no Snap or Fernwood products, by construction

Michael: "no S or F products on the website". Checked before changing anything:
**no F product was served at all, and the only S-prefixed ones were the 3
Concept2 ergs** (`SCRWAR04`, `SCSTAR03`, `SCSTACC04`), added on request in
feedback round 3. **Confirmed 2026-08-20 that the Concept2 range STAYS** - it is
a range MasterKraft distributes, S-looking only by SKU prefix.

But "not listed" was not the same as "not on the website". Two routes bypassed
the M/N brand filter:

1. **Clearance runs with `brandFilter: false`** to show A-prefixed ex-display
   stock, so a Snap or Fernwood item filed there would have been listed. None is
   today (Clearance is 39 A-prefixed), but nothing stopped it.
2. **`getProductBySlug` applied no brand filter at all**, so **all 149 Snap and
   Fernwood product pages answered 200 on a direct URL** and sat in the sitemap.
   Trucker Hat, LED Dimmers, Snap dumbbell racks and so on.

`isForeignBrandSku` (`/^(?:S(?!C)|F)/i`) now excludes them at the same chokepoint
as the obsolete rule, so listings, search, the sitemap and the product route all
inherit it. **SC is exempt by the negative lookahead**, which is what keeps the
Concept2 range.

Verified: those pages 404, the 3 C2 pages still 200, catalogue unchanged at 184,
Cardio 16, Strength 17. **Sitemap 429 → 283**, the drop being Snap/Fernwood URLs
no longer advertised.

### Watch out: THREE different codes for the same Concept2 products
- **Product name:** "C2 Rower Model D PM5 Black"
- **WooCommerce SKU:** `SCRWAR04` (no WooCommerce SKU starts with "C2")
- **Unleashed code:** `C2ROWERG` (Unleashed has 4: `C2BIKEERG`, `C2ROWERG`,
  `C2SKIERG`, `C2SKIERGFS`)

**FIXED 2026-08-20 (mapping confirmed by Michael).** The three had no
`unleashed-aliases` entry - the matcher could never have found them, since there
is no shared prefix and "Model D" vs "Row Erg with Standard Legs" is well under
the 0.80 name-similarity gate - so they fell back to the WooCommerce RRP and were
**underpriced**:

| product | was | now (ERP) | recovered |
|---|---|---|---|
| C2 Rower Model D PM5 Black | $1,375.00 | **$1,705.00** | +$330 |
| C2 Ski Erg PM5 | $1,320.00 | **$1,650.00** | +$330 |
| C2 Ski Erg Floor Stand | $352.00 | **$440.00** | +$88 |

Added as `manualAliases` in `unleashed-aliases.ts`, a **separate object merged
into `skuAliases`**, so regenerating the auto-generated block cannot silently
drop them. Verified on the product pages and the Cardio listing.

**Side effect worth knowing: all three flipped from "In stock" to "Made to
order."** Unleashed is the source of truth for stock once a SKU matches, and it
reports 0 available on the rower and -1 on both ski-erg lines. The old "In stock"
came from WooCommerce's own flag, which is stale (the same staleness the turf
showed). If the ergs really are held in stock, the fix is in Unleashed.

**`C2BIKEERG` (Bike Erg, $2,145 inc-GST) exists in the ERP with NO WooCommerce
product at all**, so the Bike Erg is missing from the site and cannot be mapped.
Add the product in WooCommerce first, then map it in `manualAliases`.

## Pre-launch test pass — run 2026-08-20 against staging

`LAUNCH.md` §3, run for the first time. **Passed on everything except four
items, listed below.**

**Passed:** catalogue pagination, sort (price asc/desc verified genuinely
ordered, name sorts), price filter, sub-category filter; Clearance crossed-out
RRP (19 markdowns, RRP/reduced pairs correct); variable "From" pricing
(`MWBBFUR` shows "From $90.00"); product gallery; **add to cart** (adds the
correct ERP price and the local mirrored image, header badge updates); cart page
line item, quantity, subtotal and the correct "confirmed on quote" freight copy;
`Product` + `BreadcrumbList` JSON-LD (385.00 AUD, InStock, parses clean); real
404 on an unknown route; favicon, `icon.svg`, OG image (49 KB PNG); `robots.txt`
correctly `Disallow: /`; all 12 marketing pages 200; all 4 legacy redirects 308
to the right place. **No console errors.** 18 requests, 248 KB, TTFB 20 ms,
DOMContentLoaded 639 ms.

### Found: 20 of 23 bundle products have NO PRICE

The `-GROUP` products are WooCommerce **bundles** (`type: "bundle"`), and 20 of
the 23 served have `regular_price: 0`, so they render **"Contact for pricing"**.
These are the primary listings for whole ranges: Rubber Hex Dumbbells, Coloured
Bumper Plates, Wall Ball, Dead Balls, Power Bag, Change Plates, Competition
Kettlebells and so on. `enrichCard` only special-cases `variable`, so a bundle
falls through to the WooCommerce parent price, which is zero. Either the bundles
need a price in WooCommerce, or the site needs to price a bundle from its
components. **Needs a decision.**

### Found: the same product listed twice, once priced and once not

`/equipment/weightlifting?sub=barbells` shows **"Urethane Fixed Barbells" twice**:
`MWBBFUR` (variable, "From $90.00") and `MWBBFUR-GROUP` (bundle, "Contact for
pricing"). Both are `visible` in WordPress, so the obsolete rule does not catch
them. 5 bundles have a priced twin: `MWBBFUR-GROUP`, `MMDBRH-GROUP`,
`MWWPCNB-GROUP`, `MMDEHG-GROUP`, `MWWPOU-GROUP`. The other four twins are
A-prefixed and sit in Clearance, so they only collide where categories overlap.

### Found: /cart and /checkout use the homepage title

Both render `MASTERKRAFT | Shop Home Gym & Commercial Fitness Equipment` instead
of "Cart" / "Checkout". They are client components with no metadata export, so
the fix is a small server wrapper or a segment layout. Cosmetic, but it is what
browser tabs, bookmarks and GA page reports will show.

### Confirmed live (both already known, both awaiting a decision)
- **Checkout still says "Shipping: Free"** while the cart says freight is quoted.
- **A Stripe card form is live on the `pk_test` key** - `CONTINUE TO PAYMENT`
  renders a Stripe iframe, so this is not quote-only as `LAUNCH.md` claimed.

### Not covered
**No visual mobile pass.** The browser pane dropped to a 0x0 viewport partway
through and would not render, so mobile was verified only structurally (viewport
meta correct, mobile menu button present in the DOM). A human should eyeball the
nav drawer, hero and product grid on a phone before launch, and Lighthouse has
still not been run.

## What the earlier sessions shipped (all live on staging)
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

## Shipped 2026-08-20 — product images mirrored locally, and the repo slimmed

**The cutover risk is closed. Nothing on the site loads an image from WordPress
any more**, verified: a category page went from 264 `wp-content` URLs to **zero**.

- `npm run mirror:images` (`scripts/mirror-product-images.mjs`) downloads every
  served product's images into `/public/product-images` and extends
  `product-image-overrides.json`, the mechanism the site already used for the 30
  colour-normalised `/product-bg` files. **374 files, 0 failures.** Idempotent;
  re-run when the catalogue gains products.
- **It fetches ONE AT A TIME on purpose.** The host refuses bursts: 20 parallel
  HEADs got 40 of 62 rejected, serial GETs return 206 in ~20ms. Do not turn that
  loop into a `Promise.all`.
- It never touches a SKU that already has an override, so the colour-normalised
  `/product-bg` images survive.
- A product is only claimed once ALL its images come down; a partial set is left
  remote rather than silently dropping gallery images.
- Overrides now cover **233 products / 419 files**, checked: 0 missing on disk,
  0 orphans.

**`npm run compress:assets` (`scripts/compress-assets.py`) then cut the weight:**

| | before | after | |
|---|---|---|---|
| product images | 86.9 MB | **24 MB** | 72% |
| manuals | 73.7 MB | **67.8 MB** | 8% |

The mirrored originals were near-lossless: one 1500x1030 photo was **4.33 MB**,
and re-encodes to ~90 KB at q88 with no visible difference (checked side by side
at 100% on fine white lettering, where JPEG artefacts show first). Dimensions are
kept, since Next's optimiser handles sizing.

**TWO TRAPS, both hit and both now guarded in the script:**
1. **NEVER use `doc.update_stream` to swap an image inside a PDF.** It replaces
   the bytes but leaves `/Filter` and `/ColorSpace` describing the OLD encoding,
   so a full-page image renders as a **BLACK PAGE**. That was written to disk
   here and only caught by rendering the result. Use `page.replace_image`.
2. **The first version was not idempotent** - a second run re-compressed the same
   files again, losing quality each time. The image threshold is now 20%, not 5%,
   so repeat runs converge. Verified: the second run changes nothing.

The script now renders every rewritten PDF and compares page brightness against
the original, discarding the rewrite if anything moved. All **54 manuals / 320
pages** render clean. The manuals only give 8% because the big owner's manuals
already store their images efficiently; the gain is concentrated in about 10
files (the rubber-tile guide halved, 3.69 MB → 1.84 MB).

`public/` is **112 MB** all up. If that ever needs to come down further, the
manuals are the remaining bulk and the honest options are dropping scan DPI
(quality cost) or hosting them outside the repo.

## Product images — the original exposure (now closed, kept for context)
- The site is **already headless WooCommerce**: it reads catalogue/price/stock via
  the WC REST API and does NOT use the old WordPress storefront. But **WooCommerce
  is a WordPress plugin** — product data + image files physically live in that one
  install (`wp-content/uploads`). You can't use "WooCommerce without WordPress";
  keep the install running as a hidden backend on a subdomain (`cms.`/`shop.`).
- **Exposure (live catalogue, 221 M/N products shown):** **191 (86%) load images
  from the WordPress backend** (`masterkraft.com/wp-content/…`, absolute URLs);
  **30** use local `/public/product-bg/` overrides; **0** have no image.
- **Cutover requirement** (else all 191 images break, same failure as the resources
  PDFs): move WordPress to a subdomain, set its **Site Address** to that subdomain
  (so WC emits subdomain image URLs), point `WC_STORE_URL` there, and add the
  subdomain to `remotePatterns` in `next.config.ts`.
- **DECISION PENDING — image mirror:** recommended to mirror all 191 images into
  `/public` (extend `product-image-overrides.json` via a `normalize-product-bg.py`
  variant) so images are immune to anything on the WordPress side while WC still
  drives live price/stock. Michael has NOT yet approved — next action to confirm.
  Michael's steer: keep WooCommerce running; don't migrate off it.

## Open / blocked (needs Michael/Steve or assets)
- ~~Site search broken for common terms~~ — **FIXED 2026-08-20**, see below.
- ~~Missing manual PDFs~~ — **DONE 2026-08-17**, see the Resources section above.
- **Home gym photos** — Michael is sending these through (2026-08-17).
- **REVL studio assets** — Michael is contacting each club directly. Per club we need:
  6-10 landscape photos of the fitted-out floor at full resolution (originals, not
  Instagram re-uploads), confirmation of trading suburb + street address, opening year
  and whether it was our original fit-out or a later refit, written OK to use the
  photos on masterkraft.com, and their current Instagram handle. Nice to have: floor
  area in sqm and any before/after shots. Drop photos into `/public/revl/ig/<slug>/`
  and wire via `IG_PHOTOS` in `revl.ts`.
- **FREIGHT CONTRADICTION (undecided, raised 2026-08-17).** The Stripe checkout
  summary hardcodes **"Shipping: Free"** (`StripeCheckout.tsx`, the Shipping row),
  but every other surface says freight is quoted: the cart says "Freight and lead
  times are confirmed on quote", the quote checkout says the same, and the Shipping
  page says "Freight is calculated by weight, volume and destination". So a card-
  paying customer is promised free freight on heavy goods. **Currently harmless only
  because Stripe is in test mode** - it goes live the moment card payments are turned
  on. Options put to Michael: (1) change the line to "Calculated on quote" - smallest
  safe fix, recommended regardless; (2) actually calculate freight by weight/volume/
  destination (net + gross weight already exist in WooCommerce for most products);
  (3) go quote-only and drop the card path, which removes the question. **No decision
  yet.**
- **Stripe is in TEST mode** but `paymentsConfigured` is on (publishable key present)
  → checkout would show a card form that rejects real cards. Decide: **quote-only**
  (remove Stripe keys) or **live** (swap to live keys + WC write key + verify the
  line-price override). See `LAUNCH.md`.
- **Form-delivery test** — HubSpot form GUIDs + Resend keys are server-side and
  unverified; needs a live test submission (Michael's go-ahead — it emails the team).
- **Domain / indexing cutover** (the big gate) — move the WordPress/WooCommerce
  backend to a subdomain, point the real domain at Vercel, then flip
  `NEXT_PUBLIC_ALLOW_INDEX=true` + set `NEXT_PUBLIC_SITE_URL`. Full steps in `LAUNCH.md`.
- **Product FEATURES data gap** — regenerated 2026-08-20 against what the site
  actually serves (221 products): **64 in the main catalogue + 27 in Clearance =
  91**. Concentrated in Equipment Storage 18, Body Weight 12, Packages 9,
  Barbells 8 = 47 of the 64. **0 products are missing an image** (all mirrored
  locally). Full list at `reports/wc-content-gaps.csv`, tagged `no_features` /
  `no_features_clearance`, with a `/product/<slug>` link per row have no `features_N_text`
  values in WooCommerce at all, so the Features section stays hidden on those pages.
  Content-entry task, not a bug. (Specs are no longer part of this gap — see the
  spec-blob fallback above. 2 products have neither specs source.) Concentrated in
  4 categories: Equipment Storage 18, Body Weight 12, Packages 9, Barbells 8 = 47 of
  the 64. **Full punch list committed at `reports/wc-content-gaps.csv`** (tagged
  `no_features` / `warranty_typo` / `no_specs`), regenerate anytime with the probe
  approach in that file's columns.
- **Warranty typos: rescanned 2026-08-20, the "exactly 2" was undercounted.**
  The doubled unit ("3 monthsmonths") appears on **12 published products, 5 of them
  served, 2 of them visible to customers**: `MBPB3I101` (3-In-1 Foam Plyometric Box
  34kg) and `MSCMDU01` (Functional Trainer Pro). Three more (`MSBMPL01`, `MSWBFW01`,
  `MSWBFW02`) carry it in the blob but render clean, because their **discrete
  Warranty field is correct and wins**. The rest sit on unserved S/R twins and the
  now-retired Glute Ham Bench.
  **The typo is NOT in the Warranty field** - for the two visible ones it lives in
  the legacy `specification_text` blob, which the site falls back to because their
  discrete Warranty field is empty. So the cheap content fix is to **type the correct
  warranty into the discrete field**, which overrides the blob; no need to edit
  legacy HTML. Still worth doing: the source data is wrong.
  **A second, wider shape turned up on 2026-08-20 while checking a C2 page:** the
  blob template appends "months" whether or not the value is written in months,
  so a warranty phrased differently comes back with a unit glued to its last WORD.
  "5 Years Frame, 2 Years Non-Wearable **Partsmonths**" was rendering on **4 more
  served products**: both C2 ergs, Air Rower Pro and Air Cycle Elite.
  `normalizeSpecUnits` in `woocommerce.ts` now strips a unit glued to a word and
  collapses a doubled one, as well as inserting the missing space in "12months".
  It only strips at the END and only after a letter, so a real "3 months" is never
  touched. Verified on all 6 affected pages.
- **Warranty typos in WooCommerce** — some warranty fields are malformed at source,
  e.g. the 34kg plyo box reads "Cover: 3 monthsmonths". Renders as entered; needs a
  pass over the warranty fields in WordPress.

## Env vars (verified against prod)
Set + working: `WC_*`, `UNLEASHED_*`, `NEXT_PUBLIC_GA_ID` (G-86MEH5QL99),
`NEXT_PUBLIC_HUBSPOT_PORTAL_ID`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (**pk_test**),
`NEXT_PUBLIC_SITE_URL` (=web.test.masterkraft.com). **Not set:**
`NEXT_PUBLIC_ALLOW_INDEX` (site is noindex — correct for staging). Server secrets
(HubSpot form GUIDs, Resend, Stripe secret, WC write) unverifiable without a test.

## Conventions
- **No em-dashes ("—") in copy.** Use commas / spaced hyphens " - ".
- **REVL** always uppercase. No public email address on the site.
- Server components by default; `'use client'` only when needed.
- Verify changes on staging after deploying — don't ask the client to check.
- Relevant memories: `reference_masterkraft_woocommerce`, `reference_masterkraft_brand`,
  `reference_masterkraft_revl_galleries`, `reference_masterkraft_deploy`.
