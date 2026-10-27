alter table ai_taste_profiles add column profile_data jsonb;
alter table ai_taste_profiles add column policy_version text;
alter table ai_taste_profiles add column source_hash text;
alter table ai_taste_profiles add column locale text;
alter table ai_taste_profiles add column provider text;
alter table writing_plans add column tasks jsonb;
alter table writing_plans add column policy_version text;
alter table writing_plans add column source_hash text;
alter table writing_plans add column locale text;
alter table writing_plans add column provider text;
revoke insert,update,delete on ai_taste_profiles,writing_plans from anon,authenticated;
grant select,insert,update on ai_taste_profiles,writing_plans to service_role;

create function taste_profile_input(p_user_id uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  with finished as(
    select sb.book_id,max(sb.finished_at) as finished_at from shelf_books sb join shelves s on s.id=sb.shelf_id
    where sb.user_id=p_user_id and s.user_id=p_user_id and s.default_type='have_read' and sb.finished_at is not null group by sb.book_id
  ), recent as(select * from finished order by finished_at desc,book_id limit 20), entries as(
    select b.id,left(b.title,500) as title,b.genres[1:10] as genres,r.finished_at,
      (select jsonb_build_object('rating',v.rating,'moods',v.mood_tags[1:10]) from reviews v where v.user_id=p_user_id and v.book_id=b.id order by v.created_at desc,v.id desc limit 1) as review
    from recent r join books b on b.id=r.book_id
  ) select jsonb_build_object('locale',case when u.preferred_locale in ('en','fr','de') then u.preferred_locale else 'en' end,'books',coalesce((select jsonb_agg(to_jsonb(e) order by e.finished_at desc,e.id) from entries e),'[]'::jsonb)) from users u where u.id=p_user_id;
$$;
create function writing_plan_input(p_user_id uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('locale',case when u.preferred_locale in ('en','fr','de') then u.preferred_locale else 'en' end,'genres',u.genres[1:5],'user_types',u.user_types,
    'challenges',coalesce((select jsonb_agg(c.title order by c.id) from(select c.id,left(c.title,200) as title from writing_challenges c join writing_challenge_participants p on p.challenge_id=c.id where p.user_id=u.id order by p.joined_at desc,c.id limit 5)c),'[]'::jsonb)) from users u where u.id=p_user_id;
$$;
create function save_taste_profile(p_user_id uuid,p_source jsonb,p_hash text,p_policy text,p_profile jsonb,p_provider text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result ai_taste_profiles;
begin
  perform 1 from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found or not has_premium_access(p_user_id) then raise exception 'Premium required' using errcode='P1003'; end if;
  if taste_profile_input(p_user_id) is distinct from p_source then raise exception 'Reading data changed' using errcode='P1001'; end if;
  if jsonb_array_length(p_source->'books')<3 then raise exception 'Insufficient reading history' using errcode='P1004'; end if;
  if length(p_hash)<>64 or p_policy is null or p_provider not in ('deepseek','gemini') or jsonb_typeof(p_profile)<>'object' or length(coalesce(p_profile->>'summary','')) not between 1 and 4000 then raise exception 'Invalid profile' using errcode='P1004'; end if;
  select * into result from ai_taste_profiles where user_id=p_user_id;
  if found and result.source_hash=p_hash and result.policy_version=p_policy and result.generated_at>now()-interval '24 hours' then return to_jsonb(result); end if;
  insert into ai_taste_profiles(user_id,profile_text,profile_data,policy_version,source_hash,locale,provider)
    values(p_user_id,p_profile->>'summary',p_profile,p_policy,p_hash,p_source->>'locale',p_provider)
    on conflict(user_id) do update set profile_text=excluded.profile_text,profile_data=excluded.profile_data,policy_version=excluded.policy_version,source_hash=excluded.source_hash,locale=excluded.locale,provider=excluded.provider,generated_at=now() returning * into result;
  return to_jsonb(result);
end $$;
create function save_writing_plan(p_user_id uuid,p_week date,p_source jsonb,p_hash text,p_policy text,p_tasks jsonb,p_provider text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result writing_plans; current_week date:=date_trunc('week',now() at time zone 'UTC')::date;
begin
  perform 1 from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found or not has_premium_access(p_user_id) then raise exception 'Premium required' using errcode='P1003'; end if;
  if not exists(select 1 from users where id=p_user_id and 'newbie_writer'=any(user_types)) then raise exception 'Writer access required' using errcode='P1003'; end if;
  if p_week is distinct from current_week or writing_plan_input(p_user_id) is distinct from p_source then raise exception 'Writing data changed' using errcode='P1001'; end if;
  if length(p_hash)<>64 or p_policy is null or p_provider not in ('deepseek','gemini') or jsonb_typeof(p_tasks)<>'array' or jsonb_array_length(p_tasks)<>7 then raise exception 'Invalid writing plan' using errcode='P1004'; end if;
  select * into result from writing_plans where user_id=p_user_id and week_start=p_week;
  if found and result.source_hash=p_hash and result.policy_version=p_policy then return to_jsonb(result); end if;
  insert into writing_plans(user_id,week_start,plan_text,tasks,policy_version,source_hash,locale,provider)
    values(p_user_id,p_week,p_tasks::text,p_tasks,p_policy,p_hash,p_source->>'locale',p_provider)
    on conflict(user_id,week_start) do update set plan_text=excluded.plan_text,tasks=excluded.tasks,policy_version=excluded.policy_version,source_hash=excluded.source_hash,locale=excluded.locale,provider=excluded.provider,created_at=now() returning * into result;
  return to_jsonb(result);
end $$;
revoke all on function taste_profile_input(uuid),writing_plan_input(uuid),save_taste_profile(uuid,jsonb,text,text,jsonb,text),save_writing_plan(uuid,date,jsonb,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function taste_profile_input(uuid),writing_plan_input(uuid),save_taste_profile(uuid,jsonb,text,text,jsonb,text),save_writing_plan(uuid,date,jsonb,text,text,jsonb,text) to service_role;
notify pgrst,'reload schema';

create function update_profile_atomic(p_user_id uuid,p_changes jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare current_profile users; changed users;
begin
  if jsonb_typeof(p_changes)<>'object' or p_changes='{}'::jsonb or exists(select 1 from jsonb_object_keys(p_changes) as field where field not in ('username','display_name','bio','country','avatar_url','external_links','user_types','genres','onboarding_complete')) then raise exception 'Invalid profile fields' using errcode='P1004'; end if;
  select * into current_profile from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003'; end if;
  changed:=jsonb_populate_record(current_profile,p_changes);
  if changed.username !~ '^[a-z0-9_]{3,30}$' or length(changed.display_name) not between 1 and 50 or length(changed.bio)>280 or cardinality(changed.external_links)>3
    or cardinality(changed.user_types) not between 1 and 4 or not changed.user_types<@array['reader','author','newbie_writer','creator']::text[]
    or cardinality(changed.genres)>20 then raise exception 'Invalid profile' using errcode='P1004'; end if;
  if changed.onboarding_complete and cardinality(changed.genres)<5 then raise exception 'Choose at least five genres' using errcode='P1004'; end if;
  update users set username=changed.username,display_name=changed.display_name,bio=changed.bio,country=changed.country,avatar_url=changed.avatar_url,
    external_links=changed.external_links,user_types=changed.user_types,genres=changed.genres,onboarding_complete=changed.onboarding_complete where id=p_user_id returning * into changed;
  return to_jsonb(changed);
end $$;
revoke all on function update_profile_atomic(uuid,jsonb) from public,anon,authenticated;
grant execute on function update_profile_atomic(uuid,jsonb) to service_role;
notify pgrst,'reload schema';

create function ai_profile_authorized(p_kind text)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select has_premium_access(auth.uid()) and exists(select 1 from users where id=auth.uid() and not is_banned and deleted_at is null and (p_kind='taste' or p_kind='writing' and 'newbie_writer'=any(user_types)));
$$;
revoke all on function ai_profile_authorized(text) from public,anon;
grant execute on function ai_profile_authorized(text) to authenticated,service_role;
create policy paid_taste_profile on ai_taste_profiles as restrictive for select to authenticated using(ai_profile_authorized('taste'));
create policy paid_writing_plan on writing_plans as restrictive for select to authenticated using(ai_profile_authorized('writing'));
