# The apparent duplicate products, and which are actually duplicates

Generated 2026-09-11, from live Unleashed records. **Nothing here has been
changed.** The ten misspellings alongside these are handled by
`scripts/erp-name-fixes.mjs`; these are not, and the reason is below.

None of the records listed here carries stock — `StockOnHand` returns zero
across all fifteen — so the risk is not inventory. It is identity: deciding
which record is the product, and that is a catalogue question, not a data one.

## First, a correction

An earlier note of mine listed `standing-hip-thrust` / `standing-hip-thurst` and
`standing-abductor` / `standing-hip-abductor` as duplicates. **At least one of
those is not a duplicate,** and the code structure says so.

The Strength codes encode the loading mechanism in characters 5-6:

| Segment | Count | Meaning |
|---|---|---|
| `PL` | 42 | plate-loaded |
| `SE` | 21 | selectorised |

Every `MSLB**` code follows it — 22 plate-loaded lower-body machines and 5
selectorised ones, and the selectorised five are exactly the machines you would
expect to be selectorised (leg curl, leg extension, leg press).

So:

- `MSLBPL28` **Standing Hip Thrust** — plate-loaded
- `MSLBSE07` **Standing Hip Thrust** — selectorised

are two different machines that share a name, at $0 and $3,427.27. Merging them
would delete a real product. **They need disambiguating, not merging** — the site
renders ProductDescription as the `<h1>`, so as things stand two different
machines are advertised under one name at two prices.

## The four cases

### 1. Standing Hip Thrust — three records, two problems

| Code | Description | Price | Mechanism |
|---|---|---|---|
| `MSLBPL04` | Standing Hip Thurst | $1,918.18 | plate-loaded |
| `MSLBPL28` | Standing Hip Thrust | $0 | plate-loaded |
| `MSLBSE07` | Standing Hip Thrust | $3,427.27 | selectorised |

`MSLBSE07` is a separate machine (above). The question is `MSLBPL04` vs
`MSLBPL28`: same mechanism, same subgroup, one misspelled and priced, one
correctly spelled and at $0.

**Most likely:** one record superseded the other and the old one kept the price.
Which survives determines whether the plate-loaded machine sells at $1,918.18 or
needs pricing.

> Note: `erp-name-fixes.mjs` does **not** touch `MSLBPL04`'s spelling. Correcting
> it would produce two identically-named plate-loaded records and make the
> duplicate harder to see, not easier.

**Suggested:** decide which of `MSLBPL04` / `MSLBPL28` is current, obsolete the
other, and rename `MSLBSE07` to "Standing Hip Thrust (Selectorised)" —
or rename both survivors to carry their mechanism.

### 2. Multi Dead Lift / Multi Deadlift

| Code | Description | Price | Mechanism |
|---|---|---|---|
| `MSLBPL08` | Multi Dead Lift | $2,418.18 | plate-loaded |
| `MSLBPL21` | Multi Deadlift | $2,772.73 | plate-loaded |

Same mechanism, same subgroup, a $354.55 difference. Either two models, or one
product whose price was revised on a new record.

**Cannot be resolved from the data.** If they are one product, the price gap
means the wrong choice under-quotes by $354.55 on every sale.

### 3. Standing Abductor / Standing Hip Abductor

| Code | Description | Price | Mechanism |
|---|---|---|---|
| `MSLBPL05` | Standing Abductor | $2,336.36 | plate-loaded |
| `MSLBPL27` | Standing Hip Abductor | $0 | plate-loaded |

Same shape as case 1: same mechanism, one priced and one at $0. The names are
plausibly the same machine, but "Standing Abductor" and "Standing Hip Abductor"
are also both real product names in this category.

### 4. Oversized Hoodie — two code series, one garment

| Code | Description | Price |
|---|---|---|
| `MAACU02-S` | Oversized Hoodie (S) | $0 |
| `MAACU02-M` | Oversized Hoodie (M) | $0 |
| `MAACU02-L` | Oversized Hoodie (L) | $0 |
| `MAACU02-XL` | Oversided Hoodie (XL) | $0 |
| `MAACU02S` | Oversized Hoodie (Unisex) (S) | $81.82 |
| `MAACU02M` | Oversized Hoodie (Unisex) (M) | $81.82 |
| `MAACU02L` | Oversized Hoodie (Unisex) (L) | $81.82 |
| `MAACU02XL` | Oversized Hoodie (Unisex) (XL) | $81.82 |

**The clearest case here.** Two complete size runs of the same garment under the
same base code, differing only by a hyphen. The hyphenated series is unpriced
throughout; the unhyphenated series is priced throughout and matches the naming
of every other apparel range (`MAACU04S` Long Sleeve Tee, `MAACU09S` Leggings —
all unhyphenated).

**Suggested:** obsolete the four `MAACU02-*` records. That also removes two of
the three hoodie URLs the site currently serves.

> `erp-name-fixes.mjs` **does** correct `MAACU02-XL`'s "Oversided" spelling,
> because that record is live and serving a page today. If the series is
> obsoleted the correction becomes moot, which costs nothing.

## What this is worth fixing for

Each duplicate is a separate indexable URL carrying its own copy, which works
directly against the thin-content problem the product copy was written to solve.
Three hoodie pages for one hoodie is three pages competing with each other.

But every one of these decisions changes what a record quotes at, and the
[CSV-not-live-writes precedent](../docs/handover-product-copy.md) applies: a
wrong guess here puts a wrong sell price on a record that invoices.
