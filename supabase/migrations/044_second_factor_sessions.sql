alter table users add column deleted_at timestamptz,
  add column mfa_version integer not null default 0,
  add column mfa_last_step bigint;
create table auth_factor_challenges (
  token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),user_id uuid not null references users(id) on delete cascade,
  kind text not null check(kind in ('login','setup')),expected_version integer not null,provider_session_hash text,
  encrypted_payload text,attempts integer not null default 0,verified_at timestamptz,grant_hash text,
  expires_at timestamptz not null default now()+interval '5 minutes',created_at timestamptz not null default now()
);
create table auth_factor_grants (
  session_hash text primary key check(session_hash ~ '^[a-f0-9]{64}$'),user_id uuid not null references users(id) on delete cascade,
  mfa_version integer not null,expires_at timestamptz not null default now()+interval '7 days',created_at timestamptz not null default now()
);
create index auth_factor_challenge_expiry on auth_factor_challenges(expires_at);
create index auth_factor_grant_user on auth_factor_grants(user_id,expires_at);
alter table auth_factor_challenges enable row level security;
alter table auth_factor_grants enable row level security;
revoke all on auth_factor_challenges,auth_factor_grants from public,anon,authenticated;
grant select,insert,update,delete on auth_factor_challenges,auth_factor_grants to service_role;
revoke select(mfa_version,mfa_last_step),update(mfa_version,mfa_last_step) on users from anon,authenticated;

create function begin_factor_challenge(p_user_id uuid,p_hash text,p_kind text,p_session_hash text,p_encrypted_payload text default null)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare profile users;
begin
  select * into profile from users where id=p_user_id and deleted_at is null and not is_banned for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003'; end if;
  if p_kind is null or p_kind not in ('login','setup') or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid factor challenge' using errcode='P1004'; end if;
  if (p_kind='login' and not profile.totp_enabled) or (p_kind='setup' and (profile.totp_enabled or p_encrypted_payload is null or p_session_hash is null)) then raise exception 'Factor state changed' using errcode='P1001'; end if;
  delete from auth_factor_challenges where expires_at<now() and user_id=p_user_id;
  insert into auth_factor_challenges(token_hash,user_id,kind,expected_version,provider_session_hash,encrypted_payload)
    values(p_hash,p_user_id,p_kind,profile.mfa_version,p_session_hash,p_encrypted_payload);
end $$;

create function claim_factor_challenge(p_hash text,p_kind text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare challenge auth_factor_challenges;
begin
  select * into challenge from auth_factor_challenges where token_hash=p_hash and kind=p_kind for update;
  if not found or challenge.expires_at<=now() or (challenge.verified_at is null and challenge.attempts>=10) then return null; end if;
  if challenge.verified_at is null then update auth_factor_challenges set attempts=attempts+1 where token_hash=p_hash; end if;
  return to_jsonb(challenge);
end $$;

create function finish_factor_challenge(p_hash text,p_kind text,p_version integer,p_step bigint,p_recovery_hash text,p_grant_hash text,p_secret text default null,p_recovery_hashes text[] default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare challenge auth_factor_challenges; profile users; target_user uuid; granted_version integer;
begin
  select user_id into target_user from auth_factor_challenges where token_hash=p_hash and kind=p_kind;
  if not found then raise exception 'Challenge unavailable' using errcode='P1003'; end if;
  select * into profile from users where id=target_user and deleted_at is null and not is_banned for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003'; end if;
  select * into challenge from auth_factor_challenges where token_hash=p_hash and kind=p_kind for update;
  if challenge.expires_at<=now() or challenge.expected_version is distinct from p_version or p_grant_hash is null or p_grant_hash !~ '^[a-f0-9]{64}$' then raise exception 'Challenge unavailable' using errcode='P1003'; end if;
  if challenge.provider_session_hash is not null and challenge.provider_session_hash<>p_grant_hash then raise exception 'Session binding mismatch' using errcode='P1003'; end if;
  granted_version:=p_version+case when p_kind='setup' then 1 else 0 end;
  if challenge.verified_at is not null then
    if profile.mfa_version is distinct from granted_version or challenge.grant_hash<>p_grant_hash then raise exception 'Factor state changed' using errcode='P1001'; end if;
    return jsonb_build_object('user_id',profile.id,'mfa_version',granted_version);
  end if;
  if challenge.attempts not between 1 and 10 or profile.mfa_version is distinct from p_version then raise exception 'Factor state changed' using errcode='P1001'; end if;
  if p_kind='login' then
    if not profile.totp_enabled then raise exception 'Factor state changed' using errcode='P1001'; end if;
    if p_recovery_hash is not null then
      if not coalesce(p_recovery_hash=any(profile.recovery_codes),false) then raise exception 'Recovery code already used' using errcode='P1003'; end if;
      update users set recovery_codes=array_remove(recovery_codes,p_recovery_hash) where id=profile.id;
    elsif p_step is not null and p_step>coalesce(profile.mfa_last_step,-1) then update users set mfa_last_step=p_step where id=profile.id;
    else raise exception 'Code already used or invalid' using errcode='P1003'; end if;
    if p_secret is not null then
      if p_secret not like 'v1:%' then raise exception 'Invalid encrypted factor' using errcode='P1004'; end if;
      update users set totp_secret=p_secret where id=profile.id;
    end if;
  elsif p_kind='setup' then
    if profile.totp_enabled or p_secret is null or p_secret not like 'v1:%' or coalesce(cardinality(p_recovery_hashes),0)<>8 or p_step is null then raise exception 'Invalid enrollment' using errcode='P1004'; end if;
    update users set totp_enabled=true,totp_secret=p_secret,recovery_codes=p_recovery_hashes,mfa_version=granted_version,mfa_last_step=p_step where id=profile.id;
  else raise exception 'Invalid challenge kind' using errcode='P1004'; end if;
  insert into auth_factor_grants(session_hash,user_id,mfa_version) values(p_grant_hash,profile.id,granted_version)
    on conflict(session_hash) do update set user_id=excluded.user_id,mfa_version=excluded.mfa_version,expires_at=excluded.expires_at;
  update auth_factor_challenges set verified_at=now(),grant_hash=p_grant_hash where token_hash=p_hash;
  insert into security_events(user_id,event_type,metadata) values(profile.id,case when p_kind='setup' then '2fa_enabled' else '2fa_login' end,jsonb_build_object('method',case when p_recovery_hash is null then 'totp' else 'recovery' end));
  return jsonb_build_object('user_id',profile.id,'mfa_version',granted_version);
end $$;

create function disable_factor_atomic(p_user_id uuid,p_version integer,p_step bigint,p_recovery_hash text,p_session_hash text,p_key text,p_fingerprint text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare profile users; previous content_intents;
begin
  if p_key is null or length(p_key) not between 8 and 200 or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' or p_session_hash is null or p_session_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid factor intent' using errcode='P1004'; end if;
  select * into profile from users where id=p_user_id for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003'; end if;
  select * into previous from content_intents where actor_id=p_user_id and action='auth:disable_factor' and intent_key=p_key;
  if found then
    if previous.fingerprint<>p_fingerprint then raise exception 'Conflicting factor intent' using errcode='P1001'; end if;
    return true;
  end if;
  if profile.mfa_version is distinct from p_version or not profile.totp_enabled then raise exception 'Factor state changed' using errcode='P1001'; end if;
  if p_recovery_hash is not null then
    if not coalesce(p_recovery_hash=any(profile.recovery_codes),false) then raise exception 'Recovery code already used' using errcode='P1003'; end if;
  elsif p_step is null or p_step<=coalesce(profile.mfa_last_step,-1) then raise exception 'Code already used or invalid' using errcode='P1003'; end if;
  update users set totp_enabled=false,totp_secret=null,recovery_codes=null,mfa_version=mfa_version+1,mfa_last_step=null where id=p_user_id;
  insert into auth_factor_grants(session_hash,user_id,mfa_version) values(p_session_hash,p_user_id,p_version+1)
    on conflict(session_hash) do update set mfa_version=excluded.mfa_version,expires_at=excluded.expires_at;
  insert into security_events(user_id,event_type) values(p_user_id,'2fa_disabled');
  insert into content_intents values(p_user_id,'auth:disable_factor',p_key,p_fingerprint,'{"ok":true}'::jsonb);
  return true;
end $$;

create function read_factor_session(p_hash text)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('id',u.id,'email',coalesce(u.email,''),'mfaVersion',u.mfa_version)
    from auth_factor_grants g join users u on u.id=g.user_id where g.session_hash=p_hash and g.mfa_version=u.mfa_version and g.expires_at>now() and u.deleted_at is null and not u.is_banned;
$$;
revoke all on function begin_factor_challenge(uuid,text,text,text,text),claim_factor_challenge(text,text),finish_factor_challenge(text,text,integer,bigint,text,text,text,text[]),disable_factor_atomic(uuid,integer,bigint,text,text,text,text),read_factor_session(text) from public,anon,authenticated;
grant execute on function begin_factor_challenge(uuid,text,text,text,text),claim_factor_challenge(text,text),finish_factor_challenge(text,text,integer,bigint,text,text,text,text[]),disable_factor_atomic(uuid,integer,bigint,text,text,text,text),read_factor_session(text) to service_role;
notify pgrst,'reload schema';

create function guard_factor_profile_fields()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if (auth.role() in ('authenticated','anon') or current_user in ('authenticated','anon')) and (new.mfa_version is distinct from old.mfa_version or new.mfa_last_step is distinct from old.mfa_last_step or new.deleted_at is distinct from old.deleted_at or new.google_id is distinct from old.google_id or new.telegram_id is distinct from old.telegram_id) then
    raise exception 'Factor fields require service authorization';
  end if;
  return new;
end $$;
create trigger factor_profile_guard before update on users for each row execute function guard_factor_profile_fields();

create function factor_session_authorized()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce((select not u.totp_enabled or exists(
    select 1 from auth_factor_grants g where g.user_id=u.id and g.mfa_version=u.mfa_version and g.expires_at>now()
      and g.session_hash=encode(sha256(convert_to('supabase:'||u.id::text||':'||(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id'),'UTF8')),'hex')
  ) from users u where u.id=auth.uid() and not u.is_banned and u.deleted_at is null),false);
$$;
revoke all on function factor_session_authorized() from public,anon;
grant execute on function factor_session_authorized() to authenticated;
do $$ declare relation_name text; begin
  for relation_name in select tablename from pg_tables where schemaname='public' loop
    execute format('create policy authenticated_factor_session on %I as restrictive for all to authenticated using(factor_session_authorized()) with check(factor_session_authorized())',relation_name);
  end loop;
end $$;
notify pgrst,'reload schema';

create function cleanup_factor_sessions(p_limit integer default 500)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare removed integer; total integer;
begin
  with expired as(select token_hash from auth_factor_challenges where expires_at<=now() order by expires_at limit greatest(1,least(coalesce(p_limit,500),2000)) for update skip locked)
    delete from auth_factor_challenges c using expired e where c.token_hash=e.token_hash;
  get diagnostics total=row_count;
  with expired as(select session_hash from auth_factor_grants where expires_at<=now() order by expires_at limit greatest(1,least(coalesce(p_limit,500),2000)) for update skip locked)
    delete from auth_factor_grants g using expired e where g.session_hash=e.session_hash;
  get diagnostics removed=row_count;
  return total+removed;
end $$;
revoke all on function cleanup_factor_sessions(integer) from public,anon,authenticated;
grant execute on function cleanup_factor_sessions(integer) to service_role;
notify pgrst,'reload schema';

alter table users add column google_id text;
create unique index users_google_identity on users(google_id) where google_id is not null;
revoke select(google_id),update(google_id) on users from anon,authenticated;
create function create_direct_account(p_id uuid,p_email text,p_username text,p_display_name text,p_password_hash text default null,p_google_id text default null,p_telegram_id text default null,p_avatar_url text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare referral text; profile users;
begin
  if p_id is null or length(coalesce(p_username,''))<1 or length(coalesce(p_display_name,''))<1 then raise exception 'Invalid account' using errcode='P1004'; end if;
  perform pg_advisory_xact_lock(hashtextextended('direct-account:'||coalesce(p_email,p_telegram_id,p_id::text),0));
  if exists(select 1 from pg_constraint where conrelid='public.users'::regclass and contype='f' and confrelid=to_regclass('auth.users')) then
    execute 'insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)' using p_id,p_email,jsonb_build_object('username',p_username,'full_name',p_display_name);
  else
    loop
      referral:=lpad(floor(random()*1000000000000)::text,12,'0');
      exit when not exists(select 1 from users where referral_code=referral);
    end loop;
    insert into users(id,username,display_name,referral_code) values(p_id,p_username,p_display_name,referral);
  end if;
  update users set email=p_email,password_hash=p_password_hash,google_id=p_google_id,telegram_id=p_telegram_id,avatar_url=p_avatar_url where id=p_id returning * into profile;
  return to_jsonb(profile);
end $$;
revoke all on function create_direct_account(uuid,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function create_direct_account(uuid,text,text,text,text,text,text,text) to service_role;
notify pgrst,'reload schema';
