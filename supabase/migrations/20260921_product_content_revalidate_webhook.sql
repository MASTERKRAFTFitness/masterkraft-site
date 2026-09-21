-- Tell the site when somebody edits product copy, so the page changes now.
--
-- PLAIN pg_net, NOT `supabase_functions.http_request`. The first version of
-- this file used the Dashboard's webhook wrapper and could not be installed:
-- enabling Database Webhooks in the UI did not create the `supabase_functions`
-- schema, so `create trigger` failed against a function that did not exist, and
-- a follow-up check found trigger, schemas, extension and function all absent.
-- pg_net is a normal extension this file can install itself, which removes the
-- dependency on a dashboard toggle having worked.
--
-- It is also the better shape: the wrapper POSTs the entire row as `record`,
-- while this sends only `{"slugs": ["..."]}` — which is what the route wants
-- for revalidatePath, and keeps a product's copy out of an HTTP body that has
-- no use for it.
--
-- WHY AT ALL. lib/product-content.ts caches the table for an hour. An editor
-- who fixes a warranty and sees no change concludes the edit did not save, and
-- edits it again — so the lag is not a slow feature, it is a broken one.
--
-- IT ONLY FIRES FOR HUMAN EDITS, and that condition is the important part of
-- this file rather than a refinement of it. scripts/content.load.ts upserts 414
-- rows in chunks; an unconditional row-level trigger would fire 414 HTTP
-- requests at the site in a few seconds, each forcing the next render to
-- re-read the whole table. A self-inflicted stampede every time the loader
-- runs, and the loader is the thing most likely to run unattended. The loader
-- stamps `updated_by = 'content.load'`, so excluding that value means a bulk
-- load fires this ZERO times. The loader makes ONE call itself instead, after
-- its last chunk — see scripts/content.load.ts.
--
-- THE SECRET LIVES IN THE FUNCTION BODY, readable by anyone who can read
-- pg_get_functiondef. Accepted, not overlooked: it is a revalidation token and
-- the worst a holder can do is make the site re-read its own database. Rotate
-- it here and in Vercel together, and never put a token here that grants
-- anything else.
--
-- REPLACE <SECRET> with CONTENT_REVALIDATE_SECRET from Vercel before running.

create extension if not exists pg_net;

create or replace function public.product_content_revalidate()
returns trigger
language plpgsql
security definer
-- Pinned because this is SECURITY DEFINER: without it a caller's search_path
-- decides which `net` this resolves to.
set search_path = public, net, extensions
as $$
declare
  v_slug text;
begin
  -- NEW is unassigned on DELETE and referencing it raises, so branch on TG_OP
  -- rather than relying on coalesce across both records.
  if tg_op = 'DELETE' then
    v_slug := old.slug;
  else
    v_slug := new.slug;
  end if;

  -- A row with no slug has no page to revalidate. The table is keyed on
  -- erp_code and a product can carry copy before it has a URL.
  if v_slug is null or v_slug = '' then
    return null;
  end if;

  -- Queued, not sent inline: pg_net hands this to its background worker, so a
  -- slow or unreachable site cannot hold the editor's UPDATE open.
  perform net.http_post(
    url := 'https://masterkraft.com/api/revalidate/product-content',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SECRET>'
    ),
    body := jsonb_build_object('slugs', jsonb_build_array(v_slug)),
    timeout_milliseconds := 5000
  );
  return null; -- AFTER trigger; the return value is discarded
end;
$$;

comment on function public.product_content_revalidate() is
  'Calls the site''s revalidation route so an edit appears in seconds rather than within the hour. Fires only for rows NOT stamped updated_by = ''content.load'' — see the trigger''s WHEN clause.';

-- TWO TRIGGERS, ONE FUNCTION, and not by preference. Postgres rejects a single
-- INSERT OR UPDATE OR DELETE trigger whose WHEN references NEW:
--
--   42P17: DELETE trigger's WHEN condition cannot reference NEW values
--
-- NEW does not exist for DELETE, and unlike the function body — which can
-- branch on TG_OP at run time — a WHEN clause is validated at creation. So the
-- condition is split the same way the operations are, and both arms call the
-- same function.
drop trigger if exists product_content_revalidate on public.product_content;
drop trigger if exists product_content_revalidate_upsert on public.product_content;
drop trigger if exists product_content_revalidate_delete on public.product_content;

create trigger product_content_revalidate_upsert
  after insert or update on public.product_content
  for each row
  when (coalesce(new.updated_by, '') is distinct from 'content.load')
  execute function public.product_content_revalidate();

create trigger product_content_revalidate_delete
  after delete on public.product_content
  for each row
  when (coalesce(old.updated_by, '') is distinct from 'content.load')
  execute function public.product_content_revalidate();

-- ---------------------------------------------------------------- verifying
--
-- pg_net queues and forgets, so a wrong secret leaves NO trace in the trigger:
-- the only place a 401 appears is the response table.
--
--   1. Everything is installed:
--
--        select
--          (select count(*) from pg_trigger where tgname like 'product_content_revalidate%') as triggers, -- expect 2
--          (select extversion from pg_extension where extname = 'pg_net') as pg_net_version;
--
--   2. Fire it with no visible change to any page, then read the answer. Run
--      the UPDATE on its own first — the SQL editor wraps a multi-statement
--      query in ONE transaction, and pg_net does not dispatch until commit, so
--      an UPDATE and a SELECT of the response in the same block cannot work:
--
--        update product_content set updated_by = 'webhook-test' where erp_code = 'MSCMDU01';
--
--      then, as a SEPARATE run:
--
--        select id, status_code, left(content::text, 200) as body, created
--        from net._http_response order by created desc limit 3;
--
--      200 with {"ok":true,...} is success. 401 means this secret and Vercel's
--      disagree. 503 means CONTENT_REVALIDATE_SECRET is unset on the
--      deployment. No rows at all means the request has not been dispatched
--      yet — wait a second and re-read.
--
--      Then put the row back, which does NOT re-fire (the WHEN clause sees
--      'content.load' and stays silent):
--
--        update product_content set updated_by = 'content.load' where erp_code = 'MSCMDU01';
