# MasterKraft website — handover (2026-08-13)

New Next.js e-commerce site for masterkraft.com. This handoff covers the current
state after a large client-feedback round. For the original go-live plan see
`docs/launch-checklist.md` and `docs/go-live-runbook.md` (still valid).

## Repo / environments
- Code: `~/Desktop/masterkraft-site`. Next.js 16 (App Router, Turbopack), TS,
  Tailwind, headless WooCommerce + Unleashed.
- Dev server: `npm run dev` on **:3100** (or use the preview tools).
- **Review/staging URL: https://masterkraft-site-pi.vercel.app** (noindex; the
  real domain isn't pointed at Vercel yet — that's the Paul gate below).
- GitHub: `MASTERKRAFTFitness/masterkraft-site`, branch `main`. All work below is
  committed + pushed (last commit `6737d80`).

## DEPLOY — read this first
- **A git push does NOT deploy.** Deploy with the Vercel CLI from the project dir:
  ```bash
  npx --yes vercel@latest deploy --prod --yes
  ```
  It's authed on this machine as **marketing-8481**; project is linked via
  `.vercel/project.json`. Build ~1 min. Serves on `masterkraft-site-pi.vercel.app`.
- It also assigns the alias `staging.masterkraft.com`, but that DNS is **not set
  up (NXDOMAIN)** — always share the `masterkraft-site-pi.vercel.app` URL.
- `NEXT_PUBLIC_*` env vars are **build-time inlined** — changing them in Vercel
  does nothing until a redeploy. To confirm one landed, grep the deployed client
  chunks for the literal value.

## What was shipped this round (all live on the staging URL)
**Products / equipment**
- **M/N SKU filter** catalogue-wide (only MasterKraft's own products show; 512 →
  221). Helpers in `src/lib/woocommerce.ts` (`filterBrandSku`). Category pages
  full-fetch + filter so counts stay right.
- **Product code (SKU)** shown on product pages + cards.
- **Full Overview + Specifications** on product pages, from WooCommerce **ACF
  meta** (`parseProductDetail` in woocommerce.ts): `product_overview_description`,
  `features_N_text`, and discrete specs (assembled size, colour, material,
  warranty, weights, packing size).
- **All Equipment → all products** landing (`getAllProducts`) with category
  dropdown, sort, pagination. **Grid/list view toggle** (`ProductListing.tsx`).
- Sub-categories **alphabetical**; **brand loading spinner** (see below).
- **Product tiles = `#e6e6e6`** to match the product photos' own grey background
  (the exact grey was sampled from the M-prefix photos).
- **Category SEO copy**: each category page renders its WooCommerce category
  `description` below the grid under an "About <category>" heading
  (`getCategoryDescription`). OPEN DECISION: client may also want a short intro
  line up in the hero banner (old-site style) — not done yet.

**Nav / home**
- Removed "Clearance" from the top menu; Equipment dropdown reordered
  (All Equipment, alphabetical, Clearance last in pink).
- "Whole" stat → "Complete". **FeatureBlock band reversed out to white.**
- **Stat count-up** on scroll (`CountUp.tsx`). **"Thinking" cursor** + brand
  spinner on navigation (`NavProgress.tsx` + `BrandSpinner.tsx`, uses
  `/brand/logo-circle.svg` + `.mk-spin`). NOTE: both the count-up and the nav
  spinner only animate in a real browser (the headless preview pane runs the tab
  as "hidden", which pauses rAF/short timers) — verify them by eye on staging.
- **Category images** replaced with the real ones from the WC category `image`
  field (fixed weightlifting/flooring/packages/clearance duplicates).

**Content**
- **Finance + Distributor**: full old-site copy ported (scraped the live pages;
  WP REST is 401). Finance copy lives in `src/lib/content-pages.ts`; Distributor
  copy is inline in `src/app/distributor/page.tsx`.
- **Resources**: thumbnail image beside each doc.
- **Schools & University** fitout hero: generic school-gym stock photo
  (Unsplash, free commercial licence) at `public/fitout/school-gym.jpg`.

**REVL page (`/revl-fitouts`)**
- **Featured Studios = 10**, covering every AU state (NSW: Bondi, Campbelltown;
  QLD: Burleigh; SA: Brighton; VIC: Collingwood) and every operating country
  (Singapore: City Hall + Lower Pierce; Malaysia: KL; Vietnam: HCMC; Taiwan:
  Taipei). Each has an image + detail-page copy. Data in `src/lib/revl.ts`
  (`revlSites`). Brighton's state fixed (was wrongly VIC → SA).
- **Global Network** section: all 8 markets grouped by country (47 named
  studios); Korea/Canada/Indonesia + **United States** shown "Coming soon";
  **Dubai excluded** per client (`revlNetwork`).
- **10 REVL photos** in `public/revl/gallery/` scraped from REVL's own sites
  (under MK's collateral agreement with REVL). **City Hall + Lower Pierce are the
  actual SG studios; the rest are representative REVL fit-out photos** (REVL
  doesn't publish a unique photo per studio). Swap in exact photos if the client
  provides them. The `revlGallery` export is now unused (the standalone gallery
  was consolidated into the featured grid).
- Home "Powered by MasterKraft" copy → "fitted out REVL Training studios around
  the world, including Australia, Singapore, Malaysia, Vietnam and Taiwan".
- **GA4** is live (`NEXT_PUBLIC_GA_ID=G-86MEH5QL99`, Production).

## How data flows (useful for future edits)
- Product/category data: WooCommerce REST (`src/lib/woocommerce.ts`), creds in
  `.env.local` (`WC_STORE_URL`, `WC_CONSUMER_KEY/SECRET`). Prices are distorted by
  a wholesale plugin — always derive from `regular_price × 1.1` (GST), not `price`.
- Unleashed = price/stock (`src/lib/unleashed.ts`).
- Handy probes in the session scratchpad pattern: WC category `image` +
  `description`, product `meta_data` ACF, and REVL image scraping = fetch a
  page's raw HTML in the in-app browser and regex `wp-content/uploads/...(jpe?g|png)`
  (REVL sites lazy-load, so the DOM only has SVG placeholders — the raw HTML has
  the real URLs).

## Email drafts ready to send
- `docs/email-paul-subdomain.md` — the WooCommerce-to-subdomain ask (the go-live
  gate).
- `docs/email-steve-gaetana-update.md` — client update on the feedback round
  (drop in the `masterkraft-site-pi.vercel.app` link before sending).

## Open / blocked (needs client input or assets)
- **Paul (go-live gate):** move WooCommerce to a subdomain (e.g. shop.), then set
  `WC_STORE_URL` + redeploy. Everything else in go-live waits on this.
- **Stripe:** still on test keys — swap to live at go-live (`docs/go-live-runbook.md`).
- **REVL:** exact per-studio photos if they want them; the coming-soon markets'
  named studios when they open.
- **Fitouts content:** K2 Max Northcote, international list edits, better Fernwood
  images, Elite Sport/PT/School examples. **Home-gym photos coming from Steve.**
- **Bold hero images** for the Equipment/Clearance/Fitouts/Resources/Our Story/
  Contact landing pages.
- **Decisions:** logo size ("should it be larger?"), USP duplication (hero vs
  "Why operators choose MK"), category copy hero-intro (see above).
- **Confirmations:** ABN (live Terms say `62 623 086 064`), displayed pricing
  (regular_price × 1.1).
- **HubSpot:** newsletter form GUID is empty; confirm server HubSpot env vars are
  on Vercel Production. **DMARC** record (optional, better before bulk email).

## Conventions
- **No em-dashes ("—") in copy.** Use commas / spaced hyphens " - ".
- **REVL** always uppercase. No public email address on the site.
- Server components by default; `'use client'` only when needed.
- Verify changes on the staging URL after deploying — don't ask the client to check.
