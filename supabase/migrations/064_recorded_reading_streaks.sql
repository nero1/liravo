create index reading_session_activity_days on reading_sessions(user_id,((created_at at time zone 'UTC')::date));
create table reading_activity_days(user_id uuid not null references users(id) on delete cascade,activity_date date not null,primary key(user_id,activity_date));
alter table reading_activity_days enable row level security;
revoke all on reading_activity_days from public,anon,authenticated;
grant select on reading_activity_days to service_role;
grant select(max_reading_streak) on users to anon,authenticated;
insert into reading_activity_days select distinct user_id,(created_at at time zone 'UTC')::date from reading_sessions where created_at<=clock_timestamp();
create function rebuild_reading_streak(p_user_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare profile users;after_profile users;day date;last_day date;streak integer:=0;maximum integer:=0;tokens integer:=0;missed integer;reward integer;
  expected jsonb:='{}';entry record;removed jsonb;removed_total integer;
begin
  select * into profile from users where id=p_user_id for update;if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  for day in select activity_date from reading_activity_days where user_id=p_user_id and activity_date<=(now() at time zone 'UTC')::date order by 1 loop
    missed:=greatest(0,day-last_day-1);
    if last_day is null or missed>tokens then streak:=1;else streak:=streak+1;tokens:=tokens-missed;end if;
    if streak in (7,30) then
      tokens:=tokens+1;reward:=case when streak=7 then 50 else 200 end;
      expected:=expected||jsonb_build_object('streak:reading:'||day,jsonb_build_object('amount',reward,'reason','reading_streak_'||streak));
    end if;
    maximum:=greatest(maximum,streak);last_day:=day;
  end loop;
  with deleted as (
    delete from xp_ledger x where user_id=p_user_id and event_key like 'streak:reading:%' and reason in ('reading_streak_7','reading_streak_30')
      and (not(expected?event_key) or amount<>(expected->event_key->>'amount')::integer or reason<>expected->event_key->>'reason') returning x.*
  ) select coalesce(sum(amount),0)::integer,coalesce(jsonb_agg(to_jsonb(deleted)),'[]'::jsonb) into removed_total,removed from deleted;
  if removed_total>0 then update users set xp=greatest(0,xp-removed_total) where id=p_user_id;end if;
  for entry in select key,value from jsonb_each(expected) loop perform award_xp_once(p_user_id,(entry.value->>'amount')::integer,entry.value->>'reason',entry.key);end loop;
  update users set reading_streak=streak,last_streak_date=last_day,streak_freeze_tokens=tokens,max_reading_streak=maximum where id=p_user_id returning * into after_profile;
  if (profile.reading_streak,profile.last_streak_date,profile.streak_freeze_tokens,profile.max_reading_streak,profile.xp)
    is distinct from (after_profile.reading_streak,after_profile.last_streak_date,after_profile.streak_freeze_tokens,after_profile.max_reading_streak,after_profile.xp) then
    insert into financial_audit_log(actor_user_id,action,correlation_id,metadata) values(p_user_id,'reading_streak_reconciled','recorded-reading-dates',jsonb_build_object(
      'before',jsonb_build_object('streak',profile.reading_streak,'lastDay',profile.last_streak_date,'freezeTokens',profile.streak_freeze_tokens,'maximum',profile.max_reading_streak,'xp',profile.xp),
      'after',jsonb_build_object('streak',streak,'lastDay',last_day,'freezeTokens',tokens,'maximum',maximum,'xp',after_profile.xp),'removedRewards',removed));
  end if;
end $$;

create function record_reading_activity_day()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform 1 from users where id=new.user_id and not is_banned and deleted_at is null for update;if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  if new.created_at<=clock_timestamp() then
    insert into reading_activity_days(user_id,activity_date) values(new.user_id,(new.created_at at time zone 'UTC')::date) on conflict do nothing;
    perform rebuild_reading_streak(new.user_id);
  end if;
  return new;
end $$;
create trigger aa_record_reading_activity_day before insert on reading_sessions for each row execute function record_reading_activity_day();
revoke all on function record_reading_activity_day() from public,anon,authenticated;

alter function process_outbox_event_atomic(uuid) rename to process_outbox_event_atomic_042;
revoke all on function process_outbox_event_atomic_042(uuid) from public,anon,authenticated,service_role;
create function process_outbox_event_atomic(p_event_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare event outbox_events;session reading_sessions;
begin
  select * into event from outbox_events where id=p_event_id for update;
  if not found then raise exception 'Unknown outbox event';end if;
  if event.aggregate_type<>'reading_sessions' or event.event_type<>'award_xp' then return process_outbox_event_atomic_042(p_event_id);end if;
  if event.status='processed' then return false;end if;
  if event.status<>'processing' then raise exception 'Event must be claimed';end if;
  select * into session from reading_sessions where id=event.aggregate_id::uuid;
  if found then
    if session.created_at<=clock_timestamp() then insert into reading_activity_days(user_id,activity_date) values(session.user_id,(session.created_at at time zone 'UTC')::date) on conflict do nothing;end if;
    perform award_xp_once(session.user_id,5,'reading_session','reading-session:'||session.id);
    perform rebuild_reading_streak(session.user_id);
  end if;
  update outbox_events set status='processed',processed_at=now(),last_error=null where id=p_event_id;return true;
end $$;
revoke all on function rebuild_reading_streak(uuid),process_outbox_event_atomic(uuid) from public,anon,authenticated;
grant execute on function process_outbox_event_atomic(uuid) to service_role;
revoke insert,update,delete on reading_sessions from anon,authenticated;

create or replace function guard_content_intent()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid; amount integer; reason text; event_key text;
begin
  if new.idempotency_key is null then return new; end if;
  if length(new.idempotency_key) not between 8 and 200 or new.request_hash !~ '^[a-f0-9]{64}$' or new.request_hash is null then raise exception 'Invalid content intent'; end if;
  actor:=(to_jsonb(new)->>tg_argv[0])::uuid;
  if tg_when='BEFORE' then
    perform 1 from users where id=actor and not is_banned and deleted_at is null for update;
    if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
    if exists(select 1 from content_intents where actor_id=actor and action=tg_table_name and intent_key=new.idempotency_key) then
      raise exception 'Content intent already committed' using errcode='23505';
    end if;
  else
    insert into content_intents values(actor,tg_table_name,new.idempotency_key,new.request_hash,to_jsonb(new)-'idempotency_key'-'request_hash');
    case tg_table_name
      when 'reviews' then amount:=20; reason:='write_review'; event_key:='review:'||(to_jsonb(new)->>'book_id');
      when 'quotes' then amount:=10; reason:='post_quote'; event_key:='quote:'||new.id;
      when 'buddy_reads' then insert into buddy_read_members(buddy_read_id,user_id) values(new.id,actor); amount:=25; reason:='start_buddy_read'; event_key:='buddy-read:'||new.id;
      when 'ask_writer_questions' then amount:=5; reason:='ask_question'; event_key:='question:'||new.id;
      when 'ask_writer_answers' then amount:=10; reason:='answer_question'; event_key:='answer:'||new.id;
      when 'reading_sessions' then amount:=5; reason:='reading_session'; event_key:='reading-session:'||new.id;
    end case;
    if tg_table_name='reading_sessions' then
      perform award_xp_once(actor,5,'reading_session',event_key);
      insert into outbox_events(aggregate_type,aggregate_id,event_type,payload) values(tg_table_name,new.id::text,'check_badges',jsonb_build_object('userId',actor,'trigger','streak'));
    else
    insert into outbox_events(aggregate_type,aggregate_id,event_type,payload)
      values(tg_table_name,new.id::text,'award_xp',jsonb_build_object('userId',actor,'amount',amount,'reason',reason,'eventKey',event_key,'readingStreak',false));
    end if;
  end if;
  return new;
end $$;

do $$declare actor uuid;begin
  for actor in select id from users where reading_streak>0 or max_reading_streak>0 or streak_freeze_tokens>0
    union select user_id from reading_sessions
    union select user_id from xp_ledger where event_key like 'streak:reading:%' and reason in ('reading_streak_7','reading_streak_30') loop
    perform rebuild_reading_streak(actor);
  end loop;
end $$;
notify pgrst,'reload schema';
