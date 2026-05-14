-- Bugfix: add processing state and atomic claim RPC to prevent concurrent double-processing.
alter table if exists outbox_events
  drop constraint if exists outbox_events_status_check;

alter table if exists outbox_events
  add constraint outbox_events_status_check check (status in ('pending','processing','processed','failed'));

create or replace function claim_outbox_events(p_batch_size integer default 50)
returns setof outbox_events
language plpgsql
as $$
begin
  return query
  with claimed as (
    select id
    from outbox_events
    where status = 'pending'
      and next_attempt_at <= now()
    order by created_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_batch_size, 50), 500))
  )
  update outbox_events oe
  set status = 'processing',
      attempts = oe.attempts + 1
  from claimed
  where oe.id = claimed.id
  returning oe.*;
end;
$$;
