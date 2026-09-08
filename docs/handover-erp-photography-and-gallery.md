# Handover — ERP photography and the Supabase gallery (2026-09-08)

## The one thing to read first

**"WooCommerce photography" and "the WordPress host" are two different problems,
and only the first one is still open.**

Every `masterkraft.com/wp-content/uploads/` path has 404ed since the cutover, and
`mirror-product-images.mjs` had already rewritten most of the catalogue to local
`/product-images/` paths. So a crawl finds zero `wp-content` URLs on the live
site and it is tempting to call the migration finished. It is not: those local
files are still the old store's photographs, just rehosted. The test that matters
is not "is the URL a WordPress one", it is "whose picture is this".

That distinction is what `isSnapshotImage` encodes, and getting it wrong is what
nearly shipped a no-op swap (see the first bug below).

## What is DONE and shipped

| Commit | What |
|---|---|
| `4725227` | The image swap: `withErpImages` at four surfaces, ERP photography replaces the snapshot's |
| `4a96893` | `report:photoupload` — recovers missing size photographs and stages them for upload |
| `3a87937` | The Supabase gallery: `product_images` table, loader, read path, third image source |
| `11d213b` | Clearance: the ERP's own `Clearance` group is listed beside the snapshot's |

All four are on `main` and pushed. **`3a87937` is the last thing deployed**;
`11d213b` (clearance) is merged but **not deployed**.

### The swap, measured on the live site

| | Before | After swap | After gallery |
|---|---:|---:|---:|
| Pages mixing Woo + ERP photography | 142 | 1 | 1 |
| Pages serving `/product-images/` | 127 | 2 | 2 |
| Pages serving `/product-bg/` | 16 | 0 | 17 |
| Product pages with fewer photographs than before | — | 136 | 120 |

Nothing went blank: 55 pages had no product photography before the swap and the
same 55 after, with none newly blank.

## The state of the photography

**Unleashed holds 1,521 photographs across 1,135 of 1,484 codes.**

345 sellable, non-obsolete codes have no image. That number overstates the work:

| | Codes |
|---|---:|
| Public-site products (`M`/`N`/`SC`) | 196 |
| Portal brands and cost lines | 149 |

...and within the 196, **16 are Other Costs** (freight and allowance lines that
should never have a photograph) and **52 are Apparel**, which is almost certainly
per-size SKUs — one garment in five sizes and three colours is 15 codes and one
photograph. **Weightlifting's 46 likely collapses the same way.**

**THE NEXT USEFUL PIECE OF WORK is collapsing those 196 codes into distinct
PRODUCTS**, by the range stem `getRange` already uses, so the output is a list of
things to photograph rather than a list of SKUs. Nobody can plan a shoot from 196
codes. This has not been built.

### What is left in WooCommerce and not in Unleashed

**1,067 photographs**, and most are staying there:

- **916 secondary angles** on products the ERP does cover. Unleashed holds one
  default image per code; WooCommerce often held three or four. There is no
  second image slot in the ERP — this is what the Supabase gallery exists for.
- **151 on products the ERP has no picture of**, sitting on `-GROUP` containers
  and `-v` parents. Those are WooCommerce constructs, not ProductCodes, so **no
  upload can ever close them**. They close when their SIZES are photographed.

Counted from the ERP side, the number of real ProductCodes that lack an image and
have a WooCommerce photograph available to move is **zero**. Re-derive from the
ERP, never from the snapshot's page counts.

## The Supabase gallery

`product_images`, applied to project `vnemkpduafnjxhkasqif` on 8 September.
**29 rows / 67 photographs** — 25 `gallery`, 4 `sole`.

Order is the whole design, in `withErpImages`:

```
ERP photograph  →  Supabase gallery  →  snapshot
```

Nothing in Supabase can displace an ERP picture. A product with nothing from
either source keeps what it has.

### Why it is only 67 photographs and not 916

The loader takes only the repainted `/product-bg/` files. The raw
`/product-images/` mirror files are the original white-box studio shots, and the
ERP's photography sits on a grey tile; putting them back would stand two
backdrops side by side in one gallery, on 136 pages at once, undoing exactly what
the swap bought. **Only 83 of 510 mirrored files have been through
`normalize-product-bg.py`.**

**So the repaint queue is the lever on the remaining ~126 photographs.** They are
not refused permanently — re-run `npm run load:images:write` after each repaint
batch and they arrive with no code change. The machinery is the deliverable here
more than today's 67 photographs.

### The 4 `sole` rows are inert

Worth knowing before anyone reads significance into them: two
(`micro-bands-revl`, `logistics-allowance`) are 308 redirects that never render,
and two (`acoustic-underlay`, `group-fitness-step`) already carry 4 and 6 ERP
photographs via range resolution. The "products the ERP cannot hold" case turned
out to be nearly solved already.

## Traps, all of which cost real time

**The mirror hides the problem.** `isSnapshotImage` must match three forms —
`/wp-content/uploads/`, `/product-images/`, `/product-bg/`. It originally matched
only the first two, which would have swapped almost nothing, because there is no
`wp-content` left on the live site. `woo-image-gap.report.ts` already defined
`isWoo` across all three; the code now agrees with the report that measures it.

**Any script building its own `UnleashedMap` must build it FAITHFULLY.**
`getRange` reads `name` (it splits on `" - "`), `brand` (`ranges.ts:231` keeps
only same-brand members) and `sellable`. A map missing them forms **no ranges at
all**, so every `-GROUP` container looks uncovered. This produced 37 `sole` rows
where there are 4, and 33 wrong rows were written before it was caught. Copy the
map-building in `woo-image-gap.report.ts`.

**An upsert cannot unsay anything.** Loaders here must prune what they no longer
produce, the way `erp-mirror.load.ts` does, or a fixed bug leaves its wrong rows
behind forever. Never prune a row a human has edited.

**One code can be two products.** The snapshot puts `RFRFRR` on both
`acoustic-underlay-r-v` and `impact-lock-rubber-tiles-rev-v`. Postgres rejects
the batch outright; the loader now writes neither and names the conflict.

**WooCommerce variation data is not trustworthy per size.** `SWWPOU01` (1.5kg)
points at `SWWPOU02-1S.jpg`, the 2.5kg plate's photograph. `report:photoupload`
quarantines any source claimed by two codes rather than guessing.

**The Unleashed API cannot write images.** `Images` is a GET-only field and
appears in no POST body; Unleashed's own support says images cannot be
bulk-loaded by CSV either. They go on the product record or the File Library, in
the UI, by hand. `report:photoupload` does every mechanical part and leaves the
drag-and-drop.

**The surviving copy of the S-prefixed photography is the catalogues app.**
`catalogues.masterkraft.com/woo-images/<year>/<month>/<file>` mirrors the
WordPress uploads at the same layout. 208 references in the snapshot are dead
`wp-content` paths with no local file; that host is the only place they still
exist. See `handover-product-image-backgrounds.md`.

**Supabase MCP does not reach this project.** The connected MCP holds
`lfkkacpwgmtlpxvoypcr` (CareLocate). The site is `vnemkpduafnjxhkasqif`, and the
service-role key goes through PostgREST, which runs queries but not DDL. **Schema
changes need the dashboard SQL Editor or a linked CLI.** Adding a `DATABASE_URL`
would remove this friction.

## Commands

```
npm run report:wooimages     what the site still serves from Woo, and what the ERP has
npm run report:photoupload   stage missing size photographs for manual upload
npm run load:images          DRY RUN — what product_images would change
npm run load:images:write    apply it (upserts, prunes, skips human-edited rows)
npm run report:clearance     where /equipment/clearance and Unleashed disagree
```

## Open work, in the order it is worth doing

1. **Collapse the 196 site codes into distinct products** so a shoot can be
   planned. Not built. Biggest unlock and the reason this doc exists.
2. **Deploy `11d213b`** — the clearance work is merged but not live.
3. **Work the repaint queue.** Each `normalize-product-bg.py` batch makes more of
   the 916 secondaries eligible; re-run `load:images:write` after each.
4. **The Unleashed attribute import**, still aborted at row 12 of 328. Assembled
   size, Colour, Material and Warranty for 328 products. This is the last
   substantial piece of "get the Woo data into the ERP or Supabase" and has not
   moved since 4 September. See `reports/erp-copy.md`.
5. **`product_content` is written and read by nothing.** 404 rows have been in
   Supabase since 5 September; the site still renders copy from the frozen
   snapshot. `product-gallery.ts` is the pattern for wiring it up.
6. Tighten `product-images.load.ts` to skip redirected slugs — cosmetic, the rows
   are inert.
