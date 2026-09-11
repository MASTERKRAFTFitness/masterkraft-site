# Eight product renames to make by hand in Unleashed

The API cannot do these. Two of the ten went through on 2026-09-11
(`MAACU02-XL`, `MAACU12M`); these eight were refused, and the refusal is not
something this end can fix — see below.

Each is a single-field edit: open the product, correct **Product Description**,
save. Nothing else changes.

| Code | Current description | Change to |
|---|---|---|
| `MSCMSE02` | 4 Stack Multi-sation | **4 Stack Multi-station** |
| `MSCMSE04` | 5 Stack Multi-sation | **5 Stack Multi-station** |
| `MSCMSE03` | 8 Stack Multi-sation | **8 Stack Multi-station** |
| `MBSADO03` | Station Markets (Set of 20) | **Station Markers (Set of 20)** |
| `MMPAUR01` | …& Vertical **Dummbell** Rack - 10 Pair (Single Sided) 1.0 | …& Vertical **Dumbbell** Rack - 10 Pair (Single Sided) 1.0 |
| `MMDBCE01` | Chrome··Dumbbell Set (1kg-10kg Pairs) *(two spaces)* | **Chrome Dumbbell Set (1kg-10kg Pairs)** |
| `MSCSPL09` | Shoulder press | **Shoulder Press** |
| `OSCMDU01` | Functional trainer | **Functional Trainer** |

These names are the `<h1>` and `<title>` of a live product page, the key the
catalogue groups ranges by, and what prints on a quote.

## Why the API refuses them

All eight fail with:

> 400 `Product Sub Group is not a valid sub group of the selected Product Group.`

The records are not invalid. Every one carries a `ProductSubGroup` whose
`ParentGroupGuid` is exactly its own `ProductGroup.Guid` — as served by
Unleashed's own GET seconds before the POST.

The discriminator is whether the **subgroup name is unique** in the 154-entry
ProductGroups list. Over the ten records the correlation is exact:

| Subgroup | Times in the list | Result |
|---|---|---|
| Unisex | 1 | **written** |
| Woman | 1 | **written** |
| Chest & Shoulder Machines | 2 | rejected (4 records) |
| Speed & Agility | 2 | rejected |
| Cable Machines | 3 | rejected |
| Dumbbells | 3 | rejected (2 records) |

Unleashed's `POST /Products/{guid}` resolves the subgroup **by name** rather than
by the Guid on the record, so a name living under more than one parent cannot be
resolved and the write is refused.

The only API-side workaround would be renaming the duplicated subgroups so every
name is unique — which reshapes the category taxonomy the entire site reads off.
That is a much larger change than correcting eight spellings, and not one to make
as a side effect. Hence: by hand.

## Getting there before this

For the record, the same POST also had to be taught that:

- `PUT /Products/{guid}` answers **405** — it is POST, as the snap dumbbell note
  found.
- Dates come back as `/Date(1653288509907)/` and are refused in that form —
  every date has to be rewritten as ISO 8601 before the object can go back.
- Unset sell price tiers come back as `{"Name":"T8-AGENT","Value":null}` and are
  refused — the null ones must be dropped, and **only** the null ones. Three of
  these ten carry real wholesale tier pricing (`MSCSPL09` has ten tiers from
  $1,343.21 to $2,513.64) that quotes distributors and REVL franchisees.

`reports/erp-name-fixes-before.json` holds all ten records exactly as they were
before any write, as a restore point.
