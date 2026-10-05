# Rubber hex dumbbell dimensions

Prepared 2026-10-05 from the factory spec sheet `HEX_DUMBBELL_SIZES.xlsx`.

Rubber Hex (`MMDBRH`, 26 sizes) and Premium Rubber Hex (`MMDBPRH`, 24 sizes)
are withheld from the site. Neither has a full carton in Unleashed or the old
store, and production hides unmeasured products under $500. Import
`reports/hex-dumbbell-dimensions-import.csv` into Unleashed and both ranges come
back at the next sync, with no code change.

## Where the numbers come from

The sheet's photos label the measurements: A = overall length, B = head width
across the corners, C = head length, D = handle length, E = handle diameter.

| Unleashed field | Value | Why |
|---|---|---|
| Width | A | Longest side. The site reads Width as length. |
| Depth | B | Head width. |
| Height | B | Head width again. Across the flats would be about 13% less, but a dumbbell's dead weight is always far above its cubic weight, so overstating it costs nothing. |
| Weight | Current Unleashed weight | Unchanged. 42.5kg and 45kg Premium had none, so they take the standard range's 44kg and 46kg. |

Values are rounded up to 0.1cm. Every row passes the site's plausibility check and
ships as a parcel.

## Assumptions to confirm

- **The "BFT Hex Dumbbell" table is the MasterKraft Rubber Hex.** It has the same
  26 sizes, including 2.5, 7.5, 42.5 and 45kg.
- **Premium uses the same head.** The old store's Premium head widths match the
  table to within about 5% (10kg is 14.0 against 13.8; 25kg is 18.0 against 18.0).
- These are product dimensions, not box dimensions. That is right if the dumbbells
  ship unboxed. If they ship in cartons, the carton sizes should replace these.

The "Revel Hex Dumbbell" table would cover REVL's `RMDBRH`. That is a portal
brand and not on this site, so it is not in the import. The "Mastercraft
Dumbbell" and "Mastercraft Barbell" tables cover the round urethane range, not
the hex dumbbells.
