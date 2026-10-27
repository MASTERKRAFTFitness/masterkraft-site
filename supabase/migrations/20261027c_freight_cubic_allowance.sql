-- A rate card's packing allowance on cubic weight.
--
-- Steve's rule for freight (27 Oct 2026): carton volume x 333, plus about 25%
-- for packaging and pallet space. That stands in for working out how an order
-- packs onto pallets, which checkout deliberately does not attempt. A carton
-- bills at the greater of its dead weight and cubic x (1 + this / 100).
--
-- Default 0 changes no price; the allowance is set per card.

alter table freight_matrices
  add column if not exists cubic_allowance_percent numeric not null default 0 check (cubic_allowance_percent >= 0);

comment on column freight_matrices.cubic_allowance_percent is 'Percent added to cubic weight for packing and pallet space. Steve: 25.';
