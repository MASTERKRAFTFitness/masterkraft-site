-- The catalogues app's product CARDS, as the partner portals' prospect
-- catalogue shows them.
--
-- A card is a product and its sizes: one "Fixed PU Straight Barbell" card holds
-- eighteen SKUs, 5kg to 60kg, each with its own photo, plus the hand-written
-- copy. masterkraft-catalogues builds them in code (src/lib/catalogue/brands.ts);
-- the portals vendored them as a JSON file (packages/data/src/brand-cards.json)
-- and redeployed to change one. Now the portals' scripts/sync-brand-cards.mjs
-- writes them here and the portal reads them at request time.
--
-- Not catalogue_cards / catalogue_listings: those hold only the multi-size cards
-- (about 210, no copy), synced by the catalogues app on its own schedule.
--
-- WRITTEN WHOLESALE by the sync script, per brand set: edits here do not survive
-- the next sync. The card itself is the catalogues app's shape (BrandCard in the
-- portals' packages/core/src/types.ts), kept as jsonb rather than split into
-- columns, because the portal renders it whole and the catalogues app owns it.
create table if not exists portal_brand_cards (
  -- Portal tenant id and side, e.g. 'strong:hq', 'fernwood:partner'.
  brand_key   text not null,
  -- The catalogues app's order, which is the order cards are shown in.
  position    integer not null,
  card_sku    text not null,
  card        jsonb not null,
  synced_at   timestamptz not null default now(),
  primary key (brand_key, position)
);

comment on table portal_brand_cards is
  'The catalogues app''s product cards per portal brand and side (BrandCard jsonb), written wholesale by masterkraft-portals scripts/sync-brand-cards.mjs. Read by the prospect catalogue.';

alter table portal_brand_cards enable row level security;
revoke all on portal_brand_cards from anon, authenticated;
