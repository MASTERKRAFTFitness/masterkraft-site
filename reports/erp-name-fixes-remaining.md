# Product renames — DONE 2026-09-15

All eight were applied by hand in the Unleashed UI, since `POST /Products`
refuses them (see below). Verified against the API afterwards.

| Code | Was | Now |
|---|---|---|
| `MSCMSE02` | 4 Stack Multi-sation | **4 Stack Multi-station** |
| `MSCMSE04` | 5 Stack Multi-sation | **5 Stack Multi-station** |
| `MSCMSE03` | 8 Stack Multi-sation | **8 Stack Multi-station** |
| `MBSADO03` | Station Markets (Set of 20) | **Station Markers (Set of 20)** |
| `MMPAUR01` | …Vertical **Dummbell** Rack… | …Vertical **Dumbbell** Rack… |
| `MMDBCE01` | Chrome··Dumbbell Set *(two spaces)* | **Chrome Dumbbell Set** |
| `MSCSPL09` | Shoulder press | **Shoulder Press** |
| `OSCMDU01` | Functional trainer | **Functional Trainer** |

## Five of them moved a URL

A product's slug comes from its ProductDescription, so correcting a spelling
renames the page as well as the heading. All five old URLs were in the sitemap
and served, so all five now redirect in `next.config.ts`:

    /product/4-stack-multi-sation          -> /product/4-stack-multi-station
    /product/5-stack-multi-sation          -> /product/5-stack-multi-station
    /product/8-stack-multi-sation          -> /product/8-stack-multi-station
    /product/station-markets-set-of-20     -> /product/station-markers-set-of-20
    /product/…-vertical-dummbell-rack      -> /product/…-vertical-dumbbell-rack

The authored copy was re-keyed to match. The orphan check in
`scripts/copy-gaps.report.ts` — added the day before after the hoodie rename
caught us out — named all five immediately, which is what it exists for.

`MSCSPL09` and `OSCMDU01` were case-only changes and `MMDBCE01` collapsed a
double space, so those three slugs are unchanged.

## Why the API cannot do these

Kept for the record. All eight fail with:

> 400 `Product Sub Group is not a valid sub group of the selected Product Group.`

on records whose `ProductSubGroup.ParentGroupGuid` **is** their
`ProductGroup.Guid`. The discriminator is whether the subgroup **name** is
unique in the 154-entry ProductGroups list — `POST /Products` resolves it by
name, so an ambiguous name cannot be resolved:

| Subgroup | In the list | Result |
|---|---:|---|
| Unisex, Woman | 1 | written via API |
| Chest & Shoulder Machines | 2 | refused (4 records) |
| Speed & Agility | 2 | refused |
| Cable Machines, Dumbbells | 3 | refused (3 records) |

The same POST also had to be taught that `PUT` answers 405, that `/Date(…)/`
values are refused in the format they are served in, and that unset sell price
tiers are refused as null.

`reports/erp-name-fixes-before.json` holds all ten records as they were.
