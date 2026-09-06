-- A mirror of Unleashed's products. A CACHE, NOT A SECOND SOURCE OF TRUTH.
--
-- Unleashed remains the product database. This table is written only by
-- scripts/erp-mirror.load.ts, only ever wholesale, and never by the site or by a
-- person. If it disagrees with the ERP it is stale and gets overwritten — there
-- is nothing to adjudicate, which is the entire point.
--
-- WHY IT EXISTS. Two things, both bad, both removed by this table.
--
--   1. `src/data/catalogue.json` was built from WooCommerce on 25 August and can
--      NEVER be rebuilt: `build:catalogue` fetches WC_STORE_URL/wp-json, and
--      since the 27 August cutover that host serves the Next.js app and returns
--      404. The product list is frozen for good.
--   2. `getUnleashedMap()` pages ~1,500 products and costs ~16s cold, because
--      Unleashed answers slowly and throttles concurrency. Every listing page
--      waits on it once an hour.
--
-- THE RULE THAT KEEPS THIS HONEST, and the failure mode if it breaks:
-- 20260905_product_content.sql argues against duplicating product data, and it
-- is right — "two systems holding a price is how they start disagreeing, and
-- this codebase already carries the scars". Those scars are real: woo-orders.ts
-- overrides WooCommerce's distorted price field, and the order path carries
-- reconciliation guards.
--
-- This is only a cache while NOTHING EDITS IT. Unlike product_content there is
-- deliberately NO `updated_by` and no notion of a human-edited row: the loader
-- overwrites unconditionally, so an edit made here visibly does not survive the
-- next sync. That is a feature. The moment someone "fixes a price in Supabase"
-- and expects it to stick, this has become the second system that note warns
-- about.
--
-- RAW ERP VALUES ONLY. `price` is DefaultSellPrice, EX GST, exactly as Unleashed
-- holds it — lib/unleashed.ts multiplies by GST when it builds the map, and that
-- business rule stays in code. Storing the inclusive figure here would put the
-- same rule in two places, which is how the two ends of it drift apart.
--
-- AXES ARE THE ERP'S OWN. Width/Depth/Height, not length/width/height. The remap
-- to the site's order lives in exactly one place, lib/freight-server.ts, and
-- renaming them here would quietly create a second one.
create table if not exists erp_products (
  -- ProductCode, upper-cased, which is the handle the cart, the order lines and
  -- the freight quote all already carry.
  erp_code    text primary key,
  -- The ERP's own key. A sales order line identifies a product by Guid, so
  -- carrying it here saves a round trip per line when an order is written.
  guid        text,
  name        text,
  -- EX GST. See the note above before changing this.
  price       numeric,
  stock       numeric,
  brand       text,
  group_name  text,
  subgroup    text,
  sellable    boolean,
  obsolete    boolean,
  -- The default image on Unleashed's CDN. Not the /product-images mirror, which
  -- is resolved by SKU convention and is a filesystem question.
  image       text,
  weight_kg   numeric,
  width_cm    numeric,
  depth_cm    numeric,
  height_cm   numeric,
  -- When this row was last confirmed against Unleashed. The read path uses it to
  -- decide "fresh, stale, or missing", and a stale mirror is still better than
  -- no catalogue.
  synced_at   timestamptz not null default now()
);

comment on table erp_products is
  'A CACHE of Unleashed products, never a source of truth. Written only by scripts/erp-mirror.load.ts, wholesale. Edits here do not survive the next sync, by design.';

comment on column erp_products.price is
  'DefaultSellPrice, EX GST, as Unleashed holds it. lib/unleashed.ts applies GST when building the map.';

-- The catalogue is browsed by group, and every listing page filters on it.
create index if not exists erp_products_group_idx
  on erp_products (group_name);

-- "Is the mirror fresh enough to use" is asked on every read that uses it.
create index if not exists erp_products_synced_idx
  on erp_products (synced_at desc);

-- Same reasoning as the other five tables: read from server code holding the
-- service role key, which bypasses RLS, so enabling it with NO policies denies
-- anon and authenticated outright. Nothing here is secret — it is a product
-- catalogue — but a browser reading it should be a decision somebody makes, not
-- a default nobody chose.
alter table erp_products enable row level security;
