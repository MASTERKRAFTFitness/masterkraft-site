-- The words for a product, and the URL it lives at.
--
-- WHAT THIS IS NOT. It is not a product table. Unleashed is the product
-- database and stays that way: code, name, price, stock, sizes, photographs and
-- — since 4 September — Assembled size, Colour, Material and Warranty on 328
-- products. Nothing here duplicates any of that.
--
-- Two systems holding a price is how they start disagreeing, and this codebase
-- already carries the scars: a frozen WooCommerce snapshot beside the ERP,
-- lib/woo-orders.ts overriding "WooCommerce's distorted price field", and
-- reconciliation guards on the order path. A second copy of product truth would
-- recreate that, and the failure is silent — the customer sees one number and
-- the warehouse picks against another.
--
-- WHAT IT IS, then: the three things Unleashed structurally cannot hold, which
-- are all website presentation rather than product data.
--
--   PROSE      335 products carry an overview and feature bullets in the frozen
--              snapshot. The ERP's only free-text field is Notes, which is one
--              plain-text box — the headings, the bullets and the spec table do
--              not survive it, and the import route runs through the
--              whole-record Products template.
--   THE URL    Unleashed has no slug field at all. Every address the site's
--              product pages live at exists only in the snapshot.
--
-- KEYED ON THE ERP CODE, because that is the identifier both systems already
-- agree on, and the one the cart, the order lines and the freight quote all
-- carry. A range's anchor is its first code, the same one lib/erp-catalogue's
-- unitAsProduct puts on the card — so a card and its copy cannot drift apart.
--
-- THE SLUG IS DATA HERE, NOT A DERIVED STRING, and that is deliberate. Deriving
-- it is what broke the breadcrumbs: "Rigs & Racks" slugifies to
-- `rigs-and-racks` while the page has lived at `rigs-racks` since launch. A
-- stored slug is a fact about where a page is, not a guess.
--
-- NO CHANNEL COLUMN. Whether a product belongs to the public site or the
-- franchisee portals is decided by its code prefix, and that rule lives in
-- lib/woocommerce (isPublicSiteSku). Storing the answer here would be a second
-- copy of a rule that already moved once this week.
create table if not exists product_content (
  -- Unleashed ProductCode. For a range, the anchor code its card is built from.
  erp_code            text primary key,
  -- The address the product page lives at. Unique because two products cannot
  -- share one; nullable because a product can have copy before it has a page.
  slug                text unique,
  -- The lead-in line and the body, as the site's parser separates them today
  -- (lib/spec.ts parseProductDetail).
  overview_short      text,
  overview            text,
  -- Ordered. The product page renders these as a list and the order is content.
  features            text[] not null default '{}',
  package_inclusions  text,
  updated_at          timestamptz not null default now(),
  -- Who last changed it. The point of moving copy out of a committed JSON file
  -- is that somebody other than an engineer can edit it, so the record of who
  -- did has to survive the move.
  updated_by          text
);

comment on table product_content is
  'Website copy and URLs, keyed to Unleashed ProductCode. Unleashed holds the product; this holds the words.';

-- The site resolves a page by slug before it knows a code, so that lookup is
-- the hot one.
create index if not exists product_content_slug_idx
  on product_content (slug)
  where slug is not null;

-- "What changed since the site last built", for a revalidation hook.
create index if not exists product_content_updated_idx
  on product_content (updated_at desc);

-- --------------------------------------------------------------------- RLS
--
-- Same reasoning as the admin and 404 tables: read from server code holding the
-- service role key, which bypasses RLS, so enabling it with NO policies denies
-- anon and authenticated outright.
--
-- This copy is already public on the website, so a read policy would not leak
-- anything — but it should be an explicit decision when a portal genuinely
-- needs to read it from a browser, not a default nobody chose.
alter table product_content enable row level security;
