-- Backs the new client-side "lock an item" feature: sell_all_items sells
-- every tradeable item in the account's full ledger (not just what's
-- displayed in the 28-slot grid — see the reconciliation fix that
-- surfaced this), so a lock that only lived client-side would be purely
-- cosmetic and this same RPC would happily sell a "locked" item anyway.
-- p_exclude_item_ids lets the client pass the item ids sitting in locked
-- slots so the server genuinely leaves them alone.
drop function if exists public.sell_all_items ();

create function public.sell_all_items (p_exclude_item_ids text[] default '{}') returns bigint as $$
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
  where ui.user_id = v_uid and ir.tradeable and not (ui.item_id = any (p_exclude_item_ids));

  update public.user_items ui
  set quantity = 0
  from public.item_reference ir
  where ui.user_id = v_uid and ir.id = ui.item_id and ir.tradeable and not (ui.item_id = any (p_exclude_item_ids));

  update public.game_state set gp = gp + v_gained where user_id = v_uid;

  return v_gained;
end;
$$ language plpgsql security definer
set
  search_path = public;

revoke execute on function public.sell_all_items (text[])
from
  public,
  anon;

grant
execute on function public.sell_all_items (text[]) to authenticated;
