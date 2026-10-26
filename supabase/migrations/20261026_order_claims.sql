-- One row per PaymentIntent that is being, or has been, turned into an order.
-- See src/lib/order-claims.ts.
--
-- Afterpay and Zip payments can be turned into an order by two callers at once:
-- the customer's browser arriving back on /checkout/complete, and Stripe's
-- payment_intent.succeeded webhook. The intent's metadata says whether an order
-- exists, but only AFTER the order is placed, and placing one in Unleashed takes
-- seconds - long enough for both callers to read "no order yet" and place two.
-- The primary key is the lock: whoever inserts the row places the order.
--
-- Only ever written by the server (service role). RLS on with no policies, like
-- every other table here, so a browser can never read it.
--
-- APPLY BEFORE THE CODE SHIPS. Without the table the code falls back to the old
-- behaviour (no lock), which is safe for cards alone but can double an Afterpay
-- or Zip order.

create table if not exists order_claims (
  payment_intent_id text primary key,
  claimed_at        timestamptz not null default now(),
  -- Set once the order exists. A claim with no order number that is more than a
  -- few minutes old is a placement that crashed: see claimOrder().
  order_number      text,
  constraint order_claims_payment_intent_id_check check (payment_intent_id ~ '^pi_[A-Za-z0-9]+$')
);

alter table order_claims enable row level security;

comment on table order_claims is
  'Lock so one Stripe PaymentIntent becomes at most one order, whichever of the browser or the webhook gets there first.';

-- Check: true when the table exists.
-- select to_regclass('public.order_claims') is not null;
