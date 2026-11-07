-- Security hardening found in a full audit after the server-side-rolls release.
--
-- 1. create_profile_and_state was still executable by the anon role (an older
--    migration re-created it after 0004 revoked it). It always failed for anon
--    (auth.uid() is null), but nothing anonymous should reach it at all.
-- 2. Usernames were unique only by exact case, so "rimprex" could sit on the
--    leaderboard next to "Rimprex" and impersonate them. Now unique ignoring case.
-- 3. Link codes are 8 characters from a 32-letter alphabet (~1.1 trillion
--    combinations, valid 10 minutes), so guessing one is already impractical;
--    this adds a per-IP limit of 20 wrong guesses per 10 minutes, plus a
--    site-wide cap, so it can't even be attempted at scale.

-- 1 ---------------------------------------------------------------------------
revoke execute on function public.create_profile_and_state (text) from public, anon;
grant execute on function public.create_profile_and_state (text) to authenticated;

-- 2 ---------------------------------------------------------------------------
create unique index if not exists profiles_username_lower_key on public.profiles (lower(username));

-- 3 ---------------------------------------------------------------------------
create table if not exists public.link_redeem_failures (
  ip text not null,
  at timestamptz not null default now()
);
create index if not exists link_redeem_failures_ip_at on public.link_redeem_failures (ip, at);
create index if not exists link_redeem_failures_at on public.link_redeem_failures (at);
alter table public.link_redeem_failures enable row level security; -- no policies: functions only

-- The caller's IP as seen by Supabase's edge. cf-connecting-ip is set by
-- Cloudflare and can't be forged by the client; the fallbacks cover other setups.
create or replace function public._client_ip () returns text as $$
declare
  v_headers json;
begin
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_headers := null;
  end;
  return coalesce(
    nullif(v_headers ->> 'cf-connecting-ip', ''),
    nullif(v_headers ->> 'x-real-ip', ''),
    nullif(trim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), ''),
    'unknown'
  );
end;
$$ language plpgsql stable set search_path = public;

create or replace function public.redeem_link_code (p_code text, p_device_name text default 'RuneLite') returns jsonb as $$
declare
  v_ip text := public._client_ip ();
  v_uid uuid;
  v_token text;
  v_username text;
begin
  if (select count(*) from public.link_redeem_failures where ip = v_ip and at > now() - interval '10 minutes') >= 20
     or (select count(*) from public.link_redeem_failures where at > now() - interval '1 minute') >= 600 then
    raise exception 'too many link attempts, wait a few minutes';
  end if;

  delete from public.link_codes
  where code = upper(replace(trim(coalesce(p_code, '')), '-', '')) and expires_at > now()
  returning user_id into v_uid;

  if v_uid is null then
    insert into public.link_redeem_failures (ip) values (v_ip);
    delete from public.link_redeem_failures where at < now() - interval '1 day';
    -- The failure must be recorded even though we raise, so return the error
    -- as a value instead of rolling the insert back with an exception.
    return jsonb_build_object('error', 'invalid or expired link code');
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

revoke execute on function public._client_ip () from public, anon, authenticated;
grant execute on function public.redeem_link_code (text, text) to anon, authenticated;
