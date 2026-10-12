-- A record of every fuel levy change made from /admin/freight.
--
-- WHY. Mainfreight's fuel adjustment factor (FAF) moves weekly, and it is
-- applied to every matrix price checkout charges. freight_matrices only holds
-- the CURRENT figure, so without this table "what levy did that order go out
-- on, and who set it" has no answer once the next week's figure is typed in.
--
-- Written by the admin screen only, through the service role. Plain Postgres
-- apart from the RLS block, like the migrations before it.

create table if not exists freight_fuel_levy_changes (
  id               uuid primary key default gen_random_uuid(),
  matrix_code      text not null references freight_matrices (code) on delete cascade,
  -- Null on the first change recorded for a matrix whose earlier levy was set by hand.
  old_percent      numeric(6, 3),
  new_percent      numeric(6, 3) not null check (new_percent >= 0 and new_percent <= 100),
  -- Kept as text as well as the id, so a change still names a person after
  -- their admin_users row is deactivated.
  changed_by       uuid references admin_users (id),
  changed_by_email text,
  -- Free text: "FAF letter 13 Oct", the email it came from, anything.
  note             text,
  created_at       timestamptz not null default now()
);

create index if not exists freight_fuel_levy_changes_matrix_idx
  on freight_fuel_levy_changes (matrix_code, created_at desc);

-- Service role only, like every other admin table. No policies on purpose.
alter table freight_fuel_levy_changes enable row level security;
