# Product structured data: what is published, and the two fields that are not

Written 2026-09-11, alongside `seo: the Product schema stops claiming
MasterKraft made everything`.

## What the Product schema carries now

Built in `src/app/product/[slug]/page.tsx`, one `Product` plus one
`BreadcrumbList` per page.

| Field | Source |
|---|---|
| `name`, `image`, `sku` | the page's own product, images made absolute (`absoluteUrl`) |
| `description` | `plainText(short_description)` — tags stripped, entities decoded |
| `mpn` | the ERP code. There are no GTINs in Unleashed to offer beside it |
| `brand` | the ERP's brand field via `brandDisplayName`, **omitted** when it has no manufacturer to name |
| `offers` | `Offer`, or `AggregateOffer` for a range, with `url`, `priceCurrency`, `price`/`lowPrice`+`highPrice`, `priceValidUntil`, `availability`, `itemCondition` |

`priceValidUntil` rolls one year from render (`priceValidUntil()` in
`lib/site.ts`). It is a function and not a constant so it cannot be frozen at
process start, and it is not in the component because reading the clock during
render is impure.

## The two fields that are missing, and why

Google's merchant-listing enhancements want `shippingDetails` and
`hasMerchantReturnPolicy`. **Neither can be stated truthfully from what this
site publishes today.** They are not oversights, and they should not be added
until the underlying policy exists — both are merchant claims Google displays
beside the product and holds the business to.

### `hasMerchantReturnPolicy`

`/returns` (`contentPages.returns` in `lib/content-pages.ts`) says:

> "Unused items in their original packaging **may be eligible** for return
> **within the stated period** from delivery. Custom-branded, made-to-order and
> clearance items **may be excluded**."

The period is never stated. The schema needs concrete values that this text
does not contain:

- `merchantReturnDays` — a number. There isn't one anywhere on the site.
- `returnPolicyCategory` — the honest encoding of the copy above is
  `MerchantReturnUnspecified`, which is valid schema.org but earns no
  enhancement, so it buys nothing.
- `returnFees` / `returnMethod` — who pays return freight is not stated either.

**To unblock:** decide the return window in days, who pays return shipping, and
which categories are excluded; put it on `/returns` in those words; then the
schema is a transcription of the page rather than an invention.

### `shippingDetails`

`/shipping` says:

> "Freight is calculated by weight, volume and destination."

That is accurate — `lib/freight.ts` quotes per cart from real carrier APIs — and
it is exactly why a per-product `shippingRate` would be false. A single figure
would be wrong for most products and wildly wrong for the bulky ones, which are
the ones where a shipping estimate in a search result would matter most.

Region-scoped `OfferShippingDetails` is the only honest shape, and it needs a
precomputed rate table (product class × destination region) that does not exist.
Live quoting cannot serve it: these are per-request carrier calls, and the
product page renders 290 products on ISR.

**To unblock:** either publish flat freight rates or free-freight thresholds
that the business will stand behind, or precompute a rate table per region from
the freight engine and emit one `OfferShippingDetails` per region.

## Do not "fix" these by guessing

A plausible-looking `merchantReturnDays: 30` or `shippingRate: 0` would clear
Google's warning and make the site advertise terms nobody agreed to. Missing is
a warning; wrong is a commitment.
