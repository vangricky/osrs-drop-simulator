-- Collection Log: records the first time each item is obtained, plus which
-- kill/open number produced it (e.g. "Twisted bow on your 47th Zulrah kill").
-- Purely informational — like inventory_cache, not used for any gp/item
-- validation — so it's a trusted client-write cache rather than a
-- server-computed value (see supabase/README.md's "What's NOT validated").

alter table public.game_state
add column container_open_counts jsonb not null default '{}'::jsonb,
add column collection_log_firsts jsonb not null default '{}'::jsonb;

-- open_container previously had no equivalent to record_kill's kill_counts
-- tracking. Needed so "opened N times" is server-authoritative like kill
-- counts already are, not just a client-side guess the collection log has
-- to trust blindly.
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

  update public.game_state
  set
    gp = gp + p_gp_gained,
    container_open_counts = jsonb_set(
      container_open_counts, array[p_container_item_id],
      to_jsonb (coalesce((container_open_counts ->> p_container_item_id)::bigint, 0) + 1)
    )
  where user_id = v_uid;

  if jsonb_array_length (p_items) > 0 then
    perform public.apply_items (v_uid, p_items);
  end if;
end;
$$ language plpgsql security definer
set
  search_path = public;

-- Trusted, unvalidated cloud save of "what did I get and when" — same trust
-- model as sync_inventory_cache.
create function public.sync_collection_log_firsts (p_data jsonb) returns void as $$
begin
  if auth.uid () is null then
    raise exception 'not authenticated';
  end if;
  update public.game_state set collection_log_firsts = p_data where user_id = auth.uid ();
end;
$$ language plpgsql security definer
set
  search_path = public;

grant
execute on function public.sync_collection_log_firsts to authenticated;

revoke execute on function public.sync_collection_log_firsts
from
  public,
  anon;
