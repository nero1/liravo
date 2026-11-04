alter function apply_social_intent(uuid,uuid,text,text)rename to apply_social_intent_before096;
create function apply_social_intent(p_actor_id uuid,p_target_id uuid,p_action text,p_key text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare previous social_intents;
begin
 if p_action in('follow','unfollow')then
  if p_key is null or length(p_key)not between 8 and 200 or p_target_id is null or p_target_id=p_actor_id then raise exception 'Invalid follow intent' using errcode='P1004';end if;
  perform 1 from users where id in(p_actor_id,p_target_id)order by id for update;
  if not exists(select 1 from users where id=p_actor_id and not is_banned and deleted_at is null)then raise exception 'Account unavailable' using errcode='P1003';end if;
  if not exists(select 1 from users where id=p_target_id and(p_action='unfollow'or(not is_banned and deleted_at is null)))then raise exception 'Reader unavailable' using errcode='P1005';end if;
  select * into previous from social_intents where actor_id=p_actor_id and action in('follow','unfollow')and intent_key=p_key limit 1;
  if found and(previous.target_id<>p_target_id or previous.action<>p_action)then raise exception 'Conflicting follow intent' using errcode='P1001';end if;
 end if;
 return apply_social_intent_before096(p_actor_id,p_target_id,p_action,p_key);
end $$;
create function follow_intent_snapshot(p_actor uuid,p_target uuid,p_key text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare receipt social_intents;
begin
 if not exists(select 1 from users where id=p_actor and not is_banned and deleted_at is null)then raise exception 'Account unavailable' using errcode='P1003';end if;
 if p_target is null or p_key is null or length(p_key)not between 8 and 200 then raise exception 'Invalid receipt' using errcode='P1004';end if;
 if(select count(*)from social_intents where actor_id=p_actor and action in('follow','unfollow')and intent_key=p_key)>1 then raise exception 'Ambiguous legacy receipt' using errcode='P1001';end if;
 select * into receipt from social_intents where actor_id=p_actor and target_id=p_target and action in('follow','unfollow')and intent_key=p_key;
 if not found or not exists(select 1 from users where id=p_target and(receipt.action='unfollow'or(not is_banned and deleted_at is null)))then raise exception 'Receipt unavailable' using errcode='P1005';end if;
 return jsonb_build_object('actorId',p_actor,'targetId',p_target,'requestKey',p_key,'action',receipt.action,'committedFollowing',receipt.result,'following',exists(select 1 from follows where follower_id=p_actor and following_id=p_target));
end $$;
create function apply_follow_intent_snapshot(p_actor uuid,p_target uuid,p_action text,p_key text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_action is null or p_action not in('follow','unfollow')then raise exception 'Invalid follow action' using errcode='P1004';end if;
 perform apply_social_intent(p_actor,p_target,p_action,p_key);
 return follow_intent_snapshot(p_actor,p_target,p_key);
end $$;
delete from follows f using users actor,users target where actor.id=f.follower_id and target.id=f.following_id and(actor.is_banned or actor.deleted_at is not null or target.is_banned or target.deleted_at is not null);
revoke insert,update,delete on follows from anon,authenticated;
revoke all on function apply_social_intent_before096(uuid,uuid,text,text),apply_social_intent(uuid,uuid,text,text),follow_intent_snapshot(uuid,uuid,text),apply_follow_intent_snapshot(uuid,uuid,text,text)from public,anon,authenticated;
revoke all on function apply_social_intent_before096(uuid,uuid,text,text)from service_role;
grant execute on function apply_social_intent(uuid,uuid,text,text),follow_intent_snapshot(uuid,uuid,text),apply_follow_intent_snapshot(uuid,uuid,text,text)to service_role;
notify pgrst,'reload schema';
update affiliate_stores set countries=array(select distinct case when country='UK'then'GB'else country end from unnest(countries)country order by 1)where 'UK'=any(countries);
