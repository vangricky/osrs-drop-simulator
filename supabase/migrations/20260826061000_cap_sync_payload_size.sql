-- Hardening: sync_inventory_cache and sync_collection_log_firsts are
-- "trusted, unvalidated" by design (they're display caches, not part of
-- the gp/leaderboard integrity model — see supabase/README.md's "What's
-- NOT validated"), but neither had any size limit on the JSONB payload an
-- authenticated client can submit. A real 28-slot inventory is a few KB;
-- a fully completed collection log (every item in the game, ~700+ ids,
-- each with sourceType/sourceId/sourceName/sourceCount/timestamp) lands
-- well under 512KB. Nothing stopped a malicious authenticated user from
-- repeatedly submitting a far larger payload than either to bloat storage
-- and degrade query performance for everyone. Cap both at 512KB: several
-- times the real worst case, but far below anything an abusive payload
-- would need to be to actually strain storage.

create or replace function public.sync_inventory_cache (p_inventory jsonb) returns void as $$
begin
  if auth.uid () is null then
    raise exception 'not authenticated';
  end if;
  if octet_length(p_inventory::text) > 524288 then
    raise exception 'payload too large';
  end if;
  update public.game_state set inventory_cache = p_inventory where user_id = auth.uid ();
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.sync_collection_log_firsts (p_data jsonb) returns void as $$
begin
  if auth.uid () is null then
    raise exception 'not authenticated';
  end if;
  if octet_length(p_data::text) > 524288 then
    raise exception 'payload too large';
  end if;
  update public.game_state set collection_log_firsts = p_data where user_id = auth.uid ();
end;
$$ language plpgsql security definer set search_path = public;

-- create or replace preserves existing grants, but reassert explicitly
-- as defense in depth, matching the pattern in 0004_security_hardening.sql.
revoke execute on function public.sync_inventory_cache from public, anon;
grant execute on function public.sync_inventory_cache to authenticated;

revoke execute on function public.sync_collection_log_firsts from public, anon;
grant execute on function public.sync_collection_log_firsts to authenticated;
