# Duplicate products: what was retired, and what is left to do by hand

Rule, from Michael on 2026-09-11: **keep the priced record.** Applied below.
Status as of that date.

`reports/erp-retire-before.json` holds all fifteen records involved exactly as
they were before anything moved.

---

## Done — the hoodies

One garment existed as two complete code series. The unpriced one is retired
(`Obsolete = true`; nothing deleted, and the flag is reversible in the UI).

| Code | Description | Price | Now |
|---|---|---|---|
| `MAACU02-S` | Oversized Hoodie (S) | $0 | **retired** |
| `MAACU02-M` | Oversized Hoodie (M) | $0 | **retired** |
| `MAACU02-L` | Oversized Hoodie (L) | $0 | **retired** |
| `MAACU02-XL` | Oversized Hoodie (XL) | $0 | **retired** |
| `MAACU02S` | Oversized Hoodie (Unisex) (S) | $81.82 | kept |
| `MAACU02M` | Oversized Hoodie (Unisex) (M) | $81.82 | kept |
| `MAACU02L` | Oversized Hoodie (Unisex) (L) | $81.82 | kept |
| `MAACU02XL` | Oversized Hoodie (Unisex) (XL) | $81.82 | kept |

**Three hoodie URLs became one.** `/product/oversided-hoodie` and
`/product/oversized-hoodie` both now redirect straight to
`/product/oversized-hoodie-unisex` — pointed at the survivor rather than chained
through each other. `src/lib/obsolete-skus.json` has been resynced, and the
authored copy went from 170 entries to 168.

---

## Cannot be done from here — three pairs under "Lower Body Machines"

All six records below sit under the subgroup **Lower Body Machines**, which
occurs **twice** in the 154-entry ProductGroups list. `POST /Products` resolves
a subgroup by name, so an ambiguous name cannot be resolved and every write is
refused — see
[`erp-name-fixes-remaining.md`](erp-name-fixes-remaining.md). This is a property
of the API, not of these records.

They need the same edit by hand in the Unleashed UI: open the product, tick
**Obsolete**, save. Then run `npm run build:obsolete` and commit the result, or
`check:obsolete` will fail at predeploy.

### 1. Standing Abductor — straightforward

| Code | Description | Price | Action |
|---|---|---|---|
| `MSLBPL05` | Standing Abductor | $2,336.36 | **keep** |
| `MSLBPL27` | Standing Hip Abductor | $0 | **retire** |

### 2. Standing Hip Thrust — needs a rename as well as a retirement

| Code | Description | Price | Mechanism | Action |
|---|---|---|---|---|
| `MSLBPL04` | Standing Hip **Thurst** | $1,918.18 | plate-loaded | **keep**, and fix the spelling |
| `MSLBPL28` | Standing Hip Thrust | $0 | plate-loaded | **retire** |
| `MSLBSE07` | Standing Hip Thrust | $3,427.27 | **selectorised** | keep — *not a duplicate* |

Two things to be careful of here:

- The record the rule keeps is the misspelled one. Correcting `MSLBPL04` to
  "Standing Hip Thrust" is right, but it then reads identically to `MSLBSE07`.
- `MSLBSE07` is the **selectorised** version of the machine, not a duplicate —
  the Strength codes carry the mechanism at characters 5-6 (`PL` plate-loaded
  across 42 codes, `SE` selectorised across 21).

**Right now the site groups `MSLBPL28` and `MSLBSE07` into a single product
page** at `/product/standing-hip-thrust`, because they share a name — presenting
a $0 plate-loaded machine and a $3,427.27 selectorised one as two options of one
product. Retiring `MSLBPL28` fixes that on its own.

Suggested end state:

- `MSLBPL04` → "Standing Hip Thrust (Plate Loaded)"
- `MSLBSE07` → "Standing Hip Thrust (Selectorised)"
- `MSLBPL28` → retired

### 3. Multi Deadlift — the rule does not decide this one

| Code | Description | Price | Mechanism |
|---|---|---|---|
| `MSLBPL08` | Multi Dead Lift | $2,418.18 | plate-loaded |
| `MSLBPL21` | Multi Deadlift | $2,772.73 | plate-loaded |

**Both are priced**, $354.55 apart, same mechanism and same subgroup. "Keep the
priced record" does not separate them, and nothing in the ERP does either — no
stock, no attributes, no notes.

Either they are two models that both need clearer names, or one superseded the
other and the wrong choice under- or over-quotes by $354.55 on every sale. This
one needs a decision from someone who knows the catalogue; it has been left
untouched.
