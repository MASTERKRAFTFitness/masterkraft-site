# MasterKraft site — Launch runbook

Status as of this doc: the site is **feature-complete and deployed to staging**
(`masterkraft-site-pi.vercel.app`) but **not yet live**. Everything below is
configuration / infrastructure / decisions — there is no outstanding app code.

Legend: ✅ done · ⚙️ set an env var in Vercel · 🌐 DNS/infra · 🧠 decision · 🔎 verify

---

## 1. Environment variables (Vercel → Project → Settings → Environment Variables)

The app reads everything from env vars and **degrades gracefully** when one is
missing (forms still say "thanks", analytics simply don't load, etc.), so a
missing var fails **silently** — that's why each must be checked deliberately.

> After changing any `NEXT_PUBLIC_*` var you must **redeploy** (those are baked in
> at build time). Server-only vars take effect on the next request.

### Already set (confirmed working on staging)
- ✅ `WC_STORE_URL`, `WC_CONSUMER_KEY`, `WC_CONSUMER_SECRET` — reads the catalogue.
- ✅ `UNLEASHED_API_ID`, `UNLEASHED_API_KEY` — correct pricing/stock.

### Must set before launch
- ⚙️ `NEXT_PUBLIC_ALLOW_INDEX=true` — **the site is `noindex` right now** (robots.txt
  `Disallow: /` + `<meta robots=noindex>`). Nothing gets into Google until this is
  `true`. Set it **only on the production/real domain**, never on the `-pi.vercel.app`
  preview, so the staging copy stays out of the index.
- ⚙️ `NEXT_PUBLIC_SITE_URL=https://<real-domain>` — canonical URLs, sitemap, OG tags
  currently default to the staging URL (`src/lib/site.ts`). Point it at the launch
  domain or every canonical/share link is wrong.
- ⚙️ `NEXT_PUBLIC_GA_ID` — **already set (G-86MEH5QL99) and working on staging.**
  GA4 loads after cookie consent. Re-check it is present on the production domain
  after the cutover, since a redeploy is what bakes it in.

### Forms — verify these are set (enquiries are the point of the site) 🔎
The enquiry/quote/newsletter forms post to HubSpot (server-side) and email via
Resend. If the vars below are absent the submission is accepted but **goes nowhere**.
- 🔎 `HUBSPOT_PORTAL_ID` + `HUBSPOT_FORM_CONTACT`, `HUBSPOT_FORM_QUOTE`,
  `HUBSPOT_FORM_NEWSLETTER` — the portal id + a Form GUID per form (HubSpot →
  Marketing → Forms → each form's embed/share code).
- 🔎 `NEXT_PUBLIC_HUBSPOT_PORTAL_ID` — loads HubSpot's tracking script after consent.
- 🔎 `NEXT_PUBLIC_HUBSPOT_FORM_DELIVERY` — the delivery-page form.
- 🔎 `RESEND_API_KEY`, `QUOTE_FROM_EMAIL` (a verified Resend sender), `QUOTE_TO_EMAIL`
  (defaults to `hello@masterkraft.com`) — the team-notification email on a quote.

**Verification:** submit one real test enquiry + one quote on the live URL and
confirm (a) the email lands and (b) a HubSpot contact/submission appears. (This
creates a real contact + email, so do it deliberately as the final check.)

### Card checkout — only if launching with payments 🧠
**Correction (2026-08-20): checkout is NOT quote-only as configured.**
`paymentsConfigured` in `src/lib/stripe-client.ts` is simply "a publishable key is
present", and staging has a **`pk_test`** key set, so the card form shows and would
reject real cards. To launch quote-only, **remove the Stripe keys**. To enable live
card payment you need all of:
- 🧠 decision to go live with payments now vs. later.
- ⚙️ `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY` — from the store's
  Stripe account.
- ⚙️ a **write-capable** WooCommerce key + `WC_WRITE_ENABLED=true`.
- 🔎 verify WooCommerce honours the explicit line prices we send (its own `price`
  field is broken by the wholesale plugin) **and** that a REST-created *paid* order
  still triggers the existing WooCommerce → Unleashed sync. Test script exists at
  `scratchpad/verify-price-override.mjs`.

---

## 1b. Freight (Interparcel) ⚙️🔎🧠

Live freight quoting is BUILT but not switched on. It turns on when these are set:

- ⚙️ `INTERPARCEL_API_KEY` — from Steve's Interparcel account.
- ⚙️ `FREIGHT_COLLECTION_CITY`, `FREIGHT_COLLECTION_POSTCODE`,
  `FREIGHT_COLLECTION_STATE` — the despatch warehouse. **Still unknown.** Without
  it no quote can be requested.
- ⚙️ `FREIGHT_MARGIN_PERCENT` — handling margin. **Defaults to 15** (Michael,
  2026-08-20); set it only to change that.

**Until they are set the checkout says "Calculated on quote" and charges goods
only. It never says "Free".** Once set, freight is quoted server-side, added to
the Stripe charge, and a cart that cannot be quoted is pushed to the quote flow
rather than charged with an unknown delivery cost.

- 🔎 **VERIFY GST HANDLING ON THE FIRST REAL QUOTE.** `taxable: true` in their
  response is read as "GST is NOT included", so GST is added for display. That
  matches every other price on the site being GST-inclusive. **If it is actually
  the other way round we undercharge freight by 10%.** Untestable without a key.
- 🔎 **33 products have no carton dimensions**, including all 3 Concept2 ergs,
  and **bundles have none at all**. Any cart containing one cannot be quoted and
  goes to the quote flow. Fixing the source data widens coverage from 85%.
- 🧠 **Service choice is not built.** The server picks the cheapest and also
  returns the fastest, but letting the customer switch needs an
  address → options → payment step. Decide once real rates exist.
- 🧠 Interparcel want **10-20 example shipments** before quoting rates.

## 2. Domain / DNS cutover 🌐🧠 (needs Steve — the biggest item)

The new site currently **reads the catalogue from `masterkraft.com`'s
WooCommerce** while itself living on Vercel. The WordPress/WooCommerce backend and
the new Next.js front-end can't both own `masterkraft.com`. Options:

- **A (recommended): move the store backend to a subdomain.** Point
  `masterkraft.com` (+ `www`) at Vercel; move WordPress/WooCommerce to e.g.
  `store.masterkraft.com`; update `WC_STORE_URL` to the new subdomain; keep the WC
  REST + Store API reachable there. Requires host/DNS work + re-check the API keys
  and any WooCommerce email/order flows still function on the new hostname.
- **B: launch on a subdomain** (e.g. `shop.` or `new.`) and leave the WordPress
  site on the apex for now — lower risk, but two front-ends.

Whichever: add the domain in Vercel, set the DNS records Vercel provides, confirm
HTTPS, then flip `NEXT_PUBLIC_ALLOW_INDEX` + `NEXT_PUBLIC_SITE_URL` for that domain
and redeploy.

---

## 3. Pre-launch test pass (on the real domain, indexing still off) 🔎
- [ ] Catalogue: categories, search, filters, sort, pagination, a variable product's
      "From" price, a clearance item's crossed-out price.
- [ ] Product page: gallery/zoom, add-to-cart, cart drawer, mini-cart totals.
- [ ] Checkout quote flow → email + HubSpot land (see §1 verification).
- [ ] Contact + newsletter forms → land.
- [ ] Mobile pass (nav drawer, hero, product grid, forms).
- [ ] 404 / error pages, favicon, OG share preview (paste a URL into Slack/LinkedIn).
- [ ] Lighthouse quick check (perf/SEO/a11y).

## 4. Go-live sequence
1. Domain added + DNS live + HTTPS green (§2).
2. All env vars set for the production domain (§1).
3. Redeploy (so `NEXT_PUBLIC_*` bake in).
4. Test pass green (§3).
5. Flip `NEXT_PUBLIC_ALLOW_INDEX=true`, redeploy.
6. Submit sitemap in Google Search Console; confirm `robots.txt` now allows crawl.
7. Watch GA realtime + first form submissions.

---

## Who owns what
- **Michael / dev:** env vars, redeploys, test pass, sitemap submit.
- **Steve / host:** domain + DNS + WordPress-backend move decision (§2).
- **Decisions needed:** card checkout now or later (§1); domain option A vs B (§2).
