-- The photographs Unleashed has no room for.
--
-- WHAT THIS IS NOT. It is not the product's photography. Unleashed is the
-- product database and stays that way, and since the 7 September image swap the
-- site renders the ERP's photograph everywhere the ERP has one — see
-- withErpImages. Nothing here overrides that. Every row in this table renders
-- BEHIND the ERP's picture, never in front of it.
--
-- WHY IT HAS TO EXIST AT ALL. Two gaps in the ERP, and neither can be closed by
-- uploading a file to Unleashed:
--
--   ONE PHOTOGRAPH PER CODE.  Unleashed carries a default image per product.
--              WooCommerce often carried three or four — the rack from the side,
--              the grip close up, the plate face. Measured against the live site
--              on 8 September: 136 of 284 product pages lost photographs to the
--              swap, 150 in total. There is no second image slot in the ERP to
--              put them back into.
--   NO RECORD TO ATTACH TO.  12 live pages are `-GROUP` bundle containers and
--              `-v` variable parents — `SMDBVR`, `MBASADJ-GROUP`. They are
--              WooCommerce constructs and are not Unleashed ProductCodes, so
--              there is nothing in the ERP to upload a picture to, ever. They
--              close only when their SIZES are photographed, and until then this
--              is the only place a picture for them can live.
--
-- IT IS DELIBERATELY NOT EVERY PHOTOGRAPH WE HAVE. 1,067 Woo photographs are
-- absent from Unleashed and most of them are staying absent. 140 of the 150 the
-- site lost are raw `/product-images/` mirror files: the original white-box
-- studio shots, which is exactly the backdrop the ERP photography does not have.
-- Putting those back would undo the consistency the swap bought — one product
-- showing a grey ERP tile beside a white Woo box — so the loader takes only the
-- repainted `/product-bg/` files, whose backdrops normalize-product-bg.py has
-- already matched. A photograph joins a gallery when it looks like it belongs
-- there, not because the file exists. The rest wait for the repaint queue.
--
-- KEYED ON THE ERP CODE, like product_content, because that is the identifier
-- both systems already agree on. The exception is the reason the table exists:
-- a `-GROUP` container has no ERP code, so it is keyed on the WooCommerce SKU
-- it is known by. Those keys never collide with a real ProductCode — Unleashed
-- has no `-GROUP` suffix anywhere — and lookups are by exact string either way.
create table if not exists product_images (
  -- Unleashed ProductCode where one exists; otherwise the WooCommerce SKU of a
  -- `-GROUP` container or `-v` parent, which has no ERP record by construction.
  erp_code    text primary key,
  -- Where the page lives, for a human opening this table and wanting to look at
  -- what they are editing. Data, not derived — same argument as product_content.
  slug        text,
  -- ORDERED, and the order is the gallery. Site-relative paths under /public
  -- (`/product-bg/MMDBRH01-2.jpg`), never absolute URLs: the WordPress host is
  -- gone and a row pointing at it would render a broken image rather than fail
  -- loudly. The loader writes only paths whose file is committed.
  images      text[] not null default '{}',
  -- Why this row exists, so the two cases stay separable without re-deriving
  -- them: 'gallery' is extra angles behind an ERP photograph, 'sole' is a
  -- product the ERP has no picture of and cannot be given one.
  kind        text not null default 'gallery',
  updated_at  timestamptz not null default now(),
  -- The point of moving photography out of a committed JSON file is that
  -- somebody other than an engineer can curate it. Record who did.
  updated_by  text,
  constraint product_images_kind_check check (kind in ('gallery', 'sole'))
);

comment on table product_images is
  'Secondary product photography, keyed to Unleashed ProductCode. Renders BEHIND the ERP''s own image, never instead of it.';

-- The site holds a code and wants its gallery. One statement loads the whole
-- table into a cached map (lib/product-gallery.ts), so this index is for the
-- admin and curation paths rather than the render path.
create index if not exists product_images_updated_idx
  on product_images (updated_at desc);

-- --------------------------------------------------------------------- RLS
--
-- Same reasoning as product_content: server code holds the service role key and
-- bypasses RLS, so enabling it with NO policies denies anon and authenticated
-- outright. These pictures are already public on the website, so a read policy
-- would leak nothing — but that should be a decision someone makes when a
-- portal needs it, not a default nobody chose.
alter table product_images enable row level security;
