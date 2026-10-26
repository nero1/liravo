create table digest_deliveries (
  user_id uuid not null references users(id) on delete cascade,
  period_start date not null,
  status text not null check(status in ('sending','sent','skipped','failed','unknown')),
  attempts integer not null default 1,
  message_id text,
  updated_at timestamptz not null default now(),
  primary key(user_id,period_start)
);
alter table digest_deliveries enable row level security;

create function claim_digest_delivery(p_user_id uuid,p_period_start date)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare delivery digest_deliveries;
begin
  insert into digest_deliveries(user_id,period_start,status) values(p_user_id,p_period_start,'sending') on conflict do nothing;
  if found then return true; end if;
  select * into delivery from digest_deliveries where user_id=p_user_id and period_start=p_period_start for update;
  if delivery.status='sending' and delivery.updated_at<now()-interval '5 minutes' then
    update digest_deliveries set status='unknown',updated_at=now() where user_id=p_user_id and period_start=p_period_start;
  elsif delivery.status='failed' and delivery.attempts<3 then
    update digest_deliveries set status='sending',attempts=attempts+1,updated_at=now() where user_id=p_user_id and period_start=p_period_start;
    return true;
  end if;
  return false;
end $$;

create function financial_integrity_snapshot()
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object(
    'tipsWithoutPayout', (select count(*) from tips t where status='completed' and not exists(select 1 from payouts p where p.tip_id=t.id)),
    'tipsWithoutOutbox', (select count(*) from tips t where status='completed' and not exists(select 1 from outbox_events e where e.aggregate_type='tip' and e.aggregate_id=t.id::text and e.event_type='notify_recipient')),
    'payoutsWithoutAudit', (select count(*) from payout_requests p where not exists(select 1 from financial_audit_log a where a.action='payout_requested' and a.actor_user_id=p.user_id and a.idempotency_key=p.idempotency_key)),
    'failedOutbox', (select count(*) from outbox_events where status='failed'),
    'stalledOutbox', (select count(*) from outbox_events where (status='processing' and (claimed_at is null or claimed_at<now()-interval '5 minutes')) or (status='pending' and created_at<now()-interval '25 hours')),
    'uncertainDigests', (select count(*) from digest_deliveries where status='unknown' or (status='sending' and updated_at<now()-interval '5 minutes'))
  );
$$;
revoke all on function claim_digest_delivery(uuid,date), financial_integrity_snapshot() from public;
do $$ declare role_name text; begin
  foreach role_name in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname=role_name) then
      execute format('revoke all on function claim_digest_delivery(uuid,date), financial_integrity_snapshot() from %I',role_name);
      execute format('revoke all on digest_deliveries from %I',role_name);
    end if;
  end loop;
end $$;
grant execute on function claim_digest_delivery(uuid,date), financial_integrity_snapshot() to service_role;
grant select,update on digest_deliveries to service_role;
