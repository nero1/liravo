alter table financial_audit_log alter column amount type numeric(18,4);

CREATE OR REPLACE FUNCTION public.process_payment_event_legacy(p_provider text, p_event_id text, p_payload jsonb, p_correlation_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
      select referred_by into referrer from users where id=t.user_id;
      gross:=t.amount; fee:=t.platform_fee;
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
      select referred_by into referrer from users where id=s.user_id;
      gross:=s.amount; fee:=gross;
    elsif p_payload->>'event'='subscription.cancelled' then
      if s.last_provider_event_at is null or event_at>=s.last_provider_event_at then
        update subscriptions set status='cancelled',cancelled_at=event_at,last_provider_event_at=event_at,provider_subscription_id=coalesce(s.provider_subscription_id,p_payload->>'provider_subscription_id') where id=s.id;
        update users set is_premium=exists(select 1 from subscriptions where user_id=s.user_id and status='active') where id=s.user_id;
      end if;
    else raise exception 'Invalid subscription event'; end if;
  end if;
  if referrer is not null then
    insert into referral_commissions(referrer_id,referred_user_id,transaction_id,transaction_type,gross_transaction_amount,platform_fee_amount,commission_amount,idempotency_key,currency)
      values(referrer,coalesce(t.user_id,s.user_id),coalesce(t.id,s.id)::text,case when t.id is null then 'subscription' else 'tip' end,gross,fee,fee*0.1,p_provider||':'||p_event_id,coalesce(t.currency,s.currency));
  end if;
  insert into financial_audit_log(target_user_id,action,provider,provider_event_id,correlation_id,metadata)
    values(coalesce(t.user_id,s.user_id),'payment_processed',p_provider,p_event_id,p_correlation_id,p_payload);
  return true;
end $function$;

create or replace function process_refund_event_047(p_provider text,p_refund_id text,p_payment_id text,p_amount_minor bigint,p_currency text,p_correlation_id text)
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
    union select referrer,capture.currency where referrer is not null loop
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

create temporary view referral_repairs as
  select c.provider,c.payment_id,c.event_id,c.entity_id,c.entity_type,c.user_id,c.currency,c.charged_minor,c.refunded_minor,c.created_at,
    coalesce(r.referrer_id,u.referred_by) as referrer_id,r.id as commission_id,r.commission_amount as previous_amount,to_jsonb(r) as previous,
    coalesce(t.amount,s.amount) as gross,price.platform_gross,round(price.platform_gross*0.1,4) as original_amount,
    round(price.platform_gross*0.1*(c.charged_minor-c.refunded_minor)/c.charged_minor,4) as amount
  from payment_captures c join users u on u.id=c.user_id
    left join tips t on c.entity_type='tip' and t.id=c.entity_id
    left join subscriptions s on c.entity_type='subscription' and s.id=c.entity_id
    left join referral_commissions r on r.idempotency_key=c.provider||':'||c.event_id
    cross join lateral(select case when c.entity_type='tip' then t.platform_fee else s.amount end as platform_gross) price
  where c.credited and c.entity_type in ('tip','subscription') and c.currency=coalesce(t.currency,s.currency) and (
    r.id is not null and r.referred_user_id=c.user_id and r.transaction_id=c.entity_id::text and r.transaction_type=c.entity_type and r.currency=c.currency and r.commission_rate=0.1
      and coalesce(r.original_commission_amount,r.commission_amount)<=round(price.platform_gross*0.1,4)
      and r.commission_amount<=round(price.platform_gross*0.1*(c.charged_minor-c.refunded_minor)/c.charged_minor,4)
      and (r.original_commission_amount is distinct from round(price.platform_gross*0.1,4) or r.platform_fee_amount is distinct from price.platform_gross)
    or r.id is null and u.referred_by is not null and u.referred_by<>u.id and exists(
      select 1 from referrals attribution where attribution.referrer_id=u.referred_by and attribution.referred_id=u.id and attribution.created_at<=coalesce(t.created_at,s.created_at)
    )
  );
do $$
declare targets jsonb; item record; repaired referral_commissions;
begin
  select jsonb_agg(jsonb_build_object('provider',provider,'payment_id',payment_id)) into targets from pg_temp.referral_repairs;
  if targets is null then return; end if;
  for item in select * from jsonb_to_recordset(targets) as target(provider text,payment_id text) order by provider,payment_id loop
    perform pg_advisory_xact_lock(hashtextextended(item.provider||':capture:'||item.payment_id,0));
  end loop;
  perform 1 from users where id in (
    select r.referrer_id from pg_temp.referral_repairs r join jsonb_to_recordset(targets) as target(provider text,payment_id text) using(provider,payment_id)
  ) order by id for update;
  for item in select r.* from pg_temp.referral_repairs r join jsonb_to_recordset(targets) as target(provider text,payment_id text) using(provider,payment_id) order by r.provider,r.payment_id loop
    if item.commission_id is null then
      insert into referral_commissions(referrer_id,referred_user_id,transaction_id,transaction_type,gross_transaction_amount,platform_fee_amount,commission_amount,original_commission_amount,idempotency_key,currency,credited_at,created_at,reversed_at)
        values(item.referrer_id,item.user_id,item.entity_id::text,item.entity_type,item.gross,item.platform_gross,item.amount,item.original_amount,item.provider||':'||item.event_id,item.currency,item.created_at,item.created_at,case when item.refunded_minor=item.charged_minor then now() else null end)
        on conflict do nothing returning * into repaired;
      if not found then continue; end if;
    else
      update referral_commissions set gross_transaction_amount=item.gross,platform_fee_amount=item.platform_gross,commission_amount=item.amount,original_commission_amount=item.original_amount,
        reversed_at=case when item.refunded_minor=item.charged_minor then coalesce(reversed_at,now()) else null end where id=item.commission_id returning * into repaired;
    end if;
    insert into financial_audit_log(target_user_id,action,amount,currency,provider,provider_event_id,correlation_id,metadata)
      values(item.referrer_id,'referral_commission_reconciled',item.amount-coalesce(item.previous_amount,0),item.currency,item.provider,item.event_id,'migration-050',jsonb_build_object('payment_id',item.payment_id,'previous',item.previous,'corrected',to_jsonb(repaired)));
  end loop;
end $$;
drop view pg_temp.referral_repairs;
revoke all on function process_payment_event_legacy(text,text,jsonb,text),process_refund_event_047(text,text,text,bigint,text,text) from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
