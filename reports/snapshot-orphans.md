# Products the site shows and the ERP has never heard of

Generated 2026-09-07 · `npm run report:orphans`

126 snapshot products have no record in Unleashed — checked against every
code it holds, obsolete included.

| | count |
|---|---:|
| **Needs a decision** | 0 |
| **Live size pickers over stock nobody holds** | 0 |
| Size containers — correct, the ERP holds the sizes | 126 |
| Obsolete or hidden — do not render | 61 |
| Portal brands — not listed on the public site | 71 |

## The list

**Nothing.** Every product the site serves resolves to an Unleashed record —
directly, through the alias map, or as a size container whose sizes the ERP
holds. This is the state to keep the report in; anything appearing here is a
page selling stock no system can confirm.

Every row, including the harmless ones, is in `reports/snapshot-orphans.csv`.
