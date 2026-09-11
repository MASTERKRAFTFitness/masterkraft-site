# Product copy for the ERP-only half of the catalogue

Written 2026-09-11. 170 products, in `src/data/product-copy.json`.

## What this fixed

Half the catalogue was mute. Of the 290 products in the sitemap, 145 had a
frozen-snapshot record carrying WooCommerce copy and 145 had none — so
`unitDescription()` generated the same sentence shape for all of them:

> Buy EVA Exercise Mat (Set of 10) at MASTERKRAFT. $2,000.00 inc. GST.

That string was the meta description, the `description` in Product JSON-LD, and
the page body, on ~145 indexable URLs. It was the largest single SEO problem on
the site.

## The copy could not be recovered, only written

Checked three ways before writing anything:

1. **Frozen snapshot** (`src/data/catalogue.json`, 512 records): no slug match.
   Fuzzy matching on normalised slug and name recovered 3 of 145.
2. **Live WooCommerce**, still running behind the old origin (`103.26.237.235`,
   reachable with a `Host:` header — `WC_STORE_URL` points at the apex, which is
   now this app, so it 404s): **524 products across every status**, and none of
   these. Searching it for "sweatshirt" returns nothing.
3. **SKU cross-match** over a 40-product sample: 0 exact matches, 1 prefix match.

They are lines WooCommerce never carried — the apparel, the Concept2 ergs, and
the machines added to the ERP after the store froze.

## What it was written from

`scripts/copy-gaps.report.ts` generates the brief (`reports/copy-gaps.json`).

The ERP's Notes and AttributeSet are **empty on all 1,425 products** (see
`scripts/erp-copy.report.ts`), so there is no material, colour, assembled size or
warranty text in the system anywhere. The honest inputs were:

- the product **name**, which carries material and form for most of this
  catalogue — a "Rubber Hex Dumbbell" is rubber and hex
- the **group and subgroup**
- the **size list**, where the unit is a range

**Nothing in the copy states a spec the system cannot check.** No weights, no
dimensions, no steel gauges, no load ratings, no warranty terms. Where a figure
appears it came from the unit's own size list or its name, and
`src/lib/product-copy.test.ts` enforces that with an allowlist that documents the
source of each one. A confident invented number is worse than an absent one — it
is the kind of wrong a customer discovers on delivery.

**When the ERP's attribute fields are populated, this file is where the
specifics should land.**

## How it renders

`unitAsProduct(unit, { withCopy: true })` fills `short_description` and
`description`, and everything downstream picks it up unchanged: the meta
description, the Product JSON-LD `description`, and the Product Overview.

`withCopy` is **off by default** because `unitCard()` builds every listing card
through the same function and `ProductCard` renders neither field. Attaching them
unconditionally shipped ~15 KB of markup nothing rendered into every listing
page's payload.

## What the tests guard

Thin-content guards, not spell-checks — copy that is present but templated
recreates the original problem in a longer form:

- every `short` between 60 and 155 characters
- no two products sharing a `short`
- **no pair above 0.4 trigram overlap** across all 14,365 pairs (actual maximum
  is below 0.25)
- no fabricated physical specifications

## ERP data problems found while writing

Not fixed here — this is the ERP's data, and the site reads it. Worth correcting
at source.

**A real bug — confirmed against the live ERP and fixed by
`scripts/erp-name-fixes.mjs`:**

- `sports-bra-woman` lists sizes `["S", "S", "L", "XL"]`. The cause is in
  Unleashed, not in our parser: `MAACU12M` exists, is priced identically to its
  siblings, and its `ProductDescription` reads "Sports Bra (Woman) **(S)**". So
  the medium is unbuyable under its own name and one of the two S entries is
  unreachable in the picker. **Fixed 2026-09-11**: the range now resolves
  `["S","M","L","XL"]`, and all nine of that record's wholesale tier prices were
  verified byte-identical after the write.

**Apparent duplicate products** — investigated in full in
[`reports/erp-duplicates.md`](../reports/erp-duplicates.md), which supersedes the
list that was here. Two corrections to what this note first said:

- **`MSLBSE07` "Standing Hip Thrust" is not a duplicate of `MSLBPL28`.** The
  Strength codes encode the loading mechanism at characters 5-6 — `PL`
  plate-loaded (42 codes), `SE` selectorised (21) — so those are the
  selectorised and plate-loaded versions of the same machine, at $3,427.27 and
  $0. Merging them would delete a real product. They need disambiguating names.
- The rest (`multi-dead-lift`/`multi-deadlift`,
  `standing-abductor`/`standing-hip-abductor`, the plate-loaded hip thrust pair,
  and the two hoodie code series) are **genuine candidates that cannot be
  resolved from the data** — each pair has one priced record and one at $0, or
  two different prices, so the wrong choice puts a wrong sell price on a record
  that quotes and invoices.

None of them carries stock, so the risk is identity rather than inventory.

Each duplicate is a separate indexable URL, so they work against the thing this
copy was written to fix.

**Name typos that reach the page, the `<h1>` and the `<title>`** — two are now
fixed in Unleashed, the other eight need a manual edit
([`reports/erp-name-fixes-remaining.md`](../reports/erp-name-fixes-remaining.md)
says why the API refuses them):

- "4/5/8 Stack Multi-sation" → multi-station (three products) — *manual*
- "Oversided Hoodie" → Oversized — **fixed 2026-09-11**. Correcting it merged
  that record into the S–XL range, so the orphan one-size page at
  `/product/oversided-hoodie` is gone and now redirects; three hoodie URLs
  became two
- "Standing Hip Thurst" → Thrust — deliberately NOT corrected; see the
  duplicates report, since fixing the spelling first would produce two
  identically named plate-loaded records and hide the duplicate
- "Station Markets (Set of 20)" → Markers
- "Vertical Dummbell Rack" → Dumbbell
- "Chrome  Dumbbell Set" → double space
- "Shoulder press", "Functional trainer" → inconsistent capitalisation

The copy does not repeat any of these.

**Miscategorised in the ERP** (the subgroup contradicts the product):

- `leg-extension-machine` and `seated-leg-curl` are filed under *Chest &
  Shoulder Machines*
- `glute-and-hamstring-developer` is filed under *Bicep & Tricep Machines*
- `olympic-half-rack` sits in *Strength* while every other half rack is in
  *Rigs & Racks*

These affect category pages and the breadcrumb, not just the copy.

## Coverage drift

`erpUnits()` currently holds **170** products with no copy; the live sitemap
(cached daily) lists **134** of them. The gap is ordinary drift — the ERP has
moved since the sitemap was built. All 170 are written, so newly-served products
arrive with copy rather than with the generated fallback.

Re-run `npx vitest run --config vitest.reports.config.mts scripts/copy-gaps.report.ts`
to find products added since.
