revoke all on email_verification_tokens from public,anon,authenticated,service_role;
delete from email_verification_tokens;
alter table users add column auth_not_before bigint not null default 0 check(auth_not_before>=0);
revoke select(auth_not_before),update(auth_not_before) on users from public,anon,authenticated;
create table auth_email_challenges (
  token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid not null references users(id) on delete cascade,
  purpose text not null check(purpose in ('verify','recover')),email text not null,original_email text,
  expected_version integer not null,expected_pin_hash text,
  expires_at timestamptz not null,consumed_at timestamptz,created_at timestamptz not null default now(),
  unique(user_id,purpose)
);
alter table auth_email_challenges enable row level security;
revoke all on auth_email_challenges from public,anon,authenticated;
grant select,insert,update,delete on auth_email_challenges to service_role;

create function issue_email_challenge(p_user_id uuid,p_email text,p_purpose text,p_hash text,p_pin_hash text default null)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare profile users;
begin
  if p_purpose is null or p_purpose not in ('verify','recover') or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_email is null or length(p_email)>254 or p_email<>lower(btrim(p_email)) or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid email challenge' using errcode='P1004';end if;
  select * into profile from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then return false;end if;
  if p_purpose='recover' then
    if not profile.email_verified or lower(profile.email) is distinct from p_email then return false;end if;
  else
    if profile.pin_hash is distinct from p_pin_hash then raise exception 'PIN confirmation changed' using errcode='P1001';end if;
    if exists(select 1 from users where lower(email)=p_email and id<>p_user_id) then raise exception 'Email unavailable' using errcode='P1001';end if;
  end if;
  insert into auth_email_challenges(token_hash,user_id,purpose,email,original_email,expected_version,expected_pin_hash,expires_at)
    values(p_hash,p_user_id,p_purpose,p_email,profile.email,profile.mfa_version,profile.pin_hash,now()+case when p_purpose='verify' then interval '24 hours' else interval '1 hour' end)
    on conflict(user_id,purpose) do update set token_hash=excluded.token_hash,email=excluded.email,original_email=excluded.original_email,expected_version=excluded.expected_version,expected_pin_hash=excluded.expected_pin_hash,expires_at=excluded.expires_at,consumed_at=null,created_at=now();
  return true;
end $$;

create function issue_account_recovery(p_email text,p_hash text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare profile users;
begin
  if (select count(*) from users where lower(email)=p_email)<>1 then return null;end if;
  select * into profile from users where lower(email)=p_email and email_verified and not is_banned and deleted_at is null;
  if not found or not issue_email_challenge(profile.id,p_email,'recover',p_hash) then return null;end if;
  return jsonb_build_object('id',profile.id,'display_name',profile.display_name,'username',profile.username);
end $$;

create function consume_email_challenge(p_hash text,p_purpose text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare target_user uuid;profile users;challenge auth_email_challenges;
begin
  select user_id into target_user from auth_email_challenges where token_hash=p_hash and purpose=p_purpose;
  if not found then return null;end if;
  select * into profile from users where id=target_user and not is_banned and deleted_at is null for update;
  if not found then return null;end if;
  select * into challenge from auth_email_challenges where token_hash=p_hash and purpose=p_purpose for update;
  if not found or challenge.consumed_at is not null or challenge.expires_at<=now() or challenge.original_email is distinct from profile.email or challenge.expected_version<>profile.mfa_version or challenge.expected_pin_hash is distinct from profile.pin_hash then return null;end if;
  if p_purpose='verify' then
    if exists(select 1 from users where lower(email)=challenge.email and id<>target_user) then raise exception 'Email unavailable' using errcode='P1001';end if;
    perform pg_advisory_xact_lock(hashtextextended('verified-email:'||challenge.email,0));
    update users set email=challenge.email,email_verified=true where id=target_user;
  elsif p_purpose='recover' then
    if not profile.email_verified or lower(profile.email) is distinct from challenge.email then return null;end if;
    update users set mfa_version=mfa_version+1,auth_not_before=floor(extract(epoch from clock_timestamp()))::bigint where id=target_user;
    delete from auth_factor_grants where user_id=target_user;
  else return null;end if;
  update auth_email_challenges set consumed_at=now() where token_hash=p_hash;
  insert into security_events(user_id,event_type,metadata) values(target_user,case when p_purpose='verify' then 'email_verified' else 'account_recovery' end,jsonb_build_object('source','email_link'));
  return jsonb_build_object('id',target_user,'email',challenge.email);
end $$;

create or replace function guard_factor_profile_fields()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if (auth.role() in ('authenticated','anon') or current_user in ('authenticated','anon')) and (new.mfa_version is distinct from old.mfa_version or new.mfa_last_step is distinct from old.mfa_last_step or new.deleted_at is distinct from old.deleted_at or new.google_id is distinct from old.google_id or new.telegram_id is distinct from old.telegram_id or new.auth_not_before is distinct from old.auth_not_before) then
    raise exception 'Factor fields require service authorization';
  end if;
  return new;
end $$;
create or replace function factor_session_authorized()
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce((select (u.auth_not_before=0 or coalesce((nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'iat')::bigint,0)>=u.auth_not_before) and (not u.totp_enabled or exists(
    select 1 from auth_factor_grants g where g.user_id=u.id and g.mfa_version=u.mfa_version and g.expires_at>now()
      and g.session_hash=encode(sha256(convert_to('supabase:'||u.id::text||':'||(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id'),'UTF8')),'hex')
  )) from users u where u.id=auth.uid() and not u.is_banned and u.deleted_at is null),false);
$$;

alter function finish_factor_challenge(text,text,integer,bigint,text,text,text,text[]) rename to finish_factor_challenge_044;
revoke all on function finish_factor_challenge_044(text,text,integer,bigint,text,text,text,text[]) from public,anon,authenticated,service_role;
create function finish_factor_challenge(p_hash text,p_kind text,p_version integer,p_step bigint,p_recovery_hash text,p_grant_hash text,p_secret text default null,p_recovery_hashes text[] default null,p_pin_hash text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare target_user uuid;profile users;
begin
  if p_kind='setup' then
    select user_id into target_user from auth_factor_challenges where token_hash=p_hash and kind=p_kind;
    select * into profile from users where id=target_user and not is_banned and deleted_at is null for update;
    if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
    if profile.pin_hash is distinct from p_pin_hash then raise exception 'PIN confirmation changed' using errcode='P1001';end if;
  end if;
  return finish_factor_challenge_044(p_hash,p_kind,p_version,p_step,p_recovery_hash,p_grant_hash,p_secret,p_recovery_hashes);
end $$;
revoke all on function issue_email_challenge(uuid,text,text,text,text),issue_account_recovery(text,text),consume_email_challenge(text,text),finish_factor_challenge(text,text,integer,bigint,text,text,text,text[],text) from public,anon,authenticated;
grant execute on function issue_email_challenge(uuid,text,text,text,text),issue_account_recovery(text,text),consume_email_challenge(text,text),finish_factor_challenge(text,text,integer,bigint,text,text,text,text[],text) to service_role;
notify pgrst,'reload schema';
