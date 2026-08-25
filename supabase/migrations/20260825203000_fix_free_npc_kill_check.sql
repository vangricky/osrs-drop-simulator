-- Bug: record_kill's "is this npc unlocked" check only accepted npcs
-- literally present in game_state.unlocked_npc_ids. Free-tier npcs
-- (unlock_cost = 0, e.g. brutus/obor) are never written to that array —
-- the client treats unlock_cost = 0 as "always unlocked" without ever
-- calling unlock_npc for them (see useGameState.ts's unlockedNpcIds memo)
-- — and the free tier's membership has changed multiple times since
-- signup for every existing account (20260823234500 backfilled a
-- since-superseded 19-monster free tier that didn't even include
-- brutus/obor). Net effect: every signed-in player's kills against the
-- *current* free bosses were rejected server-side ("npc % is not
-- unlocked") while the client optimistically credited gp locally anyway —
-- so gp appeared to reset to the last successfully-synced value on
-- reload. Fix: also accept an npc whose *current* unlock_cost is 0,
-- matching the client's own definition of "unlocked" exactly.
create or replace function public.record_kill (p_npc_id text, p_gp_gained bigint, p_items jsonb default '[]'::jsonb) returns void as $$
declare
  v_uid uuid := auth.uid ();
  v_max_gp bigint;
  v_unlock_cost bigint;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  perform public.check_and_touch_mint_cooldown (v_uid);

  select unlock_cost, max_gp_per_kill into v_unlock_cost, v_max_gp from public.npc_reference where id = p_npc_id;
  if v_max_gp is null then
    raise exception 'unknown npc: %', p_npc_id;
  end if;

  if v_unlock_cost > 0 and not exists (
    select 1 from public.game_state
    where user_id = v_uid and unlocked_npc_ids @> to_jsonb (p_npc_id)
  ) then
    raise exception 'npc % is not unlocked', p_npc_id;
  end if;

  if p_gp_gained < 0 or p_gp_gained > v_max_gp then
    raise exception 'implausible gp for %: %', p_npc_id, p_gp_gained;
  end if;

  update public.game_state
  set
    gp = gp + p_gp_gained,
    kill_counts = jsonb_set(
      kill_counts, array[p_npc_id],
      to_jsonb (coalesce((kill_counts ->> p_npc_id)::bigint, 0) + 1)
    )
  where user_id = v_uid;

  if jsonb_array_length (p_items) > 0 then
    perform public.apply_items (v_uid, p_items);
  end if;
end;
$$ language plpgsql security definer
set
  search_path = public;

-- Defense in depth / consistency: also backfill every existing account's
-- stored unlocked_npc_ids with the current free tier, so it stays an
-- accurate record of "what this player has unlocked" even though the
-- function above no longer strictly depends on it for free npcs.
update public.game_state g
set unlocked_npc_ids = (
  select coalesce(jsonb_agg(distinct id), '[]'::jsonb)
  from (
    select jsonb_array_elements_text(g.unlocked_npc_ids) as id
    union
    select nr.id from public.npc_reference nr where nr.unlock_cost = 0
  ) combined
);
