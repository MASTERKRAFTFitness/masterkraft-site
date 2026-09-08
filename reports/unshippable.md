# What each visibility rule withholds

Generated 2026-09-08 · `npm run report:unshippable`

**Two rules hide products and they are not the same rule.** Freight needs a weight
and all three carton dimensions or the whole cart is unquotable, not just the line,
so production runs `HIDE_UNSHIPPABLE=true`. What that flag does depends on which
rule serves the page.

| rule | governs | exempts |
|---|---|---|
| `erpUnits` | `/all-equipment`, every category page, the sitemap, product pages | anything priced $0 or at/above $500, as an enquiry product |
| `filterListable` | `/equipment/clearance`, which still lists from the frozen snapshot | nothing |

| | |
|---|---:|
| ERP units withheld entirely | 35 |
| ERP units that lost sizes but kept their page | 22 |
| Snapshot pages withheld with no ERP twin | 18 |
| …whose URL the ERP unit adopted, so the page is live anyway | 11 |
| …that are a second URL for equipment already sold elsewhere | 3 |

## Rule A - the ERP catalogue

What `/all-equipment`, the category pages, the sitemap and the product pages
withhold. A measurement in either source returns it.

### Withheld entirely (35)

No page, no listing, no sitemap entry. Priced under $500, so the enquiry exemption
does not save them.

| product | group | price | codes |
|---|---|---:|---|
| Linear LED Lighting System | Lighting | $445.00 | `NBLLE2501` |
| CONCEPT 2 - Ski Erg Floor Stand | Cardio | $440.00 | `C2SKIERGFS` |
| Chrome 110 Dumbbells (1kg-7kg Pairs) | Mixed Implements | $431.20 | `MMPACE103` |
| Retail Rack | Equipment Storage | $385.00 | `MERK153001` |
| Barbell Storage Box (12 Bar Holder) | Equipment Storage | $345.00 | `MEFRBB06` |
| Barbell Storage Box | Equipment Storage | $280.01 | `MEFSBB04` |
| Ski Trainer Floor Stand | Cardio | $269.00 | `MCSTACC01` |
| Power Grip Cable Attachment Set (5) | Strength | $185.00 | `MSCMATT01` |
| Olympic Urethane Weight Plates (4 Grip) | Weightlifting | $135.00 | `MWWPOU10` `MWWPOU13` |
| Urethane Fixed Dumbbells (Pair) | Mixed Implements | $132.00 | `MMDBUR19` |
| Climbing Rope | Mixed Implements | $110.00 | `MMBRNC02` |
| Olympic Dumbbell Handles (Pair) | Mixed Implements | $109.00 | `MMDBOH01` |
| Cable Pulley System | Strength | $95.00 | `MSCMATT02` |
| Squat Wedge Block | Weightlifting | $85.00 | `MWWLRR01` |
| Station Markets (Set of 20) | Body Weight | $80.00 | `MBSADO03` |
| Storage Pin with Shoulder | Rigs & Racks | $75.00 | `MRATTACC01` |
| Wall Mounted-Rope & Band Rack | Equipment Storage | $70.00 | `MEWMRO 02` |
| Impact-Lock Rubber Tiles | Flooring | $65.00 | `NBFRFRR01` `NBFRFRR02` `NBFRFRR03` `NBFRFRR04` |
| Pro Bumper Plates | Weightlifting | $64.00 | `MWWPCNB06` `MWWPCNB07` `MWWPCNB08` `MWWPCNB09` `MWWPCNB10` |
| Wall Mounted-Exercise Mat Hanging Rack | Equipment Storage | $50.00 | `MEWMMA 01` |
| Fixed PU Curl Barbell | Weightlifting | $45.00 | `MWBBFUR20` `MWBBFUR21` `MWBBFUR22` `MWBBFUR23` `MWBBFUR24` `MWBBFUR25` `MWBBFUR26` `MWBBFUR27` `MWBBFUR28` `MWBBFUR29` `MWBBFUR30` `MWBBFUR31` `MWBBFUR32` `MWBBFUR33` `MWBBFUR34` `MWBBFUR35` `MWBBFUR36` `MWBBFUR37` `MWBBFUR38` |
| LED Dimmer | Lighting | $45.00 | `NBLLE2502` |
| Wall Mounted-Battle Rope Storage | Equipment Storage | $45.00 | `MEWMRO 01` |
| Weightlifting Belt | Weightlifting | $35.00 | `MWWAACC01` |
| Acoustic Underlay (1m x 10m) | Flooring | $30.50 | `NBFAFRR01` `NBFAFRR02` `NBFAFRR03` `NBFAFRR04` |
| Fitness Ball | Body Weight | $30.00 | `MBCT5501` `MBCT6501` `MBCT7501` |
| Pilates Ring | Mixed Implements | $30.00 | `MMPILFG01` |
| Technique/Training Pipe | Weightlifting | $25.00 | `MWWLPVC01` |
| Agility Dots (Set of 5) | Body Weight | $20.00 | `MBSADO01` |
| Power Bands | Body Weight | $12.00 | `MBRPPO06` `MBRPPO07` `MBRPPO08` |
| Olympic PU Weight Plates (4 Grip) | Weightlifting | $11.25 | `MWWPOU08` `MWWPOU11` `MWWPOU14` `MWWPOU09` `MWWPOU12` |
| Micro Bands | Body Weight | $6.00 | `MBRPPO03` `MBRPPO04` `MBRPPO05` |
| Premium Rubber Hex Dumbbell | Mixed Implements | $5.00 | `MMDBPRH01` `MMDBPRH02` `MMDBPRH04` `MMDBPRH05` `MMDBPRH06` `MMDBPRH07` `MMDBPRH08` `MMDBPRH10` `MMDBPRH11` `MMDBPRH12` `MMDBPRH13` `MMDBPRH14` `MMDBPRH15` `MMDBPRH16` `MMDBPRH17` `MMDBPRH18` `MMDBPRH19` `MMDBPRH20` `MMDBPRH21` `MMDBPRH22` `MMDBPRH23` `MMDBPRH24` `MMDBPRH25` `MMDBPRH26` |
| Rubber Hex Dumbbell | Mixed Implements | $5.00 | `MMDBRH01` `MMDBRH02` `MMDBRH03` `MMDBRH04` `MMDBRH05` `MMDBRH06` `MMDBRH07` `MMDBRH08` `MMDBRH09` `MMDBRH10` `MMDBRH11` `MMDBRH12` `MMDBRH13` `MMDBRH14` `MMDBRH15` `MMDBRH16` `MMDBRH17` `MMDBRH18` `MMDBRH19` `MMDBRH20` `MMDBRH21` `MMDBRH22` `MMDBRH23` `MMDBRH24` `MMDBRH25` `MMDBRH26` |
| Cotton Inners | Mixed Implements | $1.00 | `MMBXG01` |

### Kept, but missing sizes (22)

**The page looks perfectly fine and one size cannot be bought.** `erpUnits` drops the
individual code rather than the range, by design - a rack measured in three sizes and
not a fourth should still sell the three - so nothing about these pages looks wrong.
The old report could not see this category at all.

| product | group | price | sizes lost |
|---|---|---:|---|
| Push & Pull Sled | Mixed Implements | $495.00 | 1 of 2 kept, missing `MMSLSL01` |
| Vertical Dumbbell Rack | Equipment Storage | $470.00 | 6 of 8 kept, missing `MEFSDB01` `MEFSDB06` |
| Olympic Plate Toaster Rack Portable | Equipment Storage | $445.00 | 1 of 2 kept, missing `MEFSOP01` |
| Group Fitness Barbell Set Rack | Equipment Storage | $395.00 | 1 of 2 kept, missing `MEFSPS01` |
| 3-In-1 Foam Plyometric Box | Body Weight | $330.00 | 1 of 2 kept, missing `MBPB3I103` |
| Core Trainer (Landmine) With T Bar Handle | Body Weight | $325.00 | 1 of 2 kept, missing `MBCTDR02` |
| Group Fitness Step (6 Risers) | Mixed Implements | $285.00 | 1 of 2 kept, missing `MBGFSTP03` |
| Group Fitness Step (Adjustable) | Mixed Implements | $275.00 | 1 of 2 kept, missing `MBGFSTP01` |
| Medicine Ball Rack | Equipment Storage | $205.00 | 3 of 5 kept, missing `MEFSBL03` `MEFSBL01` |
| Power Bands (Pack of 8) | Body Weight | $195.00 | 1 of 2 kept, missing `MBRPBA03` |
| PU Dumbbells (Pair) | Mixed Implements | $176.00 | 19 of 28 kept, missing `MMDBUR20` `MMDBUR21` `MMDBUR22` `MMDBUR23` `MMDBUR18` `MMDBUR25` `MMDBUR26` `MMDBUR27` `MMDBUR28` |
| Power Bands (Pack of 4) | Body Weight | $120.00 | 1 of 2 kept, missing `MBRPBA02` |
| Fixed PU Straight Barbell | Weightlifting | $90.00 | 7 of 14 kept, missing `MWBBFUR13` `MWBBFUR14` `MWBBFUR15` `MWBBFUR16` `MWBBFUR17` `MWBBFUR18` `MWBBFUR19` |
| Urethane Competition Kettlebell | Mixed Implements | $80.00 | 6 of 10 kept, missing `MMKBUR07` `MMKBUR08` `MMKBUR09` `MMKBUR10` |
| Power Bag | Mixed Implements | $70.00 | 4 of 6 kept, missing `MMPWPBG06` `MMPWPBG07` |
| Rope & Band Rack (Wall Mounted) | Equipment Storage | $70.00 | 1 of 2 kept, missing `MEWMRO02` |
| Urethane Fixed Barbells | Weightlifting | $67.50 | 4 of 5 kept, missing `MWBBFUR11` |
| Medicine Ball | Mixed Implements | $44.00 | 5 of 6 kept, missing `MMMBPR 03` |
| High Grip Dead Ball | Mixed Implements | $40.00 | 12 of 16 kept, missing `MMDEHG09` `MMDEHG11` `MMDEHG16` `MMDEHG17` |
| Foam Roller | Body Weight | $33.00 | 3 of 4 kept, missing `MBRMRL04` |
| Change Plates | Weightlifting | $26.00 | 2 of 6 kept, missing `MWWPCP03` `MWWPCP04` `MWWPCP05` `MWWPCP06` |
| Speed Rope (Elite) | Body Weight | $25.00 | 1 of 2 kept, missing `MBSAROL01` |

## Rule B - the frozen snapshot

This governs `/equipment/clearance` alone. The snapshot is an archive, so a row here
is only work if no ERP unit already sells the same equipment.

### The ERP unit adopted this URL, so nothing is hidden (11)

**Not work, and not even a duplicate.** `erp-catalogue` gives a unit the slug of the
snapshot page it covers, so inbound links and the marketing copy survive. There is one
URL, it is live, and it is priced from the ERP. The snapshot row behind it is
suppressed and no visitor can tell.

| URL | product | ERP price |
|---|---|---:|
| `coloured-bumper-plates-set-of-10-150kg` | Coloured Bumper Plates (Set of 10) - 150kg | $860.00 |
| `coloured-bumper-plates-set-of-8-2-5kg-change-plates-145kg` | Coloured Bumper Plates (Set of 8) & 2.5kg Change Plates - 145kg | $858.00 |
| `competition-bumper-plates-set-of-8-100kg` | Competition Bumper Plates (Set of 8) - 100kg | $1,200.00 |
| `rubber-fixed-barbells-set-of-5-bars-rack` | Rubber Fixed Barbells (Set of 5 Bars) & Rack | $1,170.00 |
| `coloured-bumper-plates-set-of-8-100kg` | Coloured Bumper Plates (Set of 8) - 100kg | $600.00 |
| `olympic-premium-rubber-weight-plates-3-grip-set-of-10-150kg` | Olympic Premium Rubber Weight Plates (3 Grip) (Set of 10) - 150kg | $840.00 |
| `coloured-bumper-plates-set-of-6-90kg` | Coloured Bumper Plates (Set of 6) - 90kg | $510.00 |
| `olympic-power-rack-2-0-weight-plate-storage-rack-only` | Olympic Power Rack 2.0 Weight Plate Storage Rack Only | $779.00 |
| `olympic-premium-rubber-weight-plates-3-grip-set-of-8-100kg` | Olympic Premium Rubber Weight Plates (3 Grip) (Set of 8) - 100kg | $560.00 |
| `competition-bumper-plates-set-of-10-150kg` | Competition Bumper Plates (Set of 10) - 150kg | $1,800.00 |
| `rubber-fixed-barbells-set-of-10-bars-rack` | Rubber Fixed Barbells (Set of 10 Bars) & Rack | $2,190.00 |

### A second URL for equipment sold elsewhere (3)

**Measuring these would make things worse.** The equipment is on the site at its ERP
price under a different slug; this snapshot page renders $0.00. Un-suppressing it
would put a $0.00 page beside the live one.

| suppressed page | product | sold instead at | price |
|---|---|---|---:|
| `c2-rower-model-d-pm5-black` | C2 Rower Model D PM5 Black | `concept-2-row-erg-with-standard-legs` | $1,705.00 |
| `c2-ski-erg-pm5` | C2 Ski Erg PM5 | `concept-2-ski-erg-with-pm5` | $1,650.00 |
| `competition-bumper-plates-set-of-8-140kg` | Competition Bumper Plates (Set of 8) - 140kg | `competition-bumper-plates-set-of-8-100kg` | $1,200.00 |

### No ERP twin, genuinely withheld (18)

| SKU | product | price | needs | Unleashed has |
|---|---|---:|---|---|
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
| `MMDBPRH-GROUP` | Premium Rubber Hex Dumbbell | $0.00 | length | no ERP record |

Every row is in `reports/unshippable.csv`, labelled by rule.
