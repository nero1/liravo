create table profile_avatar_uploads (
  id uuid primary key default gen_random_uuid(),user_id uuid references users(id) on delete set null,
  fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),backend text not null check(backend in ('s3','supabase')),
  bucket text not null check(length(bucket) between 1 and 128),path text not null unique,public_url text,
  state text not null default 'pending' check(state in ('pending','uploaded','committed','abandoned','deleting')),
  expires_at timestamptz not null default now()+interval '24 hours',claim_token uuid,claimed_until timestamptz,
  created_at timestamptz not null default now()
);
create index avatar_upload_owner on profile_avatar_uploads(user_id,fingerprint);
create index avatar_upload_cleanup on profile_avatar_uploads(backend,state,expires_at);
create index users_avatar_reference on users using hash(avatar_url) where avatar_url is not null;
alter table profile_avatar_uploads enable row level security;
revoke all on profile_avatar_uploads from public,anon,authenticated;
grant select,insert,update,delete on profile_avatar_uploads to service_role;

create function begin_avatar_upload(p_user_id uuid,p_hash text,p_backend text,p_bucket text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare profile users;upload profile_avatar_uploads;upload_id uuid:=gen_random_uuid();
begin
  if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_backend is null or p_backend not in ('s3','supabase') or p_bucket is null or length(p_bucket) not between 1 and 128 then raise exception 'Invalid avatar upload' using errcode='P1004';end if;
  select * into profile from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  select * into upload from profile_avatar_uploads where user_id=p_user_id and fingerprint=p_hash and backend=p_backend and bucket=p_bucket
    and ((state in ('pending','uploaded') and expires_at>now()) or (state='committed' and public_url=profile.avatar_url)) order by created_at desc limit 1;
  if found then return to_jsonb(upload);end if;
  if (select count(*) from profile_avatar_uploads where user_id=p_user_id and state in ('pending','uploaded') and expires_at>now())>=10 then raise exception 'Too many staged avatars' using errcode='P1001';end if;
  insert into profile_avatar_uploads(id,user_id,fingerprint,backend,bucket,path) values(upload_id,p_user_id,p_hash,p_backend,p_bucket,'avatars/'||p_user_id::text||'/'||upload_id::text||'.webp') returning * into upload;
  return to_jsonb(upload);
end $$;

create function finish_avatar_upload(p_user_id uuid,p_upload_id uuid,p_public_url text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare upload profile_avatar_uploads;
begin
  if p_public_url is null or length(p_public_url)>2048 or p_public_url !~ '^https?://' then raise exception 'Invalid avatar URL' using errcode='P1004';end if;
  perform 1 from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  select * into upload from profile_avatar_uploads where id=p_upload_id and user_id=p_user_id for update;
  if not found or upload.state not in ('pending','uploaded','committed') or (upload.state<>'committed' and upload.expires_at<=now()) then raise exception 'Upload expired or unavailable' using errcode='P1001';end if;
  if upload.public_url is not null and upload.public_url<>p_public_url then raise exception 'Avatar URL changed' using errcode='P1001';end if;
  if upload.state='pending' then update profile_avatar_uploads set state='uploaded',public_url=p_public_url where id=p_upload_id;end if;
  return true;
end $$;

alter function update_profile_atomic(uuid,jsonb,text) rename to update_profile_055;
revoke all on function update_profile_055(uuid,jsonb,text) from public,anon,authenticated,service_role;
create function update_profile_atomic(p_user_id uuid,p_changes jsonb,p_pin_hash text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare profile users;upload profile_avatar_uploads;changes jsonb:=p_changes-'avatar_upload_id';result jsonb;
begin
  select * into profile from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  if p_changes?'avatar_upload_id' then
    if coalesce(p_changes->>'avatar_upload_id','') !~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$' then raise exception 'Invalid avatar reference' using errcode='P1004';end if;
    select * into upload from profile_avatar_uploads where id=(p_changes->>'avatar_upload_id')::uuid and user_id=p_user_id for update;
    if not found or upload.public_url is null or upload.state not in ('uploaded','committed') or (upload.state='uploaded' and upload.expires_at<=now()) then raise exception 'Avatar expired or unavailable' using errcode='P1001';end if;
    if changes?'avatar_url' and changes->>'avatar_url' is distinct from upload.public_url then raise exception 'Conflicting avatar reference' using errcode='P1004';end if;
    changes:=jsonb_set(changes,'{avatar_url}',to_jsonb(upload.public_url));
  elsif changes?'avatar_url' and changes->>'avatar_url' is not null and changes->>'avatar_url' is distinct from profile.avatar_url then raise exception 'Use an owned avatar upload' using errcode='P1004';end if;
  result:=update_profile_055(p_user_id,changes,p_pin_hash);
  if changes?'avatar_url' then
    update profile_avatar_uploads set state='abandoned',expires_at=now() where user_id=p_user_id and state='committed' and public_url is distinct from changes->>'avatar_url';
    if upload.id is not null then update profile_avatar_uploads set state='committed' where id=upload.id;end if;
    if profile.avatar_url is distinct from changes->>'avatar_url' then insert into security_events(user_id,event_type,metadata) values(p_user_id,'avatar_changed',jsonb_build_object('upload_id',upload.id));end if;
  end if;
  return result;
end $$;

create function claim_avatar_cleanup(p_backend text,p_limit integer default 5)
returns setof profile_avatar_uploads language sql security definer set search_path=public,pg_temp as $$
  with candidates as (
    select a.id from profile_avatar_uploads a where a.backend=p_backend
      and ((a.state in ('pending','uploaded','committed','abandoned') and a.expires_at<=now()) or (a.state='deleting' and a.claimed_until<=now()))
      and not exists(select 1 from users u where u.avatar_url=a.public_url)
      order by a.expires_at limit greatest(1,least(coalesce(p_limit,5),20)) for update skip locked
  ) update profile_avatar_uploads a set state='deleting',claim_token=gen_random_uuid(),claimed_until=now()+interval '2 minutes'
    from candidates c where a.id=c.id returning a.*;
$$;
create function finish_avatar_cleanup(p_id uuid,p_claim uuid,p_success boolean)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_success then
    delete from profile_avatar_uploads where id=p_id and state='deleting' and claim_token=p_claim and claimed_until>now();
    return found or not exists(select 1 from profile_avatar_uploads where id=p_id);
  end if;
  update profile_avatar_uploads set state='abandoned',claimed_until=null,claim_token=null,expires_at=now()+interval '15 minutes'
    where id=p_id and state='deleting' and claim_token=p_claim and claimed_until>now();
  return found;
end $$;
revoke all on function begin_avatar_upload(uuid,text,text,text),finish_avatar_upload(uuid,uuid,text),update_profile_atomic(uuid,jsonb,text),claim_avatar_cleanup(text,integer),finish_avatar_cleanup(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function begin_avatar_upload(uuid,text,text,text),finish_avatar_upload(uuid,uuid,text),update_profile_atomic(uuid,jsonb,text),claim_avatar_cleanup(text,integer),finish_avatar_cleanup(uuid,uuid,boolean) to service_role;
do $storage$ begin
  if to_regclass('storage.objects') is not null then
    execute 'create policy avatar_insert_requires_service on storage.objects as restrictive for insert to anon,authenticated with check(bucket_id<>''avatars'')';
    execute 'create policy avatar_update_requires_service on storage.objects as restrictive for update to anon,authenticated using(bucket_id<>''avatars'') with check(bucket_id<>''avatars'')';
    execute 'create policy avatar_delete_requires_service on storage.objects as restrictive for delete to anon,authenticated using(bucket_id<>''avatars'')';
  end if;
end $storage$;
notify pgrst,'reload schema';
