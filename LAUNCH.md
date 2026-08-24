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

## 1b. Freight (Australia Post) ⚙️🔎🧠

**Carrier switched from Interparcel to Australia Post (Michael, 2026-08-24.)** The
adapter is built against their Postage Assessment Calculator API. It turns on when:

- ⚙️ `AUSPOST_API_KEY` — from the MasterKraft Australia Post account. **Not yet set
  in `.env.local` or in Vercel.** Until it is, freight stays off.
- ✅ `FREIGHT_COLLECTION_POSTCODE=3074` (Thomastown VIC) — the despatch warehouse.
  Set in `.env.local` 2026-08-24. **Still needs adding in Vercel**, or freight
  works locally and silently does nothing in production.
- ⚙️ `FREIGHT_MARGIN_PERCENT` — handling margin. **Defaults to 15** (Michael,
  2026-08-20); set it only to change that.

**Until they are set the checkout says "Calculated on quote" and charges goods
only. It never says "Free".**

### 🧠 Decision, Michael 2026-08-24: heavy carts go to the quote flow

Once the key is set, a cart Australia Post cannot carry is **not** charged for goods
with freight invoiced later. It is pushed to the quote flow, the same way an item
priced on application already is. Nobody is charged with an unknown delivery cost.

**Know what this changes on launch day:** every rack, machine and rig stops being
buyable by card the moment `AUSPOST_API_KEY` reaches Vercel. That is roughly
two-thirds of the catalogue moving from "add to cart" to "request a quote". It is
deliberate. §1d is how to get them back.

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
