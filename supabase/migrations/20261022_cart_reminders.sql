-- The cart reminder: one email, the morning after, to a shopper who ticked
-- "Email me my cart if I don't finish" at checkout. See src/lib/cart-reminders.ts.
--
-- OPT-IN, NOT ASSUMED. A recovery email is a commercial message under the Spam
-- Act and a checkout is not consent to one (cron/abandoned-checkouts explains
-- why the team alert exists instead). The box is unticked by default, so a true
-- here is the shopper's own express consent, recorded with the checkout it was
-- given for.
--
-- SAFE TO APPLY BEFORE THE CODE SHIPS. The new parameter has a default, so the
-- deployed code's existing calls to record_checkout_lead keep matching. Apply it
-- FIRST: code that sends p_reminder_opt_in to the old function fails every lead
-- write, and with them the team's abandoned-checkout alerts.

alter table checkout_leads
  add column if not exists reminder_opt_in boolean not null default false,
  add column if not exists reminded_at     timestamptz;

-- Addresses that unsubscribed. Checked before every reminder, so ticking the
-- box on a later checkout does not undo an unsubscribe. Lower-cased on write.
create table if not exists cart_reminder_optouts (
  email      text primary key,
  created_at timestamptz not null default now()
);

comment on table cart_reminder_optouts is
  'Emails that unsubscribed from the cart reminder. Never emailed a reminder again.';

alter table cart_reminder_optouts enable row level security;

-- Same function, plus p_reminder_opt_in. Dropped first because adding a
-- parameter to CREATE OR REPLACE makes a second overload rather than replacing.
drop function if exists record_checkout_lead(
  text, text, text, text, text, text, text, text, text, jsonb, numeric, numeric, text, text, text
);

create or replace function record_checkout_lead(
  p_checkout_id     text,
  p_status          text,
  p_name            text default null,
  p_email           text default null,
  p_phone           text default null,
  p_company         text default null,
  p_suburb          text default null,
  p_state           text default null,
  p_postcode        text default null,
  p_items           jsonb default null,
  p_subtotal        numeric default null,
  p_freight_price   numeric default null,
  p_freight_label   text default null,
  p_freight_reason  text default null,
  p_order_number    text default null,
  p_reminder_opt_in boolean default null
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
    items, subtotal, freight_price, freight_label, freight_reason, order_number,
    reminder_opt_in
  )
  values (
    p_checkout_id, p_status, p_name, p_email, p_phone, p_company, p_suburb, p_state, p_postcode,
    coalesce(p_items, '[]'::jsonb), p_subtotal, p_freight_price, p_freight_label, p_freight_reason,
    p_order_number, coalesce(p_reminder_opt_in, false)
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
    freight_price  = case when p_status = 'quoted' and checkout_leads.status not in ('paid', 'quote_requested')
                          then excluded.freight_price else checkout_leads.freight_price end,
    freight_label  = case when p_status = 'quoted' and checkout_leads.status not in ('paid', 'quote_requested')
                          then excluded.freight_label else checkout_leads.freight_label end,
    freight_reason = case when p_status = 'quoted' and checkout_leads.status not in ('paid', 'quote_requested')
                          then excluded.freight_reason else checkout_leads.freight_reason end,
    order_number   = coalesce(excluded.order_number, checkout_leads.order_number),
    notified_at    = case when p_status = 'quoted' and checkout_leads.status not in ('paid', 'quote_requested')
                          then null else checkout_leads.notified_at end,
    -- Null leaves the choice alone, so the payment step (which sends none)
    -- cannot untick it. An untick is sent as false by the freight step, and
    -- wins: consent withdrawn before the email goes stops the email.
    reminder_opt_in = coalesce(p_reminder_opt_in, checkout_leads.reminder_opt_in),
    updated_at     = now();
$$;

-- Only the server calls this, with the service role. A new function is
-- executable by everyone by default; RLS already stops anon writing through it,
-- and this stops anon calling it at all.
revoke execute on function record_checkout_lead(
  text, text, text, text, text, text, text, text, text, jsonb, numeric, numeric, text, text, text, boolean
) from public, anon, authenticated;

-- Check: true when the columns, the table and the new parameter are all there.
select
  (select count(*) from information_schema.columns
    where table_name = 'checkout_leads' and column_name in ('reminder_opt_in', 'reminded_at')) = 2
  and to_regclass('public.cart_reminder_optouts') is not null
  and (select count(*) from pg_proc where proname = 'record_checkout_lead') = 1
  as cart_reminders_ready;
