alter table subscriptions drop constraint if exists subscriptions_provider_check;
alter table subscriptions add constraint subscriptions_provider_check check(provider in ('dodopayments','paystack','google_play'));
alter table subscriptions add column provider_product_id text;
alter table subscriptions add column provider_account_id text;
alter table subscriptions add column provider_state text;
alter table subscriptions add column last_verified_at timestamptz;
alter table subscriptions add column provider_acknowledged boolean not null default true;
alter table users add column premium_override boolean not null default false;
update users u set premium_override=true where is_premium and not exists(select 1 from subscriptions s where s.user_id=u.id and s.status='active');
update subscriptions set provider_event_id='gplay_'||encode(sha256(convert_to(provider_event_id,'UTF8')),'hex')
  where provider='google_play' and provider_event_id is not null and provider_event_id !~ '^gplay_[a-f0-9]{64}$';
create index subscription_expirations on subscriptions(current_period_end,user_id) where status='active' and current_period_end is not null;

create table billing_accounts (
  provider text not null check(provider='google_play'),
  account_id text not null,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(provider,account_id)
);
create table billing_webhook_receipts (
  provider text not null,
  delivery_id text not null,
  fingerprint text not null,
  status text not null check(status in ('pending_ack','processed')),
  created_at timestamptz not null default now(),
  primary key(provider,delivery_id)
);
alter table billing_accounts enable row level security;
alter table billing_webhook_receipts enable row level security;
revoke all on billing_accounts,billing_webhook_receipts from public,anon,authenticated;
grant select on billing_accounts,billing_webhook_receipts to service_role;

create function guard_premium_override()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if auth.role() in ('anon','authenticated') and new.premium_override is distinct from old.premium_override then
    raise exception 'Premium grants require service authorization' using errcode='42501';
  end if;
  return new;
end $$;
create trigger users_premium_override before update on users for each row execute function guard_premium_override();

create function has_premium_access(p_user_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce((select premium_override from users where id=p_user_id),false) or exists(
    select 1 from subscriptions where user_id=p_user_id and status='active' and ((current_period_end is null and provider<>'google_play') or current_period_end>now())
  );
$$;
create function refresh_premium_access(p_user_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare active boolean;
begin
  active:=has_premium_access(p_user_id);
  update users set is_premium=active where id=p_user_id and is_premium is distinct from active;
  return active;
end $$;
create function refresh_subscription_access()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='DELETE' then perform refresh_premium_access(old.user_id); return old; end if;
  perform refresh_premium_access(new.user_id);
  return new;
end $$;
create trigger subscriptions_premium_access after insert or update or delete on subscriptions for each row execute function refresh_subscription_access();

create function set_premium_override_atomic(p_actor_id uuid,p_user_id uuid,p_enabled boolean,p_correlation_id text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare previous boolean;
begin
  perform 1 from users where id in (p_actor_id,p_user_id) order by id for update;
  if not exists(select 1 from users where id=p_actor_id and is_admin and not is_banned) then raise exception 'Forbidden' using errcode='P1003'; end if;
  select premium_override into previous from users where id=p_user_id;
  if not found or p_enabled is null then raise exception 'Unknown user' using errcode='P1005'; end if;
  if previous is distinct from p_enabled then
    update users set premium_override=p_enabled where id=p_user_id;
    insert into financial_audit_log(actor_user_id,target_user_id,action,correlation_id,metadata)
      values(p_actor_id,p_user_id,'premium_grant_changed',p_correlation_id,jsonb_build_object('enabled',p_enabled));
  end if;
  return refresh_premium_access(p_user_id);
end $$;

create function register_billing_account(p_user_id uuid,p_account_id text)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare owner uuid;
begin
  if p_account_id is null or p_account_id !~ '^[a-f0-9]{64}$' then raise exception 'Invalid account binding' using errcode='P1004'; end if;
  perform 1 from users where id=p_user_id for update;
  if not found then raise exception 'Unknown user' using errcode='P1005'; end if;
  insert into billing_accounts(provider,account_id,user_id) values('google_play',p_account_id,p_user_id) on conflict do nothing;
  select user_id into owner from billing_accounts where provider='google_play' and account_id=p_account_id;
  if owner<>p_user_id then raise exception 'Account binding conflict' using errcode='P1003'; end if;
  return p_account_id;
end $$;

create function reconcile_google_play_purchase(
  p_user_id uuid,p_token_id text,p_product_id text,p_provider_state text,p_period_end timestamptz,
  p_account_id text,p_linked_token_id text,p_verified_at timestamptz,p_acknowledged boolean,p_correlation_id text,
  p_delivery_id text default null,p_fingerprint text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare subscription subscriptions; linked_owner uuid; account_owner uuid; receipt billing_webhook_receipts;
  active boolean; next_status text; changed boolean;
begin
  if p_user_id is null or p_token_id is null or p_token_id !~ '^gplay_[a-f0-9]{64}$' or p_product_id is null or length(p_product_id) not between 1 and 150
    or p_provider_state is null or p_provider_state not in ('SUBSCRIPTION_STATE_UNSPECIFIED','SUBSCRIPTION_STATE_PENDING','SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_PAUSED','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_ON_HOLD','SUBSCRIPTION_STATE_CANCELED','SUBSCRIPTION_STATE_EXPIRED','SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED')
    or p_verified_at is null or p_verified_at>now()+interval '5 minutes' or p_acknowledged is null then raise exception 'Invalid purchase state' using errcode='P1004'; end if;
  if p_delivery_id is not null then perform pg_advisory_xact_lock(hashtextextended('google_delivery:'||p_delivery_id,0)); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_token_id,0));
  select * into subscription from subscriptions where provider='google_play' and provider_event_id=p_token_id;
  if found and subscription.user_id<>p_user_id then raise exception 'Purchase belongs to another account' using errcode='P1003'; end if;
  select user_id into account_owner from billing_accounts where provider='google_play' and account_id=p_account_id;
  if account_owner is not null and account_owner<>p_user_id then raise exception 'Purchase account mismatch' using errcode='P1003'; end if;
  select user_id into linked_owner from subscriptions where provider='google_play' and provider_event_id=p_linked_token_id;
  if linked_owner is not null and linked_owner<>p_user_id then raise exception 'Linked purchase belongs to another account' using errcode='P1003'; end if;
  if subscription.id is null and account_owner is null and linked_owner is null then raise exception 'Purchase account binding is missing' using errcode='P1003'; end if;
  if subscription.provider_account_id is not null and subscription.provider_account_id is distinct from p_account_id then raise exception 'Purchase account binding changed' using errcode='P1003'; end if;
  perform 1 from users where id=p_user_id for update;
  if not found then raise exception 'Unknown user' using errcode='P1005'; end if;
  if p_delivery_id is not null then
    if length(p_delivery_id) not between 1 and 200 or p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'Invalid billing delivery' using errcode='P1004'; end if;
    select * into receipt from billing_webhook_receipts where provider='google_play' and delivery_id=p_delivery_id for update;
    if found and receipt.fingerprint<>p_fingerprint then raise exception 'Billing delivery conflict' using errcode='P1001'; end if;
    if found and receipt.status='processed' then return jsonb_build_object('id',subscription.id,'active',coalesce(subscription.status='active' and subscription.current_period_end>now(),false),'expiresAt',subscription.current_period_end,'providerState',subscription.provider_state,'acknowledged',subscription.provider_acknowledged,'replay',true); end if;
  end if;
  active:=p_provider_state in ('SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_CANCELED') and p_period_end>now();
  next_status:=case when active then 'active' when p_provider_state='SUBSCRIPTION_STATE_PENDING' then 'pending' else 'expired' end;
  if subscription.id is null then
    insert into subscriptions(user_id,provider,status,amount,currency,provider_event_id,provider_product_id,provider_account_id,provider_state,current_period_end,last_verified_at,provider_acknowledged)
      values(p_user_id,'google_play',next_status,0,'USD',p_token_id,p_product_id,p_account_id,p_provider_state,p_period_end,p_verified_at,p_acknowledged) returning * into subscription;
    changed:=true;
  elsif subscription.last_verified_at is null or p_verified_at>=subscription.last_verified_at then
    changed:=subscription.status is distinct from next_status or subscription.current_period_end is distinct from p_period_end or subscription.provider_state is distinct from p_provider_state;
    update subscriptions set status=next_status,current_period_end=p_period_end,provider_state=p_provider_state,last_verified_at=p_verified_at,
      provider_product_id=p_product_id,provider_account_id=coalesce(provider_account_id,p_account_id),provider_acknowledged=p_acknowledged where id=subscription.id returning * into subscription;
  end if;
  if changed then
    insert into financial_audit_log(actor_user_id,target_user_id,action,provider,provider_event_id,correlation_id,metadata)
      values(p_user_id,p_user_id,'google_play_entitlement_verified','google_play',p_token_id,p_correlation_id,jsonb_build_object('state',p_provider_state,'expires_at',p_period_end,'product_id',p_product_id));
  end if;
  if p_delivery_id is not null then
    insert into billing_webhook_receipts(provider,delivery_id,fingerprint,status) values('google_play',p_delivery_id,p_fingerprint,
      case when active and not p_acknowledged then 'pending_ack' else 'processed' end) on conflict do nothing;
  end if;
  perform refresh_premium_access(p_user_id);
  return jsonb_build_object('id',subscription.id,'active',coalesce(subscription.status='active' and subscription.current_period_end>now(),false),'expiresAt',subscription.current_period_end,'providerState',subscription.provider_state,'acknowledged',subscription.provider_acknowledged,'replay',false);
end $$;

create function complete_google_play_delivery(p_user_id uuid,p_token_id text,p_acknowledged boolean,p_delivery_id text,p_fingerprint text,p_correlation_id text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare subscription subscriptions; receipt billing_webhook_receipts;
begin
  perform 1 from users where id=p_user_id for update;
  select * into subscription from subscriptions where provider='google_play' and provider_event_id=p_token_id for update;
  if not found or subscription.user_id<>p_user_id then raise exception 'Purchase owner mismatch' using errcode='P1003'; end if;
  if p_acknowledged and not subscription.provider_acknowledged then
    update subscriptions set provider_acknowledged=true where id=subscription.id;
    insert into financial_audit_log(actor_user_id,target_user_id,action,provider,provider_event_id,correlation_id)
      values(p_user_id,p_user_id,'google_play_purchase_acknowledged','google_play',p_token_id,p_correlation_id);
  end if;
  if p_delivery_id is not null then
    select * into receipt from billing_webhook_receipts where provider='google_play' and delivery_id=p_delivery_id for update;
    if not found or receipt.fingerprint is distinct from p_fingerprint then raise exception 'Billing delivery conflict' using errcode='P1001'; end if;
    update billing_webhook_receipts set status='processed' where provider='google_play' and delivery_id=p_delivery_id;
  end if;
end $$;

create function expire_subscription_entitlements(p_limit integer default 200)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare target uuid; total integer:=0;
begin
  for target in select u.id from users u where exists(select 1 from subscriptions s where s.user_id=u.id and s.status='active' and s.current_period_end<=now())
    order by u.id for update skip locked limit greatest(1,least(p_limit,1000)) loop
    update subscriptions set status='expired' where user_id=target and status='active' and current_period_end<=now();
    perform refresh_premium_access(target);
    total:=total+1;
  end loop;
  return total;
end $$;

alter function process_payment_event(text,text,jsonb,text) rename to process_payment_event_legacy;
create function process_payment_event(p_provider text,p_event_id text,p_payload jsonb,p_correlation_id text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare applied boolean;
begin
  applied:=process_payment_event_legacy(p_provider,p_event_id,p_payload,p_correlation_id);
  if p_payload ? 'user_id' then perform refresh_premium_access((p_payload->>'user_id')::uuid); end if;
  return applied;
end $$;

create or replace function request_subscription_cancellation(p_user_id uuid,p_correlation_id text)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare target subscriptions; total integer;
begin
  perform 1 from users where id=p_user_id for update;
  for target in select * from subscriptions where user_id=p_user_id and provider in ('paystack','dodopayments') and status='active' order by id for update loop
    insert into subscription_cancellations(subscription_id,correlation_id) values(target.id,p_correlation_id) on conflict do nothing;
    if found then
      insert into financial_audit_log(actor_user_id,target_user_id,action,provider,correlation_id,metadata)
        values(p_user_id,p_user_id,'subscription_cancellation_requested',target.provider,p_correlation_id,jsonb_build_object('subscription_id',target.id));
    end if;
  end loop;
  select count(*) into total from subscription_cancellations c join subscriptions s on s.id=c.subscription_id
    where s.user_id=p_user_id and s.provider in ('paystack','dodopayments') and c.status<>'completed';
  return total;
end $$;

create or replace function complete_subscription_cancellation(p_subscription_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare s subscriptions; c subscription_cancellations;
begin
  select * into s from subscriptions where id=p_subscription_id;
  perform 1 from users where id=s.user_id for update;
  select * into s from subscriptions where id=p_subscription_id for update;
  select * into c from subscription_cancellations where subscription_id=p_subscription_id for update;
  if not found or c.status='completed' then return; end if;
  if c.status<>'processing' or s.provider not in ('paystack','dodopayments') then raise exception 'Invalid web cancellation'; end if;
  update subscriptions set status='cancelled',cancelled_at=now(),last_provider_event_at=greatest(coalesce(last_provider_event_at,now()),now()) where id=s.id;
  perform refresh_premium_access(s.user_id);
  update subscription_cancellations set status='completed',completed_at=now(),last_error=null where subscription_id=s.id;
  insert into financial_audit_log(actor_user_id,target_user_id,action,provider,correlation_id,metadata)
    values(s.user_id,s.user_id,'subscription_cancelled',s.provider,c.correlation_id,jsonb_build_object('subscription_id',s.id));
end $$;

revoke all on function process_payment_event_legacy(text,text,jsonb,text) from public,anon,authenticated,service_role;
revoke all on function has_premium_access(uuid),refresh_premium_access(uuid),set_premium_override_atomic(uuid,uuid,boolean,text),register_billing_account(uuid,text),
  reconcile_google_play_purchase(uuid,text,text,text,timestamptz,text,text,timestamptz,boolean,text,text,text),complete_google_play_delivery(uuid,text,boolean,text,text,text),
  expire_subscription_entitlements(integer),process_payment_event(text,text,jsonb,text) from public,anon,authenticated;
grant execute on function has_premium_access(uuid),refresh_premium_access(uuid),set_premium_override_atomic(uuid,uuid,boolean,text),register_billing_account(uuid,text),
  reconcile_google_play_purchase(uuid,text,text,text,timestamptz,text,text,timestamptz,boolean,text,text,text),complete_google_play_delivery(uuid,text,boolean,text,text,text),
  expire_subscription_entitlements(integer),process_payment_event(text,text,jsonb,text) to service_role;

create or replace function financial_integrity_snapshot()
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object(
    'tipsWithoutPayout', (select count(*) from tips t where status='completed' and not exists(select 1 from payouts p where p.tip_id=t.id)),
    'tipsWithoutOutbox', (select count(*) from tips t where status='completed' and not exists(select 1 from outbox_events e where e.aggregate_type='tip' and e.aggregate_id=t.id::text and e.event_type='notify_recipient')),
    'payoutsWithoutAudit', (select count(*) from payout_requests p where not exists(select 1 from financial_audit_log a where a.action='payout_requested' and a.actor_user_id=p.user_id and a.idempotency_key=p.idempotency_key)),
    'failedOutbox', (select count(*) from outbox_events where status='failed') + (select count(*) from subscription_cancellations where status='failed'),
    'stalledOutbox', (select count(*) from outbox_events where (status='processing' and (claimed_at is null or claimed_at<now()-interval '5 minutes')) or (status='pending' and created_at<now()-interval '25 hours')) + (select count(*) from subscription_cancellations where (status='processing' and claimed_at<now()-interval '2 minutes') or (status='pending' and created_at<now()-interval '25 hours')),
    'unacknowledgedPurchases', (select count(*) from subscriptions where provider='google_play' and status='active' and not provider_acknowledged and last_verified_at<now()-interval '5 minutes'),
    'stalledBillingDeliveries', (select count(*) from billing_webhook_receipts where status='pending_ack' and created_at<now()-interval '5 minutes'),
    'uncertainDigests', (select count(*) from digest_deliveries where status='unknown' or (status='sending' and updated_at<now()-interval '5 minutes'))
  );
$$;
