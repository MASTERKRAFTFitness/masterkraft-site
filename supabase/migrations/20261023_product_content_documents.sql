-- Downloads for a product page: brochures, spec sheets, manuals.
--
-- WEBSITE PRESENTATION, so it belongs here and not on the mirror. erp_products
-- is a cache of Unleashed that lib/erp-mirror.ts rewrites wholesale, and
-- Unleashed has no field for a document link. A link on this table has an
-- author and survives every sync.
--
-- An ordered array of {"label": "...", "href": "..."}. `href` is a site path
-- (the files live in public/manuals) or a full URL. Order is render order.
-- Null and [] both mean "no downloads" and render nothing.
--
-- The first one is the Recovery Roller brochure on MBRMRL09
-- (print/recovery-roller-brochure).
alter table product_content
  add column if not exists documents jsonb;

comment on column product_content.documents is
  'Downloads shown under Specifications on the product page: [{label, href}], in render order.';
