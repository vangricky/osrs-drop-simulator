-- Validated state-mutation functions. The client still rolls drops locally
-- (random npc/container tables), but every GP or item-count change must
-- pass through one of these — there is no UPDATE policy on game_state or
-- user_items, so this is the only path that can move the numbers.

-- p_items shape: [{"item_id": "dragon-bones", "quantity": 3}, ...]
create function public.apply_items (p_user_id uuid, p_items jsonb) returns void as $$
declare
  v_item record;
begin
  for v_item in select * from jsonb_to_recordset(p_items) as x (item_id text, quantity bigint)
  loop
    if v_item.quantity <= 0 or v_item.quantity > 100000 then
      raise exception 'implausible item quantity for %: %', v_item.item_id, v_item.quantity;
    end if;
    if not exists (select 1 from public.item_reference where id = v_item.item_id) then
      raise exception 'unknown item: %', v_item.item_id;
    end if;

    insert into public.user_items (user_id, item_id, quantity)
    values (p_user_id, v_item.item_id, v_item.quantity)
    on conflict (user_id, item_id)
    do update set quantity = public.user_items.quantity + excluded.quantity;

    update public.game_state
    set collection_log = jsonb_set(
      collection_log,
      array[v_item.item_id],
      to_jsonb (coalesce((collection_log ->> v_item.item_id)::bigint, 0) + v_item.quantity)
    )
    where user_id = p_user_id;
  end loop;
end;
$$ language plpgsql security definer
set
  search_path = public;

create function public.record_kill (p_npc_id text, p_gp_gained bigint, p_items jsonb default '[]'::jsonb) returns void as $$
declare
  v_uid uuid := auth.uid ();
  v_max_gp bigint;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

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

create function public.open_container (p_container_item_id text, p_gp_gained bigint, p_items jsonb default '[]'::jsonb) returns void as $$
declare
  v_uid uuid := auth.uid ();
  v_max_gp bigint;
  v_held bigint;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

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

create function public.sell_item (p_item_id text, p_quantity bigint) returns bigint as $$
declare
  v_uid uuid := auth.uid ();
  v_value bigint;
  v_tradeable boolean;
  v_held bigint;
  v_gained bigint;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_quantity <= 0 then
    raise exception 'quantity must be positive';
  end if;

  select value, tradeable into v_value, v_tradeable from public.item_reference where id = p_item_id;
  if v_value is null then
    raise exception 'unknown item: %', p_item_id;
  end if;
  if not v_tradeable then
    raise exception '% is not tradeable', p_item_id;
  end if;

  select quantity into v_held from public.user_items where user_id = v_uid and item_id = p_item_id;
  if coalesce(v_held, 0) < p_quantity then
    raise exception 'not enough % to sell', p_item_id;
  end if;

  v_gained := v_value * p_quantity;

  update public.user_items set quantity = quantity - p_quantity where user_id = v_uid and item_id = p_item_id;
  update public.game_state set gp = gp + v_gained where user_id = v_uid returning gp into v_gained;

  return v_gained;
end;
$$ language plpgsql security definer
set
  search_path = public;

create function public.sell_all_items () returns bigint as $$
declare
  v_uid uuid := auth.uid ();
  v_gained bigint;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select coalesce(sum(ui.quantity * ir.value), 0) into v_gained
  from public.user_items ui
  join public.item_reference ir on ir.id = ui.item_id
  where ui.user_id = v_uid and ir.tradeable;

  update public.user_items ui
  set quantity = 0
  from public.item_reference ir
  where ui.user_id = v_uid and ir.id = ui.item_id and ir.tradeable;

  update public.game_state set gp = gp + v_gained where user_id = v_uid;

  return v_gained;
end;
$$ language plpgsql security definer
set
  search_path = public;

create function public.unlock_npc (p_npc_id text) returns void as $$
declare
  v_uid uuid := auth.uid ();
  v_cost bigint;
  v_gp bigint;
  v_unlocked jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select unlock_cost into v_cost from public.npc_reference where id = p_npc_id;
  if v_cost is null then
    raise exception 'unknown npc: %', p_npc_id;
  end if;

  select gp, unlocked_npc_ids into v_gp, v_unlocked from public.game_state where user_id = v_uid;

  if v_unlocked @> to_jsonb (p_npc_id) then
    raise exception '% already unlocked', p_npc_id;
  end if;
  if v_gp < v_cost then
    raise exception 'not enough gp to unlock %', p_npc_id;
  end if;

  update public.game_state
  set gp = gp - v_cost, unlocked_npc_ids = unlocked_npc_ids || to_jsonb (p_npc_id)
  where user_id = v_uid;
end;
$$ language plpgsql security definer
set
  search_path = public;

-- Trusted, unvalidated cloud save of the 28-slot grid's visual arrangement.
create function public.sync_inventory_cache (p_inventory jsonb) returns void as $$
begin
  if auth.uid () is null then
    raise exception 'not authenticated';
  end if;
  update public.game_state set inventory_cache = p_inventory where user_id = auth.uid ();
end;
$$ language plpgsql security definer
set
  search_path = public;

revoke execute on function public.apply_items from public,
anon;

grant
execute on function public.record_kill,
public.open_container,
public.sell_item,
public.sell_all_items,
public.unlock_npc,
public.sync_inventory_cache,
public.create_profile_and_state to authenticated;
