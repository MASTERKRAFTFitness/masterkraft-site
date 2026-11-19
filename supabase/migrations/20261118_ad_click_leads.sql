-- The Google ad click behind each lead and order. See src/lib/ad-click.ts.
--
-- WHY. Google Ads only counts a conversion the browser tag fires for a visitor
-- who accepted cookies, and most visitors never press Accept. Between 27 Oct and
-- 18 Nov 2026 Ads recorded zero conversions while the site was taking orders and
-- enquiries. Keeping the click id beside the lead lets /admin/ad-clicks export
-- them for Ads' offline conversion import, which needs no cookie.
--
-- ONE ROW PER LEAD, keyed by (kind, ref):
--   checkout  ref = the checkout id. Whether it was paid is read from
--             checkout_leads at export time, so this row never goes stale.
--   quote     ref = the checkout id when the quote came from a card checkout,
--             else a fresh id per request.
--   brief     ref = a fresh id per fitout brief.
-- Only written when the browser sent a click id, so most leads have no row.
--
-- consent: 'granted' when the visitor had pressed Accept (the tag will already
-- have counted them), 'unspecified' when they had not answered. A visitor who
-- pressed Decline never sends a click, so there is no 'denied'.
--
-- 120 DAYS, pruned on write. Ads will not take an upload past 90 days from the
-- click; the extra month is slack for a late export.

create table if not exists ad_click_leads (
  kind        text not null check (kind in ('checkout', 'quote', 'brief')),
  ref         text not null check (char_length(ref) between 1 and 64),
  gclid       text check (gclid is null or char_length(gclid) <= 250),
  gbraid      text check (gbraid is null or char_length(gbraid) <= 250),
  wbraid      text check (wbraid is null or char_length(wbraid) <= 250),
  clicked_at  timestamptz not null,
  consent     text not null check (consent in ('granted', 'unspecified')),
  email       text check (email is null or char_length(email) <= 256),
  -- Cart subtotal for a checkout or quote; null for a brief, which has no cart.
  value       numeric,
  exported_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (kind, ref),
  check (gclid is not null or gbraid is not null or wbraid is not null)
);

comment on table ad_click_leads is
  'Google ad click ids beside the leads and orders they produced, for Ads offline conversion import. Retained 120 days.';

create index if not exists ad_click_leads_recent_idx on ad_click_leads (created_at desc);

-- Upsert one lead's click. A later call for the same lead (re-pricing freight
-- after an address edit) refreshes the click and value but never clears them,
-- and never resets exported_at - a lead uploaded once must not be uploaded twice.
create or replace function record_ad_click_lead(
  p_kind       text,
  p_ref        text,
  p_gclid      text,
  p_gbraid     text,
  p_wbraid     text,
  p_clicked_at timestamptz,
  p_consent    text,
  p_email      text default null,
  p_value      numeric default null
)
returns void
language sql
security invoker
set search_path = public
as $$
  with pruned as (
    delete from ad_click_leads where created_at < now() - interval '120 days'
  )
  insert into ad_click_leads (kind, ref, gclid, gbraid, wbraid, clicked_at, consent, email, value)
  values (p_kind, p_ref, p_gclid, p_gbraid, p_wbraid, p_clicked_at, p_consent, p_email, p_value)
  on conflict (kind, ref) do update set
    gclid      = coalesce(excluded.gclid, ad_click_leads.gclid),
    gbraid     = coalesce(excluded.gbraid, ad_click_leads.gbraid),
    wbraid     = coalesce(excluded.wbraid, ad_click_leads.wbraid),
    clicked_at = greatest(excluded.clicked_at, ad_click_leads.clicked_at),
    -- Once granted, stays granted: the tag has counted them, so the export must not.
    consent    = case when ad_click_leads.consent = 'granted' then 'granted' else excluded.consent end,
    email      = coalesce(excluded.email, ad_click_leads.email),
    value      = coalesce(excluded.value, ad_click_leads.value),
    updated_at = now();
$$;

-- Written from public routes and holds personal data: RLS on, no policies,
-- service role only - same posture as checkout_leads.
alter table ad_click_leads enable row level security;

revoke execute on function record_ad_click_lead(
  text, text, text, text, text, timestamptz, text, text, numeric
) from public, anon, authenticated;

-- Check: true when the table and function both exist.
select to_regclass('public.ad_click_leads') is not null
  and (select count(*) from pg_proc where proname = 'record_ad_click_lead') = 1
  as ad_click_leads_ready;
