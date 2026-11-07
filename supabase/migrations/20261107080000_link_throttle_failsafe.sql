-- Fail-safe for the link-code throttle (20261107070000_security_hardening_2.sql):
-- if the caller's IP can't be determined, don't lump every such caller into one
-- shared "unknown" bucket (20 typos site-wide would then block everyone). Only the
-- site-wide cap applies in that case, which alone keeps guessing a code impractical.
create or replace function public.redeem_link_code (p_code text, p_device_name text default 'RuneLite') returns jsonb as $$
declare
  v_ip text := public._client_ip ();
  v_uid uuid;
  v_token text;
  v_username text;
begin
  if (v_ip <> 'unknown' and (select count(*) from public.link_redeem_failures where ip = v_ip and at > now() - interval '10 minutes') >= 20)
     or (select count(*) from public.link_redeem_failures where at > now() - interval '1 minute') >= 600 then
    raise exception 'too many link attempts, wait a few minutes';
  end if;

  delete from public.link_codes
  where code = upper(replace(trim(coalesce(p_code, '')), '-', '')) and expires_at > now()
  returning user_id into v_uid;

  if v_uid is null then
    insert into public.link_redeem_failures (ip) values (v_ip);
    delete from public.link_redeem_failures where at < now() - interval '1 day';
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

grant execute on function public.redeem_link_code (text, text) to anon, authenticated;
