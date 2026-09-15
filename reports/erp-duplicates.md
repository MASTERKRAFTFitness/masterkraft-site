# Duplicate products — ALL RETIRED as of 2026-09-15

Rule, from Michael on 2026-09-11: **keep the priced record.** Applied below.
Status as of that date.

`reports/erp-retire-before.json` holds all fifteen records involved exactly as
they were before anything moved.

---

## Done — the hoodies

One garment existed as two complete code series. The unpriced one is retired
(`Obsolete = true`; nothing deleted, and the flag is reversible in the UI).

| Code | Description | Price | Now |
|---|---|---|---|
| `MAACU02-S` | Oversized Hoodie (S) | $0 | **retired** |
| `MAACU02-M` | Oversized Hoodie (M) | $0 | **retired** |
| `MAACU02-L` | Oversized Hoodie (L) | $0 | **retired** |
| `MAACU02-XL` | Oversized Hoodie (XL) | $0 | **retired** |
| `MAACU02S` | Oversized Hoodie (Unisex) (S) | $81.82 | kept |
| `MAACU02M` | Oversized Hoodie (Unisex) (M) | $81.82 | kept |
| `MAACU02L` | Oversized Hoodie (Unisex) (L) | $81.82 | kept |
| `MAACU02XL` | Oversized Hoodie (Unisex) (XL) | $81.82 | kept |

**Three hoodie URLs became one.** `/product/oversided-hoodie` and
`/product/oversized-hoodie` both now redirect straight to
`/product/oversized-hoodie-unisex` — pointed at the survivor rather than chained
through each other. `src/lib/obsolete-skus.json` has been resynced, and the
authored copy went from 170 entries to 168.

---

## Done — the three machine pairs, retired via Sellable rather than Obsolete

Unleashed refuses `Obsolete` on these with **"Cannot set product with open
transactions as Obsolete."** No stock transactions, no open sales or purchase
orders in any active status, and no Bill of Materials membership — so whatever
holds them is not visible from the API. Rather than go hunting, Michael's call
on 2026-09-15 was to switch **Sellable** off instead.

That reaches the same place for every consumer that matters here:
`build-obsolete-skus.mjs` filters on `Obsolete === true || IsSellable === false`,
so all three landed in the committed obsolete list, and `erpUnits` already skips
`sellable === false`. The pages are gone and the redirects are in.

| Retired | Was | Survivor |
|---|---|---|
| `MSLBPL28` | Standing Hip Thrust, $0 | — see note |
| `MSLBPL27` | Standing Hip Abductor, $0 | `MSLBPL05` Standing Abductor, $2,336.36 |
| `MSLBPL08` | Multi Dead Lift, $2,418.18 | `MSLBPL21` Multi Deadlift, $2,772.73 |

**`/product/standing-hip-thrust` still serves, deliberately.** `MSLBPL28` was
only half of that page: `MSLBSE07`, the selectorised machine at $3,427.27, still
carries the name. So the URL survives and now shows **one** machine instead of
presenting a $0 plate-loaded unit and a $3,427 selectorised one as two size
options of the same product. That was the real fault and retiring `MSLBPL28`
fixed it.

## The one thing still outstanding

`MSLBPL04` is still **"Standing Hip Thurst"** — misspelled, live, and its
spelling is the page's `<h1>`. It was left alone on purpose and still must be:
correcting it to "Standing Hip Thrust" would make it read identically to
`MSLBSE07`, and the two would group into one product page again — the exact
fault just fixed.

Fixing it needs both records renamed together, e.g.

- `MSLBPL04` → "Standing Hip Thrust (Plate Loaded)" — $1,918.18
- `MSLBSE07` → "Standing Hip Thrust (Selectorised)" — $3,427.27

That is a naming decision rather than a typo fix, which is why it is still here.

## For the record — why the API could not do any of this

All six records below sit under the subgroup **Lower Body Machines**, which
occurs **twice** in the 154-entry ProductGroups list. `POST /Products` resolves
a subgroup by name, so an ambiguous name cannot be resolved and every write is
refused — see
[`erp-name-fixes-remaining.md`](erp-name-fixes-remaining.md). This is a property
of the API, not of these records.

They need the same edit by hand in the Unleashed UI: open the product, tick
**Obsolete**, save. Then run `npm run build:obsolete` and commit the result, or
`check:obsolete` will fail at predeploy.

### 1. Standing Abductor — straightforward

| Code | Description | Price | Action |
|---|---|---|---|
| `MSLBPL05` | Standing Abductor | $2,336.36 | **keep** |
| `MSLBPL27` | Standing Hip Abductor | $0 | **retire** |

### 2. Standing Hip Thrust — needs a rename as well as a retirement

| Code | Description | Price | Mechanism | Action |
|---|---|---|---|---|
| `MSLBPL04` | Standing Hip **Thurst** | $1,918.18 | plate-loaded | **keep**, and fix the spelling |
| `MSLBPL28` | Standing Hip Thrust | $0 | plate-loaded | **retire** |
| `MSLBSE07` | Standing Hip Thrust | $3,427.27 | **selectorised** | keep — *not a duplicate* |

Two things to be careful of here:

- The record the rule keeps is the misspelled one. Correcting `MSLBPL04` to
  "Standing Hip Thrust" is right, but it then reads identically to `MSLBSE07`.
- `MSLBSE07` is the **selectorised** version of the machine, not a duplicate —
  the Strength codes carry the mechanism at characters 5-6 (`PL` plate-loaded
  across 42 codes, `SE` selectorised across 21).

**Right now the site groups `MSLBPL28` and `MSLBSE07` into a single product
page** at `/product/standing-hip-thrust`, because they share a name — presenting
a $0 plate-loaded machine and a $3,427.27 selectorised one as two options of one
product. Retiring `MSLBPL28` fixes that on its own.

Suggested end state:

- `MSLBPL04` → "Standing Hip Thrust (Plate Loaded)"
- `MSLBSE07` → "Standing Hip Thrust (Selectorised)"
- `MSLBPL28` → retired

### 3. Multi Deadlift — decided, and it is an exception

| Code | Description | Price | Action |
|---|---|---|---|
| `MSLBPL08` | Multi Dead Lift | $2,418.18 | **retire** |
| `MSLBPL21` | Multi Deadlift | $2,772.73 | **keep** |

Both records are priced, so "keep the priced record" does not separate them.
Michael, 2026-09-11: **the higher price is the current one.**

That makes this the only pair where a record carrying a live sell price is
retired, so the script will not do it on the strength of the rule alone — the
entry carries an explicit `retirePricedBecause` note, without which a priced
record is refused. The reason is printed beside the write.

The API refuses it for the subgroup reason above, so it is a manual edit like
the other two.

**Follow-up, and the order matters.** `/product/multi-dead-lift` is served
today, so its redirect must not be added until the ERP record is actually
retired — `next.config.ts` matches redirects *before* routing, so a redirect
whose source still serves deletes a working page.

1. Tick **Obsolete** on `MSLBPL08` in Unleashed.
2. `npm run build:obsolete` and commit `src/lib/obsolete-skus.json`.
3. Re-run the copy-gaps report. It now reports orphaned copy, and will name
   `multi-dead-lift`:
   ```
   npx vitest run --config vitest.reports.config.mts scripts/copy-gaps.report.ts
   ```
4. Remove the `multi-dead-lift` entry from `src/data/product-copy.json`, and
   drop the line in the `multi-deadlift` copy that points at it ("Note this
   product and the Multi Dead Lift are listed separately in our ERP…"), which
   stops being true at step 1.
5. Add the redirect, now that the source no longer serves:
   ```ts
   { source: "/product/multi-dead-lift", destination: "/product/multi-deadlift", permanent: true },
   ```

The same five steps apply to `MSLBPL28` and `MSLBPL27`, against
`/product/standing-hip-thrust` and `/product/standing-hip-abductor`.
