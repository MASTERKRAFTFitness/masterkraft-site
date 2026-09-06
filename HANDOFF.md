# MasterKraft website — handover (2026-08-20)

New Next.js e-commerce site for masterkraft.com, headless: it reads catalogue,
price and stock from WooCommerce and Unleashed over their APIs, and does not use
the old WordPress storefront.

**The code side of the launch checklist is now clear.** Everything outstanding
needs a decision, a credential, or content. **Launch gates and env vars live in
`LAUNCH.md` - read that before any go-live work.**

---

## 0. THE SITE IS LIVE (2026-08-27)

`https://masterkraft.com` serves this Next.js site. Cut over from WordPress on
27 August. Verified over real DNS: valid certificate covering apex and www, www
redirects to apex, `/admin` 404s, `robots.txt` indexable on the apex and still
`Disallow: /` on `web.test`. **Email survived**: MX and SPF untouched, nameservers
left on Netregistry deliberately, and a real message was received after the change.

**It launched as browse-and-quote.** `NEXT_PUBLIC_CHECKOUT_MODE=quote` is set, so
the card form is hidden and every cart goes to the quote flow. Two things have to
happen before card checkout returns, in either order:

1. ~~**Stripe live keys** in Vercel Production.~~ **Done** - live keys are in
   (Michael, 2026-09-06). This can no longer be confirmed from the bundle the way
   3 September's `pk_test_51OgYExS…` was: quote mode means no publishable key is
   shipped to the browser at all, and 12 chunks checked on 2026-09-06 carry
   neither `pk_live` nor `pk_test`. Vercel's dashboard is the only view of it.
   **So the flag itself is now the only thing standing between here and card
   checkout** - and `NEXT_PUBLIC_CHECKOUT_MODE=quote` is confirmed still live,
   because `https://masterkraft.com/checkout` served the quote-mode banner
   ("Card payment is briefly unavailable...") when fetched on 2026-09-06.
2. **Paul moves WooCommerce to a subdomain** (`docs/email-paul-subdomain.md`),
   then `WC_STORE_URL` changes and `NEXT_PUBLIC_CHECKOUT_MODE` is removed.

**Freight is dormant until that flag changes.** In quote mode `paymentsConfigured`
is false, so `canPay` is false, so `StripeCheckout` never renders, so
`/api/freight/quote` is never called. The two-carrier router, the quote cache and
the carrier alerting are all live in the code and all unreachable in production.

The buy path (payment-intent, order, freight quote) is the only thing that reads
the live store. Everything a visitor browses comes from the committed snapshot,
which is why the cutover could happen before Paul did anything.

**DNS, for reference:** apex A records at Vercel (`216.198.79.1`, `64.29.17.1`),
`www` CNAME to `cname.vercel-dns.com`, everything else untouched. Rollback is both
A records back to `103.26.237.235`. See `docs/dns-cutover.md`.

---

## 0b. Shipped the evening of 27 August, after the cutover

Four commits, all pushed and deployed to production, all verified live.

### `3b91747` The cutover broke every product image, and this fixed it

Product images were absolute URLs on `masterkraft.com/wp-content/uploads/`. The
moment the apex became Vercel they all 404'd, and Next's image optimiser returned
502. **279 of 512 products** were affected. The earlier mirror
(`mirror-product-images.mjs`) had copied the product *data* but only the image
*URLs*, and it drew a brand line (`/^(?:[MN]|SC)/`) that excluded REVL and the
foreign ranges - sound while the domain still pointed at WordPress, a fault line
once it did not.

`scripts/mirror-remaining-images.mjs` picks up what it skipped. Two differences
from the original, both forced:

* it reads `src/data/catalogue.json`, not the WooCommerce API - that API is
  unreachable post-cutover, so **the original script cannot run at all**;
* it fetches over `node:http` against `103.26.237.235` with an explicit
  `Host: masterkraft.com` header. That host serves uploads **only** to its exact
  vhost name (a made-up subdomain and the bare IP both 404), and `fetch()` cannot
  do this because undici drops a `host` header in favour of the URL's authority.

`scripts/dedupe-product-images.mjs` then collapses byte-identical files by
SHA-256. One photo shared by several SKUs was written once per SKU.

    1494 files / 109.9 MB  ->  510 files / 36 MB

**Snap (S) and Fernwood (F) are excluded and must stay excluded.** The first run
pulled 174 of their products - another company's brand photography, headed into
this repo, for pages that 404 by design under `isForeignBrandSku`. The filter now
lives in the script with its reasoning.

Every product the site serves resolves to a local image; none remain remote.

### `c9d251f` Warranty claim form, REVL markets, scraped cart popup

* **`/warranty#claim`** - the page said what was covered and gave nobody a way to
  act. Follows the **waitlist** route's shape, not the contact route's: when
  HubSpot does not confirm, the claim is emailed to a human, and when neither
  lands the customer is told to email rather than shown a receipt we cannot
  honour. `HUBSPOT_FORM_WARRANTY` does not exist yet, so today every submission
  takes the email fallback to `QUOTE_TO_EMAIL`. **Nobody has yet submitted a real
  claim end to end** - worth doing once.
* **REVL** - Thailand (coming soon) and New Zealand added, Indonesia promoted to
  operating. Neither new market has named studios, so both use the existing
  "Studios operating" branch. A hardcoded "eight markets" in the intro had already
  gone stale; it counts from the data now (`revlOperatingMarketCount`).
* **"since 2022"** on both the homepage feature and the fit-outs page, confirmed
  by Michael. The two previously disagreed (2022 vs 2023).
* **Cart popup** - "You were not leaving your cart just like that, right?" was
  scraped WordPress cart-abandonment copy at the foot of **five** legal pages, not
  the three reported. All removed.

### `2107df0` Apparel, Lighting and Reformers categories

All three ranges exist in **Unleashed** under MasterKraft's own codes: 107 products
in its Apparel group (`MAAAU01` Trucker Hat, `MAACU02` Oversized Hoodie …),
`NBLLE2501`/`NBLLE2502` in Lighting, `MCRFAL01`/`MCRFWO01` reformers filed under
Cardio. **None were ever created in WooCommerce**, which only received the Snap and
REVL equivalents (`SAAAU01` against `MAAAU01`, `SLLE`/`RLLE` against `NBLLE`), and
those are excluded by `isForeignBrandSku`.

So all three render the empty state today. Apparel and Lighting point at the real
WooCommerce terms (349, 348) and **populate with no code change** the day
MasterKraft-coded products are filed under them. Reformers has no term in the store
at all; one needs creating.

`image` and `wcId` are now **optional** on `Category` - no image falls back to the
`mk-glow` hero, no `wcId` means nothing to query. Four call sites guarded, and the
parity test skips termless categories because it compares against the live store.

**Deliberately not linked from the nav** while they have no stock. One line each in
`nav.ts` when there is.

### `b9784d2` The Terms pointed at a competitor's domain

Clause 28(a) bound customers to "our Privacy Policy which can be found at
`www.gymequipmentdirect.com.au`" - a domain MasterKraft does not own, scraped in
with the rest of the legal content. Now `masterkraft.com/privacy-policy`.

**Still there and NOT touched:** section 29 of the same page is the full terms of a
competition that closed **29 April 2023** (Australian Fitness Expo Sydney, $1,795
Air Rowing Machine), presented as current. Removing live legal copy is Michael's
call, not a fix to make unasked.

---

## 0c. Shipped 2026-09-02 - one page per range, sized from Unleashed

**The problem.** A shopper could not choose a weight. The Rubber Hex Dumbbells
page was one photo, a "From $X" and no picker, and the 26 weights behind it were
unreachable. Across the catalogue that is **258 sized products with their own
prices and photographs, none of it selectable.**

**Why it looked hard, and was not.** WooCommerce modelled a range as two
container records - a hidden `variable` parent holding the variations, and a
visible `-GROUP` bundle holding nothing. The first cut of this paired them. That
was the wrong thing to key on: those containers are precisely what is being
dropped. Of the 27 served products with no Unleashed record, **24 are those
containers**. Nothing real is missing from the ERP.

**Unleashed does not have containers.** A range there is a set of ordinary
products whose `ProductDescription` shares a name:

```
MMDBRH01   "Rubber Hex Dumbbell - 1kg"      $5.00    own photo, own stock
MMDBRH26   "Rubber Hex Dumbbell - 45kg"     $225.00
```

So **the name before `" - "` is the range, and nothing else is.** `src/lib/ranges.ts`,
one function, `getRange(product, unleashedMap)`.

That is better data than WooCommerce ever held: **45 ranges over 399 products**
against Woo's 32 over 258. Sizes the old store never listed now sell - the PU
Dumbbells go from 17 to 28, the straight barbell from 10 to 14.

### The three rules that stop it going wrong

1. **Never group on the code stem.** `MWBBFUR` holds a curl barbell AND a straight
   barbell, both running 10-40kg. `MCBIAR` holds the Classic, Pro and Elite air
   bikes. Grouping on the stem puts unrelated products behind one picker.
2. **One brand only.** "Rubber Hex Dumbbell" is 26 products on MK and another 26
   each on SNAP, NO BRAND, Air Locker and Hyper Health. Without the brand guard a
   dropdown shows every weight five times at five prices.
3. **Never merge two name-groups.** An earlier cut merged groups whose sizes did
   not collide, to rescue stragglers left by half-finished renames in the ERP. It
   rescued them - and put the Micro Bands in the Power Bands dropdown and mixed kg
   with lb on the Wall Ball. Disjoint sizes do not mean "same product".

Where a stem holds several real ranges, the codes the page **already sold** decide
which one is its own. That is what keeps `MWBBFUR-GROUP` on the straight barbell
(14 sizes) rather than the curl barbell that shares its stem and has more (19).

### What still comes from WooCommerce, and why

The URL and the words. `src/data` is a **frozen text archive** now - nothing is
fetched from the store - supplying the slug the page is routed by, the marketing
copy, the features and the spec table. **Unleashed holds no product copy at all:
`Notes` is empty on all 1,476 sellable records and `ProductDescription` is just a
name.** Until that copy is written into the ERP, the snapshot is the only place it
exists. Deleting `src/data` empties every product page of prose.

### Checkout

A cart line now carries the **ERP code** (`sku`), which is what the warehouse picks
and what the quote email prints. It also carries the WooCommerce ids **when the
frozen snapshot still has them**, because `resolveOrderLines` re-prices a *paid*
order against the store. Sizes the old store never listed have no such ids, so
they carry `productId: 0`, and `canPay` in `checkout/page.tsx` now requires
`productId > 0`. Those sizes still sell - through the quote flow, which needs
only a code, a name and a price. Without that guard the customer fills in a card
form and then hits `resolveOrderLines` failing closed.

### Photography

Per-size shots come from Unleashed's own CDN (`unlappcdn.unleashedsoftware.com`,
public, no auth, ~100 KB each), allowlisted in `next.config.ts`. The `/public`
mirror holds one shot per PRODUCT, taken from WooCommerce parents; it has nothing
for the individual sizes. Mirroring these the way `scripts/mirror-product-images.mjs`
did is how to drop the external dependency - worth doing, not urgent.

### `npm run report:ranges`

Prints what the ERP's naming is doing wrong, because rule 3 above is only as good
as the naming:

- **ORPHANS** - a size stranded under an unfinished rename, so it is missing from
  its picker on the live site. 3 today; `MMDBUR19` is called "Urethane Fixed
  Dumbbells (Pair) - 7.5kg" while its other 28 are "PU Dumbbells (Pair)". **Fix is
  one field in Unleashed.** Advisory - read each, some are genuinely separate.
- **SPLITS** - 40 stems holding more than one real range. Correct, but only one of
  them can have a page while pages are routed by the old WooCommerce slugs. The
  Wall Ball (Armatex), 5 sizes, has no page for exactly this reason.

Files: `src/lib/ranges.ts`, `src/lib/ranges.test.ts`, `scripts/range-report.mjs`,
`src/components/shop/VariantSelection.tsx` (new); `VariantSelector.tsx`,
`ProductGallery.tsx`, `app/product/[slug]/page.tsx`, `app/checkout/page.tsx`,
`app/api/quote/route.ts`, `cart/CartProvider.tsx`, `lib/unleashed.ts`,
`lib/catalogue.ts`, `next.config.ts`.

---

## 0d. Shipped 2026-09-02 - the categories are the ERP's product groups

**The site was showing 157 of the 696 products the ERP sells under MasterKraft
codes.** 184 cards where the ERP has 319 once a range is counted once. Apparel,
Lighting and Reformers had been sitting empty since 27 August with a comment
explaining that their products exist in Unleashed and were never created in
WooCommerce - which was the visible corner of the real problem.

**`ProductGroup` IS the category now**, the same way the franchisee catalogues
have always grouped. `src/lib/erp-catalogue.ts`. Nothing maps, nothing is
maintained by hand: a product appears in Strength because the ERP files it there.

| | before | after |
|---|---|---|
| Strength | 11 | **81** |
| Apparel | 0 | **18** |
| Weightlifting | 29 | 42 |
| Mixed Implements | 20 | 41 |
| Body Weight | 25 | 33 |
| Rigs & Racks | 11 | 26 |
| Cardio | 13 | 20 |
| Flooring | 0 | 8 |
| Lighting | 0 | 2 |

Sub-filters are `ProductSubGroup` - Dumbbells, Barbells, Wall Mounted, Lower Body
Machines - which is richer and better kept than the WooCommerce child terms it
replaces. **165 units had no WooCommerce record at all** and now have a generated
page: name, ERP code, price, stock, photographs, and a size picker when it is a
range. No marketing copy, because the ERP has none.

### A UNIT is what earns one card

Either a range (everything sharing a name before `" - "`, one card with a picker)
or a single product. Same rule the product page uses, so a card and the page it
opens cannot disagree - `sizesFromCodes` in ranges.ts is the ONE place a size row
is built. That is what makes 731 products into 319 cards rather than 731.

### Five rules, each of which was a bug first

1. **Never group on the code stem.** `MWBBFUR` is three barbells, `MCBIAR` is the
   Classic, Pro and Elite air bikes.
2. **A brand prefix is not a range.** "CONCEPT 2 - Ski Erg with PM5" read as a
   range gives one "CONCEPT 2" card whose sizes are four whole ergs.
3. **A trailing `(L)` is a size; a trailing `(Armatex)` is not.** Apparel is named
   "Sweatshirt (Unisex) (L)", so the `" - "` rule alone gave 52 cards for about a
   dozen products. The whitelist is XS-3XL and deliberately nothing else.
4. **NO BRAND fills gaps, it does not duplicate.** N-codes have always counted as
   ours (`/^(?:[MN]|SC)/`) and Lighting exists only there, but NO BRAND also
   holds white-label copies of MK ranges - a whole 26-weight `NBMDBRH` beside
   `MMDBRH`. Same name in the same group: earliest brand in `BRAND_ORDER` wins.
5. **The loser of a page contest gets its own page, not oblivion.** Three ranges
   want `/product/urethane-fixed-barbells-2`. The winner is decided by the codes
   that page ALREADY sold - the same anchor rule ranges.ts uses, shared on purpose
   - and the others get a slug from their own name. That is how the Fixed PU Curl
   Barbell (19 sizes) is listed at all; the old store never had a page for it.

### What did NOT change

- **URLs.** Slugs stay hand-written in `categories.ts` and inherited from the
  snapshot for products. "Rigs & Racks" slugifies to `rigs-and-racks` and this
  category has lived at `/equipment/rigs-racks` since launch; a change of source
  is not a reason to break every link into it. `/equipment/reformers` 308s to
  `/equipment/cardio`, where the ERP files both reformers.
- **Clearance.** Ex-display stock on A-prefixed codes, still listed from the
  snapshot with the brand filter off. Unleashed's "Clearance" group holds one
  product and is not the same thing.
- **The words.** `src/data` is a frozen text archive supplying copy, features and
  specs. Deleting it empties every product page of prose.

### If Unleashed is unreachable

Every listing surface - category, all-equipment, search, sitemap - checks for an
empty map and **falls back to the snapshot**. A visitor sees the old, smaller
catalogue rather than a site that sells nothing. Worth keeping when editing any
of them.

### `npm run report:ranges`

Now also reports what the category pages are missing, because the ERP is the
catalogue and its gaps are holes on live pages.

> **Superseded 3 September.** The counts below are as at 2 September.
> `npm run report:punchlist` (§0e) replaces this list with a per-field punch list
> and is the one to work from.

- **48 with no price** - render "Contact for pricing".
- **186 with no photograph** - render an empty tile. `masterkraft-portals-franchisee`
  has `scripts/harvest-unleashed-images.py`, which fills blanks from the ERP's own
  CDN; the same trick would help here.
- **2 near-duplicate names** - "Multi Dead Lift" vs "Multi Deadlift", "V Squat"
  vs "V-Squat". Two cards for one product; fix the name and they merge.
- Plus the apparel mess: `MAACU02-L "Oversized Hoodie (L)"` beside
  `MAACU02L "Oversized Hoodie (Unisex) (L)"`, and `MAACU02-XL` is spelled
  **"Oversided Hoodie (XL)"**. Three hoodie cards where there should be one.

Files: `src/lib/erp-catalogue.ts`, `src/lib/erp-catalogue.test.ts` (new);
`lib/categories.ts`, `lib/ranges.ts`, `lib/unleashed.ts`,
`app/equipment/[category]/page.tsx`, `app/all-equipment/page.tsx`,
`app/product/[slug]/page.tsx`, `app/search/page.tsx`, `app/sitemap.ts`,
`scripts/range-report.mjs`, `next.config.ts`.

---

## 0e. Shipped 2026-09-03 - what a range costs, and every size in it

Deployed to production and verified on `masterkraft.com`. Five changes, all on top
of §0c/§0d: the ERP was already the catalogue, but a card would not say what a
range cost end to end and a shopper could not see two sizes at once.

`cc5ed0f`, `b3892f5`, `3b0ff30`, plus `6418e20` (retirements) and `e600caf`
(metadata).

### The card spans the price

`From $40.00` became `$40.00 – $300.00`. The old label hid that the top of the
High Grip Dead Balls is seven times the bottom, and it collapsed three different
situations into one. There are now three, and the distinction matters:

| Label | Means |
| --- | --- |
| `$40.00 – $300.00` | The sizes cost different amounts. |
| `From $40.00` | Some sizes are unpriced, so the top is genuinely unknown and must not be implied. |
| `$65.00` | Every size costs the same - the apparel ranges. "From" on a flat price is noise. |

`ErpUnit` gained `priceMax` and `pricedCount` to tell the last two apart.

### And says what is in the range

`16 sizes · 6kg – 75kg` under the price, from `enriched.rangeLabel`.

**The span reads the measurement each label OPENS with, not the whole label.**
The competition kettlebells are eleven plain weights and one
`6kg (Aluminium)`; on the whole label that is either nonsense or nothing, and on
the leading measurement it is `12 sizes · 6kg – 40kg`. A unit is required, which
is what keeps `2 Tier (10 Pair) 1.0` out - a bare leading number is a model
number as often as a size. A label with no measurement gets the count alone:
`Set of 6 – Set of 10` is not a span.

### The thumbnails are labelled, and clicking one selects that size

Each thumbnail on a range page is captioned with its weight and moves the
selection, so the price and the add-to-cart follow. Previously a click swapped
the picture only, which is how the page could show a 12kg ball above a 6kg price.

Captions are passed from the page (`galleryLabels`), not published through the
selection context - through context they arrived a frame after hydration and
shifted the strip under the cursor.

### The size table

The franchisee catalogue's table, on the storefront: size, ERP code,
availability, price, ADD. The dropdown is the right control for buying one
dumbbell and the wrong shape for a gym comparing 26 weights and buying eight.

**Prices are inc-GST here, unlike the franchisee catalogue's ex-GST column.** The
storefront quotes inc-GST everywhere else on the page and a table that switched
convention halfway down would be misread.

### The page is two columns all the way down

The table is in the LEFT column under the thumbnails. **Product Overview,
Features and Specifications all moved up into the RIGHT column**, under the
price, in that order.

Overview and Specifications were each a full-width band in their own centred
`max-w-3xl`, which lined up with neither column and read as stray blocks below
the fold. They are now the same 598px column as the price at 1440.

### Garment sizes were ordered alphabetically

The Long Sleeve Tee picker read **`L, M, S, XL`** on the live site. Garment
labels carry no number, so the numeric sort fell through to `localeCompare`.
`compareSizeLabels` in `ranges.ts` now ranks them by body and is the ONE
ordering, read by the picker, the card's span and the captions. It also writes
out a comparison that had been leaning on `Infinity - Infinity` being `NaN` and
`NaN` being falsy.

### Four rules that are load-bearing

Break any of these and it regresses quietly:

1. **One owner, two askers.** Three controls can now change the selected size -
   dropdown, thumbnail strip, table. The picker OWNS it, keyed by ERP code; the
   strip and the table only ask, and the picker answers by moving the code and
   the photograph together. Two owners fight over one value.
2. **The ask carries a counter.** Click 9kg, choose 12kg in the dropdown, click
   9kg again: with the code alone the second ask sets state to the value it
   already holds, React skips the render, and the control goes dead.
3. **One cart-line builder** - `lib/variant-line.ts`. Two add paths exist now,
   and `productId: 0` is what routes a size the old store never listed to the
   quote flow instead of card checkout. A second copy would drift. Verified:
   adding 9kg from the table then 9kg from the picker gives ONE line at qty 2.
4. **The table is a grid SIBLING, not a child of the gallery column.** Nested it
   renders before the buy box on a phone, pushing price and Add to Cart below 26
   rows. `lg:row-span-2` on the right column is what still places it under the
   thumbnails on desktop - without it row 1 is sized by the taller column and the
   table lands 317px below the strip. Measured at 1440: 317px -> 64px.

### Retirements and metadata

`6418e20` - Unleashed retired 66 SKUs during the day (`SMDBPRH`, `SMDBRH`,
`SMDBVR`, `SBSAROL01`). All SNAP-branded, so nothing a customer sees changed, but
`check:obsolete` refuses to ship a stale list and that is what it is for.

`e600caf` - `generateMetadata` resolved the snapshot only, so the 165 ERP-only
units went out as `Product | MASTERKRAFT` in search results with no og:title, on
pages the sitemap advertises. It now falls back to the ERP unit the way the page
body already did.

### `npm run report:punchlist`

New. Writes `reports/erp-punchlist.md` and `.csv` - **170 fixes, every one a
field in Unleashed**, no code change and no deploy, because the site rebuilds its
cards from the ERP every 15 minutes.

| Problem | Rows | Field |
| --- | ---: | --- |
| No photo anywhere | 62 | Product > Images |
| Size has no photo | 59 | Product > Images |
| No price | 39 | Default Sell Price |
| Two cards, one product | 5 | Product Description |
| No card - not on the site | 3 | Product Description |
| Filed under the wrong group | 1 | Product Group |
| Size has no price | 1 | Default Sell Price |

**49 cards across 19 families would collapse into one picker from a rename
alone.** `Artificial Turf Black (2m x 10m / 15m / 20m)`,
`Coloured Bumper Plates (Set of 6 / 8 / 10)` and so on. The site groups on the
part before `" - "`, so renaming to `Coloured Bumper Plates - Set of 8` makes the
dropdown appear by itself, and the franchisee catalogues get it too.

This was deliberately NOT done in code. Reading every trailing bracket as an
option is the trap from §0d that put `Wall Ball (Armatex)` and `Wall Ball` behind
one picker at two prices. Five of the nineteen are judgement calls - Olympic
Power Rack 1.0-5.0 may be five different racks rather than five options on one.

**19 cards hide a second product.** Two ERP records share a name under two code
schemes - `MRSPFW02` and `MSSPFW02` are both "Olympic Power Rack 2.0" - and only
the first is ever sold. Merge them or give them different names.

### Known limits

- **A product gets ONE dropdown.** `Olympic Urethane Weight Plates` would need
  grip x weight. That one is a code change, not a rename.
- **15 thumbnails against 16 options** on the dead ball. 70kg has no ERP photo,
  falls back to the shared product image, and dedupes out of the strip. Data.

### Deploys went quiet twice

Three deploy attempts, two of which produced **no deployment at all** - the CLI
gave no useful output and nothing appeared in Vercel. Same silent class of
failure as the git-author block on 2 September (§0d era), cause not established
this time because the third attempt simply worked.

**Always confirm a deploy landed rather than assuming:**

```
npx vercel@latest ls --scope masterkraft
```

The top row must be minutes old and `Ready`. If it hangs on `Building…`, rerun
with `--debug` - that is what surfaced `readyState: BLOCKED` last time. Never
pipe the deploy through `tail`; it hides the reason.

Files: `src/lib/variant-line.ts`, `src/components/shop/SizeTable.tsx`,
`scripts/erp-punchlist.report.ts` (all new); `lib/erp-catalogue.ts`,
`lib/ranges.ts`, `lib/unleashed.ts`, `components/shop/ProductCard.tsx`,
`ProductGallery.tsx`, `VariantSelection.tsx`, `VariantSelector.tsx`,
`app/product/[slug]/page.tsx`.

---

## 0f. Shipped later on 2026-09-03 - what the outside world can reach

Four changes about URLs rather than about products: what this site still serves
that it should not, what it stopped serving at the cutover and never redirected,
how we find out what else is missing, and a dead URL that was answering 200.
`c97e985`, `e29894e`, `1ca536a`, `4dfe075`.

### `c97e985` REVL is off the site, which the rule always said it was

`FOREIGN_BRAND_SKU_RE` named REVL "R" in its own comment but only ever matched
S and F. So **63 R-SKU products stayed servable** - excluded from every listing
by the M/N brand filter, and still answering 200 on a direct URL, and still in
the sitemap. Unlisted is not the same as not on the website, which is the exact
thing the rule was added to fix for Snap and Fernwood.

What those 63 are matters more than the count. Only 15 are named "REVL ...".
The other **48 are REVL's own-brand copies of lines we sell under the SAME
names** - Abdominal Mat, Olympic Barbell - 20kg, Premium Rubber Hex Dumbbells,
Wall Balls - one for one against the Snap set already excluded. Indexed, they
competed with our own pages for our own product names.

Servable product pages **283 -> 220**. Nothing linked to them: the REVL fitout
pages are editorial and fetch no products, and Clearance is all A-prefixed
ex-display stock. **SC is untouched and tested to stay that way** - the Concept2
ergs are named "C2", SKU'd "SC", and stay by the 2026-08-20 decision.

### `e29894e` The inbound links that have 404ed since 27 August

The internal link graph was already clean - 497 URLs crawled from the homepage,
all 200. What was broken was everything pointing IN. Since the apex moved,
**69 `/product-category/` archives and 225 product URLs** answered 404, none of
it reachable from inside the site, so nothing surfaced it. The biggest archive
covered 106 products.

WooCommerce's own term tree picks the destinations: each site category records
the Woo term it used to list from, so walking a term up its parents maps 66 of
the 69 non-empty archives with nobody guessing. The three that do not resolve
are not equipment categories - `new-products` is promotional, `freight-delivery`
was never a product, and `studio-kit` is REVL's own kit on R-SKUs, which points
at `/revl-fitouts` rather than bait-and-switching to a MasterKraft category.

**GENERATED, BECAUSE THE ORDERING IS DANGEROUS.** Config redirects match BEFORE
routing, so a redirect whose source still serves does not lose an argument with
the page - it deletes it. The generator therefore imports the visibility rules
rather than restating them, and refuses to write a map that collides with a
servable URL.

362 redirects against Vercel's ceiling of 1,024. **The generator fails at 900**,
which is the signal to move to the Proxy + Bloom filter approach in the Next
docs rather than quietly ship a map the platform truncates.

### `1ca536a` The site records its own 404s

The redirect map above was written from what the old store served - a complete
account of what the cutover broke and no account of what anyone actually
requests. So `/admin/dead-links` now reads back a table of 404s, busiest first,
marking whether a crawler or a person asked. A crawler means it is still
indexed; a person means something still links to it and someone just failed to
buy something.

**One row per PATH, not per request** - the traffic is mostly crawlers, so
aggregating bounds the table by how many dead URLs exist rather than by how hard
we are being crawled. Counting is a Postgres function so simultaneous hits
increment rather than race.

**The obvious implementation would have cost the whole site.** `not-found.tsx`
cannot see the path it was rendered for, so the natural move is a header from
Proxy plus `headers()` in the 404 page - which takes the build from 35 static
routes to NONE, because a root not-found that reads request headers cannot be
prerendered and any route can fall back to it. Measured, not assumed. Instead
the path is passed in by callers that already know it: a catch-all route at the
lowest routing precedence, plus the five existing `notFound()` call sites, which
have their slug in params.

> ~~**NOT LIVE.**~~ **The table exists as of 2026-09-06** - see §13c for the
> database it now lives in. `not_found_hits` and `record_not_found` are both
> applied.
>
> **It still no-ops in production**, because `recordNotFound` calls `adminDb()`,
> which returns null unless `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are
> set, and **neither is in Vercel yet**. Local runs work; production does not
> record a thing until those two variables are added.
>
> Nothing is broken meanwhile - the site is built to run without a database and
> does. What it costs is that the log collects nothing, so the evidence the next
> redirect map should be argued from is not accumulating, and every day this
> waits is a day of 404s nobody can see. See §10.

### `4dfe075` A dead category URL said 200

`/equipment/anything-at-all` answered **200 with the 404 page inside it**. The
`loading.tsx` in that segment wraps the page in Suspense; the moment its
fallback renders the headers are already sent, so `notFound()` in `page.tsx`
could change the body and not the status. Same trap the product page documents
and sidesteps by having no `loading.tsx` at all.

Not as bad as it looks - Next marks a streamed 404 `noindex` and the live page
carried it, so Google was not indexing these. What a 200 on a dead URL does
break is everything that counts on the STATUS: link checkers, Search Console's
soft-404 report, and the 404 log added an hour earlier.

Fixed **without losing the skeleton**. A layout renders outside its own
segment's Suspense boundary, so a check there still runs while the status can be
set. It has to be cheap and must not suspend or it starts the stream itself -
`getCategory` is a lookup over twelve committed entries, no `await`. Deleting
`loading.tsx` would also have worked and would have cost the skeleton on a page
that waits on Unleashed, which is a bad trade for a status code.

### One question these two left open, on purpose

**8 R-prefixed slugs still serve** - `pro-bumper-plates`, `power-bands`,
`retail-rack` and five more - and are in the sitemap, despite failing the brand
rule `c97e985` just tightened. `erpUnits()` filters on the ERP's **brand field**,
not the SKU prefix, so a product Unleashed calls MK or NO BRAND on an R-code
comes through. Whether the ERP or the SKU is right about those is a real
question and a redirect map was the wrong place to answer it, so they were left
alone. See §10.

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

**THE GATE PASSES AGAIN (28 Aug).** It was broken from the cutover until then:
`check:catalogue` queries `masterkraft.com/wp-json/wc/v3`, which is Vercel now, so
it died on `WooCommerce 403 after 4 tries` and the `&&` chain stopped **before**
`vercel` ran. Two things fixed it, and both are worth knowing about.

**1. The store never went away, it only lost its name.** WordPress is still
serving on the old box, our consumer key still works, and its certificate covers
both `masterkraft.com` and `www.masterkraft.com`, so it validates fully if you
resolve the name yourself. `scripts/lib/store-dns-pin.mjs` does exactly that,
driven by `WC_STORE_PIN=masterkraft.com=103.26.237.235` in `.env.local`. Read the
header of that file before touching it. It is a splint: it is inert unless the
variable is set, it announces itself on stderr every run, and it goes stale by
itself the moment `WC_STORE_URL` moves to a subdomain. **Delete `WC_STORE_PIN`
the day Paul gives the store a hostname.**

Do not reach for `http://103.26.237.235` instead. That host serves by vhost name
so the bare IP 404s, and it would put the consumer key on the wire in clear text.

**2. The check was also crying wolf.** It compared whole products with
`JSON.stringify`, and WooCommerce does not promise a stable order for a product's
`categories`. Six rigs came back with the same four terms reshuffled, which the
gate called drift. It now compares `categories[0]` exactly - that is the one thing
the site reads from that order, for the breadcrumb on `product/[slug]` - and the
rest as a set. The snapshot is still **written** in the store's own order, because
that is what `categories[0]` reads. No snapshot data changed; the gate simply
stopped failing over a reshuffle that changes nothing on any page.

Full gate verified green end to end on 28 Aug: 512 products, 80 categories, 98
tests, obsolete list clean, no drift.

`npm run deploy` was also missing `--scope masterkraft`, so it would have failed
at the `vercel` step even once the gate passed. Fixed in `package.json`.

If you ever do need to skip the gate, that is only safe when the commit does not
touch `src/data/` - that snapshot is exactly what the check guards.

**Watch for the silent version of this failure.** Piping `npm run deploy` through
`tail` reports the *pipe's* exit code, so a failed gate looks like a clean exit 0
and it appears to have deployed when nothing did. Confirm against production, not
against the exit code.

To deploy without the gate (it is a safety net, not a law):

```bash
npx --yes vercel@latest deploy --prod --yes --scope masterkraft
```

There is no local or global `vercel` binary on this machine, so a bare
`vercel --prod` fails with command-not-found.

**`--scope masterkraft` IS REQUIRED.** Without it the CLI returns a bare
`{"status":"error","reason":"deploy_failed","message":"Not authorized"}` even
though `vercel whoami` returns marketing-8481 and `vercel teams ls` shows
MASTERKRAFT as the current team. The error never mentions scope, so it reads like
a credentials problem and is not - **do not go re-authenticating.**
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

**SUPERSEDED BY §0d.** The rules below still decide what the WooCommerce snapshot
serves — Clearance, and the fallback when Unleashed is unreachable — but they no
longer decide what the site LISTS. Categories come from the ERP's `ProductGroup`
now, and the count is 319 units, not 184 products.

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
   listing superseded by its `-GROUP` product. 25 products. Unchanged by §0c:
   ranges no longer read those hidden twins at all, they read the ERP.
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
- **A RANGE is the exception** (§0c). It is priced off its ERP sizes, so
  `priceValue` is the cheapest size and the price filter can finally see it. Safe
  because the shopper picks a size and buys that, not an un-configured range. This
  also settles the disagreement `getBundleFromPrice` documents - the card used to
  say "From $110" off WooCommerce while the page said "From $90" off Unleashed.
  One source now, and it is the ERP.

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
| auditing product spec content | `npm run report:specs` (writes `reports/wc-spec-gaps.*`) |
| Interparcel need example shipments | `npm run report:freight` (writes `reports/interparcel-sample-shipments.*`) |

`build:obsolete` refuses to write if fewer than 1,500 products come back, since a
short read would silently un-retire everything. `build:catalogue` refuses below
400 published products for the same reason: a short read would empty the shop.

**`build:catalogue` is now the most important of these.** The site serves product
data from `src/data/`, so a content edit in WordPress is invisible until the
snapshot is rebuilt and committed. Nothing rebuilds it automatically.

---

## 4b. Orders are written into UNLEASHED now, not WooCommerce (2026-09-06)

**`UNLEASHED_WRITE_ENABLED=true` is set in Vercel Production.** `orderBackend()`
returns `unleashed`, and `createWooOrder` is no longer reached.

**This was found the hard way, an hour after card checkout went live.** Card
checkout was opened while `WC_WRITE_ENABLED=false` and `WC_STORE_URL` still
pointed at `https://masterkraft.com` — which is this Next.js app, not WooCommerce.
`masterkraft.com/wp-json/wc/v3/products` returns 404. And because
`stripe.confirmPayment` runs BEFORE `/api/order`, every card payment would have
been **captured and then refused** with a 503 "Order creation is not enabled".
Nobody hit it, but nothing prevented it either.

### What had to be true, and now is

| gate | how it was settled |
|---|---|
| Unleashed key has write scope | Proven by an intentionally invalid `POST /SalesOrders/{guid}`, which came back **400 on validation** (`OrderStatus`, `Customer`, `Tax` required) rather than 401/403. Nothing was created. |
| A web sales customer exists | **It did not.** All 4,125 customers were scanned; the 20 name matches were real gyms with "Online" or "Shop" in them. Created `WEB-MASTERKRAFT` / "MasterKraft Website", AUD, taxable, `T7-DIRECT`. |
| `UNLEASHED_WEB_CUSTOMER_CODE` | `WEB-MASTERKRAFT`. `resolveCustomer` throws rather than guess, which is why this had to exist first. |
| `UNLEASHED_FREIGHT_CODE` | `MKFR` ("Freight - Local"). **Nobody had this on the list** - it is unset by default and any freight-bearing order throws without it. |
| The write path works | `SO-00000851`, written 2026-09-06 through the real `buildSalesOrderPayload`. **Delete it.** |

### The test order, and what it proves

`SO-00000851`, Parked, $35.40: one `MBSADO02` at $18.18 ex plus freight riding as
an `MKFR` line at $14.00 ex ($15.40 inc), tax $3.22. That is the freight-line
mapping section 6 has wanted proven since August, and it works.

**What it does NOT prove** is the full card path. It called
`buildSalesOrderPayload` directly, so Stripe verification, `resolveOrderLines`
repricing and the amount-match check in `order/route.ts` are still unexercised
against a real payment. Production was probed with a bogus PaymentIntent and
returned **402 "Payment not verified"** rather than 503, which confirms the route
is enabled and reaches the payment check - and nothing further.

🔎 **One real card order is still owed**, and it is the only way to test the
repricing and amount-match logic. Use something cheap with carton data.

### Decommissioning WooCommerce

Orders no longer touch it. Still outstanding: `WC_STORE_URL` points at a host with
no WooCommerce behind it, the catalogue snapshot in `src/data` is still built from
Woo by `build:catalogue`, and the `productId > 0` rule in `checkout/page.tsx`
still forces **557 of 1,345 sellable ERP products** to the quote flow because
`resolveOrderLines` cannot price a line with no Woo product. That rule can relax
once repricing resolves an ERP-only line from the ERP - same fix, and it is worth
`npm run report:erponly` before scoping it.

---

## 5. Freight (Australia Post + Easyship, priced against each other)

### The second carrier arrived 2026-09-05

**`quoteFreight()` now asks BOTH carriers in parallel and returns the best of the
pooled options.** Australia Post via PAC as before; Easyship via
`POST https://public-api.easyship.com/2024-09/rates`, fronting TNT, Aramex,
CouriersPlease, Allied, Toll, FedEx, Hubbed and UPS.

**Neither carrier is redundant — they win opposite ends of this catalogue.**
Measured against the live accounts, Thomastown to a capital
(`docs/easyship-evaluation.md`):

| carton | lane | AusPost | Easyship |
|---|---|---|---|
| 1kg satchel | Perth | **$10.20** | $17.70 |
| 21kg, 63x53x35 | Melbourne | $30.70 | **$27.94** |
| 21kg, 63x53x35 | Perth | $149.45 | **$111.20** |
| 43kg, 150x60x60 | Sydney | *refused* | **$180.84** |
| 601kg, 200x100x120 | Sydney | *refused* | **$619.96** |

Australia Post charges a FLAT national rate under about 2kg, which Easyship cannot
beat, then turns steeply zoned and loses badly. Above the parcel limits it does not
compete at all. So the router asks both and lets `selectOptions()` choose.

**What changed structurally:** an over-limit carton no longer fails the cart, it
just rules Australia Post out. `oversize` is now only returned when there is no
second carrier configured to take it. One carrier failing is not a failure; both
failing is. Option ids are namespaced (`auspost:CODE`, `easyship:UUID`) because
they travel to the browser and come back to be re-priced when the card is charged.

**`EASYSHIP_API_TOKEN` is NOT set yet**, in `.env.local` or Vercel. Until it is,
the router runs Australia Post alone and behaves exactly as it did before. See
`LAUNCH.md` §1b.

- `npm run check:carriers` — three real carts through the actual router, prints
  which carrier won each, then re-quotes one to prove the cache is serving it.
- `npm run report:carriers` — prices both separately across all six lanes,
  weighted by the real destination mix, and tests whether an Easyship rate is
  stable across two identical calls.

**Quotes are cached** (`src/lib/freight-cache.ts`, 15 min, 60s for failures).
That is not only about the metered endpoint: display and charge now come from ONE
carrier answer, so they cannot disagree and refuse an order after the card is
captured. In-memory, so per-lambda on Vercel.

**⚠️ The Easyship trial allowance was exhausted on 2026-09-05** — ~90 calls of
building and testing, not traffic — and every call now returns `403 usage_limit`.
The router fails soft, so nothing broke, but the bulky half is back on
"Calculated on quote" and nothing surfaces the 403. Two measurements were lost to
it: rate stability and the AusPost/Easyship crossover weight.

**Two integration traps, recorded so nobody rediscovers them:** an item needs a
`category` slug (we send `sport_leisure`, HS 9506910000) or every call 422s, and
the useful half of an Easyship error lives in `error.details`, not `error.message`.

**Rate stability is ANSWERED (2026-09-06): stable.** Two identical calls returned
identical prices across all six services, so the display-then-charge pair does not
drift. Latency re-measured at 693-1136ms, not the ~4s recorded while calls were
failing. The allowance has also reset and Easyship is quoting normally again.

**Three things the evaluation did NOT settle**, all in
`docs/easyship-evaluation.md`: rate stability across our two quotes, whether the
invoice matches the quote, tailgate and two-person delivery (still nobody's job),
and the fact that TNT returned the only rate on every bulky quote. The account is
also a trial with no payment method and zero shipments. **One real bulky
consignment answers most of it.**

### Australia Post, as it was

**LIVE in production.** `AUSPOST_API_KEY` and all four `FREIGHT_COLLECTION_*` are
set in Vercel Production, and the deployment serving the site is newer than they
are, so they are in the running build. Verified 2026-08-25. Carrier switched from
Interparcel to Australia Post (Michael, 2026-08-24).

(This line previously read "Built, not switched on — waiting on the API key only",
which was true when written and stale within hours. It caused a real
mis-reading: §5 and §7b said opposite things about whether freight worked.) Freight is quoted at checkout,
cheapest service plus one faster option, carrier rate plus a **15% handling margin**.

**Despatch origin is 3074, Thomastown VIC** (Michael, 2026-08-24). That was the
missing value that blocked every quote. It is in `.env.local`, which is gitignored,
so it also needs setting in Vercel.

### The bulky freight brief (2026-08-25)

`docs/freight-brief-bulky.md` plus `npm run report:bulky`. The RFP sent to
carriers for the half of the catalogue AusPost cannot carry. It documents the
LIVE AusPost integration as the spec to repeat, rather than describing a wishlist,
and carries a field-level data contract.

The requirement most rate APIs miss, and the one to keep loudest: **we price
freight twice**, once at checkout to display and again server-side in
`payment-intent/route.ts` when we charge the card, because the browser sends only
the service id and never the price. So a carrier's rate must reproduce for the
same inputs, or supply a redeemable quote token. A rate that drifts between those
two calls fails the order.

Also found while writing it: **Unleashed holds 923 sales shipments and only 43
carry a tracking number**; 886 have no `ShippingCompany`. Those fields exist and
are essentially unused, so we have no dispatch visibility in our own ERP.

### Australia Post prices a third of the catalogue, and that is expected

> **The "111 of 338" figure below is STALE.** Current, from `npm run report:bulky`:
> 79 of 186 measured products are parcel-carriable (42%), 107 are bulky (58%), out
> of 220 sellable. 33 carry no carton data at all. Trust the report, not the prose.


PAC prices parcels: 22kg, 105cm longest side, 0.25m³. Of 338 listed products, 246
carry usable carton data and **111 fit those limits**. 96 are over 22kg and 109 over
105cm. Racks, rigs, machines and benches are pallet freight and always were.

`quoteFreight` checks the limits **before** calling PAC, because PAC would only
reject them. **That is no longer where the story ends:** since 2026-09-05 an
over-limit consignment goes to Easyship instead of straight to the quote flow, and
only falls back to "Calculated on quote" if Easyship is unconfigured or fails. See
the top of this section.

**Correction to earlier versions of this doc:** the "85% quotable / 33 products
missing dimensions" figure was measured over a narrower set than the shop serves.
On the listed set it is **73% (246/338)**, with 92 products short: 55 have neither
weight nor dimensions, 37 have a weight but no dimensions. Bundles are not "none at
all" either; 27 of 47 carry dimensions, but those are `-GROUP` parents whose carton
is one representative unit, and they are all $0 "Contact for pricing" so they never
reach card checkout.

### How it hangs together

- `src/lib/freight.ts` is the domain logic and BOTH carrier transports,
  `src/lib/freight-server.ts` resolves a cart against WooCommerce, and **both the
  quote route and the payment-intent route go through it**, so the price shown and
  the price charged cannot disagree.
- Weights and cartons are read server-side. **The client sends only which service
  was chosen, never what it costs.**
- **One parcel per unit**, using each product's own carton. Identical cartons are
  priced once and multiplied, since PAC takes one parcel per call.
- **It fails soft in every direction and NEVER says "Free".** No key, missing carton
  data, an over-limit carton, no service common to every carton, or a dead API all
  produce "Calculated on quote" and charge goods only.
- `npm run check:auspost` smoke-tests the live key against five destinations.

### Two bugs fixed 2026-08-24 that would have bitten the moment freight went live

Both were harmless while freight was off, which is exactly why they survived:

- `src/app/api/order/route.ts` compared the Stripe amount against a **goods-only**
  total. A freight-bearing charge would have 409'd **after the card was captured**,
  leaving a paid customer with no order. It now reads the freight figure from the
  PaymentIntent metadata (written by our own server at intent creation) rather than
  re-quoting the carrier after payment.
- `src/lib/woo-orders.ts` hardcoded `free_shipping 0.00`, so Woo and Unleashed would
  have recorded zero freight on a charge that included it. It now writes the real
  figure, and when no freight was charged the line reads **"Freight quoted
  separately"** rather than "Free shipping", so nobody picking the order reads $0 as
  permission to ship for nothing.

🔎 **The `flat_rate` shipping line is new and needs one test order** to confirm the
WooCommerce → Unleashed sync still maps it (see §6, which verified the pipeline with
the old `free_shipping` line).

🔎 **Verify GST on the first real quote** or freight undercharges by 10%. See
`LAUNCH.md` §1b.

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
| order into WooCommerce | built, `woo-orders.ts`, gated by `WC_WRITE_ENABLED` — **but see the key warning below** |
| WooCommerce → Unleashed | **already working** |
| fulfilment / labels | Interparcel Shipping Manager "Fetch Orders", no code |

**THE WOOCOMMERCE KEY IN `.env.local` IS READ-ONLY.** Proven 2026-08-21 by a real
`PUT /products/{id}`, which returned:

```
401 woocommerce_rest_authentication_error
"The API key provided does not have write permissions."
```

This is a launch blocker hiding behind a feature flag. `WC_WRITE_ENABLED=false`
today, so nothing tries to write and nothing fails. **The moment that flag is
turned on for launch, every order creation will 401 the same way** — the order
would be paid for via Stripe and then never reach WooCommerce, and so never reach
Unleashed. The three verified test orders (§6) were created before this key was
in place, so they do not prove the current credentials work.

Fix: WP Admin → WooCommerce → Settings → Advanced → REST API → create a key with
**Read/Write** permission, then set `WC_CONSUMER_KEY`/`WC_CONSUMER_SECRET` in both
`.env.local` and Vercel.

**RESOLVED later the same day, and it was worse than suspected** — see §7b. The
Vercel credentials were not merely read-only, they were dead: `getProductById`
returned null for every product, so card checkout was broken on the deployed site
and had been for some time. It hid because only the checkout path reads live
WooCommerce; everything a visitor browses comes from the snapshot, so the site
looked healthy. `WC_CONSUMER_SECRET` also held a `ck_` consumer key rather than a
`cs_` secret — same length, and invisible while the var was marked Sensitive.

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

## 7b. Shipped 2026-08-24

Freight went live, and finding out whether it worked turned up three bugs that had
nothing to do with freight. Every one of them was invisible from the code alone.

### Card checkout was broken on the deployed site

**The WooCommerce credentials in Vercel were dead.** `getProductById` returned null
for every product, so `payment-intent` answered "We couldn't price one or more
items" and nothing could be bought. It had presumably been broken for some time.

It was invisible because **product pages, categories and search all serve the
committed snapshot in `src/data/`** and only the checkout path reads live
WooCommerce. The site looked completely healthy. This is the "unverified Vercel
key" from §8 earlier the same day, now proven rather than suspected.

**Lesson worth keeping: set Vercel vars NON-sensitive where you can.** Sensitive
values cannot be read back, which is exactly why a dead key sat there unnoticed.
Reading them back immediately caught `WC_CONSUMER_SECRET` holding the consumer key
(`ck_`) rather than the secret (`cs_`) - same length, invisible any other way.

### WooCommerce was adding GST to a GST-inclusive freight charge

Test order `490118` was charged **$86.80** and recorded as **$90.48**, in both
WooCommerce and Unleashed. The shipping line sent the GST-inclusive $36.80 and the
store added another $3.68.

The line items three lines above already divide by GST and carry a comment saying
why. The shipping line did not. **Only an order that actually carries freight shows
this**, so nothing short of a real end-to-end test would have caught it.

### Newsletter signups were being discarded

`HUBSPOT_FORM_NEWSLETTER` has never existed. With no GUID `submitHubspotForm`
returns "skipped", and the route still returned `ok: true`, so subscribers saw a
thank-you and the address reached nothing but a log line. Unlike the contact and
quote forms there was no email fallback. There is now, with tests for all four
states.

### Also

- **Freight (Australia Post) is live and verified.** See §5.
- The checkout announced "Pricing updated since you added to cart" on every
  freight-bearing order, because it compared a freight-inclusive total against a
  goods-only subtotal. Nothing had repriced; the difference was the freight,
  itemised directly above the warning.
- The order confirmation read "#490118is in." JSX trimmed the space; the source
  looked right and the bundle did not. Now explicit.
- **Business address moved** to 8/337-339 Settlement Rd, Thomastown VIC 3074.
  Updated on `/privacy-policy` and `/returns`, along with the stale phone number
  there (now `(03) 9044 9575`, which every other surface already used).

  **⚠️ BLOCKED, NOT DONE: the WordPress side.** Michael could not get into
  wp-admin on 2026-08-24. Whoever has access needs to change three things, and
  the first affects tax and invoices, not just wording:
  1. **WooCommerce → Settings → General**, Store Address. WooCommerce calculates
     tax from this and prints it on invoices and packing slips. Clear the
     "Factory 2" line.
  2. **WooCommerce → Settings → Emails**, "Footer text" under Email template.
     Still reads `© 2021 — MASTERKRAFT / Factory 2, 73 Dohertys Road, Laverton
     North, VIC 3026`. Fix the year while there. Check "From" name and address
     on the same screen.
  3. **A PDF invoice plugin, if one is installed** (commonly WooCommerce PDF
     Invoices & Packing Slips), keeps its OWN shop address. If invoices are PDFs
     rather than plain emails, this is the one customers actually see.

  Then search wp-admin for `Dohertys` and `Laverton`: the address tends to also
  sit in a theme option or an old page. Most are invisible now the front end is
  headless, but anything feeding emails or PDFs still reaches customers.
- **The Woo → Unleashed sync is confirmed working with the new `flat_rate` shipping
  line.** Order 490118 reached Unleashed under the same number. §6 had only ever
  proven it with the old `free_shipping` line.

**Test order 490118 needs cancelling** in WooCommerce and Unleashed.

---

## 8. Shipped 2026-08-24 (earlier the same day)

12 commits, `e41431a` through `36e2ee0`. Dated 2026-08-21 in the original write-up;
that was wrong, it is the morning of the same day as §7b. All deployed and verified on
`web.test.masterkraft.com`.

### The site no longer reads WooCommerce to render anything

Product, variation and category data now comes from a **committed snapshot** in
`src/data/`, generated by `npm run build:catalogue`. Same argument `obsolete.ts`
already made about Unleashed: the store answers in 1.5-2.5s per request, refuses
bursts, and its content changes only when someone edits a product.

Proven, not assumed: a production build served with `WC_STORE_URL` pointed at a
dead host rendered every listing, search, product page and the sitemap with
unchanged counts. Warm renders are 0.014-0.09s against cold baselines of 19.2s
(`/equipment/strength`) and 7.3s (`/all-equipment`).

**The checkout path still reads the store live, on purpose.** `getProductById` and
`getVariation` run once per checkout, so the latency is affordable, and an order
must never be priced off a snapshot that is a content edit behind the store.

The snapshot holds **no visibility rules**. All four still run at the same
chokepoint in `woocommerce.ts`, so it cannot drift from what we serve. Two things
that caught us:

- **WooCommerce's `category=` matches descendants.** Filtering on the parent id
  alone silently dropped 7 products. `withDescendants()` reproduces it.
- `menu_order` is **0 on all 512 products**, so the "Featured" sort is
  WordPress's internal fallback, not a merchandising decision anyone made.

`catalogue-parity.test.ts` proves the snapshot answers the same questions the live
store does (32 assertions: category sets, sub-categories, search, variations,
`parseProductDetail` field-for-field). Skipped by default; run
`npm run verify:catalogue`.

### Deploys are gated

There was no gate before: no CI, no `vercel.json`, and nothing called
`check:obsolete`. `npm run deploy` now runs the checks first. See §1.

### 89 live content defects fixed

Products showing `Warranty: 12` now read `12 months`. The discrete Warranty field
held a bare number and, unlike Net/Gross weight, the renderer appends no unit.
Applied against the live store: 89 applied, 0 skipped, 0 failed, previous values
in `reports/warranty-fix-rollback.json`.

### Reports

- `reports/wc-spec-gaps.csv` — 783 items across 218 of 220 served products, with
  both competing values and the literal action. `npm run report:specs`.
- `reports/interparcel-sample-shipments.csv` — 15 real consignments for rate
  quoting. `npm run report:freight`.

### Two bugs found in our own checks

- `check:obsolete` diffed the whole `obsolete-skus.json`, including a
  `generatedFrom` product counter. It blocked a real deploy when the ERP grew
  from 1,892 to 1,942 products while all 804 retired codes were identical. Now
  compares the codes.
- The `deploy` script called a bare `vercel`, which does not exist on this
  machine. Now goes through `npx`.

---

## 9. Shipped 2026-08-20

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

## 10. Open / blocked, by owner

### Michael

**Added 27 August, in priority order. The first one gates most of the rest.**

- **SEND THE EMAIL TO PAUL.** Drafted, sitting unsent in Outlook drafts, needs his
  address. Text is `docs/email-paul-subdomain.md`; it leads with a request for a
  full cPanel backup, with the subdomain as the fallback ask. **There is a deadline
  that is not ours:** his server holds a Let's Encrypt certificate for
  `masterkraft.com` expiring **27 September 2026**, renewed by HTTP validation
  against a hostname that now resolves to Vercel, so the renewal will start
  failing. The WooCommerce migration, the new categories filling with stock, and
  card checkout mattering at all are all downstream of this conversation starting.
- **107 apparel SKUs that the website has never been able to sell.** MasterKraft's
  own apparel, lighting and reformers are all in Unleashed but were never created
  in WooCommerce, which only ever got the Snap and REVL versions. Ask Steve or
  Gaetana whether that was deliberate (wholesale-only) or an oversight. If it is an
  oversight it is a product line the site has never listed. See §0b.
- **Section 29 of the Terms is a competition that closed in April 2023.** Still
  live, presented as current. Yes/no on removing it.
- **Submit one real warranty claim** through `/warranty#claim` and confirm it
  arrives. Only the rejection paths have been exercised; submitting for real sends
  email, so it was left for a human. With no `HUBSPOT_FORM_WARRANTY` it takes the
  email fallback to `QUOTE_TO_EMAIL`.
- **Remove the `/etc/hosts` override.** `103.26.237.235 masterkraft.com` is still
  in there from cutover testing, so the live site does not appear on this machine.
- **Fix the deploy gate** (§1 DEPLOY). `check:catalogue` cannot pass while
  WooCommerce is unreachable, so it blocks every deploy and is being stepped past.
  It should degrade to a warning rather than fail hard.

**Added 3 September (see §0e).**

- **170 catalogue fixes in Unleashed.** `npm run report:punchlist` writes
  `reports/erp-punchlist.md` grouped by category, every row one field on one
  product. No deploy needed - the site re-reads the ERP every 15 minutes. The
  biggest single win is photography: 121 of the 170 are a missing image, and
  `masterkraft-portals-franchisee` has `scripts/harvest-unleashed-images.py`
  which fills blanks from the ERP's own CDN.
- **Decide the 19 rename families.** 49 cards that would collapse into one card
  with a picker if renamed to the `Name - Option` shape. Listed in §0e; five are
  judgement calls that need someone who knows whether Olympic Power Rack 1.0-5.0
  are five racks or five options.
- **Resolve the 19 duplicate-name pairs.** Two ERP records, one name, two code
  schemes, only the first ever sold.
- **Vercel seat for `michael@masterkraft.com`** is still invite-pending and needs
  an account at that address; the invite must be accepted from that session or
  the seat rebinds to the gmail login. Carried from 2 September.
- **Set the git identity in the other MasterKraft repos** before their next
  deploy - they inherit the global PartTimeCMO address and will hit the same
  block. One line each: `git config user.email "marketing@masterkraft.com"`.

**Added later on 3 September (see §0f).**

- **Get at the MasterKraft Supabase project. This is one task, not two, and it
  has been open since 25 August.** Two migrations are queued behind a single
  credential:
  1. `supabase/migrations/20260825_admin_identity_and_audit.sql` - the admin
     console's identity and audit tables (§13b).
  2. `supabase/migrations/20260903_not_found_hits.sql` - the 404 log (§0f).

  ~~**Why neither has run:**~~ **BOTH HAVE RUN, 2026-09-06.** See §13c.

  The diagnosis above was half right and half wrong, and the wrong half cost
  three sessions. `pmydkwszkgjnolrcnenh` was never the website's database: it is
  the **Catalogues** project, it holds `catalogue_quotes` and
  `catalogue_quote_staff` for `masterkraft-portals-franchisee`, and it sits in
  ap-northeast-2 (Seoul). Every session that tried to reach it was trying to put
  the site's tables in another app's database, in the wrong hemisphere.

  Still true: **`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are not in Vercel
  in any environment.** The service role key bypasses RLS - it must be a
  Production secret and must never take a `NEXT_PUBLIC_` prefix.

  **What it costs while it waits.** Nothing breaks: `adminDb()` returns null and
  both features degrade by design. But `/admin` has been running without its
  identity and audit tables since 25 August, and the 404 log records nothing, so
  every day of dead-URL traffic since 3 September is evidence that is simply
  gone. The redirect map cannot be argued from evidence that was never collected.
- **Decide whether the ERP or the SKU prefix is right about 8 products.**
  `pro-bumper-plates`, `power-bands`, `retail-rack` and five more serve and sit
  in the sitemap on R-prefixed codes, because `erpUnits()` reads the ERP's brand
  field while the visibility rule reads the SKU. One of the two is wrong about
  these. If the ERP is right the codes want fixing in Unleashed; if the SKU is
  right the brand filter needs to reach the ERP path too.
- **Watch the redirect count.** 362 of Vercel's 1,024, and the generator hard
  fails at 900 rather than shipping a truncated map. At that point the move is
  the Proxy + Bloom filter approach in the Next docs.

- **The Recovery Roller waitlist page (`/recovery-roller`) is built but MUST NOT be
  promoted yet.** Three things gate it, and two are promises the page makes:
  1. **`HUBSPOT_FORM_WAITLIST` does not exist.** Until it is created and set, every
     registration falls back to email. That path is built and tested, so nothing
     is lost, but the contact is not in HubSpot and the list cannot be pulled for
     the November send. The custom properties the route sends also need creating:
     `site_count`, `purchase_timeframe`, `opt_in_status`, `contact_source`,
     `source_campaign`.
  2. **Lead routing has no owner.** Build Kit doc 14 still routes enquiries to
     Adam, who has left. Registrations currently email `QUOTE_TO_EMAIL`.
  3. **Somebody has to actually send the spec sheet and pricing.** The page trades
     an operator's details for them. The list will be small and high value, so
     this is a personal send, not a campaign.
- **Is the Recovery Roller render approved for public use?** It is the hero of
  that page at a larger size than anywhere else, extracted from the design preview
  to `public/recovery-roller/roller-render.png`.
- ~~**THE LAUNCH BLOCKER: the WooCommerce key in Vercel.**~~ **RESOLVED 2026-08-24,
  see §7b.** It was worse than suspected: the Vercel credentials were dead rather
  than read-only, card checkout was broken on the deployed site, and
  `WC_CONSUMER_SECRET` held a `ck_` consumer key instead of a `cs_` secret. Kept
  here for the lesson: **set Vercel vars non-sensitive where you can**, because a
  value you cannot read back is a value nobody checks.
- **Card checkout: live or quote-only.** Staging shows a **card form on a `pk_test`
  key**, which would reject a real card. `LAUNCH.md` used to claim the checkout was
  quote-only; it is not. `paymentsConfigured` is simply "a publishable key exists".
- ~~**The Australia Post API key.**~~ **Done** — set in Vercel Production, and the
  live deployment is newer than it, so freight quoting is live. Verified
  2026-08-25.
- **A second carrier for the heavy two-thirds.** Australia Post prices 111 of 338
  listed products; racks, rigs, machines and benches are pallet freight. Commercial
  decision, not outstanding code.
- **Void the test orders** sitting in Unleashed: `490100` and `490102` (§6), plus
  `490118` from the 2026-08-24 freight test (§7b).
- **Form-delivery test** - needs a go-ahead, it emails the team and creates a real
  HubSpot contact.
- **The admin support desk needs three env vars before it exists in production**
  (§13b). `ANTHROPIC_API_KEY` from console.anthropic.com (billed per token,
  separate from any Claude subscription), plus `ADMIN_PASSWORD` and a random
  `ADMIN_SESSION_SECRET`. All three go in `.env.local` and Vercel Production.
  Until then `/admin` returns 404 everywhere, which is the intended safe state.
  No live model conversation has been run against it yet.
- ~~**Home gym photos.**~~ **Done 2026-08-25** - `/fitout/home-gym.jpg`, cropped from
  Michael's own garage setup. Worth knowing it is tonally different from its five
  siblings, which are professionally shot, dark and moody; this one is a bright,
  flat phone photo. It is real MasterKraft equipment and it beats the
  product-category placeholder it replaced, but if a styled home-gym shoot ever
  happens, this is the first tile to swap.

### Steve
- **Domain / DNS cutover, option A or B** (`LAUNCH.md` §2). The big gate:
  indexing, `NEXT_PUBLIC_SITE_URL` and the OG image colour all wait behind it.
- **The 15 example shipments are still useful, for a different carrier.**
  `reports/interparcel-sample-shipments.csv` was built for Interparcel, who are no
  longer the carrier. The consignments themselves are real catalogue weights and
  cartons spanning 1kg to 450kg, so they are exactly what a **pallet-freight**
  quote from Mainfreight or Freight Exchange needs. Regenerate with
  `npm run report:freight`; the origin is now known, so they are no longer
  originless.
- **28 products have specs that genuinely disagree** between the two content
  sources, and the page shows the discrete one, so these are wrong on the site
  now. Several are order-of-magnitude errors: `MCTMSP02` net weight 480 against
  180kg, and the C2 rower `SCRWAR04` assembled size `24,400 x 6,100` against
  `2,440 x 610 x 1,150`. Filter `reports/wc-spec-gaps.csv` to `issue=conflict`.
  Ten of them are weight disagreements, which is also why those products are held
  out of the freight samples: we will not quote a rate against a number we cannot
  stand behind. A wrong weight is now a wrong freight charge, not just wrong copy.
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
- **FIXED 2026-08-21: the 89 warranties that showed no unit.** Kept here because
  the cause is worth knowing: the discrete Warranty field held a bare number and,
  unlike Net/Gross weight, `parseProductDetail` appends no unit to it. If someone
  types `12` into that field again, the page will read `12`.
- **`ABPBSB04` (Plyometric Foam Stacker Box) has impossible carton dimensions**:
  `850 x 1000 x 305 cm`, ie 259 cubic metres. Millimetres typed into a centimetre
  field. It is the only one of 187 quotable products like this, so it is a typo
  rather than a units problem, but a cart containing it would ask Interparcel to
  quote a 259m3 consignment.
- ~~**89 products show a warranty with no unit.**~~ The product page renders
  `Warranty: 12` where it should read `12 months`: the discrete Warranty field holds
  a bare number, and unlike Net/Gross weight the renderer appends no unit to it. The
  blob has the full value, but the discrete field wins. **Customers see this today.**
  Found 2026-08-21 by `npm run report:specs`; every affected SKU is in the CSV with
  the exact value to type.
- **28 products have specs that genuinely disagree** between the discrete field and
  the blob, and the page shows the discrete one. Several are order-of-magnitude
  errors: `MCTMSP02` net weight 480 vs 180kg, `SCRWAR04` (C2 rower) assembled size
  `24,400 x 6,100` against the blob's `2,440 x 610 x 1,150`. These are wrong on the
  site right now.
- **26 warranty values read "3 monthsmonths"** in the served set (including
  `MBPB3I101` and `MSCMDU01`). The typo is in the legacy `specification_text` blob,
  **not** the Warranty field, so anyone fixing it will look in the wrong place. The
  cheap fix is to type the correct warranty into the discrete Warranty field, which
  overrides the blob. The site already repairs this at render time, so it is a
  source-data problem rather than a visible one.
- **The full spec punch list is `reports/wc-spec-gaps.csv`** (872 items across 218 of
  the 220 served products), with `reports/wc-spec-gaps-summary.md` for the counts.
  Regenerate with `npm run report:specs`. Each row carries the field, both competing
  values and the literal action to take. Only the 143 priority-1 items change what a
  customer sees; the rest is cleanup needed before `specification_text` can be
  retired. **Doing this work is worth it whether or not the content ever leaves
  WordPress** - it is the expensive, destination-independent half of any migration.
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

## 11. Reference: the WordPress side and the cutover

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

## 12. Env vars

**`WC_CONSUMER_KEY`/`WC_CONSUMER_SECRET`: `.env.local` now holds the Read/Write
pair; Vercel's are unverified and probably not** - see §10, first item.

Set and working: `WC_*`, `UNLEASHED_*`, `NEXT_PUBLIC_GA_ID` (G-86MEH5QL99),
`NEXT_PUBLIC_HUBSPOT_PORTAL_ID`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (**pk_test**),
`NEXT_PUBLIC_SITE_URL` (= web.test.masterkraft.com).

Not set: `NEXT_PUBLIC_ALLOW_INDEX` (correct for staging), `INTERPARCEL_API_KEY`,
`FREIGHT_COLLECTION_*`. Server secrets (HubSpot form GUIDs, Resend, Stripe secret,
WC write) remain unverifiable without a live test.

`FREIGHT_MARGIN_PERCENT` defaults to 15 in code; set it only to change that.

**Admin console (new, 2026-08-25):** `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`
(32+ random hex), `ANTHROPIC_API_KEY`. All three are local-dev only right now and
**none is set in Vercel**, so `/admin` 404s in production until they are. See §13b.

---

## 13. Conventions

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

## 13b. The admin support desk (`/admin`), built 2026-08-25

An internal console where a Claude agent answers product, stock, order and
delivery questions against the real systems, and drafts customer replies. Built
because the customer-facing admin work had no tooling at all: answering "is this
in stock and what does delivery cost" meant opening Unleashed, WooCommerce and
the AusPost calculator by hand.

**It is not customer-facing.** Nothing it writes reaches a customer without a
staff member approving it first.

### Getting in

`ADMIN_PASSWORD` + `ADMIN_SESSION_SECRET` are exchanged for a signed, 12-hour
cookie. There are no user accounts.

**It fails closed.** With either env var unset, `/admin` and `/admin/login` both
return 404 rather than opening. Verified by unsetting the secret: 404, restored:
307 to the login page. An unconfigured deploy therefore cannot leak order data or
expose a send-email tool, which is why it is safe that Vercel has neither var yet.

`src/proxy.ts` is the gate. Next 16 renamed Middleware to Proxy and the file must
sit at `src/proxy.ts`; a `middleware.ts` there is silently ignored. The proxy is
the optimistic check the Next docs describe, so `/api/admin/agent` re-verifies the
cookie itself rather than trusting it.

### What the agent can reach

| tool | source | notes |
|---|---|---|
| `search_catalogue`, `get_product` | committed snapshot + Unleashed | matches what a visitor sees |
| `check_stock` | Unleashed, **live** | ERP is the source of truth, inc-GST |
| `lookup_order`, `list_recent_orders` | WooCommerce, live, **read only** | `lib/wc-admin.ts` |
| `check_payment` | Stripe, via the order's `transaction_id` | refunds and disputes included |
| `check_shipment` | Unleashed `SalesShipments` | see the dispatch note below |
| `quote_freight` | Australia Post | same numbers the checkout charges |
| `send_reply`, `log_enquiry` | Resend, HubSpot | **write - approval required** |

### Two freshness tiers, on purpose

`getUnleashedMap()` is a 60-minute snapshot of the whole catalogue and stays that
way: rebuilding it costs ~16s and every listing page waits on it. That is right
for the shop, where stale-but-consistent is exactly what the visitor sees.

**The support desk reads live instead**, through `getLiveEntries()` in
`lib/unleashed.ts`. A staff member repeats these figures to a customer, so an
hour-old "one in stock" is a promise rather than a display, and `MCTMSP02` has
exactly 1. Unleashed filters server-side on `productCode` and answers in
150-600ms, verified 2026-08-25, so live costs almost nothing here.

`search_catalogue` still uses the cached map, because a search can span the
catalogue. Every tool result carries its own basis, and the system prompt forbids
quoting a price or stock figure from a search without confirming it first.

### Dispatch: "no tracking number" is the normal case

`check_shipment` reads `SalesShipments`, keyed on the same order number the
website uses (verified against 488906). Two field shapes bite: `ShippingCompany`
is an OBJECT (`{Guid, Name}`) and not a string, and `DispatchDate` is Microsoft
JSON date format.

**923 shipments exist and only 43 carry a tracking number**; 886 have no carrier
recorded, because dispatch paperwork is done in carrier portals and nothing
writes back. So the usual answer is a dispatch date with nothing against it. The
tool says so explicitly and the prompt forbids reading that as "lost" or "we do
not know if it shipped". This is the same gap the freight API spec asks a
provider to close.

It also separates three cases that look alike: dispatched, order exists but has
not shipped, and no such order. A typo must not read back to a customer as a
delayed delivery.

### Sizes are three different things

`assembled_size` (ACF meta, **millimetres**) is the built machine. `packing_size`
(ACF meta, **millimetres**) is the carton. `freight_carton`
(`WcProduct.dimensions`, **centimetres**) is the same carton, and exists only to
price delivery. Weight splits the same way: net is the machine, gross is machine
plus carton, and freight quotes on gross.

`get_product` returns all of them separately and never merges them, plus a
plausibility check that flags unit errors instead of letting the agent read them
out. `SCRWAR04` records its assembled length as 24,400mm, ten times the truth,
**and its freight carton inherited it as 2440cm**. That now fires three
`data_warnings`. `MCTMSP02` (net 480kg, gross 601kg) produces none, so the check
is not just noise.

Reads go through the same modules the public site uses, so the agent cannot quote
a price the shop does not show.

### The approval gate

The two write tools never execute in the tool loop. When Claude calls one, the
route emits an `approval` event instead and stops; the console renders the exact
payload with Approve and Decline. The conversation is held in the browser, and
the approved action is re-read from the `tool_use` block in that history, so
there is no session store to keep.

One consequence worth knowing: the Anthropic API needs every `tool_result` for an
assistant turn in a single message, so a turn that mixes reads with a pending
write re-runs its read tools when you approve. All read tools are idempotent, so
this is safe, just not free.

### Verified 2026-08-25 (not assumed)

Against live systems, through the running app:

- Unleashed: `MBCTMA01` $25.00 / 7 in stock, `MCTMSP02` $7,589.00 / 1,
  `SCRWAR04` $1,705.00 / 0.
- **`SCRWAR04` shows the Unleashed price is doing real work**: the WooCommerce
  fallback for the same product is $1,375.00. A $330 gap.
- AusPost: 2x `MBCTMA01` to Parramatta 2150 quoted $36.80 Parcel Post, which is
  exactly the freight charged on real order `490118`.
- WooCommerce orders: `490118`, `490117`, `490116` returned with contact,
  address and lines.
- Auth: unauthenticated `/admin` 307s to the login page, `/api/admin/agent`
  answers 401 JSON (not an HTML login page, which would have rendered into the
  chat), and the unconfigured case 404s.

`npm run build` passes, `npx vitest run` is 86 passed / 32 skipped, and lint is
unchanged at 21 errors + 2 warnings.

### The Anthropic account

**Create a MasterKraft organisation, on a MasterKraft email and card.** Not
Michael's personal account: this is an operating cost that should arrive addressed
to the business, and a support desk keyed to one person's card stops working the
day that person steps back. Whoever's address creates the org owns it, so use
`hello@masterkraft.com` or similar rather than a personal address.

**You do not need a second login.** One Anthropic login can belong to several
organisations and switch between them in the Console. So: create the MasterKraft
org from a MasterKraft mailbox, then invite Michael's existing login into it as an
admin. Ownership and recovery stay with the business, day-to-day management
happens from the login he already uses. Billing, API keys and usage are all
per-ORGANISATION, not per-login, which is the distinction that matters.

**The trap: a key from the wrong org works perfectly.** The app reads
`ANTHROPIC_API_KEY` and cannot tell which organisation issued it. Paste a personal
key into MasterKraft's Vercel and everything runs, the usage just bills the wrong
entity and there is no clean handover later. Nothing will warn you. Check the key
was issued in the MasterKraft workspace, not merely that the console answers.

**Issue the key inside a Workspace, and set a spend limit on it.** This is not
bookkeeping neatness. An agent is a program that spends money in a loop.
`MAX_TURNS` in the agent route caps one conversation at 12 model turns; nothing in
the code caps the month, and a workspace spend limit is the only thing that does.

**A leaked `ANTHROPIC_API_KEY` is a bill, not a breach.** It buys Claude tokens
and nothing else. It does not reach Unleashed, WooCommerce, HubSpot or Resend,
which hold their own credentials, and reaching the tools at all requires
`ADMIN_PASSWORD` first. Worth knowing, because it sets how paranoid to be.

Keep it Sensitive in Vercel, but **verify it the moment it is set**: load `/admin`
and ask one question. See §7b for why that instruction is here, a Sensitive var
holding the wrong value went unnoticed for weeks because nobody could read it back.

Rough cost, estimated and not measured: **$0.10 to $0.30 a conversation**, so
roughly **$60 to $180 a month** at twenty a day. The system prompt and tool
definitions are cached, so the variable cost is mostly tool results;
`list_recent_orders` is the expensive one at maybe 6k to 8k tokens of order JSON.
The lever if that lands badly is the model (`MODEL` in the agent route): Sonnet 5
is $3/$15 per MTok against Opus 5's $5/$25.

### Why it is not a Managed Agent

Anthropic can host the agent loop and a sandbox. That is the wrong shape here. The
tools ARE the app: `getUnleashedMap()`, `quoteFreight()` and `getOrder()` are
existing functions sharing the site's env vars and its `unstable_cache` layer.
Hosting the loop elsewhere means either reimplementing all of that or exposing
MasterKraft's ERP and order data over a public API for a sandbox to call. The loop
belongs next to the data it reads.

### Identity and audit

**Two modes, and the console says which one it is in.**

| | shared | supabase |
|---|---|---|
| trigger | `SUPABASE_*` unset | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` set |
| sign in | one shared `ADMIN_PASSWORD` | work email, six-digit code emailed via Resend |
| "who approved this" | **no answer** | recorded against a person |

Shared mode is kept deliberately, not as a leftover: it means a database outage
cannot lock the team out of their own order lookups, and the console worked
before the database existed. Both `/admin` and the login page state plainly when
they are in it, because in shared mode nothing is attributable.

**No passwords in identity mode.** Identity IS the work email, proven by a code.
Nothing to rotate, and when someone leaves the business their mailbox goes and so
does their access. Codes are six digits from the CSPRNG, hashed at rest, single
use, ten minute expiry, and burnt after five wrong guesses. Requesting a code
answers identically whether or not the address belongs to staff, so it cannot be
used to enumerate who works here.

**Bootstrap:** an empty `admin_users` table means nobody can sign in to create the
first user. `ADMIN_BOOTSTRAP_EMAILS` (comma separated, in Vercel) lists addresses
allowed to sign in before a row exists; the row is created on first successful
code entry. Kept out of the repo on purpose.

**What is recorded:** the conversation, every message, and one row per write the
agent proposed. The proposal row is written BEFORE anyone decides, so a proposal
nobody acted on still leaves a trace: `/admin/activity` shows those as **never
decided**, in the accent colour, because "the agent wanted to email a customer and
nobody said yes" is the case you most want to see.

Audit writes are best effort and never raise. An audit outage must not stop
someone looking up an order for a customer on the phone. The trade is explicit: a
gap in the record beats a console that stops working.

**Schema:** `supabase/migrations/20260825_admin_identity_and_audit.sql`. Plain
Postgres apart from the RLS block, so it runs anywhere. Every table has RLS on
with **no policies**, which denies anon and authenticated outright; only the
service role key reaches them, and only from server code.

> ~~**NOT YET APPLIED.**~~ **APPLIED 2026-09-06** to `masterkraft-site`
> (`vnemkpduafnjxhkasqif`), NOT to `pmydkwszkgjnolrcnenh` - see §13c for why that
> ref was the wrong project all along. `ADMIN_BOOTSTRAP_EMAILS` and the two
> `SUPABASE_*` variables are still unset in Vercel.
>
> The SQL was validated against a real Postgres inside a transaction that was
> rolled back: tables, foreign keys, the insert/approve flow and RLS all checked
> out, and nothing persisted.
>
> **Still true on 3 September, and now blocking a second thing.** Re-checked
> that day: the API still answers "you do not have permission" for that ref, and
> `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are set in no Vercel environment
> at all. The 404 log (§0f) is queued behind the same credential, so this is one
> access problem holding two features rather than two separate jobs. §10.

### Still open

- **Identity mode is unverified end to end**, because the database does not exist
  yet. Shared mode was tested through the running app (wrong password 401, correct
  200, activity page reports no audit trail). The email-code path is built and
  typechecks, but no code has been sent or redeemed.
- Conversations are recorded but not yet re-openable in the UI. `/admin/activity`
  lists actions, not threads.

### Not verified

**`check_payment` end to end.** `STRIPE_SECRET_KEY` is empty in `.env.local`, so
the tool was only exercised down to its "not configured" branch. It does correctly
pull the PaymentIntent ref (`pi_3U7tPf...`) off order `490118`. **Note the trap:
per section 10 the deployed site runs test Stripe keys, and a test key cannot see
a live customer payment.** The tool reports which mode answered and says explicitly
not to tell a customer they have not paid on the strength of a miss.

**The model calls themselves.** `ANTHROPIC_API_KEY` was not available in the
session that built this, so the tool executors, the auth, the streaming route and
the UI are all proven, but no live conversation has run end to end. Expect to
shake out prompt-level behaviour on the first real use.

### Watch out

- **§13's lint note is stale.** It says 2 pre-existing lint errors; there are 21
  errors and 2 warnings, none in the admin code. Compare against `HEAD`, do not
  expect 2.
- Folders under `app/` starting with `_` are Next private folders and do not
  route. Cost 10 minutes here.
- The system prompt in `lib/agent/prompt.ts` sits behind a prompt-cache
  breakpoint. Keep it a byte-stable constant; interpolating anything per-request
  invalidates the cache on every call.
- `TOOL_DEFINITIONS` order is part of that same cached prefix. Appending is fine,
  reshuffling is not.
- The spec conflicts in §10 now matter more, not less. The agent will read a
  wrong weight out to a staff member and freight will price on it.

---

## 13c. The site's Supabase project (2026-09-06)

**`masterkraft-site`, ref `vnemkpduafnjxhkasqif`, region `ap-southeast-2` (Sydney),
in the MASTERKRAFT org.** All four migrations are applied and 404 products plus
11 categories of copy are loaded.

### The mistake this section exists to stop repeating

Three sessions - 25 August, 3 September, and the first half of 6 September - were
told by this document that the site's database was `pmydkwszkgjnolrcnenh`, could
not reach it, and recorded the blocker as an access problem. **It was never the
site's database.** It is the **Catalogues** project: it holds `catalogue_quotes`
and `catalogue_quote_staff` for `masterkraft-portals-franchisee`, and it lives in
`ap-northeast-2` (Seoul).

So the blocker was never a permission to chase. Every attempt was trying to put
the site's tables into another app's database, in the wrong hemisphere.

**Three projects exist in the MASTERKRAFT org**, and it is worth knowing which is
which before touching any of them:

| project | ref | region | whose |
|---|---|---|---|
| `masterkraft-site` | `vnemkpduafnjxhkasqif` | Sydney | **this repo** |
| Catalogues | `pmydkwszkgjnolrcnenh` | Seoul | franchisee portal |
| masterkraft-admin | - | Sydney | the admin app |
| snap-portal | - | Sydney | paused |

### Why a separate project rather than sharing

The `service_role` key bypasses RLS entirely. Putting the site's tables in the
franchisee portal's database would mean the portal's key could read the site's
admin identity table and its audit trail, and the site's key could read every
franchisee's quotes. Those are different trust boundaries and one leaked key
would cross both. `masterkraft-admin` already has its own project, so one project
per app was the established pattern, not a new idea.

It was also the cheapest possible moment: the site owned zero tables anywhere, so
nothing had to be migrated.

### What is in it

Eight tables, **every one with RLS enabled and no policies**, which denies `anon`
and `authenticated` outright and leaves the service role key - server code only -
as the only way in.

| table | migration | rows |
|---|---|---|
| `product_content` | `20260905_product_content.sql` | **404** |
| `category_content` | `20260905_category_content.sql` | **11** |
| `not_found_hits` | `20260903_not_found_hits.sql` | 0 |
| `admin_users`, `admin_login_codes`, `agent_conversations`, `agent_messages`, `agent_actions` | `20260825_admin_identity_and_audit.sql` | 0 |

### The content load changed nothing on the site

Deliberately. It is a COPY, not a move: **no application code reads
`product_content` or `category_content`**, and the site still serves every word
from the committed snapshot in `src/data`. Verified after loading - the home page,
the listing and a product page all still render their snapshot copy.

Three things stand between here and the site reading from the database, and none
of them has been done:

1. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in Vercel Production.
2. Code that prefers a database row and **falls back to the snapshot** when there
   is none - 404 of ~512 snapshot products have rows, and the rest are products
   the ERP does not know, so a missing row must degrade to today rather than to
   an empty page.
3. A way to edit it. Otherwise one frozen store has been swapped for another, and
   the point of the move was that somebody other than an engineer can change the
   words.

`npm run load:content` reports what it would write and writes nothing;
`load:content:write` applies it. It is idempotent, and it tracks whether a row is
**loader-owned** or **edited by a human** - after the first load all 404 are
loader-owned and safe to refresh, and any row a person edits afterwards is skipped
rather than overwritten by the frozen original.

---

## 14. Reference: brand, navigation, shop, content, REVL, resources

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

## 15. Reference: shipped 2026-08-17 (feedback round 3)

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
