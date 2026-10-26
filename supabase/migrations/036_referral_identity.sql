create function guard_referral_identity()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if auth.role() in ('authenticated','anon') and (new.referral_code is distinct from old.referral_code or new.referred_by is distinct from old.referred_by) then
    raise exception 'Referral identity requires service authorization';
  end if;
  return new;
end $$;
create trigger users_referral_identity before update on users for each row execute function guard_referral_identity();

create function attribute_referral_atomic(p_user_id uuid,p_code text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare referrer uuid; existing uuid;
begin
  if p_code is null or length(p_code) not between 1 and 100 then return null; end if;
  select id into referrer from users where referral_code=p_code and id<>p_user_id and not is_banned;
  if not found then return null; end if;
  perform 1 from users where id in (p_user_id,referrer) order by id for update;
  select referred_by into existing from users where id=p_user_id;
  if not found then raise exception 'Unknown user' using errcode='P1003'; end if;
  if existing is not null then return existing; end if;
  update users set referred_by=referrer where id=p_user_id;
  insert into referrals(referrer_id,referred_id) values(referrer,p_user_id);
  perform award_xp_once(referrer,200,'referral_signup','referral-signup:'||p_user_id);
  insert into notifications(user_id,type,actor_id,entity_type,entity_id,message)
    values(referrer,'referral',p_user_id,'user',p_user_id,'Someone signed up using your referral link! +200 XP');
  return referrer;
end $$;
revoke all on function attribute_referral_atomic(uuid,text) from public;
do $$ declare role_name text; begin
  foreach role_name in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname=role_name) then
      execute format('revoke all on function attribute_referral_atomic(uuid,text) from %I',role_name);
    end if;
  end loop;
end $$;
grant execute on function attribute_referral_atomic(uuid,text) to service_role;
