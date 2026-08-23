-- Bug: game_state.unlocked_npc_ids' column default (and create_profile_and_state,
-- which relies on it) was a hardcoded 5-id array from when this table was first
-- created. It never tracked the free tier (unlock_cost = 0 in npc_reference) as
-- the roster grew, so every signed-in player was missing most of their actual
-- free monsters — showing as "locked" even though unlocking them costs 0 gp.
-- Guests don't have this bug (src/hooks/useGameState.ts's loadState already
-- unions in the current free tier on every load); only the cloud/signed-in path
-- was affected.
--
-- Also lowers the free-tier cutoff itself from combat level 10 to 6 (see
-- scripts/generate-monsters.mjs and this reference-data reseed) — a monster
-- that's free should actually be unlocked already, not just free-to-click.

-- 1. Backfill: every existing account gets the union of what they already
--    have plus every currently-free npc. Additive only — never removes
--    anything a player has already unlocked or paid for.
update public.game_state g
set unlocked_npc_ids = (
  select coalesce(jsonb_agg(distinct id), '[]'::jsonb)
  from (
    select jsonb_array_elements_text(g.unlocked_npc_ids) as id
    union
    select nr.id from public.npc_reference nr where nr.unlock_cost = 0
  ) combined
);

-- 2. Column default updated to a current snapshot of the free tier, as a
--    defense-in-depth fallback for the direct-insert RLS policy on
--    game_state (a client can INSERT its own row without going through
--    create_profile_and_state). Not the primary fix — that's #3 below,
--    which stays correct even if the free tier changes again later.
alter table public.game_state
alter column unlocked_npc_ids set default '["carnivorous-chinchompa", "chicken", "cow", "cow-calf", "duck", "giant-rat", "goblin", "highwayman", "man", "monk", "rabbit", "ram", "rat", "rooster", "seagull", "undead-chicken", "undead-cow", "woman", "wormbrain"]'::jsonb;

-- 3. New signups now start with every currently-free npc, computed fresh
--    from npc_reference each time rather than a fixed literal.
create or replace function public.create_profile_and_state (p_username text) returns void as $$
declare
  v_starter jsonb;
begin
  select coalesce(jsonb_agg(id), '[]'::jsonb) into v_starter from public.npc_reference where unlock_cost = 0;
  insert into public.profiles (id, username) values (auth.uid (), p_username);
  insert into public.game_state (user_id, unlocked_npc_ids) values (auth.uid (), v_starter);
end;
$$ language plpgsql security definer set search_path = public;
