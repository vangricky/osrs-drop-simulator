-- Server-side drop rolls, competitive leaderboards, permanent badges, public
-- profiles, and RuneLite plugin device linking.
--
-- WHY: until now the client rolled every drop and the server took its word for
-- it. record_kill/open_container accepted a client-supplied p_items list that
-- apply_items() only checked for "item id exists, quantity <= 100,000" — so any
-- signed-in player could "kill a chicken" for 100,000 of the most valuable item
-- in the game, sell_item() them, and top the leaderboard. The GP ceiling and
-- 200ms cooldown didn't touch that path at all.
--
-- NOW: the server rolls every kill/open itself from npc_reference.loot /
-- container_reference.loot (exported from the exact same merged data the
-- browser uses, see scripts/export-reference-data.mjs), and clients only ever
-- say WHICH boss to kill. record_kill/open_container/sync_collection_log_firsts
-- are revoked — nothing a client sends can create items or GP any more.
--
-- Every game action now has ONE internal implementation taking a user id
-- (public._kill, public._sell_item, ...). The website calls thin wrappers that
-- pass auth.uid(); the RuneLite plugin calls device_* wrappers that resolve a
-- revocable device token (from a website-issued link code) to the same user id.
-- Internal functions are revoked from every client role.

-- ---------------------------------------------------------------------------
-- Reference data: loot tables and display names
-- ---------------------------------------------------------------------------

alter table public.npc_reference add column if not exists name text;
alter table public.npc_reference add column if not exists loot jsonb;
alter table public.container_reference add column if not exists name text;
alter table public.container_reference add column if not exists loot jsonb;
alter table public.item_reference add column if not exists name text;
alter table public.item_reference add column if not exists is_pet boolean not null default false;

-- ---------------------------------------------------------------------------
-- Competitive stats on game_state
-- ---------------------------------------------------------------------------

create or replace function public._current_week () returns date as $$
  select date_trunc('week', now() at time zone 'utc')::date;
$$ language sql stable set search_path = public;

alter table public.game_state
  add column if not exists lifetime_value bigint not null default 0 check (lifetime_value >= 0),
  add column if not exists week_value bigint not null default 0 check (week_value >= 0),
  add column if not exists week_start date not null default public._current_week (),
  add column if not exists clog_slots integer not null default 0 check (clog_slots >= 0),
  add column if not exists total_kills bigint not null default 0 check (total_kills >= 0),
  -- Token bucket for kills: refills 2/s (the site's own 500ms Auto Kill pace),
  -- holds up to 20. A script gets no advantage over the honest Auto Kill.
  add column if not exists kill_tokens double precision not null default 20,
  add column if not exists tokens_at timestamptz not null default now();

-- Backfill existing players so nobody loses rank on day one.
update public.game_state
set
  lifetime_value = greatest(lifetime_value, gp),
  total_kills = (
    select coalesce(sum((v)::bigint), 0) from jsonb_each_text(kill_counts) as t(k, v)
  ),
  clog_slots = (select count(*) from jsonb_object_keys(collection_log_firsts));

-- ---------------------------------------------------------------------------
-- Badges (permanent: survive prestige, never revoked) and weekly seasons
-- ---------------------------------------------------------------------------

create table if not exists public.user_badges (
  user_id uuid not null references auth.users (id) on delete cascade,
  badge_id text not null,
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);
alter table public.user_badges enable row level security;
drop policy if exists "Badges are publicly readable" on public.user_badges;
create policy "Badges are publicly readable" on public.user_badges for select using (true);

create table if not exists public.seasons (
  week_start date primary key,
  champion_id uuid references auth.users (id) on delete set null,
  champion_value bigint not null,
  closed_at timestamptz not null default now()
);
alter table public.seasons enable row level security;
drop policy if exists "Seasons are publicly readable" on public.seasons;
create policy "Seasons are publicly readable" on public.seasons for select using (true);

create or replace function public._award_badge (p_uid uuid, p_badge text) returns void as $$
begin
  insert into public.user_badges (user_id, badge_id) values (p_uid, p_badge)
  on conflict do nothing;
end;
$$ language plpgsql security definer set search_path = public;

-- Closes every finished week that hasn't been closed yet and crowns its
-- champion. Called before ANY player's weekly counter is reset, so a past
-- week's standings are always still intact when it's closed.
create or replace function public._close_finished_seasons () returns void as $$
declare
  v_row record;
begin
  for v_row in
    insert into public.seasons (week_start, champion_id, champion_value)
    select distinct on (g.week_start) g.week_start, g.user_id, g.week_value
    from public.game_state g
    where g.week_start < public._current_week ()
      and g.week_value > 0
      and not exists (select 1 from public.seasons s where s.week_start = g.week_start)
    order by g.week_start, g.week_value desc, g.updated_at asc
    on conflict (week_start) do nothing
    returning champion_id
  loop
    if v_row.champion_id is not null then
      perform public._award_badge (v_row.champion_id, 'weekly-champion');
    end if;
  end loop;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- The drop roller: a faithful port of rollDrop() in src/utils/dropLogic.ts
-- ---------------------------------------------------------------------------

create or replace function public._rand_qty (p_min bigint, p_max bigint) returns bigint as $$
  select case when p_max <= p_min then p_min else p_min + floor(random() * (p_max - p_min + 1))::bigint end;
$$ language sql volatile set search_path = public;

create or replace function public._drop (p_entry jsonb, p_source text) returns jsonb as $$
  select jsonb_build_object(
    'item_id', p_entry ->> 'itemId',
    'quantity', public._rand_qty ((p_entry ->> 'minQuantity')::bigint, (p_entry ->> 'maxQuantity')::bigint),
    'source', p_source,
    'noted', coalesce((p_entry ->> 'noted')::boolean, false)
  );
$$ language sql volatile set search_path = public;

-- Returns a jsonb array of {item_id, quantity, source, noted}.
-- p_owned (the player's collection log, item_id -> count) only decides which
-- member of a "leastOwned" tertiary group is handed out, exactly like the client.
create or replace function public._roll_loot (p_table jsonb, p_owned jsonb) returns jsonb as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_entry jsonb;
  v_group jsonb;
  v_items jsonb;
  v_total double precision;
  v_r double precision;
  v_pick jsonb;
  v_min bigint;
  v_candidates jsonb;
  v_rolls integer := greatest(coalesce((p_table ->> 'mainRolls')::integer, 1), 0);
begin
  -- always: guaranteed every roll
  for v_entry in select value from jsonb_array_elements(coalesce(p_table -> 'always', '[]'::jsonb)) loop
    v_out := v_out || jsonb_build_array(public._drop (v_entry, 'always'));
  end loop;

  -- mainTable: exactly ONE weighted pick per roll, weights normalised against their own sum
  select sum((e ->> 'numerator')::double precision / (e ->> 'denominator')::double precision)
  into v_total
  from jsonb_array_elements(coalesce(p_table -> 'mainTable', '[]'::jsonb)) e;

  if coalesce(v_total, 0) > 0 then
    for i in 1..v_rolls loop
      v_r := random() * v_total;
      v_pick := null;
      for v_entry in select value from jsonb_array_elements(p_table -> 'mainTable') loop
        v_r := v_r - (v_entry ->> 'numerator')::double precision / (v_entry ->> 'denominator')::double precision;
        v_pick := v_entry;
        exit when v_r <= 0;
      end loop;
      if v_pick is not null then
        v_out := v_out || jsonb_build_array(public._drop (v_pick, 'main'));
      end if;
    end loop;
  end if;

  -- tertiary: independent rolls that can stack
  for v_entry in select value from jsonb_array_elements(coalesce(p_table -> 'tertiary', '[]'::jsonb)) loop
    if random() < (v_entry ->> 'numerator')::double precision / (v_entry ->> 'denominator')::double precision then
      v_out := v_out || jsonb_build_array(public._drop (v_entry, 'tertiary'));
    end if;
  end loop;

  -- tertiaryGroups: one shared chance per group, then one member (or all, on the complete bonus)
  for v_group in select value from jsonb_array_elements(coalesce(p_table -> 'tertiaryGroups', '[]'::jsonb)) loop
    continue when not (random() < (v_group ->> 'numerator')::double precision / (v_group ->> 'denominator')::double precision);
    v_items := v_group -> 'items';
    continue when v_items is null or jsonb_array_length(v_items) = 0;

    if v_group ? 'completeNumerator' and v_group ? 'completeDenominator'
       and random() < (v_group ->> 'completeNumerator')::double precision / (v_group ->> 'completeDenominator')::double precision then
      for v_entry in select value from jsonb_array_elements(v_items) loop
        v_out := v_out || jsonb_build_array(public._drop (v_entry, 'tertiary'));
      end loop;
    elsif coalesce(v_group ->> 'selection', 'leastOwned') = 'uniform' or p_owned is null then
      v_out := v_out || jsonb_build_array(public._drop (v_items -> floor(random() * jsonb_array_length(v_items))::integer, 'tertiary'));
    else
      select min(coalesce((p_owned ->> (e ->> 'itemId'))::bigint, 0)) into v_min
      from jsonb_array_elements(v_items) e;
      select jsonb_agg(e) into v_candidates
      from jsonb_array_elements(v_items) e
      where coalesce((p_owned ->> (e ->> 'itemId'))::bigint, 0) = v_min;
      v_out := v_out || jsonb_build_array(public._drop (v_candidates -> floor(random() * jsonb_array_length(v_candidates))::integer, 'tertiary'));
    end if;
  end loop;

  return v_out;
end;
$$ language plpgsql volatile set search_path = public;

-- ---------------------------------------------------------------------------
-- Applying rolled drops to a player (coins -> gp, items -> user_items + log)
-- ---------------------------------------------------------------------------

-- Credits one roll's drops to p_uid. The caller must already hold the
-- game_state row lock. Returns the GE value of what was gained.
create or replace function public._credit_drops (
  p_uid uuid,
  p_drops jsonb,
  p_source_type text,
  p_source_id text,
  p_source_name text,
  p_source_count bigint
) returns bigint as $$
declare
  v_drop jsonb;
  v_item_id text;
  v_qty bigint;
  v_value bigint;
  v_is_pet boolean;
  v_coins bigint := 0;
  v_total_value bigint := 0;
  v_log jsonb;
  v_firsts jsonb;
  v_new_slots integer := 0;
begin
  select collection_log, collection_log_firsts into v_log, v_firsts
  from public.game_state where user_id = p_uid;

  for v_drop in select value from jsonb_array_elements(p_drops) loop
    v_item_id := v_drop ->> 'item_id';
    v_qty := (v_drop ->> 'quantity')::bigint;
    continue when v_qty is null or v_qty <= 0;

    if v_item_id = 'coins' then
      v_coins := v_coins + v_qty;
      continue;
    end if;

    select value, is_pet into v_value, v_is_pet from public.item_reference where id = v_item_id;
    continue when v_value is null; -- an item the catalog doesn't know can't be held

    insert into public.user_items (user_id, item_id, quantity) values (p_uid, v_item_id, v_qty)
    on conflict (user_id, item_id) do update set quantity = public.user_items.quantity + excluded.quantity;

    v_log := jsonb_set(v_log, array[v_item_id], to_jsonb(coalesce((v_log ->> v_item_id)::bigint, 0) + v_qty));
    v_total_value := v_total_value + v_value * v_qty;

    if not (v_firsts ? v_item_id) then
      v_firsts := v_firsts || jsonb_build_object(v_item_id, jsonb_build_object(
        'itemId', v_item_id,
        'sourceType', p_source_type,
        'sourceId', p_source_id,
        'sourceName', p_source_name,
        'sourceCount', p_source_count,
        'timestamp', floor(extract(epoch from now()) * 1000)::bigint
      ));
      v_new_slots := v_new_slots + 1;
    end if;

    if v_is_pet then
      perform public._award_badge (p_uid, 'pet-hunter');
    end if;
  end loop;

  v_total_value := v_total_value + v_coins;

  update public.game_state
  set
    gp = gp + v_coins,
    collection_log = v_log,
    collection_log_firsts = v_firsts,
    clog_slots = clog_slots + v_new_slots,
    lifetime_value = lifetime_value + v_total_value,
    week_value = week_value + v_total_value
  where user_id = p_uid;

  return v_total_value;
end;
$$ language plpgsql security definer set search_path = public;

-- Resets the player's weekly counter if a new week has started (closing the
-- finished season first), then awards collection-log milestone badges.
create or replace function public._roll_week (p_uid uuid) returns void as $$
begin
  if exists (select 1 from public.game_state where user_id = p_uid and week_start < public._current_week ()) then
    perform public._close_finished_seasons ();
    update public.game_state set week_start = public._current_week (), week_value = 0 where user_id = p_uid;
  end if;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public._check_clog_badges (p_uid uuid) returns void as $$
declare
  v_slots integer;
begin
  select clog_slots into v_slots from public.game_state where user_id = p_uid;
  if v_slots >= 100 then perform public._award_badge (p_uid, 'clog-100'); end if;
  if v_slots >= 250 then perform public._award_badge (p_uid, 'clog-250'); end if;
  if v_slots >= 500 then perform public._award_badge (p_uid, 'clog-500'); end if;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- Core game actions (internal; every client path goes through these)
-- ---------------------------------------------------------------------------

-- Kills a boss p_count times (1..10). Returns
-- { kills: [ [drop, ...], ... ], gp, kill_count, value_gained }.
create or replace function public._kill (p_uid uuid, p_npc_id text, p_count integer default 1) returns jsonb as $$
declare
  v_npc record;
  v_state record;
  v_tokens double precision;
  v_kills jsonb := '[]'::jsonb;
  v_drops jsonb;
  v_kc bigint;
  v_value bigint := 0;
  v_gp bigint;
begin
  if p_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_count is null or p_count < 1 or p_count > 10 then
    raise exception 'count must be between 1 and 10';
  end if;

  select id, name, unlock_cost, loot into v_npc from public.npc_reference where id = p_npc_id;
  if v_npc.id is null or v_npc.loot is null then
    raise exception 'unknown npc: %', p_npc_id;
  end if;

  select * into v_state from public.game_state where user_id = p_uid for update;
  if v_state.user_id is null then
    raise exception 'no game state';
  end if;

  if v_npc.unlock_cost > 0 and not (v_state.unlocked_npc_ids @> to_jsonb (p_npc_id)) then
    raise exception 'npc % is not unlocked', p_npc_id;
  end if;

  v_tokens := least(20, v_state.kill_tokens + extract(epoch from (now() - v_state.tokens_at)) * 2);
  if v_tokens < p_count then
    raise exception 'too many requests';
  end if;
  update public.game_state set kill_tokens = v_tokens - p_count, tokens_at = now() where user_id = p_uid;

  perform public._roll_week (p_uid);

  v_kc := coalesce((v_state.kill_counts ->> p_npc_id)::bigint, 0);
  for i in 1..p_count loop
    v_kc := v_kc + 1;
    v_drops := public._roll_loot (v_npc.loot, (select collection_log from public.game_state where user_id = p_uid));
    v_value := v_value + public._credit_drops (p_uid, v_drops, 'kill', p_npc_id, coalesce(v_npc.name, p_npc_id), v_kc);
    v_kills := v_kills || jsonb_build_array(v_drops);
  end loop;

  update public.game_state
  set
    kill_counts = jsonb_set(kill_counts, array[p_npc_id], to_jsonb(v_kc)),
    total_kills = total_kills + p_count
  where user_id = p_uid
  returning gp into v_gp;

  perform public._check_clog_badges (p_uid);

  return jsonb_build_object('kills', v_kills, 'gp', v_gp, 'kill_count', v_kc, 'value_gained', v_value);
end;
$$ language plpgsql security definer set search_path = public;

-- Opens one container (clue casket, key, unsired...) the player holds.
-- Returns { drops: [...], gp, open_count, value_gained }.
create or replace function public._open (p_uid uuid, p_container_item_id text) returns jsonb as $$
declare
  v_container record;
  v_held bigint;
  v_drops jsonb;
  v_count bigint;
  v_value bigint;
  v_gp bigint;
begin
  if p_uid is null then
    raise exception 'not authenticated';
  end if;

  perform public.check_and_touch_mint_cooldown (p_uid); -- also takes the game_state row lock

  select item_id, name, loot into v_container from public.container_reference where item_id = p_container_item_id;
  if v_container.item_id is null or v_container.loot is null then
    raise exception 'unknown container: %', p_container_item_id;
  end if;

  select quantity into v_held from public.user_items where user_id = p_uid and item_id = p_container_item_id;
  if coalesce(v_held, 0) < 1 then
    raise exception 'no % to open', p_container_item_id;
  end if;
  update public.user_items set quantity = quantity - 1 where user_id = p_uid and item_id = p_container_item_id;

  perform public._roll_week (p_uid);

  select coalesce((container_open_counts ->> p_container_item_id)::bigint, 0) + 1 into v_count
  from public.game_state where user_id = p_uid;

  v_drops := public._roll_loot (v_container.loot, (select collection_log from public.game_state where user_id = p_uid));
  v_value := public._credit_drops (p_uid, v_drops, 'container', p_container_item_id, coalesce(v_container.name, p_container_item_id), v_count);

  update public.game_state
  set container_open_counts = jsonb_set(container_open_counts, array[p_container_item_id], to_jsonb(v_count))
  where user_id = p_uid
  returning gp into v_gp;

  perform public._check_clog_badges (p_uid);

  return jsonb_build_object('drops', v_drops, 'gp', v_gp, 'open_count', v_count, 'value_gained', v_value);
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public._sell_item (p_uid uuid, p_item_id text, p_quantity bigint) returns bigint as $$
declare
  v_value bigint;
  v_tradeable boolean;
  v_held bigint;
  v_gp bigint;
begin
  if p_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'quantity must be positive';
  end if;

  select value, tradeable into v_value, v_tradeable from public.item_reference where id = p_item_id;
  if v_value is null then
    raise exception 'unknown item: %', p_item_id;
  end if;
  if not v_tradeable then
    raise exception '% is not tradeable', p_item_id;
  end if;

  select quantity into v_held from public.user_items where user_id = p_uid and item_id = p_item_id for update;
  if coalesce(v_held, 0) < p_quantity then
    raise exception 'not enough % to sell', p_item_id;
  end if;

  update public.user_items set quantity = quantity - p_quantity where user_id = p_uid and item_id = p_item_id;
  update public.game_state set gp = gp + v_value * p_quantity where user_id = p_uid returning gp into v_gp;
  return v_gp;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public._sell_all_items (p_uid uuid, p_exclude_item_ids text[]) returns bigint as $$
declare
  v_gained bigint;
begin
  if p_uid is null then
    raise exception 'not authenticated';
  end if;

  perform 1 from public.game_state where user_id = p_uid for update;

  select coalesce(sum(ui.quantity * ir.value), 0) into v_gained
  from public.user_items ui
  join public.item_reference ir on ir.id = ui.item_id
  where ui.user_id = p_uid and ir.tradeable and not (ui.item_id = any (coalesce(p_exclude_item_ids, '{}')));

  update public.user_items ui
  set quantity = 0
  from public.item_reference ir
  where ui.user_id = p_uid and ir.id = ui.item_id and ir.tradeable
    and not (ui.item_id = any (coalesce(p_exclude_item_ids, '{}')));

  update public.game_state set gp = gp + v_gained where user_id = p_uid;
  return v_gained;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public._unlock_npc (p_uid uuid, p_npc_id text) returns bigint as $$
declare
  v_cost bigint;
  v_gp bigint;
  v_unlocked jsonb;
begin
  if p_uid is null then
    raise exception 'not authenticated';
  end if;

  select unlock_cost into v_cost from public.npc_reference where id = p_npc_id;
  if v_cost is null then
    raise exception 'unknown npc: %', p_npc_id;
  end if;

  select gp, unlocked_npc_ids into v_gp, v_unlocked from public.game_state where user_id = p_uid for update;
  if v_unlocked @> to_jsonb (p_npc_id) then
    raise exception '% already unlocked', p_npc_id;
  end if;
  if v_gp < v_cost then
    raise exception 'not enough gp to unlock %', p_npc_id;
  end if;

  update public.game_state
  set gp = gp - v_cost, unlocked_npc_ids = unlocked_npc_ids || to_jsonb (p_npc_id)
  where user_id = p_uid
  returning gp into v_gp;
  return v_gp;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public._prestige (p_uid uuid) returns integer as $$
declare
  v_total_npcs bigint;
  v_unlocked_npcs bigint;
  v_starter jsonb;
  v_new_count integer;
begin
  if p_uid is null then
    raise exception 'not authenticated';
  end if;

  perform public.check_and_touch_mint_cooldown (p_uid);

  select count(*) into v_total_npcs from public.npc_reference;
  select count(*) into v_unlocked_npcs
  from public.npc_reference nr
  where nr.id in (
    select jsonb_array_elements_text (g.unlocked_npc_ids) from public.game_state g where g.user_id = p_uid
  );
  if v_unlocked_npcs < v_total_npcs then
    raise exception 'not all monsters are unlocked yet (% of %)', v_unlocked_npcs, v_total_npcs;
  end if;

  select coalesce(jsonb_agg(id), '[]'::jsonb) into v_starter from public.npc_reference where unlock_cost = 0;

  delete from public.user_items where user_id = p_uid;

  -- lifetime_value, total_kills, clog_slots and collection_log_firsts are
  -- career stats and deliberately survive a prestige.
  update public.game_state
  set
    gp = 0,
    kill_counts = '{}'::jsonb,
    collection_log = '{}'::jsonb,
    unlocked_npc_ids = v_starter,
    inventory_cache = '[]'::jsonb,
    prestige_count = prestige_count + 1
  where user_id = p_uid
  returning prestige_count into v_new_count;

  if v_new_count >= 1 then perform public._award_badge (p_uid, 'prestige-1'); end if;
  if v_new_count >= 2 then perform public._award_badge (p_uid, 'prestige-2'); end if;
  if v_new_count >= 3 then perform public._award_badge (p_uid, 'prestige-3'); end if;
  if v_new_count >= 5 then perform public._award_badge (p_uid, 'prestige-5'); end if;
  if v_new_count >= 10 then perform public._award_badge (p_uid, 'prestige-10'); end if;

  return v_new_count;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public._discard_item (p_uid uuid, p_item_id text, p_quantity bigint) returns void as $$
declare
  v_held bigint;
begin
  if p_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'quantity must be positive';
  end if;
  select quantity into v_held from public.user_items where user_id = p_uid and item_id = p_item_id for update;
  if coalesce(v_held, 0) < p_quantity then
    raise exception 'not enough % to discard', p_item_id;
  end if;
  update public.user_items set quantity = quantity - p_quantity where user_id = p_uid and item_id = p_item_id;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public._discard_all_items (p_uid uuid, p_exclude_item_ids text[]) returns void as $$
begin
  if p_uid is null then
    raise exception 'not authenticated';
  end if;
  update public.user_items set quantity = 0
  where user_id = p_uid and not (item_id = any (coalesce(p_exclude_item_ids, '{}')));
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public._sync_inventory_cache (p_uid uuid, p_inventory jsonb) returns void as $$
begin
  if p_uid is null then
    raise exception 'not authenticated';
  end if;
  if octet_length(p_inventory::text) > 524288 then
    raise exception 'payload too large';
  end if;
  update public.game_state set inventory_cache = p_inventory where user_id = p_uid;
end;
$$ language plpgsql security definer set search_path = public;

-- Everything a client needs to render the game for p_uid.
create or replace function public._get_state (p_uid uuid) returns jsonb as $$
  select jsonb_build_object(
    'username', p.username,
    'gp', g.gp,
    'prestige_count', g.prestige_count,
    'unlocked_npc_ids', g.unlocked_npc_ids,
    'kill_counts', g.kill_counts,
    'container_open_counts', g.container_open_counts,
    'collection_log', g.collection_log,
    'collection_log_firsts', g.collection_log_firsts,
    'inventory_cache', g.inventory_cache,
    'lifetime_value', g.lifetime_value,
    'week_value', case when g.week_start = public._current_week () then g.week_value else 0 end,
    'clog_slots', g.clog_slots,
    'total_kills', g.total_kills,
    'items', coalesce((
      select jsonb_object_agg(ui.item_id, ui.quantity) from public.user_items ui
      where ui.user_id = g.user_id and ui.quantity > 0
    ), '{}'::jsonb),
    'badges', coalesce((
      select jsonb_agg(b.badge_id order by b.earned_at) from public.user_badges b where b.user_id = g.user_id
    ), '[]'::jsonb)
  )
  from public.game_state g
  join public.profiles p on p.id = g.user_id
  where g.user_id = p_uid;
$$ language sql stable security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- Website RPCs (signed in via Supabase Auth)
-- ---------------------------------------------------------------------------

create or replace function public.kill (p_npc_id text, p_count integer default 1) returns jsonb as $$
  select public._kill (auth.uid (), p_npc_id, p_count);
$$ language sql security definer set search_path = public;

create or replace function public.open_container_v2 (p_container_item_id text) returns jsonb as $$
  select public._open (auth.uid (), p_container_item_id);
$$ language sql security definer set search_path = public;

create or replace function public.sell_item (p_item_id text, p_quantity bigint) returns bigint as $$
  select public._sell_item (auth.uid (), p_item_id, p_quantity);
$$ language sql security definer set search_path = public;

create or replace function public.sell_all_items (p_exclude_item_ids text[] default '{}') returns bigint as $$
  select public._sell_all_items (auth.uid (), p_exclude_item_ids);
$$ language sql security definer set search_path = public;

-- unlock_npc / prestige keep their original return types (void / integer).
create or replace function public.unlock_npc (p_npc_id text) returns void as $$
begin
  perform public._unlock_npc (auth.uid (), p_npc_id);
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.prestige () returns integer as $$
  select public._prestige (auth.uid ());
$$ language sql security definer set search_path = public;

create or replace function public.discard_item (p_item_id text, p_quantity bigint) returns void as $$
begin
  perform public._discard_item (auth.uid (), p_item_id, p_quantity);
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.discard_all_items (p_exclude_item_ids text[] default '{}') returns void as $$
begin
  perform public._discard_all_items (auth.uid (), p_exclude_item_ids);
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.sync_inventory_cache (p_inventory jsonb) returns void as $$
begin
  perform public._sync_inventory_cache (auth.uid (), p_inventory);
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.get_my_state () returns jsonb as $$
  select public._get_state (auth.uid ());
$$ language sql stable security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- RuneLite plugin linking: one-time link codes -> revocable device tokens
-- ---------------------------------------------------------------------------

create table if not exists public.link_codes (
  code text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  expires_at timestamptz not null
);
alter table public.link_codes enable row level security; -- no policies: functions only

create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash bytea not null unique, -- sha256 of the token; the token itself is never stored
  name text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);
alter table public.device_tokens enable row level security; -- no policies: functions only
create index if not exists device_tokens_user_idx on public.device_tokens (user_id);

-- Website: returns a fresh 8-character code, valid for 10 minutes.
create or replace function public.create_link_code () returns jsonb as $$
declare
  v_uid uuid := auth.uid ();
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no 0/O/1/I
  v_code text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if (select count(*) from public.device_tokens where user_id = v_uid) >= 10 then
    raise exception 'too many linked devices: unlink one first';
  end if;

  delete from public.link_codes where user_id = v_uid or expires_at < now();

  loop
    v_code := '';
    for i in 1..8 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::integer, 1);
    end loop;
    exit when not exists (select 1 from public.link_codes where code = v_code);
  end loop;

  insert into public.link_codes (code, user_id, expires_at) values (v_code, v_uid, now() + interval '10 minutes');
  return jsonb_build_object('code', v_code, 'expires_at', now() + interval '10 minutes');
end;
$$ language plpgsql volatile security definer set search_path = public;

-- Plugin: trades a link code (once) for a device token.
create or replace function public.redeem_link_code (p_code text, p_device_name text default 'RuneLite') returns jsonb as $$
declare
  v_uid uuid;
  v_token text;
  v_username text;
begin
  delete from public.link_codes
  where code = upper(replace(trim(coalesce(p_code, '')), '-', '')) and expires_at > now()
  returning user_id into v_uid;

  if v_uid is null then
    raise exception 'invalid or expired link code';
  end if;

  -- 2 x uuid v4 = 244 random bits
  v_token := replace(gen_random_uuid ()::text, '-', '') || replace(gen_random_uuid ()::text, '-', '');
  insert into public.device_tokens (user_id, token_hash, name)
  values (v_uid, sha256(convert_to(v_token, 'UTF8')), left(coalesce(nullif(trim(p_device_name), ''), 'RuneLite'), 40));

  perform public._award_badge (v_uid, 'plugin-pioneer');
  select username into v_username from public.profiles where id = v_uid;
  return jsonb_build_object('token', v_token, 'username', v_username);
end;
$$ language plpgsql volatile security definer set search_path = public;

create or replace function public._device_uid (p_token text) returns uuid as $$
declare
  v_id uuid;
  v_uid uuid;
  v_last timestamptz;
begin
  select id, user_id, last_used_at into v_id, v_uid, v_last
  from public.device_tokens where token_hash = sha256(convert_to(coalesce(p_token, ''), 'UTF8'));
  if v_uid is null then
    raise exception 'invalid device token';
  end if;
  if v_last < now() - interval '5 minutes' then
    update public.device_tokens set last_used_at = now() where id = v_id;
  end if;
  return v_uid;
end;
$$ language plpgsql volatile security definer set search_path = public;

create or replace function public.list_devices () returns jsonb as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'created_at', created_at, 'last_used_at', last_used_at) order by created_at), '[]'::jsonb)
  from public.device_tokens where user_id = auth.uid ();
$$ language sql stable security definer set search_path = public;

create or replace function public.revoke_device (p_id uuid) returns void as $$
begin
  if auth.uid () is null then
    raise exception 'not authenticated';
  end if;
  delete from public.device_tokens where id = p_id and user_id = auth.uid ();
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- Plugin RPCs (device token instead of a Supabase session)
-- ---------------------------------------------------------------------------

create or replace function public.device_unlink (p_token text) returns void as $$
begin
  delete from public.device_tokens where token_hash = sha256(convert_to(coalesce(p_token, ''), 'UTF8'));
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.device_get_state (p_token text) returns jsonb as $$
  select public._get_state (public._device_uid (p_token));
$$ language sql volatile security definer set search_path = public;

create or replace function public.device_kill (p_token text, p_npc_id text, p_count integer default 1) returns jsonb as $$
  select public._kill (public._device_uid (p_token), p_npc_id, p_count);
$$ language sql security definer set search_path = public;

create or replace function public.device_open (p_token text, p_container_item_id text) returns jsonb as $$
  select public._open (public._device_uid (p_token), p_container_item_id);
$$ language sql security definer set search_path = public;

create or replace function public.device_sell_item (p_token text, p_item_id text, p_quantity bigint) returns bigint as $$
  select public._sell_item (public._device_uid (p_token), p_item_id, p_quantity);
$$ language sql security definer set search_path = public;

create or replace function public.device_sell_all_items (p_token text, p_exclude_item_ids text[] default '{}') returns bigint as $$
  select public._sell_all_items (public._device_uid (p_token), p_exclude_item_ids);
$$ language sql security definer set search_path = public;

create or replace function public.device_unlock_npc (p_token text, p_npc_id text) returns bigint as $$
  select public._unlock_npc (public._device_uid (p_token), p_npc_id);
$$ language sql security definer set search_path = public;

create or replace function public.device_prestige (p_token text) returns integer as $$
  select public._prestige (public._device_uid (p_token));
$$ language sql security definer set search_path = public;

create or replace function public.device_discard_item (p_token text, p_item_id text, p_quantity bigint) returns void as $$
begin
  perform public._discard_item (public._device_uid (p_token), p_item_id, p_quantity);
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.device_discard_all_items (p_token text, p_exclude_item_ids text[] default '{}') returns void as $$
begin
  perform public._discard_all_items (public._device_uid (p_token), p_exclude_item_ids);
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.device_sync_inventory_cache (p_token text, p_inventory jsonb) returns void as $$
begin
  perform public._sync_inventory_cache (public._device_uid (p_token), p_inventory);
end;
$$ language plpgsql security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- Public leaderboards and profiles (anyone can read)
-- ---------------------------------------------------------------------------

create or replace function public._badges_of (p_uid uuid) returns jsonb as $$
  select coalesce(jsonb_agg(badge_id order by earned_at), '[]'::jsonb) from public.user_badges where user_id = p_uid;
$$ language sql stable security definer set search_path = public;

create or replace view public.leaderboard_overall as
select
  rank() over (order by g.prestige_count desc, g.lifetime_value desc) as rank,
  p.username, g.prestige_count, g.lifetime_value, g.total_kills, g.clog_slots,
  public._badges_of (g.user_id) as badges
from public.game_state g join public.profiles p on p.id = g.user_id
where g.total_kills > 0 or g.lifetime_value > 0;

create or replace view public.leaderboard_weekly as
select
  rank() over (order by g.week_value desc) as rank,
  p.username, g.week_value, g.prestige_count,
  public._badges_of (g.user_id) as badges
from public.game_state g join public.profiles p on p.id = g.user_id
where g.week_start = public._current_week () and g.week_value > 0;

create or replace view public.leaderboard_clog as
select
  rank() over (order by g.clog_slots desc) as rank,
  p.username, g.clog_slots, g.prestige_count,
  public._badges_of (g.user_id) as badges
from public.game_state g join public.profiles p on p.id = g.user_id
where g.clog_slots > 0;

grant select on public.leaderboard_overall, public.leaderboard_weekly, public.leaderboard_clog to anon, authenticated;

create or replace function public.get_boss_leaderboard (p_npc_id text, p_limit integer default 100) returns jsonb as $$
  select coalesce(jsonb_agg(row_to_json(t) order by t.rank), '[]'::jsonb) from (
    select
      rank() over (order by (g.kill_counts ->> p_npc_id)::bigint desc) as rank,
      p.username, (g.kill_counts ->> p_npc_id)::bigint as kills, g.prestige_count,
      public._badges_of (g.user_id) as badges
    from public.game_state g join public.profiles p on p.id = g.user_id
    where (g.kill_counts ->> p_npc_id)::bigint > 0
    order by 1
    limit least(greatest(coalesce(p_limit, 100), 1), 100)
  ) t;
$$ language sql stable security definer set search_path = public;

create or replace function public.get_season_info () returns jsonb as $$
  select jsonb_build_object(
    'week_start', public._current_week (),
    'ends_at', (public._current_week () + 7)::timestamp at time zone 'utc',
    'past_champions', coalesce((
      select jsonb_agg(jsonb_build_object('week_start', s.week_start, 'username', p.username, 'value', s.champion_value) order by s.week_start desc)
      from (select * from public.seasons order by week_start desc limit 10) s
      left join public.profiles p on p.id = s.champion_id
    ), '[]'::jsonb)
  );
$$ language sql stable security definer set search_path = public;

-- A player's public progress: what everyone can see about everyone.
create or replace function public.get_profile (p_username text) returns jsonb as $$
declare
  v_uid uuid;
  v_out jsonb;
begin
  select id into v_uid from public.profiles where lower(username) = lower(p_username);
  if v_uid is null then
    return null;
  end if;

  select jsonb_build_object(
    'username', p.username,
    'joined', p.created_at,
    'prestige_count', g.prestige_count,
    'lifetime_value', g.lifetime_value,
    'week_value', case when g.week_start = public._current_week () then g.week_value else 0 end,
    'total_kills', g.total_kills,
    'clog_slots', g.clog_slots,
    'gp', g.gp,
    'unlocked_count', jsonb_array_length(g.unlocked_npc_ids),
    'kill_counts', g.kill_counts,
    'badges', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.badge_id, 'earned_at', b.earned_at) order by b.earned_at)
      from public.user_badges b where b.user_id = g.user_id
    ), '[]'::jsonb),
    'weekly_titles', (select count(*) from public.seasons s where s.champion_id = g.user_id),
    'rank_overall', (select r.rank from public.leaderboard_overall r where r.username = p.username),
    'rank_weekly', (select r.rank from public.leaderboard_weekly r where r.username = p.username),
    'rank_clog', (select r.rank from public.leaderboard_clog r where r.username = p.username),
    'best_drops', coalesce((
      select jsonb_agg(d order by (d ->> 'value')::bigint desc) from (
        select jsonb_build_object(
          'item_id', f.key,
          'name', coalesce(ir.name, f.key),
          'value', coalesce(ir.value, 0),
          'is_pet', coalesce(ir.is_pet, false),
          'source_name', f.value ->> 'sourceName',
          'source_count', (f.value ->> 'sourceCount')::bigint,
          'timestamp', (f.value ->> 'timestamp')::bigint
        ) as d
        from jsonb_each(g.collection_log_firsts) f
        left join public.item_reference ir on ir.id = f.key
        order by coalesce(ir.is_pet, false) desc, coalesce(ir.value, 0) desc
        limit 10
      ) best
    ), '[]'::jsonb)
  ) into v_out
  from public.game_state g join public.profiles p on p.id = g.user_id
  where g.user_id = v_uid;

  return v_out;
end;
$$ language plpgsql stable security definer set search_path = public;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

-- The old client-trusted paths: nothing a client sends can mint items or GP.
revoke execute on function public.record_kill (text, bigint, jsonb) from public, anon, authenticated;
revoke execute on function public.open_container (text, bigint, jsonb) from public, anon, authenticated;
revoke execute on function public.sync_collection_log_firsts (jsonb) from public, anon, authenticated;

-- Internal functions: never callable by a client. (_current_week and
-- _badges_of are the exceptions: the public leaderboard views call them, and
-- Postgres checks a view's function calls against whoever reads the view.
-- Both only return public information.)
revoke execute on function
  public._award_badge (uuid, text),
  public._close_finished_seasons (),
  public._rand_qty (bigint, bigint),
  public._drop (jsonb, text),
  public._roll_loot (jsonb, jsonb),
  public._credit_drops (uuid, jsonb, text, text, text, bigint),
  public._roll_week (uuid),
  public._check_clog_badges (uuid),
  public._kill (uuid, text, integer),
  public._open (uuid, text),
  public._sell_item (uuid, text, bigint),
  public._sell_all_items (uuid, text[]),
  public._unlock_npc (uuid, text),
  public._prestige (uuid),
  public._discard_item (uuid, text, bigint),
  public._discard_all_items (uuid, text[]),
  public._sync_inventory_cache (uuid, jsonb),
  public._get_state (uuid),
  public._device_uid (text)
from public, anon, authenticated;
grant execute on function public._current_week (), public._badges_of (uuid) to anon, authenticated;

-- Website (signed in only).
revoke execute on function
  public.kill (text, integer),
  public.open_container_v2 (text),
  public.sell_item (text, bigint),
  public.sell_all_items (text[]),
  public.unlock_npc (text),
  public.prestige (),
  public.discard_item (text, bigint),
  public.discard_all_items (text[]),
  public.sync_inventory_cache (jsonb),
  public.get_my_state (),
  public.create_link_code (),
  public.list_devices (),
  public.revoke_device (uuid)
from public, anon;
grant execute on function
  public.kill (text, integer),
  public.open_container_v2 (text),
  public.sell_item (text, bigint),
  public.sell_all_items (text[]),
  public.unlock_npc (text),
  public.prestige (),
  public.discard_item (text, bigint),
  public.discard_all_items (text[]),
  public.sync_inventory_cache (jsonb),
  public.get_my_state (),
  public.create_link_code (),
  public.list_devices (),
  public.revoke_device (uuid)
to authenticated;

-- Plugin (device token, so the anon role) and public reads.
grant execute on function
  public.redeem_link_code (text, text),
  public.device_unlink (text),
  public.device_get_state (text),
  public.device_kill (text, text, integer),
  public.device_open (text, text),
  public.device_sell_item (text, text, bigint),
  public.device_sell_all_items (text, text[]),
  public.device_unlock_npc (text, text),
  public.device_prestige (text),
  public.device_discard_item (text, text, bigint),
  public.device_discard_all_items (text, text[]),
  public.device_sync_inventory_cache (text, jsonb),
  public.get_boss_leaderboard (text, integer),
  public.get_season_info (),
  public.get_profile (text)
to anon, authenticated;
