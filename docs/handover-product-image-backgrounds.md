# Handover — product image backgrounds (2026-09-07)

## The one thing to read first

**The SNAP catalogue does not read images from Unleashed OR from WooCommerce.**
It serves its own frozen copies, baked into its Vercel build:

```
https://catalogues.masterkraft.com/woo-images/2023/11/MRSPFW01-1S-1.jpg?dpl=dpl_…
└─ catalogue's own domain          └─ mirrored WordPress path        └─ Vercel deployment id
```

So fixing an image in Unleashed cannot change that page, and neither would writing
to WooCommerce. **To fix the catalogue you must replace the files under
`woo-images/` in the catalogue app's own repo and redeploy it.** That repo is on
this machine at `~/Desktop/masterkraft-catalogues` (a sibling app,
`~/Desktop/masterkraft-portals-franchisee`, has its own `public/woo-images/`).

This was established late. A large amount of Unleashed work was done first on the
assumption that the catalogue read the ERP live. That assumption was never
verified until the image URL above was produced. The ERP work is real and correct
— it just does not achieve the catalogue fix on its own.

## What the job was

Product photos whose backdrop does not match the grey tile they sit on render as a
visible box. Originally reported on masterkraft.com/all-equipment, later on
`catalogues.masterkraft.com/catalogue/snap-hq/products`.

## What is DONE and shipped

### In this repo (committed and pushed to `main`)

| Commit | What |
|---|---|
| `139eb0e` | 214 ERP photos repainted to `#e6e6e6` → `/public/erp-bg/` + `erp-image-overrides.json`; wired into `unleashed.ts`, cache key bumped to v7 |
| `e1fb544` | Record correction for two data-loss bugs in `normalize-product-bg.py` |
| `f23af92` | Python DNS pin; `normalize-product-bg.py` re-pointed at the live store; 45 `/product-bg` images re-derived from true originals (41 improved, 0 regressed) |
| `4109d8c` | `is_studio`/`cutout` contrast gate; `scripts/export-brand-images.py`; untracked the 101 MB export dir |

Deployed to production (masterkraft.com) as of `dpl_5W5LbAnrhYftB7PCx1dExR5f7cHe`.
The white backgrounds on the public shop grid are fixed and verified live.

### In Unleashed (UI uploads — NOT code, nothing to commit)

**~125 products converted**, each verified through the API. Every one keeps its
original JPEG as a second attachment, so **any of them reverts with one menu
click** (gear → Make Default Image on the JPEG row).

- **All 64 SNAP products whose backdrop clashed** — verified 64/64 in a final sweep.
  Includes the full `SMDBUR01–28` dumbbell range (26) and `SWBBFUR` barbells (13).
- ~55 further SNAP products that were already on `#e6e6e6` (cosmetic only).
- `C2ROWERG`, `C2SKIERG`, `C2SKIERGFS`. (`C2BIKEERG` was already a transparent PNG.)

## ~~IMMEDIATE NEXT ACTION (prepared, not done)~~ — DONE 2026-09-07

Getting the WooCommerce photography into Unleashed. **The gap is only 7 products**
(Woo has a photo, Unleashed has none). Cutouts are already generated in
`reports/woo-to-erp/` alongside `-original.jpg` copies:

> **ALL SEVEN ARE UPLOADED AND API-VERIFIED (2026-09-07).** Each now carries
> exactly one image, set as default, and it is the PNG cutout. Nothing was
> displaced — these products had no image at all — so the revert is simply
> deleting the attachment, and none of the ~125 conversion backups was touched.
> The `file_upload` path auto-set each as default; the DOM "Make Default Image"
> dance below was not needed for a product with no existing image.
>
> **AND THE GAP IS NOW ZERO, measured from the ERP side**: of the 402 Unleashed
> codes still carrying no image, NOT ONE has a WooCommerce photograph available
> to move. 1082 of 1484 codes now have a picture, up from 1075.

| Code | Unleashed product id | Woo source file |
|---|---|---|
| SLLE2501 | 2531 | SLLE2501-1S.jpg |
| SLLE2502 | 2532 | SLLE2502-1S.jpg (left as shot — no removable backdrop) |
| SRSPFW01 | 2537 | MRSPFW01-1S-1.jpg |
| SRSPFW03 | 2538 | SRSPFW03-1S.jpg |
| SRSPFW04 | 2539 | SRSPFW04-1S.jpg |
| SRSPSE01 | 2540 | SRSPSE01-1S.jpg |
| SSWBFW01 | 2521 | SSWBFW01-1S.jpg |

A further **150 Woo SKUs do not exist in Unleashed at all**, so there is no record
to attach an image to.

## How to upload to Unleashed (the only way that works)

**Unleashed's API cannot write images.** `Images` is GET-only, there is no
Attachments/Files endpoint, and CSV import cannot carry images. Confirmed against
the API docs and changelog. It is a UI-only operation.

Web app (NOT `unleashedsoftware.com` — that is a different tenant and repeatedly
hitting its login endpoint will knock out your Access session):

```
https://go.unleashed.erp.accessacloud.com/v2/Product/Update/<id>#attachments
```

Per product, ~2 tool calls:

1. `browser_batch`: navigate via JS + wait 7 + `find` "the actual input element with
   type file for uploading, not its container"
2. `file_upload` with that ref
3. Fold the set-default into the *next* navigate call using this DOM script — it is
   far more reliable than clicking pixels (the success toast overlays the tab bar,
   and the window frame size changes between 1568x758 and 1514x784):

```js
const sleep=ms=>new Promise(r=>setTimeout(r,ms));await sleep(3000);
const tab=[...document.querySelectorAll('a')].find(a=>/tabsAttachments/.test(a.getAttribute('href')||''));if(tab)tab.click();await sleep(2500);
const rows=[...document.querySelectorAll('tr')].filter(r=>/\.png\s*$/m.test(r.cells?.[1]?.textContent?.trim()||''));
let s='no png row';
if(rows.length){const row=rows[rows.length-1];const gear=row.querySelector('td:last-child img, td:last-child a, td:last-child div');
if(gear){gear.click();await sleep(1500);
const item=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&e.textContent.trim()==='Make Default Image').pop();
if(item){item.click();await sleep(2500);s='ok';}else s='menu missing';}else s='gear missing';}
window.onbeforeunload=null;location.href='/v2/Product/Update/<NEXT_ID>#attachments';s
```

Notes:
- Product code → numeric id: `GET /v2/Enquiry/GlobalAutocomplete?term=<CODE>` → `{id}`.
- Every product page raises a spurious "unsaved changes" dialog after an attachment
  change. The write has already landed server-side; `window.onbeforeunload=null`
  before navigating is safe (verified against the API before relying on it).
- `find` sometimes returns the "browse local files" button or a wrapper `div`
  instead of the input. If `file_upload` errors with "Element is not a file input",
  re-run `find` — do not click the browse button, it opens a native picker.
- PNG with alpha is preserved byte-for-byte; Unleashed does not re-encode.

### The fast path, if you can host the files

The upload API *is* reachable from the page, so the whole thing is scriptable —
the only blocker is getting the PNG bytes into the browser. `http://127.0.0.1` is
blocked as mixed content from the HTTPS page. **Put the cutouts on any HTTPS origin
with CORS and the remaining work becomes one loop instead of hundreds of calls:**

```
POST /v2/File/CreateUploadUrl   {fileName, md5, fileSize, entityType, entityGuid}
PUT  <returned blob url>         the bytes
PUT  /v2/File/SetUploadComplete  {fileId, entityGuid, entityType}
POST /v2/Enquiry/SetProductImage {productId, fileId}
```

`entityGuid` is the product `Guid` from the Unleashed API; `productId` is the
numeric id from GlobalAutocomplete.

## Backups

- `reports/snap-original-images/` — all 255 SNAP originals + `ORIGINALS.csv`
  (code, file, bytes, sha256, source URL). Five sampled at random and confirmed
  byte-identical to the live ERP.
- `reports/woo-to-erp/*-original.jpg` — untouched Woo originals for the 7 above.
- Every converted product still holds its original JPEG in Unleashed.
- All gitignored via `reports/*-images/`.

## The tooling

- `scripts/backdrop.py` — shared backdrop detection/repaint/cutout.
  - `needs_normalizing()` — the shop's question: does this fail to match the tile?
  - `is_studio()` — the cutout's question: is there a removable backdrop at all?
    **Gated on CONTRAST (≥40), not lightness or uniformity.** Both of those were
    tried and both were wrong: a lightness floor discards SNAP's flat *black*
    sweeps; a uniformity floor discards products that run off the frame edge. What
    actually fails is a product the same tone as its backdrop (black tee on black):
    unsalvageable cases score 19–27, clean ones 43+.
- `scripts/export-brand-images.py <BRAND>` — per-brand cutout export + manifest.
  Modes: `transparent` (default), `white`, `tile`.
- `scripts/normalize-erp-bg.py` — repaints ERP photos to `#e6e6e6` for the shop.
- `scripts/normalize-product-bg.py` — same for WooCommerce photos. Offline; reads
  the committed mirror. **Merges the shared override map, never overwrites it, and
  never deletes** (see `e1fb544` — both were real data-loss bugs).
- `scripts/lib/store_dns_pin.py` / `.mjs` — the store has no working DNS name.
  Set `WC_STORE_PIN`. TLS is fully verified; a wrong pin fails the handshake.

## Assets ready to use

- `reports/snap-images/` — 245 SNAP cutouts + `manifest.csv`. 10 entries are flagged
  as needing a pen tool: 6 black-on-black apparel, 1 gym-interior shot, 3
  chrome-on-light-grey near the contrast threshold.
- `reports/c2-images/` — 4 Concept 2 cutouts.
- `reports/woo-to-erp/` — the 7 above.

## The site now reads the ERP for photography too (2026-09-07)

The listing grids were already ERP-driven; every OTHER surface still rendered a
snapshot product and emitted its WordPress URL. `withErpImages(product, map)` in
`lib/unleashed.ts` is the swap, wired into the product page (body, og:image and
JSON-LD), the related strip and search-suggest. It replaces snapshot photography
— `/wp-content/uploads/`, and the `/product-images/` and `/product-bg/` local
mirrors of the same pictures — ONLY where the ERP has a photograph, so a product
the ERP has no picture of keeps the one it has. `src/lib/erp-images.test.ts`
covers the rule; `npm run report:wooimages` re-measures it.

**It takes the DEFAULT image only, never the ERP's `Images[]` array** — that
array is where the ~125 conversion backups live, and rendering it would put every
pre-conversion white backdrop back into the gallery.

## `mirror:remaining` IS A NO-OP BY DESIGN — do not "fix" it

622 photographs on 174 products are still on the WordPress box and were never
mirrored. That is deliberate: all 174 are S- or F-prefixed, and
`mirror-remaining-images.mjs` carries an explicit `FOREIGN_BRAND_SKU_RE` guard
against pulling Snap's and Fernwood's brand photography into MasterKraft's git
history to serve pages that redirect anyway. Running the script reports
"0 to mirror" and that is the correct answer. If those pictures are ever wanted,
they need a route that is not this repo.

The WordPress URLs themselves are dead — every `/wp-content/uploads/` path 404s
since the cutover. It is nearly invisible, though: `legacy-redirects.json` 308s
172 of the 174 to a category page. Only `SRATTACC01` (404) and `SAAAU01` (renders
from /erp-bg) are still served.

## The catalogue app: what it ACTUALLY reads (corrected 2026-09-07)

The top of this document said the catalogue "does not read images from Unleashed
OR from WooCommerce". **That is half wrong and the wrong half matters.**

`masterkraft-catalogues/src/data/brand-images.json` holds **925 Unleashed CDN
URLs**. It is not a live read — it is a BAKED SNAPSHOT written by
`scripts/build-image-fallbacks.mjs`, which calls the Unleashed API and records
each product's `ImageUrl`. Those URLs are pinned to a specific file GUID.

The consequence is the thing to remember: **fixing a photo in Unleashed mints a
NEW GUID URL, and the old file stays alive at the old one.** So the catalogue
keeps serving the pre-fix image until that script is re-run and the app is
redeployed. Nothing about the ERP fix reaches the catalogue on its own.

`C2ROWERG`, `C2SKIERG` and `C2SKIERGFS` are the proof: their ERP default has been
a correct `.png` cutout since the conversion pass, and the Gold's catalogue was
still serving the old white `.jpg` today, purely because the baked map is stale.

Resolution order is brand art → parent brand → M-range swap → `_shared` →
range representative → `image-map.json` (local `/woo-images/`) → ERP CDN URL.

### Gold's catalogue, measured 2026-09-07

249 items. 24 have no image. **38 had an off-tile backdrop**, split by where the
file lives:

| | Count | Fix |
|---|---|---|
| Served from the Unleashed CDN | 31 | at source in the ERP |
| Served from files in the catalogue repo | 7 | replace the file in that repo |

Of the 31: **28 were repainted in the ERP and verified** (see below); the other 3
are the C2 machines, already correct at source and needing only the rebuild.

**All 28 already had repainted `#e6e6e6` copies sitting in THIS repo** under
`public/erp-bg/` — the earlier pass fixed the shop through
`erp-image-overrides.json` and never carried the fix back to the ERP, which is
why every catalogue still showed white.

Uploaded as `<CODE>-e6e6e6.jpg` — named so a repaint can never be mistaken for
the original it replaces, which is the ambiguity that made bulk attachment
uploads risky. Each was set default via the DOM menu; each original is retained
as a NON-default attachment, so every one reverts in one click. Verified 28/28 by
fetching the new default from the CDN and re-measuring its backdrop.

### STILL TO DO for the catalogue

1. Re-run `npm run build:image-fallbacks` (or `node scripts/build-image-fallbacks.mjs`)
   in `~/Desktop/masterkraft-catalogues` so `brand-images.json` re-points at the
   new GUIDs. **Until this runs, none of the 28 shows up on any catalogue.**
2. Redeploy the catalogue app.
3. Replace the 7 local files: `MMPWPBG05`, `NBFATSY01`/`02`/`03` (all pure white,
   under `public/brand-images/golds/`), and `MSBMPL01`, `MRSPATT04`, `MRWAATT01`
   (near-greys, under `public/woo-images/`).
4. Re-measure the other brands. The same photography is shared across catalogues,
   so the 28 fix them all — but each brand has its own off-tile set that has not
   been measured.

## Open items

1. **Fix the catalogue app** — the actual reported problem. Replace files under
   `woo-images/` in `~/Desktop/masterkraft-catalogues` and redeploy. Note the
   catalogue keys images by *WordPress filename*, not product code, and SNAP
   products can reuse MasterKraft photography (SNAP `SRSPFW01` displays
   `MRSPFW01-1S-1.jpg`). Cut out the **Woo** images, not the Unleashed ones.
2. ~~**Upload the 7 Woo→ERP images**~~ — DONE and API-verified 2026-09-07.

   **Secondary angles: 37 of 54 done, 17 left.** The remaining list, with
   Unleashed product ids and local file paths, is
   `reports/woo-to-erp/phase2-remaining.csv`. Same method as above: navigate to
   `/v2/Product/Update/<id>#attachments`, `find` the file input, `file_upload`.
   Do NOT call SetProductImage — these must stay non-default. Verified behaviour:
   uploading beside an existing image leaves the original `IsDefault: true` and
   lands the new file as `IsDefault: false`, so the conversion backups are not
   disturbed. All 37 confirmed through the API as ≥2 images / exactly 1 default.

   The run stopped on the 38th because a permission classifier blocked the
   upload tool call, not because anything failed. Nothing is half-written: each
   product is a single atomic upload.

   **THE SECONDARY-ANGLE JOB IS 54 PHOTOGRAPHS, NOT ~1,070.** An earlier count
   in this session said ~1,070 and was wrong: it summed `images - 1` over
   snapshot products including variable parents carrying 40-100 per-size photos,
   whose SIZES already have their own ERP pictures, and products whose SKU is not
   an ERP code at all. Counted properly — snapshot SKU resolves to a real ERP
   code, files already on our own CORS-open domain, more than one photograph —
   it is 54.

3. **57 ERP codes had no picture but a WooCommerce VARIATION had one.** This was
   missed earlier in the session, which wrongly reported the gap as closed: the
   first count looked only at parent-product SKUs, and variation records carry
   their own images. Split by whose photograph it is, from the filename:

   - ~~**26 are MasterKraft's own**~~ — **DONE and API-verified 2026-09-07.**
     M-code photography reused on SNAP pages (`SWBBFRZ01` ← `MWBBFRZ05-1S-20.jpg`,
     `SWWPCB01` ← `MWWPCB01-1S-2.jpg`). Fetched from the WooCommerce box via
     `WC_STORE_PIN` into a scratch directory — NEVER into `public/`, which is what
     the mirror guard protects — cut out with `scripts/backdrop.py`, uploaded.
     All 26 passed `is_studio` (lowest contrast gap 57, well clear of the 40
     threshold) and every one carries a real alpha channel, so the `C2BIKEERG`
     extension-check trap is avoided. Each now has exactly one image, set as
     default, and it is the PNG cutout.
   - ~~**28 need Snap's own photography**~~ — **27 DONE and API-verified
     2026-09-07/08.** Michael's call: MasterKraft supplies these SNAP lines, the
     ERP is MasterKraft's, and a prior pass already converted 64 SNAP images
     there, so the mirror guard (which is about GIT HISTORY) does not apply.
     Bytes came from the WooCommerce box via `WC_STORE_PIN` into scratch, cut
     with `backdrop.py` — all passed `is_studio` at gaps of 159-188.

     **`SWWPOU01` IS THE ONE THAT WAS NOT DONE, AND IT SHOULD NOT BE.** It is the
     1.5kg Olympic Urethane plate, and the only photograph WooCommerce has for it
     is `SWWPOU02-1S.jpg` — the 2.5kg plate, which carries **"2.5" moulded into
     its face, twice, plainly legible**. Attaching it would be a caption that
     lies, and the plate's own marking is what contradicts it. This is the same
     rule `RANGE_REPRESENTATIVE` states in the catalogue: a representative shot is
     fine where no size is stamped, and wrong where one is.

     **The MasterKraft side has the identical fault, already live.** `MWWPOU01`
     ("Olympic Urethane Weight Plates (3 Grip) - 1.5kg") carries an ERP default
     that is also a **2.5** plate, just with the `M` mark instead of Snap's. So
     the 1.5kg appears never to have been photographed on either brand.

     **CORRECTION (2026-09-08): "shoot it" was wrong, and so was the reasoning
     under it.** These are not photographs. Every size in the ladder — 2.5, 5,
     10, 15, 20, 25kg — is a RENDER with a pixel-identical subject box of
     (211, 267, 771, 835) on a 1000x1080 canvas. A real 15kg Olympic plate
     dwarfs a 2.5kg one; these show them the same size. The range does not
     depict physical scale AT ALL, so "a 1.5kg differs in diameter and
     thickness" is not a difference this artwork was ever making. The moulded
     number is the only thing separating one size from another, and a
     photograph would not match the set.

     RESTAMPING IS THE HOUSE METHOD, not a fudge. See
     `~/Desktop/masterkraft-catalogue-ops/snap-render-generator/restamp-snap-plates.py`,
     which states it plainly: "The 3D scene is not available, so each per-weight
     file is made by erasing the moulded marking on a 5kg render and stamping
     the new one." It already generates SWWPCNB07-10 that way.

     **BUT THAT PIPELINE DOES NOT TRANSFER TO THIS LADDER.** It works by
     thresholding a WHITE painted marking. Measured:

     | | marking contrast (p2-p98) | median |
     |---|---|---|
     | `MWWPCNB06`, the base it restamps | **215** | 235 (white paint) |
     | `SWWPOU02`, this ladder | **28** | 43 (moulded, dark on black) |

     There is no white marking to threshold here — the numerals are relief in
     the same black rubber, carrying only ~28 levels of shading. Erase-and-stamp
     would leave a flat number where the others have moulded depth.

     WHAT WOULD WORK. The renders are pixel-aligned with identical lighting, so
     the moulded "1" in the 15kg render is directly transplantable onto the 2.5kg
     face — same relief, same shading, same canvas position. Only the horizontal
     placement differs, because "15" is two glyphs and "2.5" is three. That is a
     contained job and the honest one; it has NOT been done. Failing that, the
     designer who owns the urethane renders regenerates 1.5 from source.

     Until then both records are better with no image than with a 2.5.
   - **3 are REVL "Freight & Delivery Allowance" line items** pointing at a
     generic logistics stock photo. Not products. Skip.

   **Remaining after this pass: 31** codes with no ERP picture but a Woo photo —
   the 28 Snap ones and the 3 REVL allowances. ZERO of them are MasterKraft's.
   ERP codes carrying a photograph: **1108** of 1484 (was 1075 at the start of
   the session).
3. **Retire `erp-image-overrides.json` for products fixed at source.**
   NOW PARTLY ACTIONABLE: 28 of these entries were fixed in the ERP on
   2026-09-07 (the Gold's set above), so the shop's local `/erp-bg` copy and the
   ERP now hold the same picture. Dropping those entries is safe once the
   `unleashed-product-map-v7` cache key is bumped. The shop
   serves its own `/erp-bg` copy and will ignore a corrected ERP image, so the two
   are now drifting. Affects `C2ROWERG`/`C2SKIERG`/`C2SKIERGFS` and `SRATTACC01`
   among others.
4. **~120 SNAP products still unconverted in the ERP** — all already on `#e6e6e6`,
   so cosmetic only. Low value unless the ERP is wanted uniformly transparent.
5. `SWWPOPR` was requested but **no such product code exists**. Nearest match
   `SWWPOU14`, already done.
6. `SRSPFW01/03/04` have no ERP image — item 2 fixes that.

## Watch out for

- **Several Claude sessions share this checkout.** During this session others
  committed my in-progress work four times, pushed a spinner change I never
  reviewed, and swept 101 MB of generated PNGs into git history (`.git` is ~245 MB;
  removing them needs a filter-repo + force push, deliberately not done). The repo
  was also switched to branch `public-chat-widget` mid-session. **Use
  `git worktree add` per session.**
- **`vercel deploy --prod` uploads the working tree, not a commit.** With several
  sessions editing, check `git status` is clean before deploying —
  `check-deploy-branch.mjs` enforces this and should not be overridden.
- **Verifying by file extension is not sufficient** if a product's original was
  already a PNG. All 255 SNAP originals were JPEG so the SNAP results are sound,
  but `C2BIKEERG` was exactly that trap. Check the alpha channel:
  `Image.open(f).convert("RGBA").getchannel("A").getextrema()` → min 0 means a real
  cutout.
- Cutouts keep the product's baked-in drop shadow. Fine on white or light pages;
  on a dark background the shadows read as pale smears.
