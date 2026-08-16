# MasterKraft website — handover (2026-08-14)

New Next.js e-commerce site for masterkraft.com (headless WooCommerce + Unleashed).
This handoff reflects the state after a large second feedback round. **Launch
gates + env vars live in `LAUNCH.md` — read that before any go-live work.**

## Repo / environments
- Code: `~/Desktop/masterkraft-site`. Next.js 16 (App Router, Turbopack), TS, Tailwind.
- Dev server: use the preview tools, or `npm run dev` (defaults to :3100). Note a
  Fernwood portal sometimes squats :3100 — run on another port (e.g. `-p 3102`).
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
- **M/N SKU filter** (`filterBrandSku`, `/^[MN]/i`): only MasterKraft's own products
  show catalogue-wide. **Clearance opts out** (A-prefixed SKUs) via
  `getAllProductsByCategory(id, { brandFilter: false })`. **If a category shows 0
  products, suspect this filter first.**

## What this session shipped (all live on staging)
**Brand / design**
- **Accent = solid coral red** `#f94d3f` (`-600 #cf3a28` button fills / AA white text,
  `-300 #ff8574` on dark). One token trio in `src/app/globals.css`. History this
  session: magenta → blue → magenta+Hot Gradient → **coral red** (gradient removed).
  To recolour the whole site, change those 3 vars + OG image + Stripe colorPrimary.

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
- **Stripe is in TEST mode** but `paymentsConfigured` is on (publishable key present)
  → checkout would show a card form that rejects real cards. Decide: **quote-only**
  (remove Stripe keys) or **live** (swap to live keys + WC write key + verify the
  line-price override). See `LAUNCH.md`.
- **Form-delivery test** — HubSpot form GUIDs + Resend keys are server-side and
  unverified; needs a live test submission (Michael's go-ahead — it emails the team).
- **Domain / indexing cutover** (the big gate) — move the WordPress/WooCommerce
  backend to a subdomain, point the real domain at Vercel, then flip
  `NEXT_PUBLIC_ALLOW_INDEX=true` + set `NEXT_PUBLIC_SITE_URL`. Full steps in `LAUNCH.md`.
- **Product features/specs data gap** — 57% of products have full ACF
  overview/features/specs; the rest are missing fields in WooCommerce (content task,
  not a bug). Can export the missing list on request.

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
