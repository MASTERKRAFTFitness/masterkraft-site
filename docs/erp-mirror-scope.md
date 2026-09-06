# Scope: mirroring Unleashed products into Supabase

**Not built. This is the shape of the work and the rules that keep it safe.**

## What this is, and the one sentence that decides everything

**A cache with a queryable shape. Not a second source of truth.**

Unleashed remains the product database. The mirror is written only by a refresh
job, only ever wholesale, and never by the site or a person. If the mirror and
the ERP disagree, the mirror is stale and gets overwritten — nobody adjudicates,
because there is nothing to adjudicate.

`supabase/migrations/20260905_product_content.sql` argues against exactly this,
and its reasoning is right and should be re-read before starting:

> Two systems holding a price is how they start disagreeing, and this codebase
> already carries the scars.

The scars are real. `woo-orders.ts` overrides "WooCommerce's distorted price
field". The order path carries reconciliation guards. A frozen snapshot has spent
twelve days disagreeing with the ERP about which products exist.

**This proposal does not contradict that, provided the rule above holds.** The
moment somebody edits a price in Supabase, it stops being a cache and becomes the
second system that note warns about. That is the failure mode; everything below
is written to make it hard.

## What it replaces, which is the actual reason to do it

Two dependencies, both bad, both removed by the same table.

**1. The frozen WooCommerce snapshot.** `src/data/catalogue.json` was built on 25
August and **can never be rebuilt**: `build:catalogue` fetches
`WC_STORE_URL/wp-json/wc/v3`, and since the 27 August cutover that host serves
this Next.js app and returns 404. The product list, and which products are
listable, are frozen for good.

**2. A 16-second cold start on every listing page.** `getUnleashedMap()` pages the
whole Products endpoint, ~1,500 products at 200 per request, and the source
comment records it costs ~16s because "Unleashed answers slowly and throttles
concurrency". It is wrapped in `unstable_cache` for 60 minutes, so one unlucky
visitor per hour pays that, and every listing page waits on it.

A mirror refreshed on a schedule makes both go away, and makes the site survive
an Unleashed outage rather than serving nothing.

## Can the snapshot actually retire? Measured 2026-09-06: yes.

Four things the snapshot supplies. Three need nothing from WooCommerce.

**1. Which products exist and are listable — the four visibility rules.**

| rule | source |
|---|---|
| `isBrandSku` — M/N/SC prefix | the SKU. **ERP has it** |
| `isPublicSiteSku` — M/N/SC/A allowlist | the SKU. **ERP has it** |
| `isRetiredSku` | `obsolete-skus.json`, already built from **Unleashed** |
| `catalog_visibility === "hidden"` | **WooCommerce only** |

Only the fourth is a real dependency, and it is smaller than it looks: **62
products are hidden, 25 of them on public-site SKUs, and 21 of those 25 are an
old single listing superseded by its `-GROUP` variable product** — `MWWPCP`
hidden behind `MWWPCP-GROUP`.

That is a WooCommerce structural artifact, and **it does not survive the move.**
`erp-catalogue.ts` builds a range from the name before " - " and collapses its
sizes onto one card; there is no `-GROUP` parent and no hidden single to suppress.
The rule has nothing to do in the ERP model.

What is left is roughly four genuinely withdrawn lines — Acoustic Underlay,
Aerobic Weighted Exercise Bars. **Tick `Obsolete` on those in Unleashed** and rule
4 disappears entirely. It is a handful of SKUs, not a mechanism to rebuild.

**2. Slugs and URLs.** Already in `product_content.slug`, loaded 2026-09-06. Needs
a read path, nothing more. Stored rather than derived on purpose: "Rigs & Racks"
lives at `rigs-racks`, not `rigs-and-racks`.

**3. Names, images, variations.**
- Names: the ERP's `ProductDescription`.
- Images: served by convention from `/product-images/<sku>-1.jpg`, so **presence
  is a filesystem question**, not a WooCommerce one. The dead `wp-content` URLs in
  the snapshot are read by nothing.
- Variations: `lib/ranges.ts` already builds sizes from ERP codes.

**4. Cartons for 18 products the ERP lacks.** Copy them into Unleashed —
`scripts/erp-dimensions.report.ts` exists to generate exactly that import, and it
separates the ones needing review from the ones safe to fill. Do not copy all 18
blindly: at least four are the Aerobic Weighted Exercise Bars whose snapshot
carton is millimetres.

**So the order is:** tick Obsolete on the withdrawn lines, import the 18 cartons,
build the mirror, add a read path for slugs, and the snapshot has nothing left to
supply.

## The table

One row per ERP product code, mirroring `UnleashedEntry` (`lib/unleashed.ts`)
plus the fields the catalogue derives from.

```
erp_products
  erp_code      text primary key   -- ProductCode, upper-cased
  guid          uuid               -- the ERP's own key; order lines need it
  name          text               -- ProductDescription
  price         numeric            -- DefaultSellPrice, ex GST
  stock         numeric            -- AvailableQty
  brand         text               -- ProductBrand.BrandName
  group_name    text               -- ProductGroup.GroupName -> the categories
  subgroup      text               -- ProductSubGroup.GroupName
  sellable      boolean
  obsolete      boolean
  image         text               -- Unleashed CDN url
  weight_kg     numeric
  width_cm      numeric            -- the ERP's OWN axis names. Do not rename
  depth_cm      numeric            -- them to length/width/height here: the
  height_cm     numeric            -- remap belongs in one place, and that place
                                   -- is lib/freight-server.ts
  synced_at     timestamptz not null
```

RLS enabled, no policies, exactly like the other four tables. Only the service
role reads it, only from server code.

**Not in this table:** slug, overview, features, package inclusions. Those are
`product_content`, they are website copy, and Unleashed has nowhere to hold them.
Keeping the split means a refresh can wholesale-overwrite the mirror without ever
touching a human's words.

## The refresh

A script shaped like `scripts/content.load.ts`: reports by default, writes behind
`ERP_MIRROR_WRITE=true`, idempotent, upsert on `erp_code`.

**Wholesale, not incremental.** Fetch every product, upsert every row, then mark
or delete codes that no longer came back. Incremental sync needs change detection
Unleashed does not offer cheaply, and a missed deletion is a product that sells
after it was retired.

**Scheduled.** Vercel Cron hitting an authenticated route is the least new
machinery — the project is already on Vercel and already has secrets. Hourly is
ample; the existing cache is 60 minutes and nobody has complained.

**Refuse a short read.** `build:catalogue` already refuses below 400 products and
`build:obsolete` below 1,500, both for the same reason: a truncated read that
overwrites is worse than no read at all. The mirror needs the same guard — if
Unleashed returns materially fewer products than the last successful sync, abort
and alert rather than empty the shop. `lib/freight-alert.ts` already does the
alerting.

## The read path

`getUnleashedMap()` is the single seam. Everything — listings, product pages,
search, freight, order repricing — goes through it, so this is one function.

```
mirror fresh?    -> build the map from Supabase        (fast, no Unleashed call)
mirror stale?    -> use it anyway, and refresh behind  (stale beats empty)
mirror missing?  -> fall back to live Unleashed        (today's behaviour)
```

**Fall back, never fail.** If Supabase is unreachable the site must behave exactly
as it does now. That is what makes this deployable incrementally rather than as a
cutover.

`ERP_MIRROR_ENABLED` gates the read path, defaulting to OFF, so the mirror can be
populated and inspected in production for days before anything reads it.

## Order of work

1. Migration and the table.
2. The loader, reporting-only. Compare its output against a live
   `getUnleashedMap()` and confirm they agree on every field before writing.
3. Write, scheduled, mirror read path still off. Watch it for a few days.
4. Turn the read path on. Measure the cold start; the 16 seconds should go.
5. **Only then** consider retiring `src/data/catalogue.json` — and note it also
   holds slugs and the listable-product rules, so it does not simply delete.

## The risks worth naming

**Somebody edits the mirror.** The whole design collapses into the two-sources
problem. Mitigation is social as much as technical: the table comment should say
so, and the loader should overwrite unconditionally so an edit visibly does not
survive. Unlike `product_content`, there is no "edited by a human" concept here
and there must not be.

**A partial sync half-updates the catalogue.** Handled by the short-read guard and
by upserting in one pass, but worth a transaction if Supabase makes it cheap.

**Stale prices.** An hourly mirror means a price change in the ERP can take an
hour to appear. That is already true — `unstable_cache` holds 60 minutes today —
but it becomes more visible once people think of the mirror as "the data".
`payment-intent` reprices from `getUnleashedMap()` at charge time, so a stale
price is charged, not just displayed. **If that is unacceptable, the order path
should read live Unleashed rather than the mirror**, and that is a deliberate
exception worth building in from the start.

**It does not fix the carton gap.** 688 products still have no dimensions and 40
are millimetres. Mirroring bad data faster does not make it good.
