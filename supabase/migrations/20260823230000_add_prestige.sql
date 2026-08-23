-- Prestige: once every monster (bosses included) is unlocked, a player can
-- reset gp/kills/collection log/unlocks/inventory back to the start in
-- exchange for a permanent, ever-increasing prestige_count shown on its own
-- leaderboard. Validated server-side the same way as every other
-- gp/item-affecting action (see 0002_actions.sql's header comment) — a
-- client claiming "I've unlocked everything" is checked against
-- npc_reference, not trusted.

alter table public.game_state
add column prestige_count integer not null default 0 check (prestige_count >= 0);

-- Recreated with the new column appended; existing grants on the view carry
-- over automatically since no column is removed/renamed.
-- New column must be appended after the existing ones (Postgres forbids
-- reordering/renaming existing view columns via CREATE OR REPLACE).
create or replace view public.leaderboard as
select p.username, g.gp, g.updated_at, g.prestige_count
from public.game_state g
join public.profiles p on p.id = g.user_id
order by g.gp desc;

grant select on public.leaderboard to anon, authenticated;

create function public.prestige () returns integer as $$
declare
  v_uid uuid := auth.uid ();
  v_total_npcs bigint;
  v_unlocked_npcs bigint;
  v_starter jsonb;
  v_new_count integer;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  perform public.check_and_touch_mint_cooldown (v_uid);

  select count(*) into v_total_npcs from public.npc_reference;

  select count(*) into v_unlocked_npcs
  from public.npc_reference nr
  where nr.id in (
    select jsonb_array_elements_text (g.unlocked_npc_ids)
    from public.game_state g
    where g.user_id = v_uid
  );

  if v_unlocked_npcs < v_total_npcs then
    raise exception 'not all monsters are unlocked yet (% of %)', v_unlocked_npcs, v_total_npcs;
  end if;

  -- Computed from npc_reference rather than hardcoded, so the reset target
  -- always matches whatever is actually free right now.
  select coalesce(jsonb_agg(id), '[]'::jsonb) into v_starter
  from public.npc_reference
  where unlock_cost = 0;

  delete from public.user_items where user_id = v_uid;

  update public.game_state
  set
    gp = 0,
    kill_counts = '{}'::jsonb,
    collection_log = '{}'::jsonb,
    unlocked_npc_ids = v_starter,
    inventory_cache = '[]'::jsonb,
    prestige_count = prestige_count + 1
  where user_id = v_uid
  returning prestige_count into v_new_count;

  return v_new_count;
end;
$$ language plpgsql security definer
set
  search_path = public;

-- Same "authenticated gets default EXECUTE" gotcha documented in
-- 0004_security_hardening.sql: grant explicitly, then revoke from
-- anon/public explicitly, rather than assuming the default is "no access".
grant
execute on function public.prestige to authenticated;

revoke execute on function public.prestige
from
  public,
  anon;
