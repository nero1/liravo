create index users_email_lookup on users using hash(lower(email)) where email is not null;
create function find_direct_account(p_email text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare matches integer;profile users;
begin
  select count(*) into matches from users where email is not null and lower(email)=lower(btrim(p_email));
  if matches>1 then raise exception 'Ambiguous email identity' using errcode='P1001';end if;
  if matches=0 then return null;end if;
  select * into profile from users where email is not null and lower(email)=lower(btrim(p_email));
  return to_jsonb(profile);
end $$;

create function resolve_direct_social_identity(p_provider text,p_subject text,p_email text,p_display_name text,p_avatar_url text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare profile users;existing jsonb;new_id uuid:=gen_random_uuid();username_base text;
begin
  if p_provider is null or p_provider not in ('google','telegram') or p_subject is null or length(p_subject) not between 1 and 255
    or p_subject~'[[:space:][:cntrl:]]' or (p_provider='telegram' and p_subject!~'^[0-9]{1,20}$')
    or (p_provider='google' and (p_email is null or p_email<>lower(btrim(p_email)) or length(p_email)>254 or p_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'))
    or (p_provider='telegram' and p_email is not null)
    or (p_avatar_url is not null and (length(p_avatar_url)>2048 or p_avatar_url!~'^https?://')) then raise exception 'Invalid provider identity' using errcode='P1004';end if;
  perform pg_advisory_xact_lock(hashtextextended('direct-identity:'||p_provider||':'||p_subject,0));
  select * into profile from users where (p_provider='google' and google_id=p_subject) or (p_provider='telegram' and telegram_id=p_subject) for update;
  if found then
    if profile.is_banned or profile.deleted_at is not null then raise exception 'Account unavailable' using errcode='P1003';end if;
    return to_jsonb(profile);
  end if;
  if p_provider='google' then
    existing:=find_direct_account(p_email);
    if existing is not null then
      select * into profile from users where id=(existing->>'id')::uuid for update;
      if profile.is_banned or profile.deleted_at is not null then raise exception 'Account unavailable' using errcode='P1003';end if;
      if not profile.email_verified or lower(profile.email) is distinct from p_email or (profile.google_id is not null and profile.google_id<>p_subject) then raise exception 'Use the existing sign-in method before linking Google' using errcode='P1001';end if;
      update users set google_id=p_subject where id=profile.id returning * into profile;
      return to_jsonb(profile);
    end if;
  end if;
  username_base:=left(lower(regexp_replace(coalesce(nullif(split_part(p_email,'@',1),''),'tg_'||p_subject),'[^A-Za-z0-9_]','_','g')),20);
  perform create_direct_account(p_id=>new_id,p_email=>p_email,p_username=>username_base||'_'||left(new_id::text,8),p_display_name=>left(coalesce(nullif(btrim(p_display_name),''),username_base),50),p_google_id=>case when p_provider='google' then p_subject end,p_telegram_id=>case when p_provider='telegram' then p_subject end,p_avatar_url=>p_avatar_url);
  update users set email_verified=(p_provider='google') where id=new_id returning * into profile;
  return to_jsonb(profile);
end $$;
revoke all on function find_direct_account(text),resolve_direct_social_identity(text,text,text,text,text) from public,anon,authenticated;
grant execute on function find_direct_account(text),resolve_direct_social_identity(text,text,text,text,text) to service_role;
notify pgrst,'reload schema';
