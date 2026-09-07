# Products the site shows and the ERP has never heard of

Generated 2026-09-07 · `npm run report:orphans`

127 snapshot products have no record in Unleashed — checked against every
code it holds, obsolete included.

| | count |
|---|---:|
| **Needs a decision** | 1 |
| **Live size pickers over stock nobody holds** | 0 |
| Size containers — correct, the ERP holds the sizes | 126 |
| Obsolete or hidden — do not render | 61 |
| Portal brands — not listed on the public site | 71 |

## The list

Live on masterkraft.com, photographed, priced, and invisible to inventory.
**Is this stock actually in the warehouse?** If it is, it needs an ERP record.
If it is not, the page should go.

### Clearance (1)

A-prefixed ex-display stock, listed on /clearance.

| SKU | product | image renders |
|---|---|---|
| `ABPBMS-01-1` | Plyometric Box 45cm | yes |

Every row, including the harmless ones, is in `reports/snapshot-orphans.csv`.
