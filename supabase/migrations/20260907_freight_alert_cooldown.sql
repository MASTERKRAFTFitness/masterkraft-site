-- Somewhere for the freight alerter to remember that it already told someone.
--
-- The cooldown was a module-scope `Map` in lib/freight-alert.ts, which is a
-- correct answer for one long-lived process and the wrong one here. Vercel runs
-- this as serverless functions: every cold instance starts with an empty Map, so
-- "one mail per problem per six hours" was really "one mail per problem per
-- lambda", and a busy afternoon sent as many as the platform felt like scaling
-- to. Steve got a run of them on 6-7 September. The classifier fix in 56fb4d4
-- stopped the mail that should never have been sent at all; this stops the
-- duplicates of the ones that should.
--
-- ONE ROW PER CARRIER AND KIND, NOT PER ALERT. The question is "have we said
-- this recently", so the row is the state of a conversation rather than a log of
-- it. That also bounds the table at carriers x failure kinds — single digits
-- forever — where an append-only log of every carrier hiccup would not be.
--
-- Plain Postgres apart from the RLS block, like the migrations before it.

create table if not exists freight_alert_cooldown (
  -- "Easyship", "Australia Post". Free text rather than an enum: a new carrier
  -- is a configuration change (FREIGHT_CARRIERS), and it must not need a
  -- migration before it can raise an alarm.
  carrier               text        not null,
  -- The CarrierFailure kind that was mailed about: quota, auth or config. The
  -- kinds that are never mailed (transient, consignment) never reach this table,
  -- so a row existing at all means somebody was woken.
  kind                  text        not null,
  last_alerted_at       timestamptz not null default now(),
  -- How many times we have actually sent this one. The pair of counters is the
  -- only evidence of how noisy an alert is; without them a quiet inbox and a
  -- broken alerter look identical.
  alerts_sent           bigint      not null default 0,
  -- How many failures we have swallowed since the last mail. A large number
  -- here is the signal that a carrier is failing continuously rather than
  -- occasionally, which the mail itself cannot say.
  suppressed_since_last bigint      not null default 0,
  primary key (carrier, kind)
);

comment on table freight_alert_cooldown is
  'One row per carrier+failure kind. Stops a serverless cold start re-sending an alert someone already has.';

-- ATOMIC BY DESIGN, because the race is the entire point. Two lambdas noticing
-- the same dead carrier in the same second must not both decide they are the
-- first. Postgres settles it: the conditional DO UPDATE either matches a row
-- outside its cooldown and claims it, or matches nothing and returns nothing.
-- Exactly one caller can win.
--
-- `security invoker` (the default) is deliberate — this is only ever called with
-- the service role key from server code, and must not become a way for anyone
-- else to write rows. `search_path` is pinned because a mutable one in a
-- function is a privilege-escalation footgun. Same reasoning as record_not_found.
create or replace function claim_freight_alert(
  p_carrier          text,
  p_kind             text,
  p_cooldown_seconds double precision
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_claimed boolean;
begin
  insert into freight_alert_cooldown as c (carrier, kind, last_alerted_at, alerts_sent)
  values (p_carrier, p_kind, now(), 1)
  on conflict (carrier, kind) do update
    set last_alerted_at       = now(),
        alerts_sent           = c.alerts_sent + 1,
        suppressed_since_last = 0
    -- The whole cooldown, in one line: only claim a row we have not written
    -- inside the window. A first-ever failure inserts instead and claims too.
    where c.last_alerted_at < now() - make_interval(secs => p_cooldown_seconds)
  returning true into v_claimed;

  if coalesce(v_claimed, false) then
    return true;
  end if;

  -- Not our turn. Count it, so the next mail can say how many it stood for.
  update freight_alert_cooldown
     set suppressed_since_last = suppressed_since_last + 1
   where carrier = p_carrier and kind = p_kind;

  return false;
end;
$$;

-- --------------------------------------------------------------------- RLS
--
-- Same posture as every other table here: reached only from server code holding
-- the service role key, which bypasses RLS, so enabling it with NO policies
-- denies anon and authenticated outright. This table is written on the freight
-- quote path, which is public and unauthenticated, so it gets the same care
-- not_found_hits does.
alter table freight_alert_cooldown enable row level security;
