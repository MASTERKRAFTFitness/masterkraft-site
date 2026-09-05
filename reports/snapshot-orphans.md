# Products the site shows and the ERP has never heard of

Generated 2026-09-05 · `npm run report:orphans`

146 snapshot products have no record in Unleashed — checked against every
code it holds, obsolete included.

| | count |
|---|---:|
| **Needs a decision** | 9 |
| `-GROUP` wrappers — correct, the ERP holds the sizes | 56 |
| Obsolete or hidden — do not render | 80 |
| Portal brands — not listed on the public site | 72 |

## The list

Live on masterkraft.com, photographed, priced, and invisible to inventory.
**Is this stock actually in the warehouse?** If it is, it needs an ERP record.
If it is not, the page should go.

### Clearance (6)

A-prefixed ex-display stock, listed on /clearance.

| SKU | product | image renders |
|---|---|---|
| `ABPBMS-01-1` | Plyometric Box 45cm | yes |
| `ABRPPO` | Power Bands | yes |
| `AMDBRH` | Rubber Hex Dumbbells | yes |
| `AMDEHG` | High Grip Dead Ball | yes |
| `AWWPCB` | Competition Bumper Plates | yes |
| `AWWPOU` | Olympic Urethane Weight Plates | yes |

### Our own codes (3)

| SKU | product | image renders |
|---|---|---|
| `MBRMRL` | Foam Roller | yes |
| `MWBBFUR` | Urethane Fixed Barbells | yes |
| `MWWPOU` | Olympic Urethane Weight Plates | yes |

Every row, including the harmless ones, is in `reports/snapshot-orphans.csv`.
