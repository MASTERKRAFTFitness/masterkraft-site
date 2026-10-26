-- A rate card's own margin, for a carrier we mark up differently from the rest.
--
-- 'cost' cards take FREIGHT_MARGIN_PERCENT (FREIGHT_MARGIN_OVERSIZE_PERCENT for
-- a bulky consignment) on top of the carrier's charge and fuel levy. A card that
-- sets margin_percent takes that instead, bulky or not: Capital Group's taxi
-- trucks carry 15%, where every bulky load would otherwise take 20%.
--
-- Null keeps the site's margin, so applying this changes no price. Safe before
-- the code ships: the loader selects every column and ignores this one until then.

alter table freight_matrices
  add column if not exists margin_percent numeric check (margin_percent is null or margin_percent >= 0);

comment on column freight_matrices.margin_percent is 'Margin on cost rates, replacing FREIGHT_MARGIN_PERCENT for this card. Null = the site''s.';
