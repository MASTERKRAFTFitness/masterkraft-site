# MasterKraft site: handoff from the hex dumbbell session (5 Oct 2026)

Paste this into a new chat to continue. Repo: `MASTERKRAFTFitness/masterkraft-site`.

## How the system works (what a new session needs to know)

- **Unleashed is the source of truth** for price, stock, name, image and carton dimensions. The site prices only from Unleashed: Default Sell Price, ex GST, with the site adding 10%. WooCommerce is gone, and the frozen snapshot only supplies URLs and old copy.
- **The website's copy of Unleashed** lives in the `erp_products` table in the Supabase project **masterkraft-site** (`vnemkpduafnjxhkasqif`). It refreshes every hour at :17 through the Vercel cron `/api/cron/erp-mirror`. You can also run it by hand: Vercel → Settings → Cron Jobs → Run. A run takes about 65 seconds, and some manual clicks never land.
  - Anything written straight into `erp_products` is overwritten at the next sync, so fixes have to go into Unleashed.
  - The site only reads this copy if `ERP_MIRROR_ENABLED=true` is set in Vercel. Whether it's set in production is unconfirmed. Checkout always reads Unleashed directly.
- **Unmeasured products under $500 are hidden** (production sets `HIDE_UNSHIPPABLE=true`). A product needs Weight plus Width, Depth and Height in Unleashed to show.
- **Copy** comes from `src/data/product-copy.json`, keyed by slug, not from Unleashed.
- **Lead images:** `src/lib/erp-image-overrides.json` maps a code to a file under `/public/erp-bg/`, and that wins over the Unleashed image.
- **Extra gallery images:** these are rows in the Supabase table `product_images`, holding paths under `/public`. Only add a row after the file is deployed.
- **Access limits:** cloud sessions can't reach masterkraft.com or `api.unleashedsoftware.com`, and there are no Unleashed API keys. To change that, add the domain to the environment's allowed domains, and add `UNLEASHED_API_ID` and `UNLEASHED_API_KEY` with write access.

## Done in this session

- **Rubber Hex (MMDBRH01–26) and Premium Rubber Hex (MMDBPRH, 24 codes; there is no 03 or 09):** dimensions came from the factory spec sheet. Width is the overall length; Depth and Height are the head width.
  - All 50 codes are now in Unleashed and confirmed by the sync.
  - Both ranges are visible at $5/kg.
  - The import file and the method notes are in `reports/hex-dumbbell-dimensions-import.csv` and `reports/hex-dumbbell-dimensions.md`.
- **The 14-pair set (MMPADB01), slug `rubber-hex-dumbbell-set-of-14-pairs`:**
  - **Price:** 1544.5455 ex GST, which is **$1,699.00**. It's in Unleashed and confirmed at the 22:17 UTC sync.
  - **Sizes:** 1–10kg, 12.5, 15, 17.5 and 20kg. That's 240kg across 28 dumbbells, on a portable four-sided vertical rack.
  - **Copy:** updated in `product-copy.json`.
  - **Lead image:** `public/erp-bg/MMPADB01.jpg`, a feature card built from the real photo of rack MEFSDB06.
  - **Gallery image:** `public/product-bg/MMPADB01-2.jpg`, with its `product_images` row added.
  - **Unleashed image:** uploaded by the user.
  - **Buying:** it goes through a freight quote (pallet freight), not card checkout.
- **Code:** merged in PR #33 (`MASTERKRAFTFitness/masterkraft-site#33`). Branch `claude/bold-fermi-uxn9rd` has one unmerged commit that only adds a description column to the import CSV.

## Open items

1. **T6-STANDARD tier on MMPADB01:** 1390.0909 ex GST (10% off, $1,529.10 including GST). This has to be entered in Unleashed. It's wholesale-only and isn't shown on the site.
2. **11 WooCommerce-only products still serving old WooCommerce prices:**
   - **Concept2 (3):** SCRWAR04, SCSTAR03 and SCSTACC04 should be linked in `src/lib/unleashed-aliases.ts` to C2ROWERG, C2SKIERG and C2SKIERGFS. Confirm each mapping first.
   - **MasterKraft cardio (8):**
     - Air Bike Classic (MCBIAR01)
     - Air Bike Pro (MCBIAR02)
     - Air Cycle Pro (MCBIAR04)
     - Air Rower Elite (MCRWAR03)
     - Ski Trainer Pro (MCSTAR01)
     - Ski Trainer Floor Stand (MCSTACC01)
     - Ski Trainer Wall Bracket (MCSTACC02)
     - Curved Treadmill Pro (MCTMSP01)

     None of these is in Unleashed. Decide whether to create them in Unleashed or retire them.
3. **Supabase trigger bug:** the function `product_content_revalidate()` posts to `/api/revalidate/product-content` with the header `Bearer NEW_SECRET_HERE`, a placeholder, so cache refreshes after copy edits fail. Replace it with the real secret.
4. **The set's value:** $1,699 saves only $46 against buying the pieces separately (dumbbells $1,200 plus rack MEFRDB06 $545). Check that this is intended.
5. **Unconfirmed assumptions in the dimensions:** the "BFT Hex Dumbbell" spec table is the MasterKraft Rubber Hex; Premium uses the same head; and the figures are product dimensions, which is right only if the dumbbells ship unboxed.
6. **Unclear:** the cause of earlier import failures and of manual Vercel cron runs that didn't land. The Vercel logs would show it.
