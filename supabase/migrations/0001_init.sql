-- OSRS Drop Simulator: accounts + global leaderboard
--
-- Design: GP and item *counts* are the only things that matter for a
-- cheat-resistant leaderboard, so those are validated server-side against
-- reference tables (npc unlock cost / max plausible gp per kill, item sell
-- values). The 28-slot inventory grid position/ordering stays a client-side
-- presentation detail, same as guest/localStorage mode — replicating full
-- slot-stacking mechanics here would mean reimplementing the whole drop
-- simulator in SQL for no leaderboard-integrity benefit.

-- ---------------------------------------------------------------------
-- Reference tables (server-side source of truth for validation, seeded by
-- scripts/export-reference-data.mjs + supabase/seed-reference-data.mjs)
-- ---------------------------------------------------------------------

create table public.npc_reference (
  id text primary key,
  unlock_cost bigint not null check (unlock_cost >= 0),
  max_gp_per_kill bigint not null check (max_gp_per_kill >= 0)
);

create table public.item_reference (
  id text primary key,
  value bigint not null check (value >= 0),
  tradeable boolean not null
);

create table public.container_reference (
  item_id text primary key,
  max_gp_per_open bigint not null check (max_gp_per_open >= 0)
);

-- Reference tables are read only by SECURITY DEFINER functions below, not
-- exposed directly to clients (the app already bundles this same data).
alter table public.npc_reference enable row level security;
alter table public.item_reference enable row level security;
alter table public.container_reference enable row level security;

-- ---------------------------------------------------------------------
-- Player data
-- ---------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (
    char_length(username) between 3 and 20 and username ~ '^[A-Za-z0-9_]+$'
  ),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are publicly readable"
  on public.profiles for select
  using (true);

create policy "Users can create their own profile"
  on public.profiles for insert
  with check (auth.uid () = id);

create table public.game_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  gp bigint not null default 0 check (gp >= 0),
  kill_counts jsonb not null default '{}'::jsonb,
  collection_log jsonb not null default '{}'::jsonb,
  unlocked_npc_ids jsonb not null default '["chicken", "cow", "giant-rat", "goblin", "man"]'::jsonb,
  -- Client-managed 28-slot presentation cache (see design note above).
  -- Not used for any validation; just a convenient cloud save of "what did
  -- my inventory grid look like."
  inventory_cache jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.game_state enable row level security;

create policy "Users can read their own game state"
  on public.game_state for select
  using (auth.uid () = user_id);

create policy "Users can create their own game state"
  on public.game_state for insert
  with check (auth.uid () = user_id);

-- Direct UPDATE is intentionally NOT allowed by policy (no update policy
-- exists) — all mutations must go through the validated functions below,
-- which run as SECURITY DEFINER and bypass RLS internally. This is what
-- stops a signed-in user from just PATCHing their own row to any gp value.

-- Authoritative per-item quantity ledger backing sell/open validation.
create table public.user_items (
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id text not null references public.item_reference (id),
  quantity bigint not null default 0 check (quantity >= 0),
  primary key (user_id, item_id)
);

alter table public.user_items enable row level security;

create policy "Users can read their own items"
  on public.user_items for select
  using (auth.uid () = user_id);

-- Public leaderboard: username + gp only, nothing private.
create view public.leaderboard as
select p.username, g.gp, g.updated_at
from public.game_state g
join public.profiles p on p.id = g.user_id
order by g.gp desc;

grant select on public.leaderboard to anon, authenticated;

-- ---------------------------------------------------------------------
-- Bookkeeping
-- ---------------------------------------------------------------------

create function public.touch_updated_at () returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger game_state_touch_updated_at
before update on public.game_state
for each row
execute function public.touch_updated_at ();

create function public.create_profile_and_state (p_username text) returns void as $$
begin
  insert into public.profiles (id, username) values (auth.uid (), p_username);
  insert into public.game_state (user_id) values (auth.uid ());
end;
$$ language plpgsql security definer set search_path = public;
