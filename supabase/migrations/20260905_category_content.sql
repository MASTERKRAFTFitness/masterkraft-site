-- The words for a category, which have nowhere else to live at all.
--
-- 67 of the old store's 80 category terms carry SEO copy, but COUNT THEM
-- PROPERLY before believing that number: only 10 are top-level terms, which are
-- the category pages. The other 57 belong to child terms, which the site renders
-- as sub-filter chips carrying a name and a count and no copy at all. So this
-- table is for roughly ten paragraphs, not sixty-seven, and a schema keyed on
-- group_name deliberately has nowhere to put the child-term copy — inventing one
-- would be storing content for a surface that does not exist.
--
-- What it does hold is the one piece of WooCommerce content with NO possible
-- home in the ERP. Checked rather than assumed: ProductGroups expose exactly
-- four fields —
--
--   GroupName, ParentGroupGuid, Guid, LastModifiedOn
--
-- No description, no notes, nothing free-text, and ProductSubGroups is not even
-- an endpoint (404) — sub-groups are the same records carrying a
-- ParentGroupGuid. So unlike the product copy, which could in principle be
-- squeezed into Notes, this cannot go into Unleashed under any arrangement.
--
-- KEYED ON GroupName, because that is what the ERP actually joins on. The site
-- already reads ProductGroup.GroupName to decide which category a product
-- belongs to (lib/erp-catalogue), so the same string is the natural key. The
-- Guid would be more stable against a rename, but it is invisible in the ERP's
-- own UI, and a key nobody can see is a key nobody can maintain.
--
-- THE SLUG IS THE POINT OF THIS TABLE, as much as the copy is.
--
-- Category slugs are deliberately NOT derived from the group name — "Rigs &
-- Racks" slugifies to `rigs-and-racks` and the page has lived at `rigs-racks`
-- since launch. That mismatch is what put products' breadcrumbs on URLs that
-- did not exist, invisibly, because the category page answered them 200 with a
-- "Page not found" body. lib/categories.ts holds the mapping in code today;
-- storing it makes it a fact somebody can correct without a deploy.
create table if not exists category_content (
  -- Unleashed ProductGroup.GroupName, exactly as the ERP spells it.
  group_name  text primary key,
  -- The address the category page lives at: /equipment/<slug>. NOT derived.
  slug        text not null unique,
  -- The short line the navigation and the category cards show.
  blurb       text,
  -- The body copy the category page renders, and what search engines read.
  description text,
  -- Order in the navigation. Nullable: unset sorts last, so adding a category
  -- does not require renumbering the others.
  sort_order  smallint,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

comment on table category_content is
  'Category copy and URLs, keyed to Unleashed ProductGroup.GroupName. The one content set the ERP has no field for.';

comment on column category_content.slug is
  'Deliberately stored, not derived: "Rigs & Racks" lives at rigs-racks, not rigs-and-racks.';

-- The site resolves /equipment/<slug> before it knows a group name.
create index if not exists category_content_slug_idx
  on category_content (slug);

-- --------------------------------------------------------------------- RLS
--
-- As with product_content: server-side reads hold the service role key and
-- bypass RLS, so enabling it with no policies denies anon and authenticated.
-- A public read policy is a decision to take when a portal needs one.
alter table category_content enable row level security;
