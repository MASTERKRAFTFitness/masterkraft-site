-- Tier prices for the partner portals, from the same /Products read the mirror
-- already makes.
--
-- WHY. Each partner portal prices its customer at one Unleashed sell-price tier
-- (SellPriceTier1..10). Until now the portals crawled Unleashed /Products for
-- it themselves, 8-19s on a cold read, for data this loader was already holding
-- and throwing away. Same cache rule as every other column here: written
-- wholesale by src/lib/erp-mirror.ts, never edited by hand.
--
-- SHAPE. {"1": 123.45, "3": 99}: keys "1".."10", EX GST like price, POSITIVE
-- VALUES ONLY. A tier with no value is absent, not 0, because the portals show a
-- missing tier price as "Price on application" and nothing should have to tell
-- a stored zero from a missing key. Null when the product has no tier at all.
alter table erp_products add column if not exists sell_price_tiers jsonb;

comment on column erp_products.sell_price_tiers is
  'SellPriceTier1..10 as {"1": 123.45, ...}, EX GST, positive values only. Written by src/lib/erp-mirror.ts. Read by the partner portals (tier pricing).';

-- ------------------------------------------------------ tier_price_overrides
--
-- A tier price agreed with a brand that Unleashed does not carry yet. These
-- lived in the portals' code (packages/data/src/pricing.ts) and moved here so a
-- price change is a row, not a deploy.
--
-- THIS IS THE ONE PLACE A PRICE IS HAND-ENTERED, which is exactly what
-- erp_products refuses to be, so it is a separate table and never written by
-- the loader. Every row says where its price came from and is deleted once
-- Unleashed matches. Keyed by tier, so a row reaches exactly the brands on that
-- tier: T9 is REVL head office only, T10 REVL's sites.
--
-- An override WINS over sell_price_tiers for its tier and code. Kits are
-- deliberately absent (Steve, 2026-10-02: kits show "Price on application").
create table if not exists tier_price_overrides (
  tier        smallint not null check (tier between 1 and 10),
  -- Upper-cased ProductCode, as erp_products.erp_code.
  erp_code    text not null check (erp_code = upper(erp_code)),
  -- EX GST, the tier's unit price. Positive: "no price" is a missing row.
  price       numeric not null check (price > 0),
  -- Where the price came from and when to remove it.
  note        text,
  updated_at  timestamptz not null default now(),
  updated_by  text,
  primary key (tier, erp_code)
);

comment on table tier_price_overrides is
  'Hand-entered tier prices Unleashed does not carry yet. Win over erp_products.sell_price_tiers for their tier. Delete a row once Unleashed matches.';

-- Server-side reads only, with the service role key, like every table here.
alter table tier_price_overrides enable row level security;
revoke all on tier_price_overrides from anon, authenticated;

-- Seeded from TIER_PRICE_OVERRIDES as it stood on 2026-10-22 (the portals repo,
-- packages/data/src/pricing.ts). The history behind each price is in that
-- file's git log.
insert into tier_price_overrides (tier, erp_code, price, note) values
  (9, 'RFATSY04', 1577.7667, 'Artificial Turf Black (2m x 15m) (Custom Branding): REVL head office price per SO-00000840 (REVL-HQ); Michael 2026-10-02: head office only, sites keep T10. Unleashed T9 still says 2148.76'),
  (9, 'RWWKCH02', 17.48, 'Weightlifting Chalk Box: RWWKCH02 holds the stock but has 0 on every tier; RWWLCH02 (being made obsolete) holds the prices (Michael 2026-10-08)'),
  (9, 'RMDBRH01', 12.8, 'REVL Premium Rubber Hex Dumbbell, head office = Woo selling price by weight: 4kg (Woo RMDBRH01)'),
  (9, 'RMDBRH02', 19.2, 'REVL Premium Rubber Hex Dumbbell, head office = Woo selling price by weight: 6kg (Woo RMDBRH02)'),
  (9, 'RMDBRH03', 25.6, 'REVL Premium Rubber Hex Dumbbell, head office = Woo selling price by weight: 8kg (Woo RMDBRH03)'),
  (9, 'RMDBRH04', 32, 'REVL Premium Rubber Hex Dumbbell, head office = Woo selling price by weight: 10kg (Woo RMDBRH04)'),
  (9, 'RMDBRH05', 40, 'REVL Premium Rubber Hex Dumbbell, head office = Woo selling price by weight: 12.5kg (Woo RMDBRH05)'),
  (9, 'RMDBRH06', 48, 'REVL Premium Rubber Hex Dumbbell, head office = Woo selling price by weight: 15kg (Woo RMDBRH06)'),
  (9, 'RMDBRH07', 56, 'REVL Premium Rubber Hex Dumbbell, head office = Woo selling price by weight: 17.5kg (Woo RMDBRH07)'),
  (9, 'RMDBRH08', 64, 'REVL Premium Rubber Hex Dumbbell, head office = Woo selling price by weight: 20kg (Woo RMDBRH08)'),
  (9, 'RMDBRH14', 72, 'REVL Premium Rubber Hex Dumbbell, head office = Woo selling price by weight: 22.5kg (Woo RMDBRH08B)'),
  (9, 'RMDBRH09', 80, 'REVL Premium Rubber Hex Dumbbell, head office = Woo selling price by weight: 25kg (Woo RMDBRH09)'),
  (9, 'RMDBRH10', 96, 'REVL Premium Rubber Hex Dumbbell, head office = Woo selling price by weight: 27.5kg (Woo RMDBRH10)'),
  (9, 'RMDBRH11', 96, 'REVL Premium Rubber Hex Dumbbell, head office = Woo selling price by weight: 30kg (Woo RMDBRH11)'),
  (9, 'RMDBRH12', 112, 'REVL Premium Rubber Hex Dumbbell, head office = Woo selling price by weight: 35kg (Woo RMDBRH12)'),
  (9, 'RMDBRH13', 128, 'REVL Premium Rubber Hex Dumbbell, head office = Woo selling price by weight: 40kg (Woo RMDBRH13)'),
  (9, 'RMDBRH15', 204.55, 'REVL Premium Rubber Hex Dumbbell, head office = Woo selling price by weight: 45kg (Woo RMDBRH14)'),
  (9, 'RMDBRH16', 227.27, 'REVL Premium Rubber Hex Dumbbell, head office = Woo selling price by weight: 50kg (Woo RMDBRH15)'),
  (9, 'RMDBRH17', 272.73, 'REVL Premium Rubber Hex Dumbbell, head office = Woo selling price by weight: 60kg (Woo RMDBRH16)'),
  (9, 'RFRFRR01', 41.96, 'Impact-Lock Rubber Tiles 20mm'),
  (9, 'RFRFRR05', 59.44, 'Impact-Lock Rubber Tiles 20mm (Custom Branding)'),
  (9, 'RLLE2501', 353.15, 'Linear LED Lighting System 2.4m'),
  (9, 'RLLE2502', 34.23, 'LED Dimmers'),
  (10, 'RWWKCH02', 22.73, 'Weightlifting Chalk Box: the site price moved from RWWLCH02, as at tier 9'),
  (10, 'RMDBRH01', 18.18, 'REVL Premium Rubber Hex Dumbbell, sites = Woo regular price by weight: 4kg'),
  (10, 'RMDBRH02', 27.27, 'REVL Premium Rubber Hex Dumbbell, sites = Woo regular price by weight: 6kg'),
  (10, 'RMDBRH03', 36.36, 'REVL Premium Rubber Hex Dumbbell, sites = Woo regular price by weight: 8kg'),
  (10, 'RMDBRH04', 45.45, 'REVL Premium Rubber Hex Dumbbell, sites = Woo regular price by weight: 10kg'),
  (10, 'RMDBRH05', 56.82, 'REVL Premium Rubber Hex Dumbbell, sites = Woo regular price by weight: 12.5kg'),
  (10, 'RMDBRH06', 68.18, 'REVL Premium Rubber Hex Dumbbell, sites = Woo regular price by weight: 15kg'),
  (10, 'RMDBRH07', 79.55, 'REVL Premium Rubber Hex Dumbbell, sites = Woo regular price by weight: 17.5kg'),
  (10, 'RMDBRH08', 90.91, 'REVL Premium Rubber Hex Dumbbell, sites = Woo regular price by weight: 20kg'),
  (10, 'RMDBRH14', 102.27, 'REVL Premium Rubber Hex Dumbbell, sites = Woo regular price by weight: 22.5kg (website price, Steve 2026-10-12)'),
  (10, 'RMDBRH09', 113.64, 'REVL Premium Rubber Hex Dumbbell, sites = Woo regular price by weight: 25kg'),
  (10, 'RMDBRH10', 125, 'REVL Premium Rubber Hex Dumbbell, sites = Woo regular price by weight: 27.5kg'),
  (10, 'RMDBRH11', 136.36, 'REVL Premium Rubber Hex Dumbbell, sites = Woo regular price by weight: 30kg'),
  (10, 'RMDBRH12', 159.09, 'REVL Premium Rubber Hex Dumbbell, sites = Woo regular price by weight: 35kg'),
  (10, 'RMDBRH13', 181.82, 'REVL Premium Rubber Hex Dumbbell, sites = Woo regular price by weight: 40kg'),
  (10, 'RMDBRH15', 204.55, 'REVL Premium Rubber Hex Dumbbell, sites = Woo regular price by weight: 45kg (website price, Steve 2026-10-12)'),
  (10, 'RMDBRH16', 227.27, 'REVL Premium Rubber Hex Dumbbell, sites = Woo regular price by weight: 50kg (website price, Steve 2026-10-12)'),
  (10, 'RMDBRH17', 272.73, 'REVL Premium Rubber Hex Dumbbell, sites = Woo regular price by weight: 60kg (website price, Steve 2026-10-12)'),
  (10, 'RFRFRR01', 53.64, 'Impact-Lock Rubber Tiles 20mm (website price, Steve 2026-10-12)'),
  (10, 'RFRFRR05', 77.27, 'Impact-Lock Rubber Tiles 20mm (Custom Branding)'),
  (10, 'RLLE2501', 409.09, 'Linear LED Lighting System 2.4m (website price, Steve 2026-10-12)'),
  (10, 'RLLE2502', 40.91, 'LED Dimmers (website price, Steve 2026-10-12)'),
  (10, 'RWWLCH01', 195.45, 'Chalk Bowl (T10 was 222.73)'),
  (10, 'RRSPATT06', 222.73, 'Rig Wall Ball Target (T10 was 250.00)'),
  (10, 'RRSPATT04', 190.91, 'Rig Dip Bar Attachment (T10 was 195.45)'),
  (10, 'RMDEHG10', 227.27, 'High Grip Dead Ball 75kg (T10 was 236.36)'),
  (10, 'RFATSY04', 2250, 'Artificial Turf Black 2m x 15m (Custom Branding) (T10 was 2363.64)')
on conflict (tier, erp_code) do update
  set price = excluded.price, note = excluded.note, updated_at = now();
