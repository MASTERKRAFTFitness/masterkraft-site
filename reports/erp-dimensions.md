# ERP carton dimensions

Generated 2026-09-04 · `npm run report:dimensions`

1425 sellable, non-obsolete products in Unleashed.

| | count | what it is |
|---|---:|---|
| **Ready to import** | 7 | The ERP has no carton and the old store has a plausible one. `reports/erp-dimensions-import.csv` |
| Disagree | 0 | Both hold a carton and they differ by more than 2%. Someone picks. |
| Store value suspect | 1 | The old store's carton has a side over 300cm — millimetres in a centimetre field. |
| Needs measuring — OURS | 429 | M/N/SC codes. Neither system knows. A tape measure, not a lookup. |
| Needs measuring — portal brands | 318 | Snap, REVL, Fernwood. Live products, sold through the portals and catalogues rather than the public site. |

## How to import

`reports/erp-dimensions-import.csv` carries the product code and the four fields, in the ERP's own
axis order, ready for Unleashed's product import. No API write access needed.

**The axes are mapped, not copied.** The old store records length/width/height;
Unleashed records Width/Height/Depth. length becomes Width, width becomes Depth,
height becomes Height. Units are identical — verified across the 307 codes that
carry dimensions in both, where the ratios are exactly 1.000.

**Whole cartons only.** Where a product is missing one field, all four are sent:
a box measured as one set is coherent, half from each system is a box nobody
measured.

## Ready to import, by category

| category | products |
|---|---:|
| Equipment Storage | 3 |
| Rigs & Racks | 3 |
| Lighting | 1 |

## Needs measuring, by category

The M/N/SC codes the public site sells. Nothing can supply these — they have
to be measured. The portal brands need the same treatment on their own list;
they are separated here because it is a different channel, not because it
does not count.

| category | products |
|---|---:|
| Mixed Implements | 142 |
| Strength | 72 |
| Weightlifting | 60 |
| Apparel | 56 |
| Body Weight | 19 |
| Equipment Storage | 18 |
| Rigs & Racks | 18 |
| Other Costs | 16 |
| Flooring | 14 |
| Packages | 6 |
| Cardio | 4 |
| Lighting | 2 |
| Storage | 1 |
| Clearance | 1 |
