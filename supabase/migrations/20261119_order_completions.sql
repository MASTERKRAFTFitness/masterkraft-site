-- One row per website sales order the site has tried to complete in Unleashed
-- once it shipped. See src/lib/complete-on-ship.ts for the why.
--
-- Completing the order is what raises its invoice in Unleashed, and that
-- invoice is what reaches Xero. This table is the memory between hourly runs:
-- it stops an order being completed twice, caps the retries on one that keeps
-- failing, and makes sure the team is told about a failure once, not hourly.
--
-- outcome:
--   pending           tried, failed, will be retried next run
--   invoiced          completed by the site; invoice_number is the Unleashed invoice
--   already_invoiced  someone had already raised the invoice by hand; nothing done
--   needs_check       Unleashed accepted the completion but no invoice turned up,
--                     or the retries ran out: a person has to look
--
-- APPLY BEFORE UNLEASHED_COMPLETE_ON_SHIP_FROM IS SET. Without the table the run
-- stops at its first read and completes nothing.

create table if not exists order_completions (
  order_number   text primary key,
  outcome        text not null check (outcome in ('pending', 'invoiced', 'already_invoiced', 'needs_check')),
  -- 'easyship' (a label was bought) or 'unleashed' (a shipment marked Dispatched).
  trigger        text,
  invoice_number text,
  attempts       integer not null default 0,
  last_error     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table order_completions is
  'Website sales orders the site completed (and so invoiced) in Unleashed after shipping. One row per order.';

-- Service role only, like every other table the site writes.
alter table order_completions enable row level security;
