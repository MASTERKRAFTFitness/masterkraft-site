# Products hidden because freight cannot be quoted

Generated 2026-09-07 · `npm run report:unshippable`

**32 products** are live on their own URL and absent from every
listing and from the sitemap. Production runs `HIDE_UNSHIPPABLE=true`, and
freight needs a weight and all three carton dimensions or the whole cart
becomes unquotable, not just the line.

One of each lists at $9,273.92. That is a size, not a forecast — several
of these are bundles whose price field is the container's, not the pack's.

Measure it in WooCommerce and it leaves this list on the next snapshot build.
Nothing else has to change.

Supersedes `reports/unshippable-products.xlsx`, which was made by hand and
still lists two products the site stopped hiding on 2026-09-07.

## Start here — 4 need a single number

One reading each, and the most valuable products on the list are in it.

| SKU | product | price | needs | Unleashed has |
|---|---|---:|---|---|
| `SCRWAR04` | C2 Rower Model D PM5 Black | $1,250.00 | height | nothing |
| `SCSTAR03` | C2 Ski Erg PM5 | $1,200.00 | height | nothing |
| `SCSTACC04` | C2 Ski Erg Floor Stand | $320.00 | height | nothing |
| `MMDBPRH-GROUP` | Premium Rubber Hex Dumbbell | $0.00 | length | no ERP record |

## Everything hidden

Most valuable first.

| SKU | product | price | needs | Unleashed has |
|---|---|---:|---|---|
| `SCRWAR04` | C2 Rower Model D PM5 Black | $1,250.00 | height | nothing |
| `SCSTAR03` | C2 Ski Erg PM5 | $1,200.00 | height | nothing |
| `MWPA15001` | Coloured Bumper Plates (Set of 10) - 150kg | $882.00 | weight, length, width, height | nothing |
| `MWPA14001` | Coloured Bumper Plates (Set of 8) & 2.5kg Change Plates - 145kg | $876.00 | weight, length, width, height | nothing |
| `MWPA10002` | Competition Bumper Plates (Set of 8) - 100kg | $840.00 | weight, length, width, height | nothing |
| `MWPAFRU02` | Rubber Fixed Barbells (Set of 5 Bars) & Rack | $731.00 | weight, length, width, height | nothing |
| `MWPA10001` | Coloured Bumper Plates (Set of 8) - 100kg | $592.00 | weight, length, width, height | nothing |
| `MWPA15003` | Olympic Premium Rubber Weight Plates (3 Grip) (Set of 10) - 150kg | $570.00 | weight, length, width, height | nothing |
| `MWPA9001` | Coloured Bumper Plates (Set of 6) - 90kg | $522.00 | weight, length, width, height | nothing |
| `MRSPFW03` | Olympic Power Rack 2.0 Weight Plate Storage Rack Only | $470.00 | length, width, height | 58kg |
| `MWPA10003` | Olympic Premium Rubber Weight Plates (3 Grip) (Set of 8) - 100kg | $380.00 | weight, length, width, height | nothing |
| `SCSTACC04` | C2 Ski Erg Floor Stand | $320.00 | height | nothing |
| `MCSTACC01` | Ski Trainer Floor Stand | $262.73 | weight, length, width, height | nothing |
| `AMBXG01` | Cotton Inners (Fingerless, 100 Pair) | $90.91 | weight, length, width, height | nothing |
| `ABSADO01` | Station Markers (Set of 96) - Numbers | $88.64 | weight, length, width, height | nothing |
| `AMBXSY01` | Focus Pads | $27.27 | weight, length, width, height | nothing |
| `ABRMRL03` | Foam Roller - 45cm (black) | $22.73 | weight, length, width, height | nothing |
| `MWWAACC01` | Weightlifting Belt | $19.00 | weight, length, width, height | nothing |
| `ABSADO02` | Station Markers (Set of 15) - Boost | $15.91 | weight, length, width, height | nothing |
| `ABSADO05` | Station Markers (Set of 15) - Form | $15.91 | weight, length, width, height | nothing |
| `ABSADO07` | Station Markers (Set of 15) - Functional | $15.91 | weight, length, width, height | nothing |
| `ABSADO06` | Station Markers (Set of 15) - Hero | $15.91 | weight, length, width, height | nothing |
| `ABSADO04` | Station Markers (Set of 15) - Neural | $15.91 | weight, length, width, height | nothing |
| `ABSADO03` | Station Markers (Set of 15) - Rep | $15.91 | weight, length, width, height | nothing |
| `ABSADO08` | Station Markers (Set of 15) - Sherpa | $15.91 | weight, length, width, height | nothing |
| `ABRPPO` | Power Bands | $8.00 | weight, length, width, height | no ERP record |
| `MMDBRH-GROUP` | Rubber Hex Dumbbells | $4.55 | weight, length, width, height | no ERP record |
| `AMDBRH` | Rubber Hex Dumbbells | $3.00 | length, width, height | no ERP record |
| `MWPA15002` | Competition Bumper Plates (Set of 10) - 150kg | $0.91 | weight, length, width, height | nothing |
| `MWPA14002` | Competition Bumper Plates (Set of 8) - 140kg | $0.91 | weight, length, width, height | nothing |
| `MWPAFRU01` | Rubber Fixed Barbells (Set of 10 Bars) & Rack | $0.91 | weight, length, width, height | nothing |
| `MMDBPRH-GROUP` | Premium Rubber Hex Dumbbell | $0.00 | length | no ERP record |

Full detail, with URLs, in `reports/unshippable.csv`.
