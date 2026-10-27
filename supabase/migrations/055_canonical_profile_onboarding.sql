alter function update_profile_atomic(uuid,jsonb) rename to update_profile_046;
revoke all on function update_profile_046(uuid,jsonb) from public,anon,authenticated,service_role;
create function update_profile_atomic(p_user_id uuid,p_changes jsonb,p_pin_hash text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare profile users; result jsonb;
begin
  select * into profile from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  if p_pin_hash is not null then
    if p_changes->>'onboarding_complete' is distinct from 'true' or p_pin_hash !~ '^\$2[aby]\$12\$[./A-Za-z0-9]{53}$' then raise exception 'Invalid onboarding PIN' using errcode='P1004';end if;
    if profile.pin_hash is not null and profile.pin_hash<>p_pin_hash then raise exception 'PIN changed; retry' using errcode='P1001';end if;
    if profile.pin_hash is null and profile.onboarding_complete then raise exception 'Use PIN settings after onboarding' using errcode='P1004';end if;
  end if;
  result:=update_profile_046(p_user_id,p_changes);
  if p_pin_hash is not null and profile.pin_hash is null then
    update users set pin_hash=p_pin_hash where id=p_user_id;
    insert into security_events(user_id,event_type,metadata) values(p_user_id,'pin_set',jsonb_build_object('source','onboarding'));
  end if;
  return result;
end $$;
create function guard_canonical_profile_fields()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if auth.role() in ('anon','authenticated') and (
    new.username is distinct from old.username or new.display_name is distinct from old.display_name or new.bio is distinct from old.bio or new.country is distinct from old.country
    or new.avatar_url is distinct from old.avatar_url or new.external_links is distinct from old.external_links or new.user_types is distinct from old.user_types
    or new.genres is distinct from old.genres or new.onboarding_complete is distinct from old.onboarding_complete
  ) then raise exception 'Use the profile API' using errcode='P1003';end if;
  return new;
end $$;
create trigger canonical_profile_fields before update on users for each row execute function guard_canonical_profile_fields();
revoke all on function update_profile_atomic(uuid,jsonb,text),guard_canonical_profile_fields() from public,anon,authenticated;
grant execute on function update_profile_atomic(uuid,jsonb,text) to service_role;
notify pgrst,'reload schema';
