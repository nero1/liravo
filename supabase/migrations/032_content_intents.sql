create table content_intents (
  actor_id uuid not null references users(id) on delete cascade,
  action text not null,
  intent_key text not null,
  fingerprint text not null,
  response jsonb not null,
  primary key(actor_id,action,intent_key)
);
alter table content_intents enable row level security;
revoke all on content_intents from public;
do $$ declare role_name text; begin
  foreach role_name in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname=role_name) then
      execute format('revoke all on content_intents from %I',role_name);
    end if;
  end loop;
end $$;
grant select on content_intents to service_role;

alter table ask_writer_questions add column if not exists tags text[] not null default '{}';
alter table ask_writer_questions add column if not exists answer_count integer not null default 0;
update ask_writer_questions q set answer_count=(select count(*) from ask_writer_answers a where a.question_id=q.id);

do $$ declare legacy text; canonical text; begin
  for legacy,canonical in values ('creator_id','created_by'),('max_members','max_participants') loop
    if exists(select 1 from information_schema.columns where table_schema='public' and table_name='buddy_reads' and column_name=legacy) then
      if exists(select 1 from information_schema.columns where table_schema='public' and table_name='buddy_reads' and column_name=canonical) then
        raise exception 'Reconcile buddy_reads columns % and % before migrating',legacy,canonical;
      end if;
      execute format('alter table buddy_reads rename column %I to %I',legacy,canonical);
    end if;
  end loop;
end $$;
alter table buddy_reads add column if not exists current_chapter integer not null default 1;
alter table buddy_reads add column if not exists is_active boolean not null default true;

create function guard_buddy_membership()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare room buddy_reads;
begin
  select * into room from buddy_reads where id=new.buddy_read_id for update;
  if not found then raise exception 'Unknown buddy read' using errcode='P1005'; end if;
  if exists(select 1 from buddy_read_members where buddy_read_id=room.id and user_id=new.user_id) then return new; end if;
  if not room.is_active or (room.is_private and room.created_by<>new.user_id) then raise exception 'Buddy read unavailable' using errcode='P1005'; end if;
  if (select count(*) from buddy_read_members where buddy_read_id=room.id)>=room.max_participants then raise exception 'Buddy read full' using errcode='P1004'; end if;
  return new;
end $$;
create trigger buddy_membership_capacity before insert on buddy_read_members for each row execute function guard_buddy_membership();

create function guard_content_intent()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid; amount integer; reason text; event_key text;
begin
  if new.idempotency_key is null then return new; end if;
  if length(new.idempotency_key) not between 8 and 200 or new.request_hash !~ '^[a-f0-9]{64}$' or new.request_hash is null then raise exception 'Invalid content intent'; end if;
  actor:=(to_jsonb(new)->>tg_argv[0])::uuid;
  if tg_when='BEFORE' then
    perform 1 from users where id=actor for update;
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
    insert into outbox_events(aggregate_type,aggregate_id,event_type,payload)
      values(tg_table_name,new.id::text,'award_xp',jsonb_build_object('userId',actor,'amount',amount,'reason',reason,'eventKey',event_key,'readingStreak',tg_table_name='reading_sessions'));
  end if;
  return new;
end $$;
do $$ declare relation_name text; owner_column text; begin
  foreach relation_name in array array['reviews','quotes','buddy_reads','ask_writer_questions','ask_writer_answers','reading_sessions'] loop
    owner_column:=case when relation_name='buddy_reads' then 'created_by' else 'user_id' end;
    execute format('alter table %I add column idempotency_key text, add column request_hash text',relation_name);
    execute format('create trigger content_intent_guard before insert on %I for each row execute function guard_content_intent(%L)',relation_name,owner_column);
    execute format('create trigger content_intent_commit after insert on %I for each row execute function guard_content_intent(%L)',relation_name,owner_column);
  end loop;
end $$;

create function count_writer_answers()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='INSERT' then
    update ask_writer_questions set answer_count=answer_count+1 where id=new.question_id;
    return new;
  else
    update ask_writer_questions set answer_count=greatest(0,answer_count-1) where id=old.question_id;
    return old;
  end if;
end $$;
create trigger writer_answers_count after insert or delete on ask_writer_answers for each row execute function count_writer_answers();

create or replace function process_outbox_event_atomic(p_event_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare e outbox_events;
begin
  select * into e from outbox_events where id=p_event_id for update;
  if not found then raise exception 'Unknown outbox event'; end if;
  if e.status='processed' then return false; end if;
  if e.status<>'processing' then raise exception 'Event must be claimed'; end if;
  if e.event_type='notify_recipient' then
    insert into notifications(user_id,type,actor_id,entity_type,entity_id,message)
      values((e.payload->>'userId')::uuid,'tip',(e.payload->>'actorId')::uuid,'tip',(e.payload->>'tipId')::uuid,
        'You received a '||coalesce(e.payload->>'currency','USD')||' '||(e.payload->>'amount')||' tip!');
  elsif e.event_type='award_xp' then
    perform award_xp_once((e.payload->>'userId')::uuid,(e.payload->>'amount')::integer,e.payload->>'reason',coalesce(e.payload->>'eventKey','outbox:'||e.id::text));
    if (e.payload->>'readingStreak')::boolean then perform increment_streak_atomic((e.payload->>'userId')::uuid,'reading'); end if;
  elsif e.event_type='push_notification' then null;
  else raise exception 'Unknown outbox event type'; end if;
  update outbox_events set status='processed',processed_at=now(),last_error=null where id=e.id;
  return true;
end $$;
