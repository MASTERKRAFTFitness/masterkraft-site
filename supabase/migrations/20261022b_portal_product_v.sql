-- The partner portals' product read: one row per sellable product, with its
-- copy and photograph already resolved.
--
-- WHY. The portals (masterkraft-portals, packages/data/src/integrations/
-- supabase-products.ts) used to read erp_products, product_content and
-- catalogue_images separately, then fill gaps in code: a brand code borrowing
-- its M twin's description, a size borrowing another size's, and three photo
-- maps hard-coded in the portal. Every new portal meant reading that code to
-- know what it would show. Now the rules live here, once, and the readiness
-- check is a query on this view.
--
-- NOTHING HERE IS A SOURCE OF TRUTH. erp_products is the loader's cache of
-- Unleashed, product_content the website's copy, catalogue_images the Dropbox
-- photography. This view only chooses between them.

-- ------------------------------------------------------ portal_product_images
--
-- Photographs the portals show that Unleashed does not carry (yet). Not
-- product_images: that table is the website's gallery, renders BEHIND the ERP's
-- photo by rule, and its loader treats a row it did not write as hand-edited
-- and stops refreshing it. These rows are different in kind:
--   override  always shown, even over the ERP's photo (a REVL-badged barbell,
--             black dead balls where Unleashed's are red). Delete the row once
--             Unleashed has the right photo. image_url may be portal-relative
--             (/product-images/X.jpg, served by each portal app).
--   primary   shown before the ERP's photo: the website's /product-images
--             mirror of the WooCommerce photography, by SKU.
--   borrow    fills a gap only: the product shows borrow_from's photograph
--             (same item, another size or branding option).
create table if not exists portal_product_images (
  erp_code     text primary key check (erp_code = upper(erp_code)),
  kind         text not null check (kind in ('override', 'primary', 'borrow')),
  image_url    text,
  borrow_from  text check (borrow_from = upper(borrow_from)),
  note         text,
  updated_at   timestamptz not null default now(),
  updated_by   text,
  constraint portal_product_images_shape check (
    (kind = 'borrow' and borrow_from is not null and image_url is null)
    or (kind <> 'borrow' and image_url is not null and borrow_from is null)
  )
);

comment on table portal_product_images is
  'Partner-portal photographs Unleashed does not carry: override (always wins), primary (before the ERP photo), borrow (gap only, from another code). Read through portal_product_v.';

alter table portal_product_images enable row level security;

-- ------------------------------------------------------ portal_family_name
--
-- "Short Sleeve Tee (Male) - L" -> "Short Sleeve Tee (Male)": the product a
-- size belongs to. Mirrors productFamilyName in the portals
-- (packages/core/src/format.ts): split on " - " / " – ", except a Concept 2
-- name (the brand is the prefix there), and a rig kit sized by cell keeps its
-- rig type ("REVL Studio Kit - Wall Mounted Rig (10 Cell)").
create or replace function portal_family_name(name text) returns text
language sql immutable parallel safe as $$
  select trim(case
    when (regexp_match(trim(name), '^(.+?\sRig)\s+\(\d+\s*Cell\)(\s+[-–]\s+.+)?$', 'i')) is not null
      then (regexp_match(trim(name), '^(.+?\sRig)\s+\(\d+\s*Cell\)(\s+[-–]\s+.+)?$', 'i'))[1]
    when lower(trim((regexp_split_to_array(name, '\s+[-–]\s+'))[1])) in ('concept 2', 'concept2')
      then trim(name)
    else (regexp_split_to_array(name, '\s+[-–]\s+'))[1]
  end)
$$;

-- ------------------------------------------------------ portal_product_v
create or replace view portal_product_v with (security_invoker = true) as
with
sellable as (
  select e.*, upper(trim(e.erp_code)) as code
  from erp_products e
  where e.sellable is true and e.obsolete is false
),
content as (
  select distinct on (upper(trim(c.erp_code)))
    upper(trim(c.erp_code)) as code, c.*,
    (coalesce(c.overview, '') <> '' or coalesce(c.overview_short, '') <> '') as has_copy
  from product_content c
  order by upper(trim(c.erp_code)), c.updated_at desc nulls last
),
-- Another size's copy: same range letter and family, so an F size never
-- describes an M one. Lowest code wins where a family has several.
family_copy as (
  select distinct on (left(s.code, 1), lower(portal_family_name(s.name)))
    left(s.code, 1) as letter, lower(portal_family_name(s.name)) as family, s.code
  from sellable s
  join content c on c.code = s.code and c.has_copy
  where coalesce(s.name, '') <> ''
  order by left(s.code, 1), lower(portal_family_name(s.name)), s.code
),
keyed as (
  select s.*,
    -- A brand code is the M product in the club's livery: FWBBFUR01 is
    -- MWBBFUR01, SPBBSCU01 (STRONG) is MBBSCU01, AMKBUR01 (Air Locker) is
    -- MMKBUR01. Text only: the twin's photograph would show the wrong livery.
    case
      when s.code like 'SP%' then 'M' || substr(s.code, 3)
      when left(s.code, 1) in ('F', 'S', 'J', 'G', 'A') then 'M' || substr(s.code, 2)
    end as twin_code,
    case when coalesce(s.name, '') <> '' then lower(portal_family_name(s.name)) end as family
  from sellable s
),
copy as (
  select k.code,
    own.code as own_code,
    case
      when own.has_copy then 'own'
      when twin.has_copy then 'twin'
      when fc.code is not null then 'family'
    end as source,
    case
      when own.has_copy then own.code
      when twin.has_copy then twin.code
      else fc.code
    end as copy_code
  from keyed k
  left join content own on own.code = k.code
  left join content twin on twin.code = k.twin_code
  left join family_copy fc on fc.letter = left(k.code, 1) and fc.family = k.family
),
-- A photo is catalogued under its SKU or its SKU stem; either key finds it, and
-- a primary shot wins. Keys first, then an equality join: an OR join here costs
-- seconds.
catalogue_keys as (
  select upper(trim(k.key)) as code, ci.public_path, ci.is_primary, ci.sort_order, ci.file_name
  from catalogue_images ci
  cross join lateral (values (ci.sku), (ci.sku_stem)) as k(key)
  where ci.include_in_catalogue is true and ci.public_path is not null and coalesce(trim(k.key), '') <> ''
),
catalogue_photo as (
  select distinct on (ck.code) ck.code,
    'https://catalogues.masterkraft.com' || ck.public_path as url
  from catalogue_keys ck
  join sellable k on k.code = ck.code
  order by ck.code, ck.is_primary desc nulls last, ck.sort_order nulls last, ck.file_name
),
-- The photo before overrides and borrowing: primary, then the ERP's, then the
-- catalogued photography. A borrowed photo is the lender's at this stage.
base_photo as (
  select s.code,
    coalesce(pp.image_url, nullif(s.image, ''), cp.url) as url,
    case
      when pp.image_url is not null then 'primary'
      when nullif(s.image, '') is not null then 'erp'
      when cp.url is not null then 'catalogue'
    end as source
  from sellable s
  left join portal_product_images pp on pp.erp_code = s.code and pp.kind = 'primary'
  left join catalogue_photo cp on cp.code = s.code
)
select
  s.code as erp_code,
  s.name, s.price, s.brand, s.group_name, s.subgroup, s.image as erp_image,
  s.weight_kg, s.width_cm, s.depth_cm, s.height_cm, s.synced_at, s.tags, s.is_branded,
  s.sell_price_tiers,
  -- Copy: the product's own row's slug and colour only (a twin's slug is the M
  -- product's page; Fernwood's colours differ). Its own other fields stay when
  -- only the description is borrowed.
  own.slug,
  coalesce(nullif(src.overview, ''), nullif(src.overview_short, ''), '') as description,
  c.source as description_source,
  case when own.code is not null then own.features else src.features end as features,
  own.colour,
  case when own.code is not null then own.material else src.material end as material,
  case when own.code is not null then own.warranty else src.warranty end as warranty,
  -- Weights: never another SIZE's (a 2-tier rack is not the 3-tier's 51 kg).
  -- Null here, so the portal falls back to the product's own ERP weight. An M
  -- twin is the same item in another livery, so its weights stand.
  case when own.code is not null then own.net_weight when c.source = 'family' then null else src.net_weight end as net_weight,
  case when own.code is not null then own.gross_weight when c.source = 'family' then null else src.gross_weight end as gross_weight,
  case
    when ov.image_url is not null then ov.image_url
    when bp.url is not null then bp.url
    else lender.url
  end as photo_url,
  case
    when ov.image_url is not null then 'override'
    when bp.url is not null then bp.source
    when lender.url is not null then 'borrow'
  end as photo_source
from sellable s
join copy c on c.code = s.code
left join content own on own.code = c.own_code
left join content src on src.code = c.copy_code
left join portal_product_images ov on ov.erp_code = s.code and ov.kind = 'override'
left join base_photo bp on bp.code = s.code
left join portal_product_images bw on bw.erp_code = s.code and bw.kind = 'borrow'
left join base_photo lender on lender.code = bw.borrow_from;

comment on view portal_product_v is
  'Partner portals: one row per sellable, current product, with copy (own -> M twin -> another size) and photo (override -> primary -> ERP -> catalogue -> borrowed) resolved. Read by masterkraft-portals sbListProducts.';

-- Server-side reads only (the portals hold the service role key). security_invoker
-- keeps the base tables' RLS in force for anyone else.
revoke all on portal_product_v from anon, authenticated;
revoke all on portal_product_images from anon, authenticated;
