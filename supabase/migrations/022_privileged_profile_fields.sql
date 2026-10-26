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
create trigger users_privileged_fields before update on users
  for each row execute function guard_privileged_profile_fields();
