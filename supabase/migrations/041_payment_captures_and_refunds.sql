create table payment_captures (
  provider text not null check(provider in ('paystack','dodopayments')),
  payment_id text not null,
  entity_type text not null check(entity_type in ('tip','subscription')),
  entity_id uuid not null,
  user_id uuid not null references users(id),
  recipient_id uuid references users(id),
  currency text not null check(currency in ('USD','NGN','EUR')),
  charged_minor bigint not null check(charged_minor>0),
  credited boolean not null default true,
  refunded_minor bigint not null default 0 check(refunded_minor>=0 and refunded_minor<=charged_minor),
  period_end timestamptz,
  event_id text not null,
  created_at timestamptz not null default now(),
  primary key(provider,payment_id)
);
create index captures_by_entity on payment_captures(entity_type,entity_id);
create table payment_refunds (
  provider text not null,
  refund_id text not null,
  payment_id text not null,
  amount_minor bigint not null check(amount_minor>0),
  currency text not null,
  correlation_id text,
  created_at timestamptz not null default now(),
  primary key(provider,refund_id),
  foreign key(provider,payment_id) references payment_captures(provider,payment_id)
);
create table refund_inbox (
  provider text not null,
  refund_id text not null,
  payment_id text not null,
  amount_minor bigint not null,
  currency text not null,
  status text not null default 'pending' check(status in ('pending','processing','processed','failed')),
  attempts integer not null default 0,
  claimed_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  correlation_id text,
  created_at timestamptz not null default now(),
  primary key(provider,refund_id)
);
alter table refund_inbox enable row level security;
revoke all on refund_inbox from public,anon,authenticated;
grant select,update on refund_inbox to service_role;
create table xp_reversals (
  user_id uuid not null,
  event_key text not null,
  amount integer not null,
  created_at timestamptz not null default now(),
  primary key(user_id,event_key),
  foreign key(user_id,event_key) references xp_ledger(user_id,event_key)
);
alter table payment_captures enable row level security;
alter table payment_refunds enable row level security;
alter table xp_reversals enable row level security;
revoke all on payment_captures,payment_refunds,xp_reversals from public,anon,authenticated;
grant select on payment_captures,payment_refunds,xp_reversals to service_role;
alter table tips add column refunded_recipient_amount numeric(10,2) not null default 0;
update tips set refunded_recipient_amount=coalesce(recipient_amount,creator_amount) where status='refunded';
alter table referral_commissions add column original_commission_amount numeric(12,4);
update referral_commissions set original_commission_amount=commission_amount;
alter table subscriptions add column renewal_cancelled boolean not null default false;
alter table subscriptions add column provider_checkout_id text;
alter table tips add column provider_checkout_id text;

insert into payment_captures(provider,payment_id,entity_type,entity_id,user_id,recipient_id,currency,charged_minor,period_end,event_id,created_at)
  select e.provider,substring(e.event_id from position(':' in e.event_id)+1),case when t.id is null then 'subscription' else 'tip' end,
    coalesce(t.id,s.id),coalesce(t.user_id,s.user_id),coalesce(t.recipient_id,t.creator_id),e.payload->>'currency',(e.payload->>'paid_amount_minor')::bigint,
    case when s.id is null then null when e.provider='paystack' then coalesce((e.payload->>'provider_event_at')::timestamptz,e.created_at)+interval '30 days' else s.current_period_end end,
    e.event_id,e.created_at
  from payment_events e left join tips t on t.id=(e.payload->>'tipId')::uuid
    left join subscriptions s on s.id=(e.payload->>'subscription_id')::uuid
  where ((e.provider='paystack' and e.event_id like 'charge:%') or (e.provider='dodopayments' and e.event_id like 'payment:%'))
    and e.payload->>'paid_amount_minor' ~ '^[0-9]+$' and (e.payload->>'paid_amount_minor')::numeric>0
    and e.payload->>'currency' in ('USD','NGN','EUR') and (t.id is not null or s.id is not null)
  on conflict do nothing;
update payment_captures c set credited=false from tips t where c.entity_type='tip' and c.entity_id=t.id and t.status='refunded';
with reversed as (
  update referral_commissions r set commission_amount=0,reversed_at=coalesce(reversed_at,now())
    where transaction_type='tip' and exists(select 1 from tips t where t.id::text=r.transaction_id and t.status='refunded') and reversed_at is null
    returning referrer_id,original_commission_amount,id
) insert into financial_audit_log(target_user_id,action,amount,currency,correlation_id,metadata)
  select referrer_id,'legacy_refund_commission_reversed',original_commission_amount,'USD','migration-041',jsonb_build_object('commission_id',id) from reversed;
with reversed as (
  insert into xp_reversals(user_id,event_key,amount)
    select l.user_id,l.event_key,l.amount from xp_ledger l join outbox_events e on l.event_key=coalesce(e.payload->>'eventKey','outbox:'||e.id::text)
      join tips t on t.id::text=e.aggregate_id where e.aggregate_type='tip' and e.event_type='award_xp' and t.status='refunded' and l.user_id=t.user_id
    on conflict do nothing returning user_id,amount
), adjusted as (
  update users u set xp=greatest(0,xp-r.total) from (select user_id,sum(amount)::integer as total from reversed group by user_id) r where u.id=r.user_id returning u.id
) insert into financial_audit_log(target_user_id,action,correlation_id,metadata)
  select user_id,'legacy_refund_xp_reversed','migration-041',jsonb_build_object('xp',sum(amount)) from reversed group by user_id;
update subscriptions s set current_period_end=(select max(period_end) from payment_captures c where c.entity_type='subscription' and c.entity_id=s.id)
  where s.provider='paystack' and s.status='active' and s.current_period_end is null;

create or replace function has_premium_access(p_user_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce((select premium_override from users where id=p_user_id),false) or exists(
    select 1 from subscriptions where user_id=p_user_id and status='active' and current_period_end>now()
  );
$$;

create or replace function process_payment_event(p_provider text,p_event_id text,p_payload jsonb,p_correlation_id text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare t tips; s subscriptions; capture payment_captures; capture_payment_id text; paid bigint; tax bigint; end_at timestamptz; owner uuid; recipient uuid; referrer uuid; applied boolean; duplicate boolean; old_payload jsonb;
begin
  if p_payload->>'event'='subscription.cancelled' then
    applied:=process_payment_event_legacy(p_provider,p_event_id,p_payload,p_correlation_id);
    select * into s from subscriptions where id=(p_payload->>'subscription_id')::uuid;
    if s.last_provider_event_at<=(p_payload->>'provider_event_at')::timestamptz then
      update subscriptions set renewal_cancelled=true,status=case when current_period_end>now() then 'active' else 'expired' end where id=s.id;
    end if;
    perform refresh_premium_access(s.user_id);
    return applied;
  end if;
  if p_payload->>'status'='failed' then return process_payment_event_legacy(p_provider,p_event_id,p_payload,p_correlation_id); end if;
  capture_payment_id:=p_payload->>'payment_id';
  if capture_payment_id is null or length(capture_payment_id) not between 1 and 150 or p_payload->>'paid_amount_minor' is null or p_payload->>'paid_amount_minor' !~ '^[0-9]+$' then raise exception 'Invalid captured payment' using errcode='P1004'; end if;
  paid:=(p_payload->>'paid_amount_minor')::bigint;
  tax:=coalesce((p_payload->>'tax_minor')::bigint,0);
  if tax<0 or tax>paid then raise exception 'Invalid payment tax' using errcode='P1002'; end if;
  if paid<=0 or p_payload->>'currency' not in ('USD','NGN','EUR') then raise exception 'Invalid captured payment' using errcode='P1004'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_provider||':capture:'||capture_payment_id,0));
  if p_payload ? 'tipId' then
    select * into t from tips where id=(p_payload->>'tipId')::uuid;
    if not found then raise exception 'Unknown tip'; end if;
    owner:=t.user_id;recipient:=coalesce(t.recipient_id,t.creator_id);
  else
    select * into s from subscriptions where id=(p_payload->>'subscription_id')::uuid;
    if not found then raise exception 'Unknown subscription'; end if;
    owner:=s.user_id;
    end_at:=(p_payload->>'period_end')::timestamptz;
    if p_payload->>'provider_event_at' is null or end_at is null or end_at<=(p_payload->>'provider_event_at')::timestamptz then raise exception 'Verified billing period required' using errcode='P1004'; end if;
  end if;
  if paid-tax<>coalesce(t.amount,s.amount)*100 then raise exception 'Payment amount mismatch' using errcode='P1002'; end if;
  select referred_by into referrer from users where id=owner;
  perform 1 from users where id in (owner,recipient,referrer) order by id for update;
  if t.id is not null then
    select * into t from tips where id=t.id for update;
    if p_payload->>'currency' is distinct from t.currency then raise exception 'Payment currency mismatch' using errcode='P1002'; end if;
  else
    select * into s from subscriptions where id=s.id for update;
    if s.user_id is distinct from (p_payload->>'user_id')::uuid or s.provider is distinct from p_provider
      or (p_payload->>'provider_reference' is not null and s.provider_event_id is distinct from p_payload->>'provider_reference')
      or (s.provider_subscription_id is not null and p_payload->>'provider_subscription_id' is not null and s.provider_subscription_id<>p_payload->>'provider_subscription_id') then raise exception 'Payment binding mismatch' using errcode='P1003'; end if;
    if p_payload->>'currency' is distinct from s.currency then raise exception 'Payment currency mismatch' using errcode='P1002'; end if;
  end if;
  select * into capture from payment_captures where provider=p_provider and payment_captures.payment_id=capture_payment_id;
  if found and (capture.entity_id<>coalesce(t.id,s.id) or capture.charged_minor<>paid or capture.currency<>p_payload->>'currency') then raise exception 'Payment capture conflict' using errcode='P1001'; end if;
  if found and capture.event_id<>p_event_id then raise exception 'Payment identity conflict' using errcode='P1001'; end if;
  if capture.payment_id is not null then
    if s.id is not null then
      if capture.period_end is not null and capture.period_end is distinct from end_at then raise exception 'Paid period conflict' using errcode='P1001'; end if;
      if capture.period_end is null and capture.credited then
        update payment_captures set period_end=end_at where provider=p_provider and payment_captures.payment_id=capture_payment_id;
        update subscriptions set current_period_end=(select max(period_end) from payment_captures where entity_type='subscription' and entity_id=s.id and credited and refunded_minor<charged_minor),
          status=case when end_at>now() then 'active' else 'expired' end where id=s.id;
        insert into financial_audit_log(target_user_id,action,provider,provider_event_id,correlation_id,metadata)
          values(owner,'billing_period_reconciled',p_provider,p_event_id,p_correlation_id,jsonb_build_object('subscription_id',s.id,'period_end',end_at));
        perform refresh_premium_access(owner);
      end if;
    end if;
    perform apply_pending_capture_refunds(p_provider,capture_payment_id,p_correlation_id);
    return false;
  end if;

  duplicate:=capture.payment_id is null and (
    (t.id is not null and t.status in ('completed','refunded')) or
    (s.id is not null and exists(select 1 from payment_captures where entity_type='subscription' and entity_id=s.id and period_end=end_at and credited and refunded_minor<charged_minor))
  );
  if duplicate then
    insert into payment_events(provider,event_id,payload) values(p_provider,p_event_id,p_payload) on conflict do nothing;
    if not found then
      select payload into old_payload from payment_events where provider=p_provider and event_id=p_event_id;
      if old_payload<>p_payload then raise exception 'Event payload conflict' using errcode='P1001'; end if;
      return false;
    end if;
    insert into payment_captures(provider,payment_id,entity_type,entity_id,user_id,recipient_id,currency,charged_minor,period_end,event_id,credited)
      values(p_provider,capture_payment_id,case when t.id is null then 'subscription' else 'tip' end,coalesce(t.id,s.id),owner,recipient,p_payload->>'currency',paid,end_at,p_event_id,false);
    insert into financial_audit_log(target_user_id,action,amount,currency,provider,provider_event_id,correlation_id,metadata)
      values(owner,'duplicate_payment_captured',paid::numeric/100,p_payload->>'currency',p_provider,p_event_id,p_correlation_id,jsonb_build_object('entity_id',coalesce(t.id,s.id),'payment_id',capture_payment_id));
    perform apply_pending_capture_refunds(p_provider,capture_payment_id,p_correlation_id);
    return true;
  end if;

  applied:=process_payment_event_legacy(p_provider,p_event_id,p_payload,p_correlation_id);
  if not applied then perform apply_pending_capture_refunds(p_provider,capture_payment_id,p_correlation_id); return false; end if;
  insert into payment_captures(provider,payment_id,entity_type,entity_id,user_id,recipient_id,currency,charged_minor,period_end,event_id)
    values(p_provider,capture_payment_id,case when t.id is null then 'subscription' else 'tip' end,coalesce(t.id,s.id),owner,recipient,p_payload->>'currency',paid,end_at,p_event_id)
    on conflict do nothing;
  update referral_commissions set original_commission_amount=commission_amount where idempotency_key=p_provider||':'||p_event_id and original_commission_amount is null;
  if s.id is not null then
    update subscriptions set current_period_end=(select max(period_end) from payment_captures where entity_type='subscription' and entity_id=s.id and credited and refunded_minor<charged_minor),
      renewal_cancelled=case when p_provider='paystack' then true else coalesce((p_payload->>'renewal_cancelled')::boolean,renewal_cancelled) end where id=s.id;
    perform refresh_premium_access(s.user_id);
  end if;
  perform apply_pending_capture_refunds(p_provider,capture_payment_id,p_correlation_id);
  return true;
end $$;

create function process_refund_event(p_provider text,p_refund_id text,p_payment_id text,p_amount_minor bigint,p_currency text,p_correlation_id text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare capture payment_captures; previous payment_refunds; receipt refund_inbox; t tips; referrer uuid; total bigint; reversal record; wallet record; pending payout_requests; new_end timestamptz;
begin
  if p_provider is null or p_provider not in ('paystack','dodopayments') or p_refund_id is null or length(p_refund_id) not between 1 and 150
    or p_payment_id is null or length(p_payment_id) not between 1 and 150 or p_amount_minor is null or p_amount_minor<=0 or p_currency is null or p_currency not in ('USD','NGN','EUR') then raise exception 'Invalid refund' using errcode='P1004'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_provider||':capture:'||p_payment_id,0));
  perform pg_advisory_xact_lock(hashtextextended(p_provider||':refund:'||p_refund_id,0));
  select * into receipt from refund_inbox where provider=p_provider and refund_id=p_refund_id;
  if found and (receipt.payment_id<>p_payment_id or receipt.amount_minor<>p_amount_minor or receipt.currency<>p_currency) then raise exception 'Refund identity conflict' using errcode='P1001'; end if;
  insert into refund_inbox(provider,refund_id,payment_id,amount_minor,currency,correlation_id) values(p_provider,p_refund_id,p_payment_id,p_amount_minor,p_currency,p_correlation_id) on conflict do nothing;
  select * into capture from payment_captures where provider=p_provider and payment_id=p_payment_id;
  if not found then return null; end if;
  select referrer_id into referrer from referral_commissions where idempotency_key=p_provider||':'||capture.event_id and capture.credited;
  perform 1 from users where id in (capture.user_id,capture.recipient_id,referrer) order by id for update;
  select * into capture from payment_captures where provider=p_provider and payment_id=p_payment_id for update;
  select * into previous from payment_refunds where provider=p_provider and refund_id=p_refund_id;
  if found then
    if previous.payment_id<>p_payment_id or previous.amount_minor<>p_amount_minor or previous.currency<>p_currency then raise exception 'Refund identity conflict' using errcode='P1001'; end if;
    update refund_inbox set status='processed',claimed_at=null where provider=p_provider and refund_id=p_refund_id;
    return false;
  end if;
  if capture.currency<>p_currency or capture.refunded_minor+p_amount_minor>capture.charged_minor then raise exception 'Refund amount or currency mismatch' using errcode='P1002'; end if;
  insert into payment_refunds(provider,refund_id,payment_id,amount_minor,currency,correlation_id) values(p_provider,p_refund_id,p_payment_id,p_amount_minor,p_currency,p_correlation_id);
  total:=capture.refunded_minor+p_amount_minor;
  update payment_captures set refunded_minor=total where provider=p_provider and payment_id=p_payment_id;
  if capture.credited and capture.entity_type='tip' then
    select * into t from tips where id=capture.entity_id for update;
    update tips set refunded_recipient_amount=round(coalesce(recipient_amount,creator_amount)*total/capture.charged_minor,2),
      status=case when total=capture.charged_minor then 'refunded' else 'completed' end where id=t.id;
    if total=capture.charged_minor then
      for reversal in select l.* from xp_ledger l join outbox_events e on l.event_key=coalesce(e.payload->>'eventKey','outbox:'||e.id::text)
        where e.aggregate_type='tip' and e.aggregate_id=t.id::text and e.event_type='award_xp' and l.user_id=t.user_id loop
        insert into xp_reversals(user_id,event_key,amount) values(reversal.user_id,reversal.event_key,reversal.amount) on conflict do nothing;
        if found then update users set xp=greatest(0,xp-reversal.amount) where id=reversal.user_id; end if;
      end loop;
    end if;
  elsif capture.credited then
    select max(period_end) into new_end from payment_captures where entity_type='subscription' and entity_id=capture.entity_id and credited and refunded_minor<charged_minor;
    update subscriptions set current_period_end=new_end,status=case when new_end>now() then 'active' else 'expired' end where id=capture.entity_id;
    perform refresh_premium_access(capture.user_id);
    if p_provider='dodopayments' and (new_end is null or new_end<=now()) then
      insert into subscription_cancellations(subscription_id,correlation_id) values(capture.entity_id,p_correlation_id) on conflict do nothing;
      if found then insert into financial_audit_log(target_user_id,action,provider,correlation_id,metadata)
        values(capture.user_id,'subscription_cancellation_requested',p_provider,p_correlation_id,jsonb_build_object('subscription_id',capture.entity_id,'reason','fully_refunded')); end if;
    end if;
  end if;
  update referral_commissions set commission_amount=round(original_commission_amount*(capture.charged_minor-total)/capture.charged_minor,4),
    reversed_at=case when total=capture.charged_minor then now() else null end where idempotency_key=p_provider||':'||capture.event_id and capture.credited;
  for wallet in select capture.recipient_id as user_id,capture.currency as currency where capture.recipient_id is not null
    union select referrer,'USD' where referrer is not null loop
    for pending in select * from payout_requests where user_id=wallet.user_id and currency=wallet.currency and status='pending' order by created_at desc,id for update loop
      exit when (creator_balance(wallet.user_id,wallet.currency)->>'available')::numeric>=0;
      update payout_requests set status='cancelled',last_error='Cancelled after payment refund' where id=pending.id;
      insert into financial_audit_log(target_user_id,action,amount,currency,provider,provider_event_id,correlation_id,metadata)
        values(wallet.user_id,'payout_cancelled_after_refund',pending.amount,pending.currency,p_provider,p_refund_id,p_correlation_id,jsonb_build_object('payout_id',pending.id));
    end loop;
  end loop;
  if capture.credited and capture.recipient_id is not null then
    insert into notifications(user_id,type,actor_id,entity_type,entity_id,message)
      values(capture.recipient_id,'tip_refunded',capture.user_id,'tip',capture.entity_id,'A tip was refunded. Check your earnings.');
  end if;
  insert into financial_audit_log(target_user_id,action,amount,currency,provider,provider_event_id,correlation_id,metadata)
    values(capture.user_id,'payment_refunded',p_amount_minor::numeric/100,p_currency,p_provider,p_refund_id,p_correlation_id,
      jsonb_build_object('payment_id',p_payment_id,'entity_type',capture.entity_type,'entity_id',capture.entity_id,'total_refunded_minor',total));
  update refund_inbox set status='processed',claimed_at=null where provider=p_provider and refund_id=p_refund_id;
  return true;
end $$;

create or replace function creator_balance(p_user_id uuid,p_currency text)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  with earned as (
    select coalesce(sum(coalesce(recipient_amount,creator_amount)-refunded_recipient_amount),0) as tips from tips
      where coalesce(recipient_id,creator_id)=p_user_id and status in ('completed','refunded') and currency=p_currency
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

revoke all on function process_refund_event(text,text,text,bigint,text,text) from public,anon,authenticated;
grant execute on function process_refund_event(text,text,text,bigint,text,text) to service_role;
update users set is_premium=has_premium_access(id) where is_premium is distinct from has_premium_access(id);
create or replace function process_outbox_event_atomic(p_event_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare e outbox_events;
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
  update subscriptions set status=case when current_period_end>now() then 'active' else 'cancelled' end,renewal_cancelled=true,cancelled_at=now(),last_provider_event_at=greatest(coalesce(last_provider_event_at,now()),now()) where id=s.id;
  perform refresh_premium_access(s.user_id);
  update subscription_cancellations set status='completed',completed_at=now(),last_error=null where subscription_id=s.id;
  insert into financial_audit_log(actor_user_id,target_user_id,action,provider,correlation_id,metadata)
    values(s.user_id,s.user_id,'subscription_cancelled',s.provider,c.correlation_id,jsonb_build_object('subscription_id',s.id));
end $$;




create function claim_refund_reconciliation(p_limit integer default 3)
returns setof refund_inbox language sql security definer set search_path=public,pg_temp as $$
  with exhausted as (
    update refund_inbox set status='failed' where attempts>=10 and (status='pending' or (status='processing' and claimed_at<now()-interval '5 minutes'))
  ), candidates as (
    select provider,refund_id from refund_inbox where attempts<10 and ((status='pending' and next_attempt_at<=now()) or (status='processing' and claimed_at<now()-interval '5 minutes'))
    order by created_at for update skip locked limit greatest(1,least(p_limit,3))
  ) update refund_inbox r set status='processing',attempts=r.attempts+1,claimed_at=now()
    from candidates c where r.provider=c.provider and r.refund_id=c.refund_id returning r.*;
$$;
create function reconcile_capture_and_refund(p_provider text,p_refund_id text,p_payment_id text,p_amount_minor bigint,p_currency text,p_event_id text,p_payload jsonb,p_correlation_id text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_provider||':capture:'||p_payment_id,0));
  if p_payload->>'payment_id' is distinct from p_payment_id then raise exception 'Payment identity mismatch' using errcode='P1003'; end if;
  perform process_payment_event(p_provider,p_event_id,p_payload,p_correlation_id);
  return process_refund_event(p_provider,p_refund_id,p_payment_id,p_amount_minor,p_currency,p_correlation_id);
end $$;
revoke all on function claim_refund_reconciliation(integer),reconcile_capture_and_refund(text,text,text,bigint,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function claim_refund_reconciliation(integer),reconcile_capture_and_refund(text,text,text,bigint,text,text,jsonb,text) to service_role;


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
    'duplicatePayments', (select count(*) from payment_captures where not credited and refunded_minor<charged_minor),
    'pendingRefunds', (select count(*) from refund_inbox where status='failed' or (status<>'processed' and created_at<now()-interval '5 minutes')),
    'unverifiedBillingPeriods', (select count(*) from subscriptions where status='active' and current_period_end is null),
    'overdrawnCreators', (select count(*) from (select distinct recipient_id as id from payment_captures where refunded_minor>0 and recipient_id is not null union select referrer_id from referral_commissions where reversed_at is not null or commission_amount<original_commission_amount) users cross join (values('USD'),('NGN'),('EUR')) currencies(currency) where (creator_balance(users.id,currencies.currency)->>'available')::numeric<0),
    'unconfirmedPayouts', (select count(*) from payout_requests where (status='processing' and (attempts>=10 or created_at<now()-interval '25 hours')) or (status='pending' and created_at<now()-interval '7 days')),
    'uncertainDigests', (select count(*) from digest_deliveries where status='unknown' or (status='sending' and updated_at<now()-interval '5 minutes'))
  );
$$;



create function apply_pending_capture_refunds(p_provider text,p_payment_id text,p_correlation_id text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare receipt refund_inbox;
begin
  for receipt in select * from refund_inbox where provider=p_provider and payment_id=p_payment_id and status<>'processed' order by refund_id loop
    perform process_refund_event(p_provider,receipt.refund_id,p_payment_id,receipt.amount_minor,receipt.currency,coalesce(receipt.correlation_id,p_correlation_id));
  end loop;
end $$;
revoke all on function apply_pending_capture_refunds(text,text,text) from public,anon,authenticated,service_role;

notify pgrst, 'reload schema';
