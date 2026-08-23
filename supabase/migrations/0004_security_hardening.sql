-- Fixes a real vulnerability found by live penetration testing: Supabase's
-- schema-level default privileges auto-grant EXECUTE on new functions to
-- the `authenticated` role, so `revoke ... from public, anon` (0002) did
-- NOT actually block signed-in users from calling apply_items() directly
-- with an arbitrary user_id and item list — confirmed exploitable, minting
-- 999 Abyssal whips (worth ~800B gp) for a test account in one request.
-- `authenticated` must be revoked explicitly.
revoke execute on function public.apply_items (uuid, jsonb)
from
  public,
  anon,
  authenticated;

-- Re-assert intended grants explicitly (defense in depth against the same
-- default-privilege surprise affecting anything else in this file).
grant
execute on function public.record_kill,
public.open_container,
public.sell_item,
public.sell_all_items,
public.unlock_npc,
public.sync_inventory_cache,
public.create_profile_and_state to authenticated;

revoke execute on function public.record_kill,
public.open_container,
public.sell_item,
public.sell_all_items,
public.unlock_npc,
public.sync_inventory_cache,
public.create_profile_and_state
from
  anon;

-- ---------------------------------------------------------------------
-- Rate limiting: also proven exploitable — 10 record_kill calls looped
-- with no delay all succeeded in ~2s (no cooldown existed). A script could
-- mint gp/items far faster than any real play session. A short per-user
-- cooldown between minting actions closes this off while staying well
-- above realistic human click speed.
-- ---------------------------------------------------------------------

alter table public.game_state
add column last_mint_at timestamptz not null default '1970-01-01';

create function public.check_and_touch_mint_cooldown (p_user_id uuid) returns void as $$
declare
  v_last timestamptz;
begin
  select last_mint_at into v_last from public.game_state where user_id = p_user_id for update;
  if v_last is not null and now() - v_last < interval '200 milliseconds' then
    raise exception 'too many requests';
  end if;
  update public.game_state set last_mint_at = now() where user_id = p_user_id;
end;
$$ language plpgsql security definer
set
  search_path = public;

revoke execute on function public.check_and_touch_mint_cooldown (uuid)
from
  public,
  anon,
  authenticated;

create or replace function public.record_kill (p_npc_id text, p_gp_gained bigint, p_items jsonb default '[]'::jsonb) returns void as $$
declare
  v_uid uuid := auth.uid ();
  v_max_gp bigint;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  perform public.check_and_touch_mint_cooldown (v_uid);

  select max_gp_per_kill into v_max_gp from public.npc_reference where id = p_npc_id;
  if v_max_gp is null then
    raise exception 'unknown npc: %', p_npc_id;
  end if;

  if not exists (
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

create or replace function public.open_container (p_container_item_id text, p_gp_gained bigint, p_items jsonb default '[]'::jsonb) returns void as $$
declare
  v_uid uuid := auth.uid ();
  v_max_gp bigint;
  v_held bigint;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  perform public.check_and_touch_mint_cooldown (v_uid);

  select max_gp_per_open into v_max_gp from public.container_reference where item_id = p_container_item_id;
  if v_max_gp is null then
    raise exception 'unknown container: %', p_container_item_id;
  end if;

  select quantity into v_held from public.user_items where user_id = v_uid and item_id = p_container_item_id;
  if coalesce(v_held, 0) < 1 then
    raise exception 'no % to open', p_container_item_id;
  end if;

  if p_gp_gained < 0 or p_gp_gained > v_max_gp then
    raise exception 'implausible gp for opening %: %', p_container_item_id, p_gp_gained;
  end if;

  update public.user_items
  set quantity = quantity - 1
  where user_id = v_uid and item_id = p_container_item_id;

  update public.game_state set gp = gp + p_gp_gained where user_id = v_uid;

  if jsonb_array_length (p_items) > 0 then
    perform public.apply_items (v_uid, p_items);
  end if;
end;
$$ language plpgsql security definer
set
  search_path = public;
