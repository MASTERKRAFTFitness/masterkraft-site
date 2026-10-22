-- One row per Easyship shipment that has had a label bought, written by the
-- Easyship webhook (src/app/api/easyship/webhook). See src/lib/easyship-webhook.ts.
--
-- WHY: tracking numbers almost never reach Unleashed (6 of 58 shipments,
-- mid-Aug to 17 Oct 2026), so the "on its way" email usually goes without one.
-- A label bought in Easyship knows its number the moment it exists; this table
-- is where the shipped-email cron picks it up.
--
-- order_number is the Unleashed sales order ("SO-00000877"), taken from the
-- platform_order_number the site gave the shipment, minus any "(1/2)" suffix
-- for a split consignment. One order can therefore have several rows.

create table if not exists easyship_labels (
  easyship_shipment_id text primary key,
  order_number         text not null,
  platform_order_number text,
  tracking_number      text,
  tracking_page_url    text,
  label_url            text,
  tracking_status      text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on table easyship_labels is
  'Easyship labels and their tracking numbers, from the shipment.label.created webhook. Read by the shipped-email cron.';

create index if not exists easyship_labels_order_idx on easyship_labels (order_number);

-- Service role only, like every other table the site writes.
alter table easyship_labels enable row level security;

-- Check: returns true when the table is ready.
select count(*) = 1 as easyship_labels_ready
from information_schema.tables
where table_schema = 'public' and table_name = 'easyship_labels';
