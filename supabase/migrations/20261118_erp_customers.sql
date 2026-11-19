-- A copy of Unleashed's customer list, enough to match a web buyer by email.
-- See src/lib/erp-customers.ts and src/lib/unleashed-customers.ts.
--
-- WHY A COPY. Web orders are booked to the buyer's own Unleashed customer so the
-- invoice Unleashed syncs to Xero is addressed to them. Asking Unleashed
-- "who has this email" took 3-37 seconds on 18 Nov 2026, while a paid customer
-- waits on the confirmation screen, and its search did not see a customer
-- created seconds earlier. This answers in milliseconds.
--
-- A CACHE, NOT A SOURCE OF TRUTH. Refreshed hourly from Customers?modifiedSince
-- by /api/cron/erp-customers; a customer the checkout creates is added straight
-- away so a quick second order finds it. Unleashed stays the customer master.
--
-- Only written by the server (service role). RLS on with no policies, like
-- every other table here: it holds customer emails and no browser may read it.
--
-- APPLY BEFORE THE CODE SHIPS. Without the table every order falls back to the
-- shared web account, which is safe but books nobody to their own customer.

create table if not exists erp_customers (
  guid        uuid primary key,
  code        text not null,
  name        text,
  -- Lower-cased and trimmed by the writer (normaliseEmail), so lookups are
  -- plain equality.
  email       text,
  obsolete    boolean not null default false,
  -- 'sync' from the hourly refresh, 'checkout' when the site created it and the
  -- refresh has not been round yet.
  source      text not null default 'sync' check (source in ('sync', 'checkout')),
  modified_at timestamptz,
  synced_at   timestamptz not null default now()
);

create index if not exists erp_customers_email_idx on erp_customers (email) where not obsolete;
create index if not exists erp_customers_code_idx on erp_customers (upper(code));

alter table erp_customers enable row level security;

comment on table erp_customers is
  'Cache of Unleashed customers (guid, code, email) so the checkout can match a buyer without a 3-37s Unleashed search.';

-- Check: true when the table exists.
-- select to_regclass('public.erp_customers') is not null;
