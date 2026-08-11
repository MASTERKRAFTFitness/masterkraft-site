# MasterKraft Handoff (updated 10 Aug 2026)

## What this is
Headless **Next.js storefront** rebuild of masterkraft.com. Reads live products, prices and
stock from the existing **WooCommerce** store + **Unleashed** ERP. The site is built and the
shop is fully working and tested end to end. Launch is gated on a hosting cutover (Paul) and a
few client sign-offs.

- **Client:** MasterKraft (Steve, Gaetana). Billed via Part Time CMO. Web dev partner = eFront (Paul).
- **DNS:** Web Central (theconsole.webcentral.au, login GYM-116), NOT Cloudflare.

## Projects
- **Website:** `~/Desktop/masterkraft-site` — Next.js 16 / React 19 / App Router / TS / Tailwind v4, `src/` dir.
  - Staging: `web.test.masterkraft.com` (noindex). Dev server port **3100** (use the preview tools, never bash).
  - **Deploys via Vercel CLI:** `npx vercel deploy --prod --yes --scope masterkraft` (NOT git-triggered).
  - Repo: `MASTERKRAFTFitness/masterkraft-site`. Public alias: `masterkraft-site-pi.vercel.app`.
- **Partner portal:** `~/Desktop/snap-portal` — multi-tenant (Snap/Fernwood/demo/REVL), npm workspaces (`@mkp/core|data|ui`).
  - **Deploys via git push to main** (auto-deploys partner + franchisee). Repo: `MASTERKRAFTFitness/snap-portal`.
- Both repos are under the `MASTERKRAFTFitness` GitHub org. First push needed `git config http.postBuffer 524288000`.
- Default **Node runtime** on all routes (ignore CLAUDE.md text claiming `edge` — that's CareLocate's file). `timeout` is not installed on this Mac.

## Data / pricing gotcha
- Products, categories, orders come from the **WooCommerce REST API**.
- The WC `price` field is **distorted by the Wholesale Pro plugin** — do NOT trust it. Use **Unleashed**
  price (or `regular_price`) **× 1.1** for GST. Unmatched SKUs fall back to "contact for pricing".
- **The store adds 10% GST on top of submitted line totals.** Our `unitPrice` is GST-inclusive, so
  `createWooOrder` submits **ex-GST** line prices (`unitPrice / 1.1`) and lets WC re-add GST, so the
  order total equals the amount charged with a correct GST line. (Fixed 10 Aug; see below.)

## Done + verified this session (10 Aug)
- **Checkout works end to end** on staging (Stripe test keys + WC write): PaymentIntent → confirm
  (test card) → real WooCommerce order, for both simple AND variable products.
- **GST double-count bug FIXED** (`src/lib/woo-orders.ts`) — orders were recording totals 10% high;
  now ex-GST line prices. Verified order #490102 total $779.00 == charged.
- **Checkout hardening shipped** (the three old open items, now done): order idempotency (PI metadata
  `wc_order_id`), cart-lock + cart snapshot during payment, free-shipping/total-match guard, plus
  legible Stripe errors (no more blank 500s) and a fix for the post-payment confirmation screen
  unmounting when the cart clears.
- **Resend quote email LIVE:** `RESEND_API_KEY` + `QUOTE_FROM_EMAIL` (`quotes@masterkraft.com`) +
  `QUOTE_TO_EMAIL` (`steve@masterkraft.com`) set in Vercel; verified `email:"sent"`. Domain verified
  in Resend (SPF/DKIM/MX; DMARC still optional/open).
- **Portal SKU-prefix gating** shipped (`apps/partner/src/lib/data/index.ts`, `visibleTo`): snap → codes
  `S|N`, fernwood → `F|N`, demo/HQ unfiltered, REVL rule unchanged.
- **Repo pushed to GitHub** (was empty before). Docs added: `docs/launch-checklist.md`, `docs/go-live-runbook.md`.

## Key gotchas
- **Stripe: staging is on SANDBOX TEST keys** (`pk_test`/`sk_test`). MUST swap to live at go-live
  (runbook §3). A bad/typo'd secret key = blank 500 on `/api/payment-intent`. Env changes need a REDEPLOY.
- **Testing checkout without the flaky browser pane:** node script that pulls `pk_test` from the deployed
  `/_next/static/chunks/*.js`, POSTs `/api/payment-intent`, confirms the PI via Stripe API with
  `pm_card_visa`, POSTs `/api/order`, then reads the order back via WC REST. Each run makes a REAL WC
  order (test card, no money) to delete after. (Pattern reusable; WC/Unleashed creds in `.env.local`.)
- **Quote submissions create a pending WC order by design** (plus email + HubSpot). Not a bug.
- **Unleashed tiered pricing:** structure exists (10 tiers; **Tier8=REVL-FRAN, Tier9=REVL-HQ** map to
  portal tenants) but values just mirror the online price (no real discount entered). API exposes
  `SellPriceTier1..10 {Name,Value}`. Portal stays on "online − 10%" until real tier prices are populated,
  then wire portal to read Tier8/9.
- **Portal Fernwood is empty:** its ~52 F-prefixed products exist in Unleashed but aren't published to
  WooCommerce (portal reads WC); "N" prefix exists nowhere. Michael said leave as-is for now.

## Key files
- `src/lib/woo-orders.ts` — server repricing + `createWooOrder` (ex-GST line prices, idempotency guard)
- `src/app/api/{payment-intent,order,quote}/route.ts` — checkout + quote endpoints
- `src/components/shop/StripeCheckout.tsx` — checkout UI (cart snapshot + lock, confirmation via `onPaid`)
- `src/components/cart/CartProvider.tsx` — cart with `lock`/`unlock`
- `src/lib/unleashed.ts` — Unleashed price/stock map (HMAC auth; `SellPriceTier` fields available)
- `src/lib/site.ts` — `SITE_URL`, `ALLOW_INDEX` env gates
- `docs/launch-checklist.md` (status) / `docs/go-live-runbook.md` (ordered cutover)
- Portal: `apps/partner/src/lib/data/index.ts` — `visibleTo` tenant gating

## Env / config
- `NEXT_PUBLIC_SITE_URL` — canonical origin (set to real domain at launch)
- `NEXT_PUBLIC_ALLOW_INDEX` — must be `true` to allow indexing + real robots/sitemap. Currently OFF.
- `WC_STORE_URL`, `WC_CONSUMER_KEY/SECRET`, `WC_WRITE_ENABLED=true`; Stripe test keys; Resend vars; Unleashed keys — in `.env.local` / Vercel.

## Conventions / preferences
- **No em-dashes ("—") in copy.** Use commas, colons, or parens.
- **REVL always uppercase.** Banner images: crop people IN, not out.
- No public email address on the site ("Contact us" instead). Server components by default; `'use client'` only when needed.

## Blocked on others / launch gates
1. **Paul (the launch gate):** move WordPress/WooCommerce to a subdomain (e.g. `shop.masterkraft.com`)
   so the new site keeps reading live data → then update `WC_STORE_URL`. Draft email ready.
2. **Steve/Gaetana:** content + legal sign-off; confirm **ABN** (live Terms say `62 623 086 064`, the
   `84 659 220 274` given earlier is unconfirmed); confirm displayed pricing (`regular_price × 1.1`).
3. **Unleashed admin:** populate REVL (and other) tier prices → then flip portal to live tier pricing.
4. **Michael:** GA4 Measurement ID (`NEXT_PUBLIC_GA_ID`); optional DMARC record (`_dmarc` TXT `v=DMARC1; p=none;`) at Web Central.
5. **HubSpot:** add the production domain to allowed domains if inline embed of the delivery form is wanted.

## Immediate next actions (when inputs land)
- Paul confirms subdomain → set `WC_STORE_URL`, redeploy, verify reads still show live prices.
- Then run `docs/go-live-runbook.md`: swap Stripe live keys, flip `NEXT_PUBLIC_SITE_URL` + `NEXT_PUBLIC_ALLOW_INDEX=true`,
  add apex/www domains to Vercel + point DNS at Web Central, live checkout smoke test (real card + refund).

## Housekeeping
- Test orders **#490100–#490103** and HubSpot contact `quote-test@example.com` to delete (Michael handling).

## Billing rule (hard)
A **MasterKraft invoice lists MasterKraft work only** — never reference CareLocate or any other project on it.
