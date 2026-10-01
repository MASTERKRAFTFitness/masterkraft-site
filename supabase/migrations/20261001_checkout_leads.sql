-- Checkouts that got as far as a freight quote, kept so an abandoned one can be
-- followed up by a person.
--
-- WHY THIS EXISTS. On 1 October a customer added a $225 dip bar, typed their
-- name, email, phone and address into the checkout, pressed Calculate Freight,
-- and left. Opinly showed the whole journey; nothing else did. The freight step
-- never sent the email to the server, so there was nobody to call. This table
-- is that missing record.
--
-- ONE ROW PER CHECKOUT, keyed by an id the browser generates and keeps for the
-- life of the cart. Re-quoting after an address edit updates the same row, and
-- each later step (payment started, paid, quote requested) moves its status on.
--
-- status:
--   quoted           freight was quoted; nothing after that
--   payment_started  a PaymentIntent was created; no order yet
--   paid             an order was placed - not abandoned
--   quote_requested  freight could not be priced and they asked for a quote,
--                    which already reached the team through /api/quote
--
-- The cron at /api/cron/abandoned-checkouts emails the team about rows still
-- at quoted / payment_started an hour on, once each (notified_at).

create table if not exists checkout_leads (
  checkout_id    text primary key,
  status         text not null default 'quoted',
  name           text,
  email          text,
  phone          text,
  company        text,
  suburb         text,
  state          text,
  postcode       text,
  -- [{ sku, name, qty, price }] as the cart showed it. Indicative only: the
  -- server reprices at payment, and this is for a person to read.
  items          jsonb not null default '[]'::jsonb,
  subtotal       numeric,
  -- What the freight step showed. Null price + a reason = it could not be priced.
  freight_price  numeric,
  freight_label  text,
  freight_reason text,
  order_number   text,
  notified_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table checkout_leads is
  'Checkouts that reached a freight quote. Abandoned ones are emailed to the team for follow-up. Retained 90 days.';

create index if not exists checkout_leads_recent_idx on checkout_leads (updated_at desc);
create index if not exists checkout_leads_pending_idx
  on checkout_leads (updated_at) where status in ('quoted', 'payment_started') and notified_at is null;

-- Upsert one checkout. Null arguments leave the stored value alone, so a later
-- step (which knows only the id and its new status) cannot blank the contact
-- details an earlier step recorded. Status never moves BACK from paid or
-- quote_requested: a stray re-quote after payment must not resurrect a sale as
-- abandoned and send the team after a customer who already bought.
--
-- NINETY DAYS, pruned on write like blocked_submissions, so it needs no pg_cron
-- and cannot silently stop. These are real customers' contact details.
create or replace function record_checkout_lead(
  p_checkout_id    text,
  p_status         text,
  p_name           text default null,
  p_email          text default null,
  p_phone          text default null,
  p_company        text default null,
  p_suburb         text default null,
  p_state          text default null,
  p_postcode       text default null,
  p_items          jsonb default null,
  p_subtotal       numeric default null,
  p_freight_price  numeric default null,
  p_freight_label  text default null,
  p_freight_reason text default null,
  p_order_number   text default null
)
returns void
language sql
security invoker
set search_path = public
as $$
  with pruned as (
    delete from checkout_leads where updated_at < now() - interval '90 days'
  )
  insert into checkout_leads (
    checkout_id, status, name, email, phone, company, suburb, state, postcode,
    items, subtotal, freight_price, freight_label, freight_reason, order_number
  )
  values (
    p_checkout_id, p_status, p_name, p_email, p_phone, p_company, p_suburb, p_state, p_postcode,
    coalesce(p_items, '[]'::jsonb), p_subtotal, p_freight_price, p_freight_label, p_freight_reason,
    p_order_number
  )
  on conflict (checkout_id) do update set
    status = case
      when checkout_leads.status in ('paid', 'quote_requested') and excluded.status in ('quoted', 'payment_started')
        then checkout_leads.status
      else excluded.status
    end,
    name           = coalesce(excluded.name, checkout_leads.name),
    email          = coalesce(excluded.email, checkout_leads.email),
    phone          = coalesce(excluded.phone, checkout_leads.phone),
    company        = coalesce(excluded.company, checkout_leads.company),
    suburb         = coalesce(excluded.suburb, checkout_leads.suburb),
    state          = coalesce(excluded.state, checkout_leads.state),
    postcode       = coalesce(excluded.postcode, checkout_leads.postcode),
    items          = case when p_items is null then checkout_leads.items else excluded.items end,
    subtotal       = coalesce(excluded.subtotal, checkout_leads.subtotal),
    -- A re-quote replaces the freight outright, including a price going to null -
    -- but only on a checkout that is still open. A stray re-quote after payment
    -- must not wipe the freight the customer actually paid.
    freight_price  = case when p_status = 'quoted' and checkout_leads.status not in ('paid', 'quote_requested')
                          then excluded.freight_price else checkout_leads.freight_price end,
    freight_label  = case when p_status = 'quoted' and checkout_leads.status not in ('paid', 'quote_requested')
                          then excluded.freight_label else checkout_leads.freight_label end,
    freight_reason = case when p_status = 'quoted' and checkout_leads.status not in ('paid', 'quote_requested')
                          then excluded.freight_reason else checkout_leads.freight_reason end,
    order_number   = coalesce(excluded.order_number, checkout_leads.order_number),
    -- Back in the checkout after a follow-up was sent counts as a fresh attempt.
    notified_at    = case when p_status = 'quoted' and checkout_leads.status not in ('paid', 'quote_requested')
                          then null else checkout_leads.notified_at end,
    updated_at     = now();
$$;

-- Same posture as blocked_submissions: written from a public path, holds
-- personal data, so RLS on with no policies - service role only.
alter table checkout_leads enable row level security;
