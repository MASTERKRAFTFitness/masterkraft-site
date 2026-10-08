-- Read the revalidation secret from Supabase Vault instead of the function body.
--
-- WHY. 20260921_product_content_revalidate_webhook.sql asked whoever ran it to
-- paste CONTENT_REVALIDATE_SECRET over a placeholder. The live function ended
-- up posting `Bearer NEW_SECRET_HERE`, so every copy edit's cache refresh got a
-- 401 and pages lagged by up to an hour — the exact failure the trigger exists
-- to prevent. A secret that has to be hand-edited into a migration is one that
-- will be committed, mistyped or left as the placeholder.
--
-- Now the secret lives in Vault under the name `content_revalidate_secret`,
-- set once from the SQL editor and never written to the repo:
--
--   select vault.create_secret('<CONTENT_REVALIDATE_SECRET from Vercel>',
--                              'content_revalidate_secret');
--
-- To rotate it later (change it in Vercel too):
--
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'content_revalidate_secret'),
--     '<new value>');
--
-- NO SECRET, NO REQUEST. Until the Vault entry exists the function returns
-- without posting, rather than sending a token it knows is wrong. The page
-- still updates within the hour from the cache TTL.
--
-- Triggers are unchanged: they call this function by name.

create or replace function public.product_content_revalidate()
returns trigger
language plpgsql
security definer
set search_path = public, net, extensions
as $$
declare
  v_slug text;
  v_secret text;
begin
  if tg_op = 'DELETE' then
    v_slug := old.slug;
  else
    v_slug := new.slug;
  end if;

  if v_slug is null or v_slug = '' then
    return null;
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = 'content_revalidate_secret'
  limit 1;

  if v_secret is null or v_secret = '' then
    return null;
  end if;

  perform net.http_post(
    url := 'https://masterkraft.com/api/revalidate/product-content',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body := jsonb_build_object('slugs', jsonb_build_array(v_slug)),
    timeout_milliseconds := 5000
  );
  return null;
end;
$$;

comment on function public.product_content_revalidate() is
  'Calls the site''s revalidation route so an edit appears in seconds rather than within the hour. Secret comes from Vault (content_revalidate_secret); no request is sent until it is set. Fires only for rows NOT stamped updated_by = ''content.load''.';

-- SECURITY DEFINER can read Vault; ordinary roles must not be able to call this
-- function directly and have it act on their behalf.
revoke all on function public.product_content_revalidate() from public, anon, authenticated;
