create function increment_streak_atomic(p_user_id uuid,p_kind text,p_today date default (now() at time zone 'utc')::date)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare u users; last_day date; streak integer; tokens integer; missed integer;
begin
  if p_kind not in ('reading','writing') or p_today is null then raise exception 'Invalid streak'; end if;
  select * into u from users where id=p_user_id for update;
  if not found then raise exception 'Unknown user'; end if;
  if p_kind='reading' then last_day:=u.last_streak_date; streak:=u.reading_streak; tokens:=u.streak_freeze_tokens;
  else last_day:=u.last_writing_date; streak:=u.writing_streak; tokens:=u.writing_freeze_tokens; end if;
  if last_day=p_today then return; end if;
  if last_day>p_today then raise exception 'Streak date is in the future'; end if;
  missed:=greatest(0,p_today-last_day-1);
  if last_day is null or missed>tokens then streak:=1;
  else streak:=streak+1; tokens:=tokens-missed; end if;
  if streak in (7,30) then
    tokens:=tokens+1;
    if p_kind='reading' then
      perform award_xp_once(p_user_id,case when streak=7 then 50 else 200 end,'reading_streak_'||streak,'streak:reading:'||p_today);
    end if;
  end if;
  if p_kind='reading' then
    update users set reading_streak=streak,last_streak_date=p_today,streak_freeze_tokens=tokens,max_reading_streak=greatest(max_reading_streak,streak) where id=p_user_id;
  else
    update users set writing_streak=streak,last_writing_date=p_today,writing_freeze_tokens=tokens where id=p_user_id;
  end if;
end $$;
revoke all on function increment_streak_atomic(uuid,text,date) from public;
do $$ declare role_name text; begin
  foreach role_name in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname=role_name) then
      execute format('revoke all on function increment_streak_atomic(uuid,text,date) from %I',role_name);
    end if;
  end loop;
end $$;
grant execute on function increment_streak_atomic(uuid,text,date) to service_role;

-- Ownership of a profile does not grant role, balance or reward administration.
create or replace function guard_privileged_profile_fields()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if auth.role() in ('authenticated','anon') and (
    new.is_admin is distinct from old.is_admin or
    new.is_moderator is distinct from old.is_moderator or
    new.is_premium is distinct from old.is_premium or
    new.is_verified_author is distinct from old.is_verified_author or
    new.is_suspended is distinct from old.is_suspended or
    new.is_banned is distinct from old.is_banned or
    new.xp is distinct from old.xp or
    new.reading_streak is distinct from old.reading_streak or
    new.last_streak_date is distinct from old.last_streak_date or
    new.streak_freeze_tokens is distinct from old.streak_freeze_tokens or
    new.max_reading_streak is distinct from old.max_reading_streak or
    new.writing_streak is distinct from old.writing_streak or
    new.last_writing_date is distinct from old.last_writing_date or
    new.writing_freeze_tokens is distinct from old.writing_freeze_tokens or

    new.email is distinct from old.email or
    new.email_verified is distinct from old.email_verified or
    new.pin_hash is distinct from old.pin_hash or
    new.password_hash is distinct from old.password_hash or
    new.totp_secret is distinct from old.totp_secret or
    new.totp_enabled is distinct from old.totp_enabled or
    new.recovery_codes is distinct from old.recovery_codes
  ) then raise exception 'Privileged profile fields require service authorization'; end if;
  return new;
end $$;
