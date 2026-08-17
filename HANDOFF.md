# MasterKraft website — handover (2026-08-17)

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
  committed + pushed (last commit `9d46386`).

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
  products, suspect this filter first.** Catalogue is 512 products → **224 shown**.

## Shipped 2026-08-17 (feedback round 3) — NOT yet deployed
Committed locally; run `npx vercel --prod` to put these on staging.

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
- **Accent recoloured** to crimson `#f7373a` (see Brand / design below).
- Fixed "Request **a** Adelaide fit-out" (vowel cities).

## What the earlier session shipped (all live on staging)
**Brand / design**
- **Accent = solid crimson red** `#f7373a` (`-600 #c52b28` button fills / AA white text
  5.6:1, `-300 #fe706b` on dark 7.3:1). One token trio in `src/app/globals.css`.
  History: magenta → blue → magenta+Hot Gradient → coral red `#f94d3f` →
  **crimson `#f7373a`** (2026-08-17, the RGB midpoint of `#FF6900` and `#EF0474`).
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
  (`ResourcesList.tsx`) listing each manual. **BUT** 24 of the old site's 27 manual
  PDFs are 404 (files gone from WordPress — confirmed in a browser). Page currently
  shows only the **3 that resolve** (both flooring guides + Curved Treadmill Pro
  assembly), hosted locally. `src/lib/resource-docs.json` drives it. **Re-add
  products when the real PDFs are supplied** (structure is ready).

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
- **Missing manual PDFs** — 22 equipment manuals need re-uploading (or send to
  Claude to host locally). Then re-populate `resource-docs.json`.
- **Home gym photos** — Michael is sending these through (2026-08-17).
- **REVL studio assets** — Michael is contacting each club directly. Per club we need:
  6-10 landscape photos of the fitted-out floor at full resolution (originals, not
  Instagram re-uploads), confirmation of trading suburb + street address, opening year
  and whether it was our original fit-out or a later refit, written OK to use the
  photos on masterkraft.com, and their current Instagram handle. Nice to have: floor
  area in sqm and any before/after shots. Drop photos into `/public/revl/ig/<slug>/`
  and wire via `IG_PHOTOS` in `revl.ts`.
- **Stripe is in TEST mode** but `paymentsConfigured` is on (publishable key present)
  → checkout would show a card form that rejects real cards. Decide: **quote-only**
  (remove Stripe keys) or **live** (swap to live keys + WC write key + verify the
  line-price override). See `LAUNCH.md`.
- **Form-delivery test** — HubSpot form GUIDs + Resend keys are server-side and
  unverified; needs a live test submission (Michael's go-ahead — it emails the team).
- **Domain / indexing cutover** (the big gate) — move the WordPress/WooCommerce
  backend to a subdomain, point the real domain at Vercel, then flip
  `NEXT_PUBLIC_ALLOW_INDEX=true` + set `NEXT_PUBLIC_SITE_URL`. Full steps in `LAUNCH.md`.
- **Product FEATURES data gap** — **64 of 224** products have no `features_N_text`
  values in WooCommerce at all, so the Features section stays hidden on those pages.
  Content-entry task, not a bug. (Specs are no longer part of this gap — see the
  spec-blob fallback below. 2 products have neither specs source.)
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
