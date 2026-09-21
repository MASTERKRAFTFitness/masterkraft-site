-- WooCommerce's own two description fields, which nothing else holds.
--
-- NOT THE SAME THING AS `overview` / `overview_short`, and the difference is
-- the reason this migration exists rather than being a duplicate of those.
--
--   overview / overview_short   the ACF fields the product page prefers.
--                               product_overview_description and
--                               product_overview_short in the snapshot.
--   description /               WooCommerce's OWN fields, which the page falls
--   short_description           back to when the ACF ones are absent — and
--                               which no system other than the frozen file has.
--
-- 275 products carry a `description` that differs from their ACF overview, so
-- these are genuinely separate content and not a second copy of it.
--
-- WHAT ACTUALLY DEPENDS ON THEM, measured rather than assumed, across the 428
-- live products:
--
--   short_description   385 products render the SNAPSHOT's value. It appears
--                       under the price AND is the page's meta description
--                       (app/product/[slug]/page.tsx), so this is the field
--                       Google indexes. Only 8 products have an override in
--                       product-copy.json or an edited row.
--   description         2 products. It is only reached when the ACF overview is
--                       empty, which is rare — c2-ski-erg-pm5 and
--                       storage-pin-with-shoulder are the whole list.
--
-- So one column carries real weight and the other is close to a rounding error.
-- Both are here because the second is nearly free and leaving it out would mean
-- the snapshot still could not be deleted for the sake of two products.
--
-- THIS IS WHAT MAKES RETIRING catalogue.json POSSIBLE. Until now the spec table
-- had moved but the meta description had not, so deleting the frozen file would
-- have stripped 385 products of the text search engines show. It is the last
-- large dependency on WooCommerce for product copy; see reports/spec-parity.md
-- for the equivalent gate on specs.
--
-- HTML, STORED AS FOUND. Both fields are WooCommerce rich text and the page
-- renders them with dangerouslySetInnerHTML today. Stripping the markup here
-- would change what a customer sees, and sanitising it is a decision about the
-- render path rather than about storage — so they are stored exactly as the
-- snapshot holds them, byte for byte, which is also what lets a parity check
-- mean anything.
alter table product_content
  add column if not exists description       text,
  add column if not exists short_description text;

comment on column product_content.short_description is
  'WooCommerce short_description, as HTML. Shown under the price and used as the page meta description. 385 live products depend on it. NOT overview_short, which is the ACF field the page prefers.';

comment on column product_content.description is
  'WooCommerce description, as HTML. Only rendered when the ACF overview is absent — 2 live products. NOT overview, which is the ACF field the page prefers.';

-- "Which products would lose their meta description if the snapshot went", the
-- question this column exists to answer and the one worth asking before the
-- frozen file is deleted.
create index if not exists product_content_no_short_desc_idx
  on product_content (erp_code)
  where short_description is null;
