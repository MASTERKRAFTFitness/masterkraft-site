-- Tell the site when somebody edits product copy, so the page changes now.
--
-- PREREQUISITE: Database Webhooks must be enabled on the project once
-- (Dashboard > Database > Webhooks > Enable). That is what creates the
-- `supabase_functions` schema and the pg_net extension this trigger calls. If
-- `supabase_functions.http_request` does not exist, that step has not been done
-- and this migration will fail with "schema does not exist" rather than
-- silently installing nothing.
--
-- WHY A TRIGGER AND NOT A CRON. lib/product-content.ts caches the table for an
-- hour. An editor who fixes a warranty and sees no change concludes the edit
-- did not save, and edits it again — so the lag is not a slow feature, it is a
-- broken one. The webhook closes the gap to seconds.
--
-- IT ONLY FIRES FOR HUMAN EDITS, and that condition is the important part of
-- this file rather than a refinement of it.
--
-- `scripts/content.load.ts` upserts 414 rows in chunks. A row-level trigger
-- with no condition would send 414 HTTP requests at the site in a few seconds,
-- each one forcing the next render to re-read the whole table — a self-inflicted
-- stampede every time the loader runs, and the loader is the thing most likely
-- to run unattended. The loader stamps `updated_by = 'content.load'`, so
-- excluding that value means a bulk load fires the webhook ZERO times.
--
-- A loader run still needs ONE revalidation. content.load.ts makes that call
-- itself, once, after the last chunk — see the note there. One deliberate call
-- beats four hundred accidental ones.
--
-- THE SECRET LIVES IN THE TRIGGER DEFINITION, which is how Supabase webhooks
-- carry headers: it is stored in the catalogue and readable by anyone who can
-- read `pg_get_triggerdef` or open the Webhooks page. That is an accepted
-- property of this mechanism, not an oversight. It is a revalidation token and
-- nothing more — the worst a holder can do is make the site re-read its own
-- database — but rotate it in both places together, and never reuse a token
-- here that grants anything else.
--
-- REPLACE <SECRET> BELOW with the value of CONTENT_REVALIDATE_SECRET from
-- Vercel before running this. A mismatch is not silent in the usual sense — the
-- route answers 401 and nothing revalidates — but it is invisible from the
-- database, because pg_net fires and forgets. Check it with the verification
-- query at the bottom of this file.

-- Fires for a person's edit, never for the loader's own rows.
create or replace trigger product_content_revalidate
  after insert or update or delete on public.product_content
  for each row
  when (
    -- DELETE exposes OLD only, INSERT/UPDATE expose NEW. coalesce over both so
    -- one condition covers all three without a separate trigger per operation.
    coalesce(new.updated_by, old.updated_by, '') is distinct from 'content.load'
  )
  execute function supabase_functions.http_request(
    'https://masterkraft.com/api/revalidate/product-content',
    'POST',
    '{"Content-Type":"application/json","Authorization":"Bearer <SECRET>"}',
    '{}',
    '5000'
  );

comment on trigger product_content_revalidate on public.product_content is
  'Calls the site''s revalidation route on a HUMAN edit. Excludes updated_by = ''content.load'' so a 414-row loader run does not fire 414 requests; the loader makes one call itself.';

-- ---------------------------------------------------------------- verifying
--
-- pg_net fires and forgets, so a 401 from a wrong secret leaves no trace in the
-- trigger. These two queries are how you tell it is actually working.
--
--   1. The trigger exists and carries the condition:
--
--        select pg_get_triggerdef(oid)
--        from pg_trigger
--        where tgname = 'product_content_revalidate';
--
--   2. What pg_net actually got back. The response table is the only place a
--      401 shows up:
--
--        select id, status_code, content, created
--        from net._http_response
--        order by created desc
--        limit 5;
--
--      200 with {"ok":true,...} is success. 401 means the secret here and the
--      one in Vercel disagree. 503 means CONTENT_REVALIDATE_SECRET is not set
--      on the deployment at all.
--
-- To test end to end, touch a row as a person would — note updated_by, which is
-- what arms the trigger:
--
--        update product_content
--        set warranty = warranty, updated_by = 'webhook-test'
--        where erp_code = 'MSCMDU01';
--
--   then check net._http_response, and set updated_by back to 'content.load'
--   so the next loader run still treats the row as its own.
