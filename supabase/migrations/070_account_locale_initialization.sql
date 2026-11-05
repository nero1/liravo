alter table users add column locale_initialized boolean not null default false;
update users set locale_initialized=true;
revoke select(locale_initialized),update(locale_initialized) on users from anon,authenticated;

create function mark_account_locale_initialized()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin new.locale_initialized:=true;return new;end $$;
create trigger account_locale_initialized before update of preferred_locale on users for each row execute function mark_account_locale_initialized();
revoke all on function mark_account_locale_initialized() from public,anon,authenticated,service_role;

create function initialize_account_locale(p_user_id uuid,p_locale text,p_replace boolean default false)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare locale text;initialized boolean;
begin
  if p_locale is null or p_locale not in ('en','fr','de') or p_replace is null then raise exception 'Invalid locale' using errcode='P1004';end if;
  select preferred_locale,locale_initialized into locale,initialized from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  if p_replace or not initialized then
    update users set preferred_locale=p_locale,locale_initialized=true where id=p_user_id returning preferred_locale into locale;
  end if;
  return locale;
end $$;

create function create_localized_direct_account(p_id uuid,p_email text,p_username text,p_display_name text,p_locale text,p_password_hash text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform create_direct_account(p_id,p_email,p_username,p_display_name,p_password_hash);
  perform initialize_account_locale(p_id,p_locale);
  return (select to_jsonb(u) from users u where id=p_id);
end $$;

create function resolve_localized_social_identity(p_provider text,p_subject text,p_email text,p_display_name text,p_avatar_url text,p_locale text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare profile jsonb;
begin
  profile:=resolve_direct_social_identity(p_provider,p_subject,p_email,p_display_name,p_avatar_url);
  perform initialize_account_locale((profile->>'id')::uuid,p_locale);
  return (select to_jsonb(u) from users u where id=(profile->>'id')::uuid);
end $$;
revoke all on function initialize_account_locale(uuid,text,boolean),create_localized_direct_account(uuid,text,text,text,text,text),resolve_localized_social_identity(text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function initialize_account_locale(uuid,text,boolean),create_localized_direct_account(uuid,text,text,text,text,text),resolve_localized_social_identity(text,text,text,text,text,text) to service_role;
notify pgrst,'reload schema';
