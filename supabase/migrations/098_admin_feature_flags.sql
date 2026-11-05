create or replace function set_feature_flag_atomic(p_actor_id uuid,p_name text,p_enabled boolean)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare current_value boolean;
begin
  if p_enabled is null then raise exception 'Invalid flag'; end if;
  if p_name in ('google_auth','telegram_auth') then
    perform 1 from feature_flags where name in ('google_auth','telegram_auth') order by name for update;
  else perform 1 from feature_flags where name=p_name for update; end if;
  perform 1 from users where id=p_actor_id and is_admin and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Forbidden' using errcode='P1005'; end if;
  select enabled into current_value from feature_flags where name=p_name;
  if not found then raise exception 'Unknown flag' using errcode='P1003'; end if;
  if current_value=p_enabled then return false; end if;
  if not p_enabled and p_name in ('google_auth','telegram_auth') and not exists(select 1 from feature_flags where name in ('google_auth','telegram_auth') and name<>p_name and enabled) then
    raise exception 'At least one sign-in provider must remain enabled' using errcode='P1006';
  end if;
  update feature_flags set enabled=p_enabled,updated_at=now() where name=p_name;
  return true;
end $$;
notify pgrst,'reload schema';
