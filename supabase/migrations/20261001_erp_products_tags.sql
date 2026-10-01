-- Tags on the mirror: labels MasterKraft puts on a product that Unleashed has
-- no field for. The first is FIIT30, Fernwood's HIIT zone (Training Manual
-- p.9), which drives a FIIT30 button in the catalogue and the partner portal.
--
-- WHY A COLUMN HERE AND NOT A SIDE TABLE. The loader (lib/erp-mirror.ts)
-- upserts every row with the same fixed set of keys, and `tags` is not one of
-- them. PostgREST builds the upsert's column list from the keys it is sent, so
-- a key no row carries is left untouched on conflict: a sync keeps the tags.
-- The trap is a loader that sends `tags` on SOME rows only; then the rest are
-- nulled (that is how 315 overviews were lost on 23 Sep). So the loader must
-- never send it at all, and erp-mirror.ts says so beside the row shape.
--
-- A product deleted from Unleashed is pruned with its tags, which is right:
-- a tag on a product that cannot be sold would list it anyway.
--
-- Spelled FIIT30, double I, upper case. Tags are compared exactly.

alter table erp_products
  add column if not exists tags text[] not null default '{}';

create index if not exists erp_products_tags_idx
  on erp_products using gin (tags);

comment on column erp_products.tags is
  'MasterKraft labels with no Unleashed field, e.g. FIIT30. Hand-set; the loader never writes it.';
