alter table tips add column if not exists checkout_url text;

create table subscription_cancellations (
  subscription_id uuid primary key references subscriptions(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','processing','completed','failed')),
  attempts integer not null default 0,
  claimed_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  correlation_id text,
  last_error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table subscription_cancellations enable row level security;
revoke all on subscription_cancellations from public,anon,authenticated;
grant select,update on subscription_cancellations to service_role;

create function request_subscription_cancellation(p_user_id uuid,p_correlation_id text)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare target subscriptions; total integer;
begin
  perform 1 from users where id=p_user_id for update;
  for target in select * from subscriptions where user_id=p_user_id and status='active' order by id for update loop
    insert into subscription_cancellations(subscription_id,correlation_id) values(target.id,p_correlation_id) on conflict do nothing;
    if found then
      insert into financial_audit_log(actor_user_id,target_user_id,action,provider,correlation_id,metadata)
        values(p_user_id,p_user_id,'subscription_cancellation_requested',target.provider,p_correlation_id,jsonb_build_object('subscription_id',target.id));
    end if;
  end loop;
  select count(*) into total from subscription_cancellations c join subscriptions s on s.id=c.subscription_id
    where s.user_id=p_user_id and c.status<>'completed';
  return total;
end $$;

create function claim_subscription_cancellations(p_user_id uuid default null,p_limit integer default 3)
returns table(subscription_id uuid,provider text,provider_subscription_id text,attempts integer,correlation_id text)
language sql security definer set search_path=public,pg_temp as $$
  with exhausted as (
    update subscription_cancellations set status='failed' where attempts>=10 and status='processing' and claimed_at<now()-interval '2 minutes'
  ), candidates as (
    select c.subscription_id from subscription_cancellations c join subscriptions s on s.id=c.subscription_id
      where (p_user_id is null or s.user_id=p_user_id) and c.attempts<10 and (
        (c.status='pending' and c.next_attempt_at<=now()) or
        (c.status='processing' and c.claimed_at<now()-interval '2 minutes'))
      order by c.created_at,c.subscription_id for update of c skip locked limit greatest(1,least(p_limit,3))
  ), claimed as (
    update subscription_cancellations c set status='processing',attempts=c.attempts+1,claimed_at=now()
      from candidates x where c.subscription_id=x.subscription_id returning c.*
  ) select s.id,s.provider,s.provider_subscription_id,c.attempts,c.correlation_id from claimed c join subscriptions s on s.id=c.subscription_id;
$$;

create function complete_subscription_cancellation(p_subscription_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare s subscriptions; c subscription_cancellations;
begin
  select * into s from subscriptions where id=p_subscription_id;
  perform 1 from users where id=s.user_id for update;
  select * into s from subscriptions where id=p_subscription_id for update;
  select * into c from subscription_cancellations where subscription_id=p_subscription_id for update;
  if not found or c.status='completed' then return; end if;
  if c.status<>'processing' then raise exception 'Cancellation must be claimed'; end if;
  update subscriptions set status='cancelled',cancelled_at=now(),last_provider_event_at=greatest(coalesce(last_provider_event_at,now()),now()) where id=s.id;
  update users set is_premium=exists(select 1 from subscriptions where user_id=s.user_id and status='active') where id=s.user_id;
  update subscription_cancellations set status='completed',completed_at=now(),last_error=null where subscription_id=s.id;
  insert into financial_audit_log(actor_user_id,target_user_id,action,provider,correlation_id,metadata)
    values(s.user_id,s.user_id,'subscription_cancelled',s.provider,c.correlation_id,jsonb_build_object('subscription_id',s.id));
end $$;

revoke all on function cancel_subscriptions_atomic(uuid,text) from service_role;
revoke all on function request_subscription_cancellation(uuid,text),claim_subscription_cancellations(uuid,integer),complete_subscription_cancellation(uuid) from public,anon,authenticated;
grant execute on function request_subscription_cancellation(uuid,text),claim_subscription_cancellations(uuid,integer),complete_subscription_cancellation(uuid) to service_role;

create or replace function financial_integrity_snapshot()
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object(
    'tipsWithoutPayout', (select count(*) from tips t where status='completed' and not exists(select 1 from payouts p where p.tip_id=t.id)),
    'tipsWithoutOutbox', (select count(*) from tips t where status='completed' and not exists(select 1 from outbox_events e where e.aggregate_type='tip' and e.aggregate_id=t.id::text and e.event_type='notify_recipient')),
    'payoutsWithoutAudit', (select count(*) from payout_requests p where not exists(select 1 from financial_audit_log a where a.action='payout_requested' and a.actor_user_id=p.user_id and a.idempotency_key=p.idempotency_key)),
    'failedOutbox', (select count(*) from outbox_events where status='failed') + (select count(*) from subscription_cancellations where status='failed'),
    'stalledOutbox', (select count(*) from outbox_events where (status='processing' and (claimed_at is null or claimed_at<now()-interval '5 minutes')) or (status='pending' and created_at<now()-interval '25 hours')) + (select count(*) from subscription_cancellations where (status='processing' and claimed_at<now()-interval '2 minutes') or (status='pending' and created_at<now()-interval '25 hours')),
    'uncertainDigests', (select count(*) from digest_deliveries where status='unknown' or (status='sending' and updated_at<now()-interval '5 minutes'))
  );
$$;
