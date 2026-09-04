# Product copy, for the ERP

Generated 2026-09-04 · `npm run report:copy`

415 products in the snapshot carry copy. 346 of them have a live,
sellable record in Unleashed — those are the ones that can be enriched today.

| | count |
|---|---:|
| **Public site** (M/N/SC/A) | 175 |
| **Portal brands** (S/F/R) | 171 |
| No ERP record — nothing to attach to | 69 |

## The four attribute fields

These have nowhere to live in Unleashed today. Define an Attribute Set with
them first (Settings → System Settings → Attribute Sets), then import
`reports/erp-copy-attributes.csv` — in Unleashed's own template shape, including the required
`*Attribute Set` column naming **Product Detail**. Import it at Inventory >
Products > Import/Export > Product Attributes.

`reports/erp-copy-attributes-one.csv` is the same file with a single row, for
proving the import format before committing the rest.

| field | products |
|---|---:|
| Assembled size | 328 |
| Colour | 320 |
| Material | 322 |
| Warranty | 318 |

## The prose

`reports/erp-copy-notes.csv` — 335 products, longest 1,537 characters.

Overview, feature bullets and package inclusions, flattened into one plain-text
block because Notes holds nothing richer. **Check the field's length limit before
importing** — if it truncates, the overview matters more than the bullets and
the order above already reflects that.

## Cartons recoverable from Packing size

`reports/erp-copy-cartons.csv` — 24 products where the spec table knows a carton or a
weight the ERP does not. Converted mm → cm, and mapped length→Width, width→Depth,
height→Height. Only written where the ERP's own field is EMPTY; nothing here
overwrites a measurement the ERP already has.

16 more carry a Packing size with only two axes (`L 380 × W 300 mm`),
which is not a carton and is left alone.

## What does not survive

The four attributes arrive intact. The prose does not: the product page renders
headings, bullets and a spec table, and Notes is one plain-text field. That is a
reason to keep the attributes separate from the prose, not a reason to skip it —
the ERP currently has neither.
