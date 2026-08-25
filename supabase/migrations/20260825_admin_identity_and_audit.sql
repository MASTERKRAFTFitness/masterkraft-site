-- Identity and audit for the /admin support desk.
--
-- Replaces the single shared password. The console reached a point where
-- "who approved sending that quote" had to have an answer, which needs both a
-- per-person identity and somewhere durable to write the answer down.
--
-- Plain Postgres on purpose: nothing here is Supabase-specific except the RLS
-- block at the end, so this runs on any Postgres if the store ever changes.

-- ---------------------------------------------------------------- identity
--
-- No passwords. Identity IS the work email, proven by a short-lived code sent
-- to it. Nothing to rotate, nothing to leak, and the audit trail is keyed to
-- something the business already controls: if someone leaves, their mailbox
-- goes and so does their access.
create table if not exists admin_users (
  id           uuid primary key default gen_random_uuid(),
  email        text not null unique,
  name         text not null,
  -- Deactivate rather than delete, so past actions keep a real name against them.
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz
);

comment on column admin_users.is_active is
  'Set false to revoke access. Never delete a user who has actions recorded.';

create table if not exists admin_login_codes (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  -- Hashed, so a leaked table row is not a working login.
  code_hash   text not null,
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  -- Bounded so a code cannot be brute forced in its lifetime.
  attempts    smallint not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists admin_login_codes_email_idx
  on admin_login_codes (lower(email), created_at desc);

-- ------------------------------------------------------------------- audit

create table if not exists agent_conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references admin_users (id),
  -- Denormalised so the transcript stays readable if a user row is ever changed.
  user_email text not null,
  title      text,
  started_at timestamptz not null default now(),
  last_at    timestamptz not null default now()
);

create index if not exists agent_conversations_recent_idx
  on agent_conversations (last_at desc);

-- Append only. The conversation is the context a decision was made in, so it is
-- part of the audit trail rather than a convenience feature.
create table if not exists agent_messages (
  id              bigserial primary key,
  conversation_id uuid not null references agent_conversations (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         jsonb not null,
  created_at      timestamptz not null default now()
);

create index if not exists agent_messages_conversation_idx
  on agent_messages (conversation_id, id);

-- The row that answers "who approved sending that quote".
--
-- One row per proposed write, updated once when a human decides. A proposal that
-- is never decided stays 'proposed' forever, which is the honest record: it says
-- the agent wanted to do something and nobody said yes.
create table if not exists agent_actions (
  id              bigserial primary key,
  conversation_id uuid not null references agent_conversations (id) on delete cascade,
  user_id         uuid not null references admin_users (id),
  user_email      text not null,
  tool_name       text not null,
  -- The Anthropic tool_use id, so an action maps back to the exact turn.
  tool_use_id     text not null unique,
  input           jsonb not null,
  decision        text not null default 'proposed'
                    check (decision in ('proposed', 'approved', 'declined')),
  result          jsonb,
  proposed_at     timestamptz not null default now(),
  decided_at      timestamptz
);

create index if not exists agent_actions_recent_idx
  on agent_actions (proposed_at desc);

-- --------------------------------------------------------------------- RLS
--
-- Every one of these is reached only from server code holding the service role
-- key, which bypasses RLS. Enabling RLS with NO policies therefore denies the
-- anon and authenticated roles outright, which is exactly right: none of this
-- should ever be readable from a browser.
alter table admin_users        enable row level security;
alter table admin_login_codes  enable row level security;
alter table agent_conversations enable row level security;
alter table agent_messages     enable row level security;
alter table agent_actions      enable row level security;
