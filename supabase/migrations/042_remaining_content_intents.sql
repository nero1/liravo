alter table reading_rooms alter column book_id drop not null;
alter table writing_workshops rename to workshop_rooms;
alter table workshop_rooms rename column creator_id to facilitator_id;
alter table workshop_rooms rename column title to name;
alter table workshop_rooms rename column description to topic;
alter table workshop_rooms add column member_count integer not null default 0;
alter table writing_workshop_members rename to workshop_members;
alter table workshop_members rename column workshop_id to room_id;
alter table writing_workshop_submissions rename to workshop_submissions;
alter table workshop_submissions rename column workshop_id to room_id;
alter table workshop_submissions rename column content to excerpt;
alter table workshop_submissions add column title text not null default '';
alter table writing_workshop_feedback rename to workshop_feedback;
alter table workshop_feedback rename column reviewer_id to user_id;
alter table workshop_feedback add column comment text not null default '';
update workshop_feedback set comment=concat_ws(E'\n\n',what_worked,what_to_improve,specific_suggestion);
update workshop_rooms r set member_count=(select count(*) from workshop_members m where m.room_id=r.id);
alter table debates rename to book_debates;
alter table book_debates rename column claim to question;
alter table book_debates rename column agree_count to yes_count;
alter table book_debates rename column disagree_count to no_count;
alter table book_debates add column is_active boolean not null default true;
alter table debate_votes drop constraint debate_votes_vote_check;
update debate_votes set vote=case when vote='agree' then 'yes' else 'no' end;
alter table debate_votes add constraint debate_votes_vote_check check(vote in ('yes','no'));
alter table community_notes add column reviewed_by uuid references users(id);
alter table community_notes add column reviewed_at timestamptz;
alter table community_notes add column status text not null default 'pending' check(status in ('pending','approved','rejected'));
update community_notes set status=case when is_visible then 'approved' else 'pending' end;
alter table events add column max_attendees integer check(max_attendees>0);

create table book_passes (
  id uuid primary key default gen_random_uuid(),sender_id uuid not null references users(id) on delete cascade,recipient_id uuid not null references users(id) on delete cascade,
  book_id uuid not null references books(id) on delete cascade,message text,created_at timestamptz not null default now(),check(sender_id<>recipient_id)
);
create table author_verification_requests (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references users(id) on delete cascade,pen_name text not null,publisher text,book_titles text not null,
  website_url text,social_proof_url text,status text not null default 'pending' check(status in ('pending','approved','rejected')),created_at timestamptz not null default now()
);
create table appeals (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references users(id) on delete cascade,report_id uuid references content_reports(id) on delete set null,reason text not null,
  content_type text,content_id uuid,status text not null default 'pending' check(status in ('pending','approved','rejected')),
  reviewed_by uuid references users(id) on delete set null,reviewer_note text,reviewed_at timestamptz,created_at timestamptz not null default now()
);
create table user_badges (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references users(id) on delete cascade,badge_id text not null,awarded_at timestamptz not null default now(),unique(user_id,badge_id)
);
create table affiliate_health_log (
  id uuid primary key default gen_random_uuid(),book_id uuid not null references books(id) on delete cascade,book_title text not null,issue text not null,flagged_at timestamptz not null default now()
);
alter table book_passes enable row level security;
alter table author_verification_requests enable row level security;
alter table appeals enable row level security;
alter table user_badges enable row level security;
alter table affiliate_health_log enable row level security;
revoke all on book_passes,author_verification_requests,appeals,user_badges,affiliate_health_log from public,anon,authenticated;
grant select on book_passes,author_verification_requests,appeals,user_badges,affiliate_health_log to service_role;
grant select on user_badges to anon,authenticated;
create policy badge_profile_visibility on user_badges for select using(exists(select 1 from users where id=user_id and not is_banned and profile_visibility='public') or auth.uid()=user_id);

create function synchronize_content_aliases()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare row_data jsonb:=to_jsonb(new); previous jsonb; legacy jsonb; canonical jsonb;
begin
  legacy:=row_data->tg_argv[0];canonical:=row_data->tg_argv[1];
  if tg_op='UPDATE' then
    previous:=to_jsonb(old);
    if canonical is distinct from previous->tg_argv[1] and legacy is not distinct from previous->tg_argv[0] then legacy:=canonical;
    elsif legacy is distinct from previous->tg_argv[0] and canonical is not distinct from previous->tg_argv[1] then canonical:=legacy; end if;
  end if;
  if legacy is null or legacy='null'::jsonb then legacy:=canonical; end if;
  if canonical is null or canonical='null'::jsonb then canonical:=legacy; end if;
  if legacy is distinct from canonical then raise exception 'Conflicting content columns' using errcode='P1004'; end if;
  new:=jsonb_populate_record(new,jsonb_build_object(tg_argv[0],legacy,tg_argv[1],canonical));
  return new;
end $$;
create trigger aa_reading_room_owner before insert or update on reading_rooms for each row execute function synchronize_content_aliases('creator_id','created_by');
create trigger aa_reading_room_name before insert or update on reading_rooms for each row execute function synchronize_content_aliases('title','name');
create trigger aa_author_post_body before insert or update on author_posts for each row execute function synchronize_content_aliases('content','body');
update reading_rooms set created_by=coalesce(created_by,creator_id),name=coalesce(name,title);
update author_posts set body=coalesce(body,content);

create function guard_additional_content_intent()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid; target uuid; room uuid; snapshot jsonb; after_insert boolean:=tg_when='AFTER'; reading_room reading_rooms;
begin
  actor:=(to_jsonb(new)->>tg_argv[0])::uuid;
  target:=case tg_table_name when 'book_passes' then (to_jsonb(new)->>'recipient_id')::uuid when 'author_qa' then (to_jsonb(new)->>'author_id')::uuid else null end;
  if not after_insert then
    perform 1 from users where id in (actor,target) order by id for update;
    if tg_table_name='book_passes' and not exists(select 1 from follows where follower_id=actor and following_id=target) then raise exception 'Follow the recipient first' using errcode='P1003'; end if;
    if tg_table_name='buddy_read_notes' then
      if not exists(select 1 from buddy_read_members where buddy_read_id=new.buddy_read_id and user_id=actor) then raise exception 'Not a participant' using errcode='P1003'; end if;
    end if;
    if tg_table_name in ('reading_room_posts','reading_room_milestones') then
      select * into reading_room from reading_rooms where id=(to_jsonb(new)->>'room_id')::uuid for share;
      if not found or not reading_room.is_active then raise exception 'Room unavailable' using errcode='P1005'; end if;
      if tg_table_name='reading_room_milestones' then
        if reading_room.created_by<>actor then raise exception 'Creator access required' using errcode='P1003'; end if;
      elsif reading_room.created_by<>actor and not exists(select 1 from room_participants where room_id=reading_room.id and user_id=actor) then
        raise exception 'Room membership required' using errcode='P1003';
      end if;
      if tg_table_name='reading_room_posts' then
        if new.milestone_id is not null and not exists(select 1 from reading_room_milestones where id=new.milestone_id and room_id=reading_room.id and unlock_date<=now()) then
          raise exception 'Milestone unavailable' using errcode='P1003';
        end if;
      end if;
    end if;
    if tg_table_name='workshop_submissions' then room:=new.room_id;
    elsif tg_table_name='workshop_feedback' then select room_id into room from workshop_submissions where id=new.submission_id; end if;
    if tg_table_name in ('workshop_submissions','workshop_feedback') and not exists(select 1 from workshop_members where room_id=room and user_id=actor) then raise exception 'Not a workshop member' using errcode='P1003'; end if;
    if tg_table_name in ('workshop_submissions','workshop_feedback') and not exists(select 1 from workshop_rooms where id=room and is_active) then raise exception 'Workshop closed' using errcode='P1004'; end if;
    if tg_table_name='workshop_submissions' then new.word_count:=case when trim(new.excerpt)='' then 0 else cardinality(regexp_split_to_array(trim(new.excerpt),E'\\s+')) end; end if;
    if new.idempotency_key is null then return new; end if;
    if length(new.idempotency_key) not between 8 and 200 or new.request_hash is null or new.request_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid content intent' using errcode='P1004'; end if;
    if exists(select 1 from content_intents where actor_id=actor and action=tg_table_name and intent_key=new.idempotency_key) then raise exception 'Content intent already committed' using errcode='23505'; end if;
  else
    case tg_table_name
      when 'reading_rooms' then insert into room_participants(room_id,user_id) values(new.id,actor) on conflict do nothing;
      when 'workshop_rooms' then insert into workshop_members(room_id,user_id) values(new.id,actor) on conflict do nothing;
      when 'workshop_submissions' then insert into outbox_events(aggregate_type,aggregate_id,event_type,payload) values(tg_table_name,new.id::text,'check_badges',jsonb_build_object('userId',actor,'trigger','workshop_submit'));
      when 'book_passes' then insert into notifications(user_id,type,actor_id,entity_type,entity_id,message) values(new.recipient_id,'book_pass',actor,'book',new.book_id,coalesce(new.message,'A reader passed you a book.'));
      when 'author_qa' then insert into notifications(user_id,type,actor_id,entity_type,entity_id,message) values(new.author_id,'author_qa_question',actor,'author_qa',new.id,new.question);
      when 'author_posts' then
        if new.type='announcement' then insert into outbox_events(aggregate_type,aggregate_id,event_type,payload) values('author_post',new.id::text,'author_announcement',jsonb_build_object('userId',actor,'postId',new.id)); end if;
      when 'author_verification_requests' then insert into outbox_events(aggregate_type,aggregate_id,event_type,payload) values('verification_request',new.id::text,'notify_admins',jsonb_build_object('userId',actor,'requestId',new.id));
      else null;
    end case;
    if new.idempotency_key is not null then
      snapshot:=to_jsonb(new)-'idempotency_key'-'request_hash';
      if tg_table_name='workshop_rooms' then select to_jsonb(r)-'idempotency_key'-'request_hash' into snapshot from workshop_rooms r where id=new.id; end if;
      insert into content_intents values(actor,tg_table_name,new.idempotency_key,new.request_hash,snapshot);
    end if;
  end if;
  return new;
end $$;
do $$ declare relation_name text; owner_column text; begin
  for relation_name,owner_column in values ('reading_lists','user_id'),('content_reports','reporter_id'),('events','organizer_id'),('reading_rooms','created_by'),('book_debates','user_id'),
    ('book_passes','sender_id'),('author_posts','author_id'),('author_qa','asked_by'),('arcs','author_id'),('workshop_rooms','facilitator_id'),('workshop_submissions','user_id'),('workshop_feedback','user_id'),
    ('buddy_read_notes','user_id'),('reading_room_posts','user_id'),('reading_room_milestones','created_by'),('author_verification_requests','user_id'),('appeals','user_id'),('community_notes','author_id') loop
    if relation_name='reading_room_milestones' then alter table reading_room_milestones add column created_by uuid references users(id); end if;
    execute format('alter table %I add column idempotency_key text, add column request_hash text',relation_name);
    execute format('create trigger content_intent_guard before insert on %I for each row execute function guard_additional_content_intent(%L)',relation_name,owner_column);
    execute format('create trigger content_intent_commit after insert on %I for each row execute function guard_additional_content_intent(%L)',relation_name,owner_column);
  end loop;
end $$;

create function enforce_workshop_capacity()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare room workshop_rooms;
begin
  perform 1 from users where id=new.user_id for update;
  select * into room from workshop_rooms where id=new.room_id for update;
  if not found or not room.is_active then raise exception 'Workshop unavailable' using errcode='P1005'; end if;
  if exists(select 1 from workshop_members where room_id=new.room_id and user_id=new.user_id) then return new; end if;
  if (select count(*) from workshop_members where room_id=new.room_id)>=room.max_members then raise exception 'Workshop full' using errcode='P1004'; end if;
  return new;
end $$;
create function count_workshop_members()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='INSERT' then update workshop_rooms set member_count=member_count+1 where id=new.room_id; return new; end if;
  update workshop_rooms set member_count=greatest(0,member_count-1) where id=old.room_id; return old;
end $$;
create trigger workshop_capacity before insert on workshop_members for each row execute function enforce_workshop_capacity();
create trigger workshop_member_count after insert or delete on workshop_members for each row execute function count_workshop_members();

create function award_badge_atomic(p_user_id uuid,p_badge_id text,p_xp integer,p_name text,p_icon text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_xp is null or p_xp<0 or p_xp>5000 or p_badge_id is null or length(p_badge_id) not between 1 and 100 then raise exception 'Invalid badge'; end if;
  perform 1 from users where id=p_user_id for update;
  insert into user_badges(user_id,badge_id) values(p_user_id,p_badge_id) on conflict do nothing;
  if not found then return false; end if;
  perform award_xp_once(p_user_id,p_xp,'badge:'||p_badge_id,'badge:'||p_badge_id);
  insert into notifications(user_id,type,message) values(p_user_id,'badge_earned',p_icon||' '||p_name);
  return true;
end $$;
revoke all on function award_badge_atomic(uuid,text,integer,text,text) from public,anon,authenticated;
grant execute on function award_badge_atomic(uuid,text,integer,text,text) to service_role;


create function count_verified_books(p_user_id uuid)
returns integer language sql stable security definer set search_path=public,pg_temp as $$
  select count(distinct b.book_id)::integer from shelf_books b join shelves s on s.id=b.shelf_id
    where s.user_id=p_user_id and s.default_type='have_read' and b.finished_at is not null;
$$;
revoke all on function count_verified_books(uuid) from public,anon,authenticated;
grant execute on function count_verified_books(uuid) to service_role;

create or replace function process_outbox_event_atomic(p_event_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare e outbox_events; post author_posts; recipients uuid[];
begin
  select * into e from outbox_events where id=p_event_id for update;
  if not found then raise exception 'Unknown outbox event'; end if;
  if e.status='processed' then return false; end if;
  if e.status<>'processing' then raise exception 'Event must be claimed'; end if;
  if e.aggregate_type='tip' then
    perform 1 from users where id in ((e.payload->>'userId')::uuid,(e.payload->>'actorId')::uuid) order by id for update;
    if exists(select 1 from tips where id=e.aggregate_id::uuid and (status='refunded' or (e.event_type='notify_recipient' and refunded_recipient_amount>0))) then
      update outbox_events set status='processed',processed_at=now(),last_error=null where id=e.id;
      return false;
    end if;
  end if;
  if e.event_type='author_announcement' then
    select * into post from author_posts where id=(e.payload->>'postId')::uuid;
    if found then
      select array_agg(follower_id order by follower_id) into recipients from (
        select follower_id from follows where following_id=post.author_id and created_at<=post.created_at
          and (e.payload->>'after' is null or follower_id>(e.payload->>'after')::uuid) order by follower_id limit 101
      ) page;
      perform 1 from users where id=post.author_id or id=any(recipients[1:100]) order by id for key share;
      insert into notifications(user_id,type,actor_id,entity_type,entity_id,message)
        select id,'author_announcement',post.author_id,'author_post',post.id,post.title from users where id=any(recipients[1:100]) and coalesce(notify_author_announcements,true);
      if cardinality(recipients)>100 then
        insert into outbox_events(aggregate_type,aggregate_id,event_type,payload)
          values(e.aggregate_type,e.aggregate_id,e.event_type,e.payload||jsonb_build_object('after',recipients[100]));
      else update author_posts set followers_notified=true where id=post.id; end if;
    end if;
  elsif e.event_type='notify_admins' then
    perform 1 from users where is_admin or id=(e.payload->>'userId')::uuid order by id for key share;
    insert into notifications(user_id,type,actor_id,entity_type,entity_id,message)
      select id,'author_verification_request',(e.payload->>'userId')::uuid,'author_verification_request',(e.payload->>'requestId')::uuid,'New author verification request' from users where is_admin and not is_banned;
  elsif e.event_type='notify_recipient' then
    insert into notifications(user_id,type,actor_id,entity_type,entity_id,message)
      values((e.payload->>'userId')::uuid,'tip',(e.payload->>'actorId')::uuid,'tip',(e.payload->>'tipId')::uuid,
        'You received a '||coalesce(e.payload->>'currency','USD')||' '||(e.payload->>'amount')||' tip!');
  elsif e.event_type='award_xp' then
    perform award_xp_once((e.payload->>'userId')::uuid,(e.payload->>'amount')::integer,e.payload->>'reason',coalesce(e.payload->>'eventKey','outbox:'||e.id::text));
    if (e.payload->>'readingStreak')::boolean then perform increment_streak_atomic((e.payload->>'userId')::uuid,'reading'); end if;
  elsif e.event_type in ('push_notification','check_badges') then null;
  else raise exception 'Unknown outbox event type'; end if;
  update outbox_events set status='processed',processed_at=now(),last_error=null where id=e.id;
  return true;
end $$;


grant select on book_passes to authenticated;
create policy book_pass_parties on book_passes for select to authenticated using(auth.uid() in (sender_id,recipient_id));
notify pgrst,'reload schema';

create function join_content_group(p_user_id uuid,p_kind text,p_target uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare workshop workshop_rooms; room reading_rooms; event events;
begin
  perform 1 from users where id=p_user_id and not is_banned for update;
  if not found then raise exception 'Unknown user' using errcode='P1003'; end if;
  if p_kind='workshop' then
    select * into workshop from workshop_rooms where id=p_target for update;
    if not found then raise exception 'Unknown workshop' using errcode='P1005'; end if;
    if exists(select 1 from workshop_members where room_id=p_target and user_id=p_user_id) then return jsonb_build_object('joined',true,'alreadyJoined',true,'member_count',workshop.member_count); end if;
    if not workshop.is_active then raise exception 'Workshop unavailable' using errcode='P1004'; end if;
    insert into workshop_members(room_id,user_id) values(p_target,p_user_id);
    return jsonb_build_object('joined',true,'member_count',workshop.member_count+1);
  elsif p_kind='reading_room' then
    select * into room from reading_rooms where id=p_target for update;
    if not found then raise exception 'Unknown room' using errcode='P1005'; end if;
    if exists(select 1 from room_participants where room_id=p_target and user_id=p_user_id) then return jsonb_build_object('joined',true,'alreadyJoined',true); end if;
    if not room.is_active or (not room.is_public and room.created_by<>p_user_id) then raise exception 'Room unavailable' using errcode='P1003'; end if;
    insert into room_participants(room_id,user_id) values(p_target,p_user_id);
    return jsonb_build_object('joined',true);
  elsif p_kind='event' then
    select * into event from events where id=p_target for update;
    if not found then raise exception 'Unknown event' using errcode='P1005'; end if;
    if exists(select 1 from event_rsvps where event_id=p_target and user_id=p_user_id) then return jsonb_build_object('rsvped',true,'alreadyRsvped',true); end if;
    if event.is_paid or event.event_date<=now() then raise exception 'Event unavailable for RSVP' using errcode='P1004'; end if;
    if event.max_attendees is not null and (select count(*) from event_rsvps where event_id=p_target)>=event.max_attendees then raise exception 'Event full' using errcode='P1004'; end if;
    insert into event_rsvps(event_id,user_id) values(p_target,p_user_id);
    return jsonb_build_object('rsvped',true);
  else raise exception 'Unknown membership' using errcode='P1004'; end if;
end $$;
revoke all on function join_content_group(uuid,text,uuid) from public,anon,authenticated;
grant execute on function join_content_group(uuid,text,uuid) to service_role;
notify pgrst,'reload schema';

create function can_read_workshop(p_room_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from workshop_members where room_id=p_room_id and user_id=auth.uid());
$$;
revoke all on function can_read_workshop(uuid) from public,anon;
grant execute on function can_read_workshop(uuid) to authenticated;
do $$ declare rule record; begin
  for rule in select tablename,policyname from pg_policies where schemaname='public' and tablename in ('workshop_members','workshop_submissions','workshop_feedback') loop
    execute format('drop policy %I on %I',rule.policyname,rule.tablename);
  end loop;
end $$;
revoke all on workshop_members,workshop_submissions,workshop_feedback from anon,authenticated;
grant select on workshop_members,workshop_submissions,workshop_feedback to authenticated;
create policy workshop_member_visibility on workshop_members for select to authenticated using(can_read_workshop(room_id));
create policy workshop_submission_visibility on workshop_submissions for select to authenticated using(can_read_workshop(room_id));
create policy workshop_feedback_visibility on workshop_feedback for select to authenticated using(exists(select 1 from workshop_submissions s where s.id=submission_id and can_read_workshop(s.room_id)));
grant select,insert,update,delete on workshop_rooms,workshop_members,workshop_submissions,workshop_feedback,book_passes,author_verification_requests,appeals,affiliate_health_log to service_role;

create function fork_reading_list(p_user_id uuid,p_source_id uuid,p_key text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare source reading_lists; target reading_lists; previous content_intents; fingerprint text;
begin
  if p_key is null or length(p_key) not between 8 and 200 then raise exception 'Invalid intent' using errcode='P1004'; end if;
  perform 1 from users where id=p_user_id for update;
  fingerprint:=encode(sha256(convert_to(p_source_id::text,'UTF8')),'hex');
  select * into previous from content_intents where actor_id=p_user_id and action='reading_list_fork' and intent_key=p_key;
  if found then
    if previous.fingerprint<>fingerprint then raise exception 'Conflicting fork intent' using errcode='P1001'; end if;
    return previous.response;
  end if;
  select * into source from reading_lists where id=p_source_id and is_public for share;
  if not found then raise exception 'Source list unavailable' using errcode='P1005'; end if;
  insert into reading_lists(user_id,name,description,is_public,forked_from) values(p_user_id,source.name,source.description,false,source.id) returning * into target;
  insert into reading_list_books(list_id,book_id,position) select target.id,book_id,position from reading_list_books where list_id=source.id;
  insert into content_intents values(p_user_id,'reading_list_fork',p_key,fingerprint,to_jsonb(target)-'idempotency_key'-'request_hash');
  return to_jsonb(target)-'idempotency_key'-'request_hash';
end $$;

create function cast_debate_vote(p_user_id uuid,p_debate_id uuid,p_vote text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare debate book_debates; previous text;
begin
  if p_vote is null or p_vote not in ('yes','no') then raise exception 'Invalid vote' using errcode='P1004'; end if;
  perform 1 from users where id=p_user_id and not is_banned for update;
  if not found then raise exception 'Forbidden' using errcode='P1003'; end if;
  select * into debate from book_debates where id=p_debate_id for update;
  if not found then raise exception 'Unknown debate' using errcode='P1005'; end if;
  select vote into previous from debate_votes where debate_id=p_debate_id and user_id=p_user_id;
  if found then
    if previous<>p_vote then raise exception 'Vote is final' using errcode='P1001'; end if;
    return jsonb_build_object('success',true,'vote',previous,'alreadyVoted',true);
  end if;
  if not debate.is_active then raise exception 'Debate closed' using errcode='P1004'; end if;
  insert into debate_votes(debate_id,user_id,vote) values(p_debate_id,p_user_id,p_vote);
  update book_debates set yes_count=yes_count+case when p_vote='yes' then 1 else 0 end,no_count=no_count+case when p_vote='no' then 1 else 0 end where id=p_debate_id;
  return jsonb_build_object('success',true,'vote',p_vote);
end $$;
revoke all on function fork_reading_list(uuid,uuid,text),cast_debate_vote(uuid,uuid,text) from public,anon,authenticated;
grant execute on function fork_reading_list(uuid,uuid,text),cast_debate_vote(uuid,uuid,text) to service_role;
revoke insert,update,delete on debate_votes from anon,authenticated;
notify pgrst,'reload schema';

revoke insert on reading_lists,content_reports,events,reading_rooms,book_debates,author_posts,author_qa,arcs,buddy_read_notes,reading_room_posts,reading_room_milestones,community_notes from anon,authenticated;
grant select,insert,update,delete on reading_lists,content_reports,events,reading_rooms,book_debates,author_posts,author_qa,arcs,buddy_read_notes,reading_room_posts,reading_room_milestones,community_notes to service_role;
revoke update on workshop_rooms,book_debates,reading_lists from anon,authenticated;
grant update(name,topic,max_members,is_active) on workshop_rooms to authenticated;
grant update(question,is_active) on book_debates to authenticated;
grant update(name,description,is_public,cover_url) on reading_lists to authenticated;
notify pgrst,'reload schema';

insert into room_participants(room_id,user_id,joined_at) select room_id,user_id,joined_at from reading_room_members on conflict do nothing;
insert into room_participants(room_id,user_id) select id,created_by from reading_rooms where created_by is not null on conflict do nothing;
create function reading_room_visible(p_room_id uuid,p_user_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from reading_rooms r where r.id=p_room_id and (r.is_public or r.created_by=p_user_id
    or exists(select 1 from room_participants m where m.room_id=r.id and m.user_id=p_user_id)));
$$;
revoke all on function reading_room_visible(uuid,uuid) from public,anon,authenticated;
grant execute on function reading_room_visible(uuid,uuid) to service_role;
create function can_read_reading_room(p_room_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select reading_room_visible(p_room_id,auth.uid());
$$;
revoke all on function can_read_reading_room(uuid) from public,anon;
grant execute on function can_read_reading_room(uuid) to authenticated;
do $$ declare rule record; begin
  for rule in select tablename,policyname from pg_policies where schemaname='public' and cmd='SELECT'
    and tablename in ('reading_rooms','room_participants','reading_room_members','reading_room_posts','reading_room_milestones') loop
    execute format('drop policy %I on %I',rule.policyname,rule.tablename);
  end loop;
end $$;
create policy room_visibility on reading_rooms for select to authenticated using(can_read_reading_room(id));
create policy room_participant_visibility on room_participants for select to authenticated using(can_read_reading_room(room_id));
create policy legacy_room_member_visibility on reading_room_members for select to authenticated using(can_read_reading_room(room_id));
create policy room_milestone_visibility on reading_room_milestones for select to authenticated using(can_read_reading_room(room_id));
create policy room_post_visibility on reading_room_posts for select to authenticated using(can_read_reading_room(room_id) and
  (milestone_id is null or exists(select 1 from reading_room_milestones m where m.id=milestone_id and m.room_id=reading_room_posts.room_id and m.unlock_date<=now())));
revoke insert,update on room_participants,reading_room_members from anon,authenticated;
grant select,insert,update,delete on room_participants to service_role;
create function read_room_posts(p_user_id uuid,p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  if not reading_room_visible(p_room_id,p_user_id) then raise exception 'Room unavailable' using errcode='P1003'; end if;
  select coalesce(jsonb_agg(row_to_json(page) order by created_at,id),'[]'::jsonb) into result from (
    select p.id,p.content,p.milestone_id,p.created_at,jsonb_build_object('id',u.id,'display_name',u.display_name,'username',u.username,'avatar_url',u.avatar_url) as users
    from reading_room_posts p join users u on u.id=p.user_id left join reading_room_milestones m on m.id=p.milestone_id and m.room_id=p.room_id
    where p.room_id=p_room_id and (p.milestone_id is null or m.unlock_date<=now()) order by p.created_at,p.id limit 100
  ) page;
  return result;
end $$;
revoke all on function read_room_posts(uuid,uuid) from public,anon,authenticated;
grant execute on function read_room_posts(uuid,uuid) to service_role;
notify pgrst,'reload schema';
