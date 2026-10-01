-- Freight matrices the checkout can price from, beside the live carrier APIs.
--
-- WHY TABLES AND NOT A FILE. Rates are a business decision that changes more
-- often than the code, and a rate change must not need a deploy. lib/freight-
-- matrix.ts reads these tables at quote time (cached for a minute), so an edit
-- in the Supabase table editor is live on the next quote.
--
-- A MATRIX IS ONE RATE CARD: a carrier's zones, the postcodes in them, and
-- zone x chargeable-weight rates. Several can be active at once - a carrier's
-- contract card beside a flat price list of our own - and each zones postcodes
-- its own way, because carriers do not share zone maps.
--
-- WHICH SOURCE ANSWERS is freight_matrix_settings.source:
--
--   api              the live carriers only - exactly the behaviour before this
--                    migration, and the default, so applying it changes nothing
--   matrix           the matrices only; a cart they cannot price goes to the quote flow
--   matrix_then_api  the matrices, and the live carriers for anything they do not cover
--   api_then_matrix  the live carriers, and the matrices when they fail or decline
--   pooled           both, every time, and the cheapest wins
--
-- A matrix is also switched individually (`active`), so a card can be loaded
-- and checked before it prices anything.
--
-- "Does not cover" means: the delivery postcode is in none of the matrix's
-- zones, or no active rate in that zone matches the consignment's chargeable
-- weight and carton class, or the matching rate has no price.
--
-- Plain Postgres apart from the RLS block, like the migrations before it.

create table if not exists freight_matrix_settings (
  -- One row, ever. The boolean key is the whole constraint.
  id      boolean primary key default true check (id),
  source  text    not null default 'api'
          check (source in ('api', 'matrix', 'matrix_then_api', 'api_then_matrix', 'pooled')),
  notes   text
);

insert into freight_matrix_settings (id) values (true) on conflict (id) do nothing;

create table if not exists freight_matrices (
  -- Short and stable: it is part of the option id payment-intent matches on.
  code                text    primary key,
  name                text    not null,
  -- What the customer sees as the carrier on the option.
  carrier             text    not null,
  -- Off until someone turns it on. Loading a card must not start pricing with it.
  active              boolean not null default false,
  -- 'price': rates are what the customer pays, GST-inclusive, used as they are.
  -- 'cost':  rates are the carrier's charge to us, ex GST. The fuel levy, then
  --          FREIGHT_MARGIN_PERCENT, then GST are added - the same treatment a
  --          live carrier quote gets.
  basis               text    not null default 'price' check (basis in ('price', 'cost')),
  -- How per_kg applies within a band.
  -- 'excess': per kilo ABOVE the band's floor ("$50 up to 25kg, then $2/kg").
  -- 'total':  per kilo on the WHOLE chargeable weight, the band only choosing
  --           the rate - how a carrier's weight breaks work ("1-250kg @ $0.78").
  per_kg_on           text    not null default 'excess' check (per_kg_on in ('excess', 'total')),
  -- A carton bills at the greater of its dead weight and volume x this.
  -- 0 means dead weight only.
  cubic_factor_kg_m3  numeric not null default 250 check (cubic_factor_kg_m3 >= 0),
  -- Carrier fuel surcharge (FAF), percent, on 'cost' rates only. It moves; keep it current.
  fuel_levy_percent   numeric not null default 0 check (fuel_levy_percent >= 0),
  -- True for a carrier that charges per consignment and takes a whole cart in
  -- one - a line-haul carrier with a minimum charge. The router splits carts so
  -- each bulky carton travels alone, because that is what TNT needs; against a
  -- per-consignment minimum that would charge the minimum once per carton. So a
  -- consolidating matrix is ALSO offered the whole cart as one consignment, and
  -- the cheaper answer wins.
  consolidate         boolean not null default false,
  notes               text
);

create table if not exists freight_zones (
  matrix_code  text not null references freight_matrices (code) on delete cascade on update cascade,
  code         text not null,
  name         text not null,
  notes        text,
  primary key (matrix_code, code)
);

-- Postcode ranges, inclusive. Within one matrix RANGES MAY OVERLAP AND THE
-- NARROWEST WINS, so a zone can be carved out of a wider one without rewriting
-- it: NSW 2000-2999 plus a regional 2640-2660 sends 2650 to the regional zone.
create table if not exists freight_zone_postcodes (
  matrix_code    text    not null,
  zone_code      text    not null,
  postcode_from  integer not null check (postcode_from between 0 and 9999),
  postcode_to    integer not null check (postcode_to between 0 and 9999),
  check (postcode_from <= postcode_to),
  primary key (matrix_code, zone_code, postcode_from),
  foreign key (matrix_code, zone_code) references freight_zones (matrix_code, code)
    on delete cascade on update cascade
);

create table if not exists freight_matrix_rates (
  id              bigint  generated always as identity primary key,
  matrix_code     text    not null,
  zone_code       text    not null,
  service         text    not null default 'Standard delivery',
  -- Only decides which option counts as "faster" when two are offered; see
  -- selectOptions in lib/freight.ts. days_* feed the same comparison.
  service_level   text    not null default 'standard'
                  check (service_level in ('standard', 'express', 'courier')),
  -- Which consignments this row prices: 'parcel' (every carton inside
  -- Australia Post's parcel limits), 'oversize' (any carton over them) or
  -- 'any'. 'parcel' by default, so a bulky rack is never priced off a parcel
  -- rate because somebody forgot this column existed.
  applies_to      text    not null default 'parcel'
                  check (applies_to in ('parcel', 'oversize', 'any')),
  -- The band is (weight_from_kg, weight_to_kg] on CHARGEABLE weight; the first
  -- band also takes 0. A null upper bound is an open-ended top band.
  weight_from_kg  numeric not null default 0 check (weight_from_kg >= 0),
  weight_to_kg    numeric check (weight_to_kg is null or weight_to_kg > weight_from_kg),
  -- Flat part of the charge (a carrier's "basic charge"). Null = this cell is
  -- not priced here: fall through to the carriers, or to the quote flow.
  price           numeric check (price is null or price >= 0),
  per_kg          numeric not null default 0 check (per_kg >= 0),
  -- The least one consignment costs on this rate, before fuel, margin and GST.
  minimum         numeric not null default 0 check (minimum >= 0),
  days_from       integer check (days_from is null or days_from >= 0),
  days_to         integer check (days_to is null or days_to >= 0),
  active          boolean not null default true,
  foreign key (matrix_code, zone_code) references freight_zones (matrix_code, code)
    on delete cascade on update cascade
);

create index if not exists freight_matrix_rates_zone on freight_matrix_rates (matrix_code, zone_code);

comment on table freight_matrix_settings is 'Which freight source answers: api / matrix / matrix_then_api / api_then_matrix / pooled.';
comment on table freight_matrices is 'One row per rate card. Inactive until switched on.';
comment on table freight_zones is 'A rate card''s delivery zones.';
comment on table freight_zone_postcodes is 'Postcode ranges into zones, inclusive, per rate card. The narrowest matching range wins.';
comment on table freight_matrix_rates is 'Zone x chargeable-weight band x service, per rate card.';

-- --------------------------------------------------------------------- RLS
--
-- Same posture as every other table here: read only from server code holding
-- the service role key, which bypasses RLS, so enabling it with NO policies
-- denies anon and authenticated outright. Rates are commercial terms, and
-- nothing outside the server should read or write them.
alter table freight_matrix_settings enable row level security;
alter table freight_matrices enable row level security;
alter table freight_zones enable row level security;
alter table freight_zone_postcodes enable row level security;
alter table freight_matrix_rates enable row level security;
