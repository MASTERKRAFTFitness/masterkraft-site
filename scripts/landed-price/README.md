# Landed-price check vs Little Bloke Fitness

Decides which products MasterKraft pays to promote on Google Shopping: in stock,
and within 5% of Little Bloke's price **including delivery** in Melbourne,
Sydney or Perth. See the docstring in `compare.py` for the method.

1. Export our prices and stock from the Unleashed mirror (Supabase project
   `masterkraft-site`) for the codes in `matches.json`, as `ours.json`:
   `select erp_code as code, round(price * 1.1, 2) as price, stock from erp_products where erp_code in (...)`
2. `python3 scripts/landed-price/compare.py --ours ours.json --publish`
3. Results land in `reports/landed-price/<YYYY-MM>/`. `summary.md` is for people;
   `merchant-center-supplemental-feed.csv` (`id,custom_label_4`) is what Merchant
   Center reads, and the Google Ads campaigns filter on `custom_label_4`.

`matches.json` pairs each of our sizes with Little Bloke's closest product
(`littleBloke` is their product handle; `null` = they don't sell one).
Quantities make plates comparable: they sell pairs, we sell singles.
When Little Bloke retires a product the run reports it as `review`; update the
handle here.

`--publish` also rewrites `public/merchant-center-promotion.csv`, which Merchant
Center fetches daily from https://masterkraft.com/merchant-center-promotion.csv.
It refuses to publish while any quote is missing, so a throttled run can't drop
products from the campaigns. Re-run with the same `--out` to fill the gaps.
