-- Discarding an item (as opposed to selling it) only ever updated the
-- client's local inventory state + the unvalidated inventory_cache display
-- sync — it never touched the user_items ledger that loadCloudState's
-- reconcileInventoryWithLedger() treats as ground truth for "what must be
-- shown." For a non-tradeable item (pets, looting bag, unopened elite clue
-- scrolls, ...), sell_item/sell_all_items can never remove it from that
-- ledger either (both explicitly require `tradeable`), so discarding one
-- appeared to work locally but the very next load silently re-added it back
-- into an empty slot, forever — reported as "sold/discarded items keep
-- reappearing after leaving and rejoining."
--
-- These mirror sell_item/sell_all_items exactly, minus the tradeable
-- requirement and the GP payout — discarding removes an item from the
-- account entirely, same as in the real game, it just doesn't pay out.

create function public.discard_item (p_item_id text, p_quantity bigint) returns void as $$
declare
  v_uid uuid := auth.uid ();
  v_held bigint;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_quantity <= 0 then
    raise exception 'quantity must be positive';
  end if;

  select quantity into v_held from public.user_items where user_id = v_uid and item_id = p_item_id;
  if coalesce(v_held, 0) < p_quantity then
    raise exception 'not enough % to discard', p_item_id;
  end if;

  update public.user_items set quantity = quantity - p_quantity where user_id = v_uid and item_id = p_item_id;
end;
$$ language plpgsql security definer;

create function public.discard_all_items (p_exclude_item_ids text[] default '{}') returns void as $$
declare
  v_uid uuid := auth.uid ();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  update public.user_items
  set quantity = 0
  where user_id = v_uid and not (item_id = any (p_exclude_item_ids));
end;
$$ language plpgsql security definer;
