-- "What stopped you?" - the shopper's answer from the cart reminder email.
-- See src/lib/cart-reminders.ts and src/app/api/cart-reminder/reason.
--
-- Only ever written by the server (service role) through a signed link, and
-- only for a shopper who opted in to the reminder. One answer per checkout; a
-- second replaces the first.
--
-- APPLY BEFORE THE CODE SHIPS. The reminder run selects these columns, so code
-- without them fails every reminder (the team alert is unaffected).

alter table checkout_leads
  add column if not exists abandon_reason      text,
  add column if not exists abandon_reason_note text,
  add column if not exists abandon_reason_at   timestamptz;

alter table checkout_leads drop constraint if exists checkout_leads_abandon_reason_check;
alter table checkout_leads add constraint checkout_leads_abandon_reason_check check (
  abandon_reason is null
  or abandon_reason in ('freight', 'quote', 'question', 'payment', 'comparing', 'later', 'other')
);

alter table checkout_leads drop constraint if exists checkout_leads_abandon_reason_note_check;
alter table checkout_leads add constraint checkout_leads_abandon_reason_note_check check (
  abandon_reason_note is null or char_length(abandon_reason_note) <= 1000
);

comment on column checkout_leads.abandon_reason is
  'Answer to "what stopped you?" in the cart reminder: freight, quote, question, payment, comparing, later, other.';

-- Check: true when all three columns exist.
select count(*) = 3 as abandon_reason_ready
from information_schema.columns
where table_name = 'checkout_leads'
  and column_name in ('abandon_reason', 'abandon_reason_note', 'abandon_reason_at');
