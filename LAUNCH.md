# MasterKraft site — Launch runbook

Status as of this doc: the site is **feature-complete and deployed to staging**
(`masterkraft-site-pi.vercel.app`) but **not yet live**. Everything below is
configuration / infrastructure / decisions — there is no outstanding app code.

Legend: ✅ done · ⚙️ set an env var in Vercel · 🌐 DNS/infra · 🧠 decision · 🔎 verify

---

## 0. State as of 2026-08-24

Everything that could be finished without the domain switchover has been.

**Working and verified on the deployed site:**
- Australia Post freight, end to end. A 2-mat cart quotes goods $50 + freight
  $36.80 = $86.80 and renders "Australia Post Parcel Post" in the checkout summary.
  A 250kg machine correctly routes to the quote flow.
- Card checkout repricing. **It was broken.** The WooCommerce credentials in Vercel
  were dead, so `getProductById` returned null for every product and payment-intent
  answered "We couldn't price one or more items". Product pages hid it completely,
  because they serve the committed snapshot and only checkout reads live
  WooCommerce. Credentials replaced 2026-08-24.
- All 64 content pages and a 57-product sample return 200. Sitemap product count
  (283) matches the servable set exactly. No console errors. Mobile pass clean.

**Blockers, all waiting on the domain (§2):**
1. ⚙️ **Stripe is in TEST mode.** `pk_test` is baked into the deployed bundle, so
   the card form renders and every real card would be declined.
2. ⚙️ `NEXT_PUBLIC_SITE_URL` is `https://web.test.masterkraft.com`, so every
   canonical, sitemap entry and share link points at a test subdomain.
3. ⚙️ `NEXT_PUBLIC_ALLOW_INDEX` is **not set at all**, so `robots.txt` is
   `Disallow: /`.

**Small, not blocked:**
- ⚙️ `HUBSPOT_FORM_NEWSLETTER` has never existed. The form must be created in
  HubSpot. Signups are no longer lost in the meantime: the route now emails them
  through Resend when HubSpot cannot take them.
- ⚙️ **Preview** still holds the dead WooCommerce credentials, all four 24 days old.
- 🔎 **One real paid order** to confirm the new `flat_rate` shipping line still
  syncs Woo → Unleashed. Doable today in Stripe test mode, and worth doing before
  live keys go anywhere near it.
- 🧠 **Klarna and Zip are enabled** on the Stripe account and appear at checkout
  alongside Card. Deliberate or not, decide before launch: this catalogue runs to
  $30k rigs.
- ⚙️ Not yet deployed: the newsletter fallback and the checkout copy fix. Both are
  committed and pushed but need `npx vercel --prod`.

---

## 1. Environment variables (Vercel → Project → Settings → Environment Variables)

The app reads everything from env vars and **degrades gracefully** when one is
missing (forms still say "thanks", analytics simply don't load, etc.), so a
missing var fails **silently** — that's why each must be checked deliberately.

> **After changing ANY env var you must redeploy.** Vercel applies environment
> variables to *new* deployments only, so neither `NEXT_PUBLIC_*` (baked in at build
> time) nor server-only vars reach the running production build until you redeploy.
> An earlier version of this doc said server-only vars took effect on the next
> request. They do not, and believing that is a good way to conclude an integration
> is broken when it simply has not been deployed yet.

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

## 1b. Freight (two carriers, priced against each other) ⚙️🔎🧠

**Australia Post and Easyship are now BOTH asked on every quote, in parallel, and
the cheapest wins** (added 2026-09-05, `src/lib/freight.ts`). They win opposite
ends of the catalogue, so neither is redundant — see `docs/easyship-evaluation.md`
for the measurements. Freight turns on when:

- ✅ `AUSPOST_API_KEY` — from the MasterKraft Australia Post account. Set in
  `.env.local` and in Vercel Production; verified live 2026-08-25.
- ⚙️ `EASYSHIP_API_TOKEN` — the production access token from the Easyship
  dashboard, API & Webhooks, integration "MASTERKRAFT Website". **Not yet set in
  `.env.local` or in Vercel.** Until it is, the router runs Australia Post alone
  and every bulky cart still says "Calculated on quote".
- ✅ `FREIGHT_COLLECTION_POSTCODE=3074` (Thomastown VIC) — the despatch warehouse.
- ⚙️ `FREIGHT_COLLECTION_LINE1` — street line of the despatch warehouse
  (`8/337-339 Settlement Rd`). Australia Post ignores it; **Easyship requires a
  street on both ends** and falls back to a placeholder without it.
- ⚙️ `FREIGHT_MARGIN_PERCENT` — handling margin, applied to BOTH carriers.
  **Defaults to 15** (Michael, 2026-08-20); set it only to change that.
- ⚙️ `EASYSHIP_PRICES_INCLUDE_GST` — defaults to `true`, which matches what the
  Easyship dashboard shows. Same trap as its Australia Post twin: wrong in the
  other direction undercharges every freight-bearing order by 10%.

**ONE CARRIER IS ENOUGH TO QUOTE.** A carrier that is unconfigured or broken is
dropped and the other still answers. Only an empty pool falls back to "Calculated
on quote" — and it never says "Free".

**Verify with `npm run check:carriers`**, which quotes three real carts through
the actual router and prints which carrier won each. `npm run report:carriers`
prices the two separately across all six lanes and tests rate stability.

### Quotes are cached, and that is load-bearing

`src/lib/freight-cache.ts` sits in front of both carriers, keyed on the cartons,
the destination, the margin and the GST flags.

- ⚙️ `FREIGHT_CACHE_TTL_SECONDS` — successful quotes. **Defaults to 900** (15
  minutes: longer than a checkout, far shorter than a rate card). `0` disables.
- ⚙️ `FREIGHT_CACHE_ERROR_TTL_SECONDS` — failures. **Defaults to 60**, so a
  carrier that is down or over quota is not re-asked on every keystroke.

**It is not only a cost control.** The checkout quotes to DISPLAY and
payment-intent quotes again to CHARGE; serving both from one cached answer means
the two cannot disagree, which removes the "rate drifted between the quote and
the charge" failure that refuses an order after the card is captured.

It is in-memory and therefore per-lambda on Vercel. The display-then-charge pair
usually lands on the same warm instance; a cold start misses and costs what it
costs today.

### A carrier that stops answering now says so

`src/lib/freight-alert.ts`. The router fails soft, so a dead carrier is invisible
from the outside — which is how an exhausted Easyship allowance went unnoticed
for an afternoon on 2026-09-05. Every carrier failure is now logged as
`[freight] <carrier> failed (<kind>): <detail>`, and the two kinds that do NOT
fix themselves — an exhausted quota and a rejected credential — also send one
email. A network blip stays quiet, because a false alarm at 2am costs more trust
than it buys.

- ⚙️ `FREIGHT_ALERT_EMAIL` — who to tell. Falls back to `QUOTE_TO_EMAIL`.
  Needs `RESEND_API_KEY` and `QUOTE_FROM_EMAIL`, both already set.
- ⚙️ `FREIGHT_ALERT_COOLDOWN_MINUTES` — **defaults to 360** (6 hours), so a busy
  checkout sends one mail per problem rather than one per request.

Alerting is fire-and-forget and swallows its own errors: it can never slow down
or break a checkout.

### ⚠️ The Easyship trial allowance is already exhausted

**Every Easyship call currently returns `403 usage_limit`.** It took ~90 calls on
2026-09-05, all of it building and testing, not real traffic. The account is a
free Plus trial with no payment method, expiring in 13 days, with zero shipments.

Nothing is broken by this — the router fails soft and Australia Post answers
alone — but **the bulky half of the catalogue is back on "Calculated on quote"
until the allowance resets or the plan is upgraded**, and nothing surfaces the
403 to anyone. Read `docs/easyship-evaluation.md` before this carries real
orders, and add an alert on Easyship 403s.

### 🧠 Decision, Michael 2026-08-24: heavy carts go to the quote flow

Once the key is set, a cart Australia Post cannot carry is **not** charged for goods
with freight invoiced later. It is pushed to the quote flow, the same way an item
priced on application already is. Nobody is charged with an unknown delivery cost.

**This is what `EASYSHIP_API_TOKEN` changes.** With Australia Post alone, every
rack, machine and rig is unbuyable by card — 107 of 186 measured products, moved
from "add to cart" to "request a quote". Easyship prices that whole segment
(verified to 601kg and 268cm), so setting the token moves them back the other way.
Decide deliberately: that is a lot of catalogue becoming card-buyable at a freight
price nobody has yet checked against a real invoice.

The rejection message now explains itself per reason, so a Sydney customer buying a
250kg machine is told it ships as freight, not that their address failed.

### 🧠 Australia Post can only price a third of the catalogue

This is a property of the carrier, not a gap in the build. PAC prices **parcels**,
capped at 22kg, 105cm on the longest side and 0.25m³. Measured against the served
catalogue on 2026-08-24:

| | count |
|---|---:|
| listed products | 338 |
| with usable carton data | 246 |
| **inside AusPost parcel limits** | **111** |
| over 22kg | 96 |
| over 105cm | 109 |

Racks, rigs, machines and benches are pallet freight. The adapter checks the limits
**before** calling the API and sends anything over them to the quote flow, so the
customer gets "Calculated on quote" rather than a carrier error. **A second carrier
is still needed for the heavy two-thirds** (the Shipping page already names
Mainfreight and Freight Exchange for exactly this).

- 🔎 **VERIFY GST ON THE FIRST REAL QUOTE.** `npm run check:auspost` prints the
  carrier's raw figure next to what we would charge. AusPost publish GST-inclusive
  retail prices, so the code does NOT add GST. Cross-check one raw figure against
  the published rate on auspost.com.au. If raw is about 9% lower than published,
  set `AUSPOST_PRICES_INCLUDE_GST=false`, or freight undercharges by 10%.
- 🔎 **92 of 338 listed products have no usable carton data** (55 have neither
  weight nor dimensions, 37 have a weight but no dimensions), including all three
  Concept2 ergs. Those go to the quote flow. Fixing them in WooCommerce widens
  coverage.
- 🔎 `ABPBSB04` is recorded as 850 x 1000 x 305cm, almost certainly millimetres in a
  centimetre field. Fix in WooCommerce.

---

## 1c. Heavy freight (StarTrack) — NOT in the launch scope 🧠

**Decision, Michael 2026-08-24: launch without it.** Australia Post parcel freight
prices the small third of the catalogue. Everything heavier goes to the quote flow,
which is where it went before any of this existed. This section is the ask for
Steve, for after launch.

### Why the Australia Post key does not cover it

Verified against the live API and against Australia Post's own documentation on
2026-08-24:

- The Postage Assessment Calculator returns exactly two service codes for any legal
  parcel: `AUS_PARCEL_EXPRESS` and `AUS_PARCEL_REGULAR`. No StarTrack, at any size.
- Over-limit cartons are refused outright, not priced. Real responses: *"The maximum
  weight of a parcel is 22 kg."* and *"The length cannot exceed 105cm."*
- `POST /shipping/v1/prices/items`, the endpoint that carries StarTrack products,
  returns **401** for our key. It uses Basic auth plus an `Account-Number` header,
  not `AUTH-KEY`.
- Australia Post's own APIs page says of the calculator: *"To calculate contract
  rates, use the Shipping and Tracking API instead."*

**PAC returns RETAIL rates.** If MasterKraft holds any negotiated Australia Post
rate, the customer is being quoted above our own cost before the 15% handling margin
is added. Worth checking one real invoice against `npm run check:auspost`.

### What Steve needs to obtain

1. **A StarTrack billing account number.** MasterKraft may already have one, given
   the Shipping page names StarTrack's sibling carriers for palletised freight.
2. **Registration for the Shipping and Tracking API** at
   developers.auspost.com.au/apis. That page has an **"Add an account to your
   existing API key"** flow, so this may attach to the key we already hold rather
   than needing a fresh integration.
3. **Credentials:** username, password and account number. Basic auth, not `AUTH-KEY`.
4. **Testbed access first**, so the integration can be built and tested without
   creating live consignments.

Note: Delivery Choices requires meeting eParcel contract minimums, and the same
commercial threshold may apply here. That is a contract question, not a technical one.

### What it costs us once those exist

About a day. `src/lib/freight.ts` normalises every carrier into one `FreightOption[]`,
so StarTrack is a second transport function feeding the same shape: quote both, offer
whichever can actually carry the consignment. The account is the long pole, not the code.

---

## 1d. Easier options for the heavy two-thirds 🧠

StarTrack (§1c) needs a billing account and possibly contract minimums. These do not.

**Interparcel — and we already have the code.** Free account, self-serve API key, no
contract. They aggregate carriers and their service levels **include `pallet`**, which
is the whole point: a rig is not a parcel. The adapter that talked to them is in git at
`git show 36e2ee0:src/lib/freight.ts` and was replaced by the Australia Post one only
because the carrier decision changed, not because it was wrong. Restoring it as a
SECOND transport alongside Australia Post is a few hours, not a rebuild: `freight.ts`
normalises every carrier into one `FreightOption[]`, so the checkout does not care how
many carriers answered.
Sample shipments for their rate team are already generated: `npm run report:freight`.

**Big Post** — Australian, purpose-built for big and bulky e-commerce, which is exactly
this catalogue. Free login, **no minimum spend**, API documentation on request. They do
palletised freight and, importantly, **tailgate and scheduled residential delivery**,
which is the awkward case a home-gym order actually is. They will not onboard a business
trading from a residential address. enquiries@bigpost.com.au / 03 9544 5525.

**Aggregators** (Machship, Shippit, Starshipit, One World Courier, Couriers & Freight)
all offer multi-carrier instant quotes with an API, but on a subscription or platform
fee rather than a free key.

**Recommendation: Interparcel.** The code exists, the account is free, it covers pallets,
and it is the shortest path from where we are to the heavy two-thirds being quotable.
Big Post is the better call if tailgate residential delivery turns out to be the real
problem, since that is what they are built for.

---

## 2. Domain / DNS cutover ✅ DONE 2026-08-27

**Option B was not needed and option A was not taken either.** The apex was
pointed at Vercel while WordPress stayed exactly where it was, because only the
buy path reads the live store. The site launched as browse-and-quote via
`NEXT_PUBLIC_CHECKOUT_MODE=quote`. WooCommerce still needs to move for card
checkout to return; it is no longer a launch blocker. See `docs/dns-cutover.md`
and HANDOFF section 0.

<details><summary>Original plan, kept for the reasoning</summary>

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

</details>

---

## 3. Pre-launch test pass 🔎

Run against staging 2026-08-24. Only the items that genuinely need the real domain
are still open.

- [x] Every route: 64 content pages + 57 sampled product pages all 200. 404 page
      renders. Favicon and sitemap serve.
- [x] Catalogue: category page, subcategory filters, price filter, sort, product
      count, grid/list toggle.
- [x] Product page → add to cart → cart drawer → mini-cart totals. 2 × $25 = $50.
- [x] Checkout: address → freight quote → payment element. Charge matched the
      server exactly ($86.80). **Found and fixed a bug here:** every freight-bearing
      order announced "Pricing updated since you added to cart" because the warning
      compared a freight-inclusive total against a goods-only subtotal.
- [x] Mobile pass (375px): hero, nav, category grid, filters.
- [x] No console errors.
- [ ] **Card payment end to end** in Stripe test mode → WooCommerce order →
      Unleashed sales order. The one remaining functional unknown.
- [ ] Contact + newsletter + quote forms actually land (creates real HubSpot
      contacts and emails, so do it deliberately).
- [ ] OG share preview — needs the real domain, since the canonical is currently a
      test subdomain.
- [ ] `ALLOW_INDEX` on, `robots.txt` allows crawl, sitemap submitted — needs the
      real domain.
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
