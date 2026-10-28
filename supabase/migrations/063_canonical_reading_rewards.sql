create table reading_completions(
  user_id uuid not null references users(id) on delete cascade,
  book_id uuid not null references books(id) on delete cascade,
  source text not null check(source in ('interactive','history')),
  completed_at timestamptz not null default now(),
  primary key(user_id,book_id)
);
alter table reading_completions enable row level security;
revoke all on reading_completions from public,anon,authenticated;
grant select on reading_completions to service_role;
insert into reading_completions(user_id,book_id,source)
  select distinct sb.user_id,sb.book_id,'history' from shelf_books sb join shelves s on s.id=sb.shelf_id and s.user_id=sb.user_id where s.default_type='have_read' on conflict do nothing;
insert into reading_completions(user_id,book_id,source)
  select x.user_id,b.id,'history' from xp_ledger x join books b on x.event_key='finish_book:'||b.id::text where x.reason='finish_book' on conflict do nothing;
create function retain_reading_completion()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if exists(select 1 from shelves where id=new.shelf_id and user_id=new.user_id and default_type='have_read') then
    insert into reading_completions(user_id,book_id,source) values(new.user_id,new.book_id,'history') on conflict do nothing;
  end if;
  return new;
end $$;
create trigger retain_reading_completion after insert or update of shelf_id,book_id,user_id,finished_at on shelf_books for each row execute function retain_reading_completion();
revoke all on function retain_reading_completion() from public,anon,authenticated;

create function claim_reading_reward(p_user_id uuid,p_action text,p_book_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare profile users;reward jsonb;
begin
  select * into profile from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  if p_action='daily_login' and p_book_id is null then
    return award_xp_once(p_user_id,3,'daily_login','daily_login:'||(now() at time zone 'UTC')::date);
  elsif p_action='finish_book' and p_book_id is not null then
    if not exists(select 1 from reading_completions where user_id=p_user_id and book_id=p_book_id and source='interactive')
      or not exists(select 1 from shelf_books sb join shelves s on s.id=sb.shelf_id and s.user_id=p_user_id where sb.user_id=p_user_id and sb.book_id=p_book_id and s.default_type='have_read' and sb.finished_at is not null) then
      return jsonb_build_object('xp',profile.xp,'awarded',0);
    end if;
    reward:=award_xp_once(p_user_id,50,'finish_book','finish_book:'||p_book_id);
    if (reward->>'awarded')::integer>0 then
      insert into outbox_events(aggregate_type,aggregate_id,event_type,payload) values('reading_completions',p_user_id::text||':'||p_book_id::text,'check_badges',jsonb_build_object('userId',p_user_id,'trigger','finish_book'));
      insert into outbox_events(aggregate_type,aggregate_id,event_type,payload) values('reading_completions',p_user_id::text||':'||p_book_id::text,'check_badges',jsonb_build_object('userId',p_user_id,'trigger','finish_book_genre'));
    end if;
    return reward;
  end if;
  raise exception 'Invalid reading reward' using errcode='P1004';
end $$;

alter function set_shelf_membership(uuid,uuid,uuid,boolean) rename to set_shelf_membership_045;
revoke all on function set_shelf_membership_045(uuid,uuid,uuid,boolean) from public,anon,authenticated,service_role;
create function set_shelf_membership(p_user_id uuid,p_shelf_id uuid,p_book_id uuid,p_add boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare target shelves;result jsonb;reward jsonb;
begin
  if p_add is null then raise exception 'Invalid membership' using errcode='P1004';end if;
  perform 1 from users where id=p_user_id and not is_banned and deleted_at is null for update;if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  perform 1 from books where id=p_book_id for update;if not found then raise exception 'Book not found' using errcode='P1005';end if;
  select * into target from shelves where id=p_shelf_id and user_id=p_user_id for update;if not found then raise exception 'Shelf not found' using errcode='P1005';end if;
  if p_add and target.default_type='have_read' then insert into reading_completions(user_id,book_id,source) values(p_user_id,p_book_id,'interactive') on conflict do nothing;end if;
  result:=set_shelf_membership_045(p_user_id,p_shelf_id,p_book_id,p_add);
  if p_add and target.default_type='have_read' then
    update shelf_books set finished_at=coalesce(finished_at,(now() at time zone 'UTC')::date) where user_id=p_user_id and shelf_id=p_shelf_id and book_id=p_book_id;
    update users set books_read_count=count_verified_books(p_user_id) where id=p_user_id;
    reward:=claim_reading_reward(p_user_id,'finish_book',p_book_id);
  else select jsonb_build_object('xp',xp,'awarded',0) into reward from users where id=p_user_id;end if;
  return result||jsonb_build_object('xp_awarded',(reward->>'awarded')::integer,'new_total',(reward->>'xp')::integer);
end $$;

create function apply_shelf_membership_intent(p_user_id uuid,p_shelf_id uuid,p_book_id uuid,p_add boolean,p_key text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare previous content_intents;fingerprint text:=jsonb_build_array(p_shelf_id,p_book_id,p_add)::text;result jsonb;
begin
  if p_key is null or length(p_key) not between 8 and 200 then raise exception 'Invalid shelf intent' using errcode='P1004';end if;
  perform 1 from users where id=p_user_id and not is_banned and deleted_at is null for update;if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  select * into previous from content_intents where actor_id=p_user_id and action='shelf:membership' and intent_key=p_key;
  if found then if previous.fingerprint<>fingerprint then raise exception 'Conflicting shelf intent' using errcode='P1001';end if;return previous.response;end if;
  result:=set_shelf_membership(p_user_id,p_shelf_id,p_book_id,p_add);
  insert into content_intents values(p_user_id,'shelf:membership',p_key,fingerprint,result);return result;
end $$;
revoke all on function claim_reading_reward(uuid,text,uuid),set_shelf_membership(uuid,uuid,uuid,boolean),apply_shelf_membership_intent(uuid,uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function claim_reading_reward(uuid,text,uuid),set_shelf_membership(uuid,uuid,uuid,boolean),apply_shelf_membership_intent(uuid,uuid,uuid,boolean,text) to service_role;
revoke insert,update,delete on shelf_books from anon,authenticated;

create unique index review_conversion_xp_event on outbox_events(aggregate_id) where aggregate_type='review_conversions' and event_type='award_xp';
create function queue_review_conversion_reward()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.reviewer_id is not null then
    insert into outbox_events(aggregate_type,aggregate_id,event_type,payload) values('review_conversions',new.actor_id::text||':'||new.book_id::text,'award_xp',jsonb_build_object('userId',new.reviewer_id,'amount',5,'reason','want_to_read_received','eventKey','review-conversion:'||new.actor_id||':'||new.book_id));
  end if;
  return new;
end $$;
create trigger queue_review_conversion_reward after insert on review_conversions for each row execute function queue_review_conversion_reward();
revoke all on function queue_review_conversion_reward() from public,anon,authenticated;
insert into outbox_events(aggregate_type,aggregate_id,event_type,payload)
  select 'review_conversions',actor_id::text||':'||book_id::text,'award_xp',jsonb_build_object('userId',reviewer_id,'amount',5,'reason','want_to_read_received','eventKey','review-conversion:'||actor_id||':'||book_id)
  from review_conversions where reviewer_id is not null on conflict do nothing;
notify pgrst,'reload schema';
