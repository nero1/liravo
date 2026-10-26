alter table user_payout_methods drop constraint user_payout_methods_provider_check;
alter table user_payout_methods add constraint user_payout_methods_provider_check check(provider in ('paystack','manual')) not valid;
update user_payout_methods set provider='manual' where provider='dodopayments';
alter table user_payout_methods validate constraint user_payout_methods_provider_check;
alter table payout_requests add column currency text not null default 'USD' check(currency in ('USD','NGN','EUR'));
alter table payout_requests add column destination jsonb;
alter table payout_requests add column transfer_reference text unique;
alter table payout_requests add column provider_transfer_code text;
alter table payout_requests add column provider_recipient_code text;
alter table payout_requests add column settlement_reference text;
alter table payout_requests add column claimed_at timestamptz;
alter table payout_requests add column next_attempt_at timestamptz not null default now();
alter table payout_requests add column attempts integer not null default 0;
alter table payout_requests add column last_error text;
alter table payout_requests add column completed_at timestamptz;
update payout_requests set method='manual' where method in ('dodopayments','paystack');
create unique index payout_settlement_receipt on payout_requests(method,settlement_reference) where settlement_reference is not null;
create index payout_work_queue on payout_requests(next_attempt_at,created_at) where status in ('pending','processing');

insert into payout_requests(user_id,amount,method,currency,status,idempotency_key,transfer_reference,last_error)
  select recipient_id,amount,'manual',currency,'processing','legacy_tip_payout:'||id,'legacy_'||id,'Legacy transfer requires reconciliation'
  from payouts where status in ('completed','processing','failed') and recipient_id is not null;
insert into financial_audit_log(target_user_id,action,amount,currency,idempotency_key,correlation_id,metadata)
  select user_id,'payout_requested',amount,currency,idempotency_key,'migration-040',jsonb_build_object('legacy',true,'payout_id',id)
  from payout_requests where idempotency_key like 'legacy_tip_payout:%';

create function creator_balance(p_user_id uuid,p_currency text)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  with earned as (
    select coalesce(sum(coalesce(recipient_amount,creator_amount)),0) as tips from tips
      where coalesce(recipient_id,creator_id)=p_user_id and status='completed' and currency=p_currency
  ), commission as (
    select coalesce(sum(commission_amount),0) as referrals from referral_commissions where referrer_id=p_user_id and reversed_at is null and p_currency='USD'
  ), events as (
    select coalesce(sum(amount),0) as revenue from event_revenue where organizer_id=p_user_id and currency=p_currency
  ), withdrawn as (
    select coalesce(sum(amount) filter(where status in ('pending','processing')),0) as reserved,
      coalesce(sum(amount) filter(where status='completed'),0) as paid from payout_requests where user_id=p_user_id and currency=p_currency
  ) select jsonb_build_object('currency',p_currency,'tips',tips::text,'referrals',referrals::text,'events',revenue::text,
    'earned',(tips+referrals+revenue)::text,'reserved',reserved::text,'paid',paid::text,'available',(tips+referrals+revenue-reserved-paid)::text)
    from earned,commission,events,withdrawn;
$$;

drop function create_payout_request_atomic(uuid,numeric,text,text,text);
create function create_payout_request_atomic(p_user_id uuid,p_amount numeric,p_method text,p_idempotency_key text,p_correlation_id text,p_currency text default 'USD')
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare existing payout_requests; destination user_payout_methods; result uuid; balance jsonb;
begin
  if p_amount is null or p_amount<5 or p_amount>10000 or p_amount<>round(p_amount,2) or p_method is null or p_method not in ('manual','paystack')
    or p_currency is null or p_currency not in ('USD','NGN','EUR') or (p_method='paystack' and p_currency<>'NGN') or p_idempotency_key is null or length(p_idempotency_key) not between 8 and 200 then
    raise exception 'Invalid payout';
  end if;
  perform 1 from users where id=p_user_id and not is_banned for update;
  if not found then raise exception 'Unknown user'; end if;
  select * into existing from payout_requests where user_id=p_user_id and idempotency_key=p_idempotency_key;
  if found then
    if existing.amount<>p_amount or existing.method<>p_method or existing.currency<>p_currency then raise exception 'Conflicting payout intent'; end if;
    return existing.id;
  end if;
  select * into destination from user_payout_methods where user_id=p_user_id and provider=p_method and currency=p_currency for share;
  if not found then raise exception 'Payout destination required'; end if;
  balance:=creator_balance(p_user_id,p_currency);
  if (balance->>'available')::numeric<p_amount then raise exception 'Insufficient balance'; end if;
  result:=gen_random_uuid();
  insert into payout_requests(id,user_id,amount,method,currency,idempotency_key,destination,transfer_reference)
    values(result,p_user_id,p_amount,p_method,p_currency,p_idempotency_key,
      jsonb_build_object('display_name',destination.display_name,'account_number',destination.account_number,'bank_code',destination.bank_code,'currency',destination.currency),
      'liravo_payout_'||replace(result::text,'-',''));
  insert into financial_audit_log(actor_user_id,target_user_id,action,amount,currency,idempotency_key,correlation_id,metadata)
    values(p_user_id,p_user_id,'payout_requested',p_amount,p_currency,p_idempotency_key,p_correlation_id,jsonb_build_object('payout_id',result,'method',p_method));
  return result;
end $$;

create function claim_payout_request(p_actor_id uuid,p_payout_id uuid,p_correlation_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare payout payout_requests; owner uuid;
begin
  select user_id into owner from payout_requests where id=p_payout_id;
  perform 1 from users where id in (owner,p_actor_id) order by id for update;
  if p_actor_id is not null and not exists(select 1 from users where id=p_actor_id and is_admin and not is_banned) then raise exception 'Forbidden' using errcode='P1003'; end if;
  select * into payout from payout_requests where id=p_payout_id for update;
  if not found then raise exception 'Unknown payout' using errcode='P1005'; end if;
  if payout.status in ('completed','failed','cancelled') then return jsonb_build_object('status',payout.status,'claimed',false); end if;
  if payout.method='manual' then
    if p_actor_id is null then raise exception 'Admin required' using errcode='P1003'; end if;
    if payout.status='processing' then return jsonb_build_object('status',payout.status,'claimed',false); end if;
    if payout.destination is null then raise exception 'Payout destination required' using errcode='P1004'; end if;
  elsif payout.method<>'paystack' or payout.currency<>'NGN' or payout.destination is null then raise exception 'Invalid payout destination' using errcode='P1004'; end if;
  if payout.next_attempt_at>now() or payout.claimed_at>now()-interval '2 minutes' then return jsonb_build_object('status',payout.status,'claimed',false); end if;
  update payout_requests set status='processing',claimed_at=now(),attempts=attempts+1,next_attempt_at=now()+interval '2 minutes' where id=payout.id returning * into payout;
  insert into financial_audit_log(actor_user_id,target_user_id,action,amount,currency,provider,correlation_id,metadata)
    values(p_actor_id,payout.user_id,'payout_processing',payout.amount,payout.currency,payout.method,p_correlation_id,jsonb_build_object('payout_id',payout.id,'attempt',payout.attempts));
  return to_jsonb(payout)||jsonb_build_object('claimed',true);
end $$;

create function settle_payout_request(p_actor_id uuid,p_payout_id uuid,p_status text,p_reference text,p_amount numeric,p_currency text,p_provider_code text,p_correlation_id text)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare payout payout_requests; owner uuid;
begin
  select user_id into owner from payout_requests where id=p_payout_id;
  perform 1 from users where id in (owner,p_actor_id) order by id for update;
  if p_actor_id is not null and not exists(select 1 from users where id=p_actor_id and is_admin and not is_banned) then raise exception 'Forbidden' using errcode='P1003'; end if;
  select * into payout from payout_requests where id=p_payout_id for update;
  if not found then raise exception 'Unknown payout' using errcode='P1005'; end if;
  if p_status is null or p_status not in ('completed','failed','reversed') or p_reference is null or length(p_reference) not between 4 and 200
    or p_amount is distinct from payout.amount or p_currency is distinct from payout.currency then raise exception 'Settlement mismatch' using errcode='P1002'; end if;
  if payout.method='manual' and (p_actor_id is null or p_status<>'completed' or payout.status not in ('processing','completed')) then raise exception 'Admin settlement receipt required' using errcode='P1003'; end if;
  if payout.method='paystack' and p_reference is distinct from payout.transfer_reference then raise exception 'Transfer binding mismatch' using errcode='P1003'; end if;
  if payout.provider_transfer_code is not null and payout.provider_transfer_code is distinct from p_provider_code then raise exception 'Transfer identity conflict' using errcode='P1001'; end if;
  if payout.status='completed' and p_status='completed' then
    if payout.settlement_reference is distinct from p_reference then raise exception 'Settlement conflict' using errcode='P1001'; end if;
    return payout.status;
  end if;
  if payout.status in ('failed','cancelled') then
    if p_status in ('failed','reversed') then return payout.status; end if;
    raise exception 'Terminal payout conflict' using errcode='P1001';
  end if;
  if payout.status='completed' and p_status<>'reversed' then raise exception 'Terminal payout conflict' using errcode='P1001'; end if;
  update payout_requests set status=case when p_status='reversed' then 'failed' else p_status end,settlement_reference=p_reference,provider_transfer_code=p_provider_code,
    completed_at=case when p_status='completed' then now() else null end,claimed_at=null,last_error=null where id=payout.id;
  insert into financial_audit_log(actor_user_id,target_user_id,action,amount,currency,provider,provider_event_id,correlation_id,metadata)
    values(p_actor_id,payout.user_id,'payout_'||p_status,payout.amount,payout.currency,payout.method,p_reference,p_correlation_id,jsonb_build_object('payout_id',payout.id,'provider_code',p_provider_code));
  return case when p_status='reversed' then 'failed' else p_status end;
end $$;

create function defer_payout_request(p_payout_id uuid,p_attempt integer,p_error text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update payout_requests set claimed_at=null,last_error=left(p_error,200),next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,least(p_attempt,7)))::integer)
    where id=p_payout_id and status='processing' and attempts=p_attempt;
end $$;

revoke all on function creator_balance(uuid,text),create_payout_request_atomic(uuid,numeric,text,text,text,text),claim_payout_request(uuid,uuid,text),
  settle_payout_request(uuid,uuid,text,text,numeric,text,text,text),defer_payout_request(uuid,integer,text) from public,anon,authenticated;
grant execute on function creator_balance(uuid,text),create_payout_request_atomic(uuid,numeric,text,text,text,text),claim_payout_request(uuid,uuid,text),
  settle_payout_request(uuid,uuid,text,text,numeric,text,text,text),defer_payout_request(uuid,integer,text) to service_role;

create function cancel_payout_request(p_user_id uuid,p_payout_id uuid,p_correlation_id text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare payout payout_requests;
begin
  perform 1 from users where id=p_user_id for update;
  select * into payout from payout_requests where id=p_payout_id and user_id=p_user_id for update;
  if not found then raise exception 'Unknown payout' using errcode='P1005'; end if;
  if payout.status='cancelled' then return; end if;
  if payout.status<>'pending' then raise exception 'Payout already processing' using errcode='P1001'; end if;
  update payout_requests set status='cancelled' where id=payout.id;
  insert into financial_audit_log(actor_user_id,target_user_id,action,amount,currency,correlation_id,metadata)
    values(p_user_id,p_user_id,'payout_cancelled',payout.amount,payout.currency,p_correlation_id,jsonb_build_object('payout_id',payout.id));
end $$;
revoke all on function cancel_payout_request(uuid,uuid,text) from public,anon,authenticated;
grant execute on function cancel_payout_request(uuid,uuid,text) to service_role;

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
    'unconfirmedPayouts', (select count(*) from payout_requests where (status='processing' and (attempts>=10 or created_at<now()-interval '25 hours')) or (status='pending' and created_at<now()-interval '7 days')),
    'uncertainDigests', (select count(*) from digest_deliveries where status='unknown' or (status='sending' and updated_at<now()-interval '5 minutes'))
  );
$$;


create function release_legacy_payout_request(p_actor_id uuid,p_payout_id uuid,p_reference text,p_amount numeric,p_currency text,p_correlation_id text)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare payout payout_requests; owner uuid;
begin
  select user_id into owner from payout_requests where id=p_payout_id;
  perform 1 from users where id in (owner,p_actor_id) order by id for update;
  if p_actor_id is null or not exists(select 1 from users where id=p_actor_id and is_admin and not is_banned) then raise exception 'Forbidden' using errcode='P1003'; end if;
  select * into payout from payout_requests where id=p_payout_id for update;
  if not found then raise exception 'Unknown payout' using errcode='P1005'; end if;
  if payout.idempotency_key not like 'legacy_tip_payout:%' or p_reference is null or length(p_reference) not between 4 and 200
    or p_amount is distinct from payout.amount or p_currency is distinct from payout.currency then raise exception 'Legacy reconciliation mismatch' using errcode='P1002'; end if;
  if payout.status='failed' and payout.settlement_reference=p_reference then return 'failed'; end if;
  if payout.status<>'processing' then raise exception 'Reconciliation conflict' using errcode='P1001'; end if;
  update payout_requests set status='failed',settlement_reference=p_reference,last_error=null,claimed_at=null where id=payout.id;
  insert into financial_audit_log(actor_user_id,target_user_id,action,amount,currency,provider,provider_event_id,correlation_id,metadata)
    values(p_actor_id,payout.user_id,'legacy_payout_released',payout.amount,payout.currency,'manual',p_reference,p_correlation_id,jsonb_build_object('payout_id',payout.id));
  return 'failed';
end $$;
revoke all on function release_legacy_payout_request(uuid,uuid,text,numeric,text,text) from public,anon,authenticated;
grant execute on function release_legacy_payout_request(uuid,uuid,text,numeric,text,text) to service_role;

notify pgrst, 'reload schema';
