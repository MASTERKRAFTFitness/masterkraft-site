-- What the outside world asks for and this site does not have.
--
-- The redirect map committed in e29894e was written from what the OLD STORE
-- served: 69 WooCommerce category archives and 225 product URLs the visibility
-- rules exclude. That is a complete account of what we broke at the cutover and
-- no account at all of what anyone actually requests. Nobody can say which of
-- those 362 redirects earns its place, and — the part that matters more — a URL
-- nobody thought of is invisible until someone happens to look.
--
-- So the site writes down its own 404s and the redirect map gets argued from
-- evidence instead of from a snapshot of a store that no longer exists.
--
-- ONE ROW PER PATH, NOT PER REQUEST. This traffic is mostly crawlers, and a
-- request-level log would grow without bound while answering a question nobody
-- asks — "when exactly did Googlebot hit this" is worth nothing next to "how
-- often, and since when". Aggregating bounds the table by DISTINCT paths, which
-- is a number set by how many dead URLs exist rather than by how hard the site
-- is being crawled.
--
-- Plain Postgres, like the migration before it: nothing here is Supabase
-- specific except the RLS block at the end.

create table if not exists not_found_hits (
  -- The path only: no query string, no fragment, no host. What is being asked
  -- for is the question; who asked and with what tracking parameters is not.
  path            text primary key,
  hits            bigint not null default 0,
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  -- Kept for the LAST hit rather than all of them, which is enough to answer
  -- the two questions that decide a redirect: is anything still linking to
  -- this, and is it a search engine or a person.
  last_referrer   text,
  last_user_agent text
);

comment on table not_found_hits is
  'One row per 404 path, counted. Drives the legacy redirect map in next.config.ts.';

-- The working query is "what is worth redirecting", which is hits desc.
create index if not exists not_found_hits_busiest_idx
  on not_found_hits (hits desc);

-- And "what started 404ing since we last looked", which is the one that catches
-- a deploy quietly breaking a URL that used to work.
create index if not exists not_found_hits_recent_idx
  on not_found_hits (last_seen_at desc);

-- Counting needs read-modify-write, which the PostgREST client cannot express
-- as an upsert. Doing it in the database also makes it atomic: two crawlers
-- hitting the same dead URL at once increment twice, rather than racing to
-- write 1.
--
-- `security invoker` (the default) is deliberate — this is only ever called
-- with the service role key from server code, and it must not become a way for
-- anyone else to write rows. `search_path` is pinned because a mutable one in a
-- function is a privilege-escalation footgun.
create or replace function record_not_found(
  p_path       text,
  p_referrer   text,
  p_user_agent text
)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into not_found_hits (path, hits, last_referrer, last_user_agent)
  values (p_path, 1, p_referrer, p_user_agent)
  on conflict (path) do update
    set hits            = not_found_hits.hits + 1,
        last_seen_at    = now(),
        -- A hit with no referrer must not erase the one referrer we have; that
        -- is the only evidence of something still linking here.
        last_referrer   = coalesce(excluded.last_referrer, not_found_hits.last_referrer),
        last_user_agent = coalesce(excluded.last_user_agent, not_found_hits.last_user_agent);
$$;

-- --------------------------------------------------------------------- RLS
--
-- Same reasoning as the admin tables: reached only from server code holding the
-- service role key, which bypasses RLS, so enabling it with NO policies denies
-- anon and authenticated outright. This one matters more than it looks — the
-- table is written on a PUBLIC, unauthenticated code path, so it is the one
-- place where a browser could otherwise reach a table at all.
alter table not_found_hits enable row level security;
