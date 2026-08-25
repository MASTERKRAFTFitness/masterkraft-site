# Bulky freight profile

Generated from the committed catalogue snapshot by `npm run report:bulky`.
Thresholds are the ones the live checkout enforces (`lib/freight.ts`):
**over 22kg, over 105cm on any side, or over 0.25m3** is not a parcel.

## The split

| segment | products | share |
|---|---|---|
| Parcel, carried today by Australia Post | 79 | 42% |
| **Bulky, no carrier** | **107** | **58%** |
| Carton data missing, cannot be quoted by anyone | 33 | - |
| Carton data implausible, needs fixing before quoting | 1 | - |

186 of 220 listed products carry usable carton data.

## What the bulky segment looks like

| measure | value |
|---|---|
| Median weight | 43kg |
| Heaviest | 601kg (MCTMSP02, Curved Treadmill Elite) |
| Longest side | 268cm (MEFRDB11, Horizontal Dumbbell Rack - 2 Tier (10 Pair) 2.0) |
| Total cubic if one of everything | 23.8m3 |
| Average cubic per item | 0.22m3 |

### Weight bands

| band | products | share |
|---|---|---|
| 22kg to 50kg | 58 | 54% |
| 50kg to 100kg | 25 | 23% |
| 100kg to 200kg | 9 | 8% |
| 200kg to 500kg | 14 | 13% |
| Over 500kg | 1 | 1% |

### Why each falls out of parcel

| reason | products | share |
|---|---|---|
| Weight only | 18 | 17% |
| Length only | 27 | 25% |
| Volume only | 1 | 1% |
| More than one reason | 61 | 57% |

### Handling flags

| flag | products | share |
|---|---|---|
| Over 100kg, needs mechanical handling | 24 | 22% |
| Over 2m on a side, may not fit a standard pallet | 15 | 14% |
| Over 1m3, cubes out before it weighs out | 1 | 1% |

## Ten representative consignments

Spread across the range on purpose, so a rate card priced off these is priced off
what actually ships.

| sku | product | kg | carton cm | m3 | out of parcel because |
|---|---|---|---|---|---|
| ABEMMA01 | EVA Exercise Mat | 3 | 140 x 62 x 1.6 | 0.01 | length |
| MBASADJ01 | Group Fitness Step (Adjustable) | 13 | 120 x 31 x 20 | 0.07 | length |
| MEFRACC03 | Modular Storage Rack Flat Shelf | 19 | 160 x 63 x 6.5 | 0.07 | length |
| MMFWTL01 | Farmers Walk Handles (Pair) | 26 | 182 x 13 x 23 | 0.05 | weight + length |
| MMPA3601 | Competition Kettlebells (Set of 3) - 36kg | 38 | 69 x 23 x 31 | 0.05 | weight |
| MCRWAR03 | Air Rower Elite | 51 | 146 x 66 x 38 | 0.37 | weight + length + volume |
| MEFRDB05 | Vertical Dumbbell Rack - 10 Pair (Double Sided) 2.0 | 64 | 165 x 43 x 43 | 0.31 | weight + length + volume |
| MEFRACC02 | Modular Storage Rack (Kettlebells, Dumbbells) - HD 2 Tier (2m) | 95 | 212 x 40.4 x 6 | 0.05 | weight + length |
| MSLBSE04 | Hip Thrust Machine Elite (Selectorize) | 220 | 161.5 x 75.5 x 35.5 | 0.43 | weight + length + volume |
| MCTMSP02 | Curved Treadmill Elite | 601 | 185 x 91 x 56 | 0.94 | weight + length + volume |

## Records that block a quote

1 products carry carton dimensions that cannot be real, so no carrier
can price them until the source record is corrected:

- `ABPBSB04` Plyometric Foam Stacker Box- 12": 850 x 1000 x 305cm, 259.3m3

33 more carry no carton data at all.
