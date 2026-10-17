-- One row per Unleashed shipment the "your order is on its way" email has gone
-- out for. See src/lib/shipped-notices.ts for the why.
--
-- The cron claims a row (insert, ignoring a duplicate) BEFORE it sends and
-- deletes it again if the send fails, so this table is what stops a customer
-- being emailed twice when two runs overlap, and what lets a failure retry.
--
-- kind:
--   tracked    the shipment carried a tracking number, and the email gave it
--   untracked  it did not; the email said it's on its way, reply for tracking

create table if not exists shipped_notices (
  shipment_number text primary key,
  order_number    text not null,
  kind            text not null check (kind in ('tracked', 'untracked')),
  tracking_number text,
  carrier         text,
  email           text,
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);

comment on table shipped_notices is
  'Shipments the customer has been emailed about (dispatch notice). One row per Unleashed SalesShipment.';

create index if not exists shipped_notices_order_idx on shipped_notices (order_number);

-- Service role only, like every other table the site writes.
alter table shipped_notices enable row level security;

-- Check: returns true when the table is ready.
select exists (
  select 1 from information_schema.tables
  where table_schema = 'public' and table_name = 'shipped_notices'
) as shipped_notices_ready;
