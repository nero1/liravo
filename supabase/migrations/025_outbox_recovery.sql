alter table outbox_events add column if not exists claimed_at timestamptz;
create or replace function claim_outbox_events(p_batch_size integer default 50)
returns setof outbox_events language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update outbox_events set status='failed' where attempts>=10 and (
    status='pending' or (status='processing' and claimed_at<now()-interval '5 minutes')
  );
  return query with candidates as (
    select id from outbox_events where attempts<10 and (
      (status='pending' and next_attempt_at<=now()) or
      (status='processing' and (claimed_at is null or claimed_at<now()-interval '5 minutes'))
    ) order by created_at,id for update skip locked limit greatest(1,least(p_batch_size,200))
  ) update outbox_events e set status='processing',attempts=e.attempts+1,claimed_at=now()
    from candidates c where e.id=c.id returning e.*;
end $$;

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
    perform award_xp_once((e.payload->>'userId')::uuid,(e.payload->>'amount')::integer,e.payload->>'reason','outbox:'||e.id::text);
  elsif e.event_type='push_notification' then null;
  else raise exception 'Unknown outbox event type'; end if;
  update outbox_events set status='processed',processed_at=now(),last_error=null where id=e.id;
  return true;
end $$;
revoke all on function claim_outbox_events(integer) from public;
revoke all on function process_outbox_event_atomic(uuid) from public;
grant execute on function claim_outbox_events(integer) to service_role;
grant execute on function process_outbox_event_atomic(uuid) to service_role;
