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
  **199 shown** (224 pass the brand filter, then 25 are dropped as obsolete, below).

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

**The rule: WooCommerce's `catalog_visibility` is the store's own "do not list
this" switch, and the site now honours it everywhere.** It did not before: the
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

**Unleashed is NOT the obsolescence source.** Its `Obsolete` flag exists on every
product but is **unused: 0 of 1092 records set it**, and `IsSellable=false` covers
only 4 non-products (an LCL handling fee, 3 REVL freight allowances), none of
which reach the site. If the ERP ever starts maintaining `Obsolete`, wiring it in
is a small change to `buildMap` in `unleashed.ts` plus one filter, and it would
give Steve a single lever in Unleashed instead of WordPress. Not built, because
dead code that filters nothing is worse than none.

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

## Product images — where they come from (+ the cutover risk)
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
- **SITE SEARCH IS BROKEN for common terms (found 2026-08-20, NOT yet fixed).**
  `/search?q=dumbbell` and `?q=barbell`, `?q=mat`, `?q=rig` all return **0
  products**, on staging today as well as locally, so this predates the obsolete
  rule. Cause: `searchProducts` asks WooCommerce for **one page of 24** results
  and applies the brand-SKU filter **afterwards**. The store holds a parallel
  S-prefixed range with identical names (`SMDBRH` alongside `MMDBRH`), WooCommerce
  ranks those first, so all 24 raw hits are filtered away and the page reports
  nothing. Terms that do return are also under-counting (kettlebell 8, bench 8).
  Fix options: fetch several pages before filtering, or push the brand filter into
  the WooCommerce query. Needs a decision, then a small change.
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
- **Product FEATURES data gap** — **64 of 224** brand-filtered products (some of
  which are now hidden as obsolete) have no `features_N_text`
  values in WooCommerce at all, so the Features section stays hidden on those pages.
  Content-entry task, not a bug. (Specs are no longer part of this gap — see the
  spec-blob fallback above. 2 products have neither specs source.) Concentrated in
  4 categories: Equipment Storage 18, Body Weight 12, Packages 9, Barbells 8 = 47 of
  the 64. **Full punch list committed at `reports/wc-content-gaps.csv`** (tagged
  `no_features` / `warranty_typo` / `no_specs`), regenerate anytime with the probe
  approach in that file's columns.
- **Warranty typos: exactly 2** (`MBPB3I101`, `MSCMDU01`) both reading "3 monthsmonths".
  The other 73 warranties written as "12months" need NO action - the spec parser adds
  the space automatically.
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
