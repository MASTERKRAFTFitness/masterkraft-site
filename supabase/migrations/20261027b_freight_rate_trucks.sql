-- Truck rows on a rate card: a row that is a vehicle, not a weight band.
--
-- Capital Group hires trucks by the hour, each with a payload, a pallet count
-- and a bed. Weight alone picks the wrong one - 400kg of rig is nowhere near
-- two tonnes but fills four pallets - so a row with max_pallets set prices any
-- consignment that fits it (payload = weight_to_kg, pallets, bed length),
-- whatever its weight_from_kg, and only the cheapest truck that fits is offered.
-- See quoteOneMatrix and palletsFor in src/lib/freight-matrix.ts.
--
-- Null on both keeps every existing row a weight band, so applying this changes
-- no price. Safe before the code ships: the loader selects every column.

alter table freight_matrix_rates
  add column if not exists max_pallets   integer check (max_pallets is null or max_pallets > 0),
  add column if not exists max_length_cm numeric check (max_length_cm is null or max_length_cm > 0);

comment on column freight_matrix_rates.max_pallets is 'Set = this row is a truck: it carries this many standard pallets. Null = a weight band.';
comment on column freight_matrix_rates.max_length_cm is 'A truck''s bed length, cm; the longest carton must fit. Null = no limit.';
