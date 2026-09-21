-- The enquiries the bot filter stopped, kept so a wrong one can be rescued.
--
-- WHY THIS EXISTS. Three of the guard's four verdicts are DELIBERATELY SILENT:
-- honeypot, too_fast and gibberish all return an ordinary success, the visitor
-- sees the thank-you screen, and nothing reaches HubSpot or anyone's inbox. That
-- is correct against a form-filler — telling a bot which layer caught it is how
-- it tunes around the layer (see lib/form-guard.ts).
--
-- The cost is that a FALSE POSITIVE looks identical from every angle. A real
-- operator whose surname reads as consonant noise, or who pastes a prepared
-- answer in under 2.5 seconds, gets the same silence — and on 20 September we
-- could not answer "where did that lead go" at all, because the only trace was a
-- Vercel log line that had already rolled. Nothing else records a submission:
-- HubSpot and email are the only destinations, and a blocked one reaches neither.
--
-- ONE ROW PER EVENT, unlike not_found_hits. That table counts, because "how
-- often" is the question about a dead URL. Here the question is "who was it and
-- what did they say", so the answer has to be the submission itself.
--
-- RATE LIMITS ARE NOT LOGGED HERE, for two reasons. They are the one verdict the
-- visitor is TOLD about (RATE_LIMITED_MESSAGE names an address to email), so
-- nothing is lost silently and there is nothing to rescue. And they are the one
-- verdict that repeats per request once a cap is hit — logging them per row would
-- turn a flood into unbounded writes on a public, unauthenticated path.

create table if not exists blocked_submissions (
  id           bigserial primary key,
  -- Which form: contact, fitout-brief, warranty, waitlist, newsletter, quote.
  form         text not null,
  -- honeypot | too_fast | gibberish. Never rate_limit; see the header.
  reason       text not null,
  -- The guard's own detail string, e.g. "contact: submitted in 900ms".
  detail       text,
  -- The submitter's IP as visitorKey() derives it. Needed to tell one person
  -- tripping the filter repeatedly from many people tripping it once.
  visitor      text,
  -- Enough of the submission to judge whether it was a person and to reply to
  -- them if it was. Capped in the client; capped again here.
  name         text,
  email        text,
  message      text,
  created_at   timestamptz not null default now()
);

comment on table blocked_submissions is
  'Submissions the bot filter stopped silently. Retained 30 days so a false positive can be found and answered.';

-- The working query is "what got blocked recently", newest first.
create index if not exists blocked_submissions_recent_idx
  on blocked_submissions (created_at desc);

-- And "is one address or one IP tripping this repeatedly", which separates a
-- real person hitting the filter twice from a form-filler hitting it fifty times.
create index if not exists blocked_submissions_visitor_idx
  on blocked_submissions (visitor, created_at desc);

-- THIRTY DAYS, NOT FOREVER. These are real people's names, addresses and typed
-- messages, captured precisely BECAUSE we judged them to be machines — so the
-- justification for holding them is weak and entirely practical: long enough for
-- "we never heard back from you" to surface, and no longer. Privacy aside, it
-- also bounds a table written on an unauthenticated path.
--
-- Pruning happens on insert rather than on a schedule, so it needs no pg_cron
-- and cannot silently stop running. With the created_at index the sweep finds
-- nothing on almost every call.
create or replace function record_blocked_submission(
  p_form    text,
  p_reason  text,
  p_detail  text,
  p_visitor text,
  p_name    text,
  p_email   text,
  p_message text
)
returns void
language sql
security invoker
set search_path = public
as $$
  with pruned as (
    delete from blocked_submissions where created_at < now() - interval '30 days'
  )
  insert into blocked_submissions (form, reason, detail, visitor, name, email, message)
  values (p_form, p_reason, p_detail, p_visitor, p_name, p_email, p_message);
$$;

-- --------------------------------------------------------------------- RLS
--
-- Same posture as not_found_hits, and for the same reason: this is written from
-- a PUBLIC, unauthenticated code path. Enabled with NO policies, so the service
-- role key used by server code is the only thing that can reach it and a browser
-- cannot touch it at all. That matters more here than for 404 paths — these rows
-- hold personal data.
alter table blocked_submissions enable row level security;
