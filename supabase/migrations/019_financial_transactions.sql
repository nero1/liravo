-- Financial state, audit and durable side effects commit together. Service-only RPCs.
create table if not exists payment_events (
  provider text not null,
  event_id text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key(provider, event_id)
);
alter table payment_events enable row level security;
drop policy if exists payout_requests_insert_own on payout_requests;
drop policy if exists payout_requests_update_own on payout_requests;
alter table payout_requests drop constraint if exists payout_requests_idempotency_key_key;
create unique index if not exists payout_intent on payout_requests(user_id, idempotency_key);

create or replace function create_payout_request_atomic(p_user_id uuid, p_amount numeric, p_method text, p_idempotency_key text, p_correlation_id text)
returns uuid language plpgsql security definer set search_path = public,pg_temp as $$
declare available numeric; reserved numeric; existing payout_requests; result uuid;
begin
  if p_amount is null or p_method is null or p_idempotency_key is null or p_amount < 5 or p_amount > 10000 or p_amount <> round(p_amount, 2) or p_method not in ('dodopayments','paystack') or length(p_idempotency_key) not between 8 and 200 then
    raise exception 'Invalid payout';
  end if;
  perform 1 from users where id = p_user_id for update;
  if not found then raise exception 'Unknown user'; end if;
  select * into existing from payout_requests where user_id=p_user_id and idempotency_key=p_idempotency_key;
  if found then
    if existing.amount <> p_amount or existing.method <> p_method then raise exception 'Conflicting payout intent'; end if;
    return existing.id;
  end if;
  select coalesce(sum(coalesce(recipient_amount, creator_amount)),0) into available from tips
    where coalesce(recipient_id,creator_id)=p_user_id and status='completed' and currency='USD';
  select available + coalesce(sum(commission_amount),0) into available from referral_commissions
    where referrer_id=p_user_id and reversed_at is null;
  select available + coalesce(sum(amount),0) into available from event_revenue where organizer_id=p_user_id and currency='USD';
  select coalesce(sum(amount),0) into reserved from payout_requests where user_id=p_user_id and status in ('pending','processing','completed');
  if available-reserved < p_amount then raise exception 'Insufficient balance'; end if;
  insert into payout_requests(user_id,amount,method,idempotency_key) values(p_user_id,p_amount,p_method,p_idempotency_key) returning id into result;
  insert into financial_audit_log(actor_user_id,target_user_id,action,amount,currency,idempotency_key,correlation_id)
    values(p_user_id,p_user_id,'payout_requested',p_amount,'USD',p_idempotency_key,p_correlation_id);
  return result;
end $$;

create or replace function process_payment_event(p_provider text, p_event_id text, p_payload jsonb, p_correlation_id text)
returns boolean language plpgsql security definer set search_path = public,pg_temp as $$
declare old_payload jsonb; t tips; s subscriptions; referrer uuid; gross numeric; fee numeric; event_at timestamptz;
begin
  if p_provider is null or p_event_id is null or p_payload is null or p_provider not in ('paystack','dodopayments') or length(p_event_id) not between 8 and 200 then raise exception 'Invalid payment event'; end if;
  insert into payment_events values(p_provider,p_event_id,p_payload,now()) on conflict do nothing;
  if not found then
    select payload into old_payload from payment_events where provider=p_provider and event_id=p_event_id;
    if old_payload <> p_payload then raise exception 'Event payload conflict' using errcode='P1001'; end if;
    return false;
  end if;
  if p_payload ? 'tipId' then
    select * into t from tips where id=(p_payload->>'tipId')::uuid for update;
    if not found then raise exception 'Unknown tip'; end if;
    if t.status='completed' then return false; end if;
    if t.status not in ('pending','failed') then raise exception 'Invalid tip transition'; end if;
    if p_payload->>'status'='completed' and p_payload ? 'paid_amount_minor' and ((p_payload->>'currency') is distinct from t.currency or (p_payload->>'paid_amount_minor')::numeric<t.amount*100) then raise exception 'Payment amount mismatch' using errcode='P1002'; end if;
    if p_payload->>'status' not in ('completed','failed') then raise exception 'Invalid tip status'; end if;
    update tips set status=p_payload->>'status',provider_reference=p_payload->>'providerReference' where id=t.id;
    if p_payload->>'status'='completed' then
      insert into payouts(tip_id,recipient_id,amount,currency,provider) values(t.id,coalesce(t.recipient_id,t.creator_id),coalesce(t.recipient_amount,t.creator_amount),t.currency,p_provider);
      if t.currency='USD' then
        select referred_by into referrer from users where id=t.user_id;
        gross:=t.amount; fee:=t.platform_fee;
      end if;
      insert into outbox_events(aggregate_type,aggregate_id,event_type,payload) values('tip',t.id::text,'notify_recipient',jsonb_build_object('userId',coalesce(t.recipient_id,t.creator_id),'actorId',t.user_id,'tipId',t.id,'amount',t.amount,'currency',t.currency));
      insert into outbox_events(aggregate_type,aggregate_id,event_type,payload) values('tip',t.id::text,'award_xp',jsonb_build_object('userId',t.user_id,'amount',5,'reason','tip_sent'));
    end if;
  else
    perform 1 from users where id=(p_payload->>'user_id')::uuid for update;
    select * into s from subscriptions where id=(p_payload->>'subscription_id')::uuid and user_id=(p_payload->>'user_id')::uuid and provider=p_provider for update;
    if not found then raise exception 'Unknown subscription'; end if;
    event_at:=coalesce((p_payload->>'provider_event_at')::timestamptz,now());
    if event_at>now()+interval '5 minutes' then raise exception 'Invalid provider event time'; end if;
    if p_payload->>'provider_subscription_id' is not null and s.provider_subscription_id is not null and s.provider_subscription_id<>p_payload->>'provider_subscription_id' then raise exception 'Subscription binding mismatch' using errcode='P1003'; end if;
    if p_payload->>'event'='subscription.activated' then
      if p_payload ? 'paid_amount_minor' and ((p_payload->>'currency') is distinct from s.currency or (p_payload->>'paid_amount_minor')::numeric<s.amount*100) then raise exception 'Payment amount mismatch' using errcode='P1002'; end if;
      if p_payload->>'provider_reference' is not null and s.provider_event_id is not null and p_payload->>'provider_reference'<>s.provider_event_id then raise exception 'Payment reference mismatch' using errcode='P1003'; end if;
      if s.last_provider_event_at is null or event_at>s.last_provider_event_at or (event_at=s.last_provider_event_at and s.status<>'cancelled') then
        update subscriptions set status='active',activated_at=event_at,last_provider_event_at=event_at,provider_subscription_id=coalesce(s.provider_subscription_id,p_payload->>'provider_subscription_id') where id=s.id;
        update users set is_premium=true where id=s.user_id;
      end if;
      if s.currency='USD' then
        select referred_by into referrer from users where id=s.user_id;
        gross:=s.amount; fee:=gross*0.1;
      end if;
    elsif p_payload->>'event'='subscription.cancelled' then
      if s.last_provider_event_at is null or event_at>=s.last_provider_event_at then
        update subscriptions set status='cancelled',cancelled_at=event_at,last_provider_event_at=event_at,provider_subscription_id=coalesce(s.provider_subscription_id,p_payload->>'provider_subscription_id') where id=s.id;
        update users set is_premium=exists(select 1 from subscriptions where user_id=s.user_id and status='active') where id=s.user_id;
      end if;
    else raise exception 'Invalid subscription event'; end if;
  end if;
  if referrer is not null then
    insert into referral_commissions(referrer_id,referred_user_id,transaction_id,transaction_type,gross_transaction_amount,platform_fee_amount,commission_amount,idempotency_key)
      values(referrer,coalesce(t.user_id,s.user_id),coalesce(t.id,s.id)::text,case when t.id is null then 'subscription' else 'tip' end,gross,fee,fee*0.1,p_provider||':'||p_event_id);
  end if;
  insert into financial_audit_log(target_user_id,action,provider,provider_event_id,correlation_id,metadata)
    values(coalesce(t.user_id,s.user_id),'payment_processed',p_provider,p_event_id,p_correlation_id,p_payload);
  return true;
end $$;

revoke all on function create_payout_request_atomic(uuid,numeric,text,text,text) from public;
revoke all on function process_payment_event(text,text,jsonb,text) from public;
revoke all on function process_subscription_webhook(text,uuid,uuid) from public;
grant execute on function create_payout_request_atomic(uuid,numeric,text,text,text) to service_role;
grant execute on function process_payment_event(text,text,jsonb,text) to service_role;

alter table tips add column if not exists idempotency_key text;
create unique index if not exists tip_intent on tips(user_id,idempotency_key);
create or replace function create_tip_transaction(p_user_id uuid,p_recipient_id uuid,p_amount numeric,p_platform_fee numeric,p_recipient_amount numeric,p_currency text,p_idempotency_key text,p_correlation_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare t tips;
begin
  if p_amount < 0.5 or p_amount > 5000 or p_amount<>round(p_amount,2) or p_currency not in ('USD','NGN','EUR') or p_user_id=p_recipient_id or length(p_idempotency_key) not between 8 and 200 then raise exception 'Invalid tip'; end if;
  perform 1 from users where id=p_user_id for update;
  select * into t from tips where user_id=p_user_id and idempotency_key=p_idempotency_key;
  if found then
    if t.amount<>p_amount or t.recipient_id<>p_recipient_id or t.currency<>p_currency then raise exception 'Conflicting tip intent'; end if;
    return jsonb_build_object('id',t.id);
  end if;
  if p_platform_fee<>round(p_amount*0.1,2) or p_recipient_amount<>p_amount-p_platform_fee then raise exception 'Invalid tip fees'; end if;
  insert into tips(user_id,recipient_id,amount,platform_fee,recipient_amount,currency,status,idempotency_key)
    values(p_user_id,p_recipient_id,p_amount,p_platform_fee,p_recipient_amount,p_currency,'pending',p_idempotency_key) returning * into t;
  insert into financial_audit_log(actor_user_id,target_user_id,action,amount,currency,idempotency_key,correlation_id,metadata)
    values(p_user_id,p_recipient_id,'tip_created',p_amount,p_currency,p_idempotency_key,p_correlation_id,jsonb_build_object('tip_id',t.id));
  return jsonb_build_object('id',t.id);
end $$;
revoke all on function create_tip_transaction(uuid,uuid,numeric,numeric,numeric,text,text,text) from public;
grant execute on function create_tip_transaction(uuid,uuid,numeric,numeric,numeric,text,text,text) to service_role;
