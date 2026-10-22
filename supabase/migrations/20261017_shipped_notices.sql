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

-- One row per ORDER asked for a Google review, a week or so after dispatch.
-- Same claim-then-send pattern; keyed by order so a split order is asked once.
create table if not exists review_requests (
  order_number text primary key,
  email        text,
  sent_at      timestamptz,
  created_at   timestamptz not null default now()
);

comment on table review_requests is
  'Website orders sent the one-off Google review request. One row per order.';

alter table review_requests enable row level security;

-- Check: returns true when both tables are ready.
select count(*) = 2 as shipped_notices_ready
from information_schema.tables
where table_schema = 'public' and table_name in ('shipped_notices', 'review_requests');
