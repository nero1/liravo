create table social_intents (
  actor_id uuid not null references users(id),
  action text not null,
  intent_key text not null,
  target_id uuid not null,
  result boolean not null,
  primary key(actor_id,action,intent_key)
);
create table social_rewards (
  actor_id uuid not null references users(id),
  action text not null,
  target_id uuid not null,
  primary key(actor_id,action,target_id)
);
alter table social_intents enable row level security;
alter table social_rewards enable row level security;
create or replace function apply_social_intent(p_actor_id uuid,p_target_id uuid,p_action text,p_key text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare previous social_intents; owner_id uuid; active boolean; affected integer;
begin
  if p_action not in ('follow','unfollow','like') or length(p_key) not between 8 and 200 then raise exception 'Invalid action'; end if;
  -- One lock order for actor/recipient updates avoids cross-user reward deadlocks.
  if p_action in ('follow','unfollow') then owner_id:=p_target_id;
  else select user_id into owner_id from reviews where id=p_target_id; end if;
  perform 1 from users where id in (p_actor_id,owner_id) order by id for update;
  select * into previous from social_intents where actor_id=p_actor_id and action=p_action and intent_key=p_key;
  if found then
    if previous.target_id<>p_target_id then raise exception 'Conflicting intent'; end if;
    return previous.result;
  end if;
  if p_action='unfollow' then
    delete from follows where follower_id=p_actor_id and following_id=p_target_id;
    active:=false;
  elsif p_action='follow' then
    if p_actor_id=p_target_id then raise exception 'Cannot follow self'; end if;
    perform 1 from users where id=p_target_id and not is_suspended;
    if not found then raise exception 'Unavailable target'; end if;
    insert into follows(follower_id,following_id) values(p_actor_id,p_target_id) on conflict do nothing;
    get diagnostics affected=row_count;
    active:=true; owner_id:=p_target_id;
    if affected>0 then
      insert into notifications(user_id,type,actor_id,entity_type,entity_id,message)
        values(p_target_id,'follow',p_actor_id,'user',p_actor_id,'You have a new follower.');
      insert into outbox_events(aggregate_type,aggregate_id,event_type,payload) values('follow',p_actor_id::text||':'||p_target_id::text,'push_notification',jsonb_build_object('userId',p_target_id,'title','New Follower','body','You have a new follower.','url','/notifications'));
    end if;
  else
    select user_id into owner_id from reviews where id=p_target_id for update;
    if not found then raise exception 'Unknown review'; end if;
    delete from review_likes where review_id=p_target_id and user_id=p_actor_id;
    get diagnostics affected=row_count;
    active:=affected=0;
    if active then insert into review_likes(review_id,user_id) values(p_target_id,p_actor_id); end if;
    update reviews set likes_count=(select count(*) from review_likes where review_id=p_target_id) where id=p_target_id;
  end if;
  if active then
    insert into social_rewards values(p_actor_id,p_action,p_target_id) on conflict do nothing;
    if found then
      update users set xp=xp+2 where id=p_actor_id;
      if owner_id<>p_actor_id then update users set xp=xp+5 where id=owner_id; end if;
    end if;
  end if;
  insert into social_intents values(p_actor_id,p_action,p_key,p_target_id,active);
  return active;
end $$;
revoke all on function apply_social_intent(uuid,uuid,text,text) from public;
grant execute on function apply_social_intent(uuid,uuid,text,text) to service_role;
revoke all on function toggle_review_like_atomic(uuid,uuid) from public;
