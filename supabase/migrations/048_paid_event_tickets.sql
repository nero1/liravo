alter table events add constraint paid_event_price check(not is_paid or ticket_price is not null and ticket_price between 0.5 and 5000 and currency in ('USD','NGN','EUR')) not valid;
alter table event_tickets drop constraint event_tickets_status_check;
alter table event_tickets add constraint event_tickets_status_check check(status in ('pending','expired','confirmed','refund_pending','refunded','legacy_hold'));
alter table event_tickets add column organizer_id uuid references users(id);
alter table event_tickets add column platform_fee numeric(10,2);
alter table event_tickets add column host_amount numeric(10,2);
alter table event_tickets add column provider text check(provider in ('paystack','dodopayments'));
alter table event_tickets add column provider_checkout_id text;
alter table event_tickets add column checkout_url text;
alter table event_tickets add column reserved_until timestamptz;
alter table event_tickets add column idempotency_key text;
update event_tickets t set organizer_id=e.organizer_id,platform_fee=round(t.amount_paid*0.1,2),host_amount=t.amount_paid-round(t.amount_paid*0.1,2),provider=case when t.currency='NGN' then 'paystack' else 'dodopayments' end,
  reserved_until=t.created_at+interval '20 minutes',status=case when t.status='confirmed' then 'legacy_hold' when t.status='pending' then 'expired' else t.status end from events e where e.id=t.event_id;
alter table event_tickets alter column organizer_id set not null;
alter table event_tickets alter column platform_fee set not null;
alter table event_tickets alter column host_amount set not null;
alter table event_tickets alter column provider set not null;
create unique index ticket_intent_identity on event_tickets(user_id,idempotency_key) where idempotency_key is not null;
create index event_ticket_capacity on event_tickets(event_id,status,reserved_until);
alter table event_revenue add column ticket_id uuid references event_tickets(id);
alter table event_revenue add column original_amount numeric(10,2);
alter table event_revenue add column verified boolean not null default false;
insert into financial_audit_log(target_user_id,action,amount,currency,correlation_id,metadata)
  select organizer_id,'legacy_event_revenue_held',amount,currency,'migration-048',jsonb_build_object('revenue_id',id,'event_id',event_id) from event_revenue;
create unique index ticket_revenue_identity on event_revenue(ticket_id) where ticket_id is not null;
alter table referral_commissions add column currency text not null default 'USD' check(currency in ('USD','NGN','EUR'));
revoke insert,update,delete on event_tickets,event_revenue from anon,authenticated;
alter table payment_captures drop constraint payment_captures_entity_type_check;
alter table payment_captures add constraint payment_captures_entity_type_check check(entity_type in ('tip','subscription','ticket'));
alter table checkout_reconciliations drop constraint checkout_reconciliations_entity_type_check;
alter table checkout_reconciliations add constraint checkout_reconciliations_entity_type_check check(entity_type in ('tip','subscription','ticket'));

create function reserve_event_ticket(p_user_id uuid,p_event_id uuid,p_key text,p_correlation_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare e events; t event_tickets; host uuid; occupied bigint; intent content_intents;
begin
  if p_key is null or length(p_key) not between 8 and 200 then raise exception 'Invalid ticket intent' using errcode='P1004'; end if;
  select organizer_id into host from events where id=p_event_id;
  perform 1 from users where id in (p_user_id,host) order by id for update;
  if not exists(select 1 from users where id=p_user_id and not is_banned and deleted_at is null) then raise exception 'Account unavailable' using errcode='P1003'; end if;
  select * into intent from content_intents where actor_id=p_user_id and action='event_ticket' and intent_key=p_key;
  if found then
    if intent.fingerprint<>p_event_id::text then raise exception 'Conflicting ticket intent' using errcode='P1001'; end if;
    select * into t from event_tickets where id=(intent.response->>'ticket_id')::uuid;
    if not found then raise exception 'Ticket unavailable' using errcode='P1005'; end if;
    return to_jsonb(t);
  end if;
  select * into e from events where id=p_event_id for update;
  if not found then raise exception 'Event not found' using errcode='P1005'; end if;
  if not e.is_paid or e.event_date<=now() or e.ticket_price is null or e.ticket_price<0.5 or e.ticket_price>5000 or e.currency not in ('USD','NGN','EUR') or e.organizer_id=p_user_id
    or not exists(select 1 from users where id=e.organizer_id and not is_banned and deleted_at is null) then raise exception 'Event unavailable' using errcode='P1004'; end if;
  select * into t from event_tickets where event_id=e.id and user_id=p_user_id and (status in ('confirmed','refund_pending','legacy_hold') or status='pending' and reserved_until>now()) order by created_at desc,id limit 1;
  if found then
    insert into content_intents values(p_user_id,'event_ticket',p_key,p_event_id::text,jsonb_build_object('ticket_id',t.id));
    return to_jsonb(t);
  end if;
  select count(*) into occupied from event_tickets where event_id=e.id and (status in ('confirmed','refund_pending','legacy_hold') or status='pending' and reserved_until>now());
  if e.max_attendees is not null and occupied>=e.max_attendees then raise exception 'Event full' using errcode='P1004'; end if;
  insert into event_tickets(event_id,user_id,organizer_id,amount_paid,platform_fee,host_amount,currency,provider,reserved_until,idempotency_key)
    values(e.id,p_user_id,e.organizer_id,e.ticket_price,round(e.ticket_price*0.1,2),e.ticket_price-round(e.ticket_price*0.1,2),e.currency,case when e.currency='NGN' then 'paystack' else 'dodopayments' end,least(e.event_date,now()+interval '20 minutes'),p_key) returning * into t;
  insert into checkout_reconciliations(entity_type,entity_id,user_id,provider,reference) values('ticket',t.id,p_user_id,t.provider,'ticket_'||t.id);
  insert into content_intents values(p_user_id,'event_ticket',p_key,p_event_id::text,jsonb_build_object('ticket_id',t.id));
  insert into financial_audit_log(actor_user_id,target_user_id,action,amount,currency,idempotency_key,correlation_id,metadata)
    values(p_user_id,e.organizer_id,'ticket_reserved',t.amount_paid,t.currency,p_key,p_correlation_id,jsonb_build_object('ticket_id',t.id,'event_id',e.id,'reserved_until',t.reserved_until));
  return to_jsonb(t);
end $$;

create function record_ticket_checkout(p_user_id uuid,p_ticket_id uuid,p_checkout_id text,p_url text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare t event_tickets;
begin
  perform 1 from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003'; end if;
  select * into t from event_tickets where id=p_ticket_id for update;
  if t.user_id is distinct from p_user_id then raise exception 'Ticket binding mismatch' using errcode='P1003'; end if;
  if t.status<>'pending' or t.reserved_until<=now() then raise exception 'Reservation expired' using errcode='P1004'; end if;
  if p_checkout_id is null or p_checkout_id !~ '^[a-zA-Z0-9_-]{1,150}$' or p_url is null or length(p_url)>2000
    or t.provider='paystack' and (p_checkout_id<>'ticket_'||t.id or p_url !~ '^https://checkout\.paystack\.com(/|$)')
    or t.provider='dodopayments' and p_url !~ '^https://([a-z0-9-]+\.)*dodopayments\.com(/|$)' then raise exception 'Invalid checkout' using errcode='P1004'; end if;
  if t.provider_checkout_id is not null and t.provider_checkout_id<>p_checkout_id then raise exception 'Checkout identity changed' using errcode='P1001'; end if;
  update event_tickets set provider_checkout_id=p_checkout_id,checkout_url=p_url where id=t.id;
end $$;

create table payment_returns (
  provider text not null,
  payment_id text not null,
  reason text not null,
  status text not null default 'pending' check(status in ('pending','processing','submitted','unknown','completed','failed')),
  provider_refund_id text,
  attempts integer not null default 0,
  claim_token uuid,
  claimed_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  correlation_id text,
  last_error text,
  created_at timestamptz not null default now(),
  primary key(provider,payment_id),
  foreign key(provider,payment_id) references payment_captures(provider,payment_id)
);
alter table payment_returns enable row level security;
revoke all on payment_returns from public,anon,authenticated;
grant select on payment_returns to service_role;

create function queue_uncredited_payment()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not new.credited then
    insert into payment_returns(provider,payment_id,reason) values(new.provider,new.payment_id,'uncredited_payment') on conflict do nothing;
  end if;
  return new;
end $$;
create trigger return_uncredited_payment after insert on payment_captures for each row execute function queue_uncredited_payment();
insert into payment_returns(provider,payment_id,reason) select provider,payment_id,'uncredited_payment' from payment_captures where not credited and refunded_minor<charged_minor;

alter function process_payment_event(text,text,jsonb,text) rename to process_payment_event_047;
revoke all on function process_payment_event_047(text,text,jsonb,text) from public,anon,authenticated,service_role;
create function process_payment_event(p_provider text,p_event_id text,p_payload jsonb,p_correlation_id text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare t event_tickets; e events; c payment_captures; payment text; paid bigint; tax bigint; referrer uuid; eligible boolean; occupied bigint; original jsonb; applied boolean;
begin
  if not (p_payload?'ticket_id') then
    applied:=process_payment_event_047(p_provider,p_event_id,p_payload,p_correlation_id);
    update payment_returns set correlation_id=coalesce(correlation_id,p_correlation_id) where provider=p_provider and payment_id=p_payload->>'payment_id';
    return applied;
  end if;
  if p_payload?'tipId' or p_payload?'subscription_id' or p_provider not in ('paystack','dodopayments') or p_payload->>'status' is distinct from 'completed'
    or p_payload->>'payment_id' is null or length(p_payload->>'payment_id') not between 1 and 150 or p_payload->>'paid_amount_minor' is null or p_payload->>'paid_amount_minor' !~ '^[0-9]+$'
    or p_payload->>'currency' is null or p_payload->>'currency' not in ('USD','NGN','EUR') then raise exception 'Invalid ticket capture' using errcode='P1004'; end if;
  payment:=p_payload->>'payment_id';paid:=(p_payload->>'paid_amount_minor')::bigint;tax:=coalesce((p_payload->>'tax_minor')::bigint,0);
  if paid<=0 or tax<0 or tax>paid then raise exception 'Invalid ticket amount' using errcode='P1004'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_provider||':capture:'||payment,0));
  select * into t from event_tickets where id=(p_payload->>'ticket_id')::uuid;
  if not found or t.provider<>p_provider or (p_payload->>'provider_reference') is distinct from 'ticket_'||t.id::text or (p_payload->>'user_id') is distinct from t.user_id::text then raise exception 'Ticket binding mismatch' using errcode='P1003'; end if;
  select referred_by into referrer from users where id=t.user_id;
  perform 1 from users where id in (t.user_id,t.organizer_id,referrer) order by id for update;
  select * into e from events where id=t.event_id for update;
  select * into t from event_tickets where id=t.id for update;
  select * into c from payment_captures where provider=p_provider and payment_id=payment;
  if found then
    if c.entity_type<>'ticket' or c.entity_id<>t.id or c.charged_minor<>paid or c.currency<>p_payload->>'currency' or c.event_id<>p_event_id then raise exception 'Ticket capture conflict' using errcode='P1001'; end if;
    perform apply_pending_capture_refunds(p_provider,payment,p_correlation_id);
    return false;
  end if;
  select payload into original from payment_events where provider=p_provider and event_id=p_event_id;
  if found then raise exception 'Ticket event conflict' using errcode='P1001'; end if;
  select count(*) into occupied from event_tickets where event_id=e.id and id<>t.id and (status in ('confirmed','refund_pending','legacy_hold') or status='pending' and reserved_until>now());
  eligible:=t.status in ('pending','expired') and e.event_date>now() and (e.max_attendees is null or occupied<e.max_attendees)
    and paid-tax=t.amount_paid*100 and p_payload->>'currency'=t.currency
    and exists(select 1 from users where id=t.user_id and not is_banned and deleted_at is null) and exists(select 1 from users where id=t.organizer_id and not is_banned and deleted_at is null)
    and not exists(select 1 from event_tickets where event_id=e.id and user_id=t.user_id and id<>t.id and (status in ('confirmed','refund_pending','legacy_hold') or status='pending' and reserved_until>now()));
  insert into payment_events(provider,event_id,payload) values(p_provider,p_event_id,p_payload);
  insert into payment_captures(provider,payment_id,entity_type,entity_id,user_id,recipient_id,currency,charged_minor,event_id,credited)
    values(p_provider,payment,'ticket',t.id,t.user_id,t.organizer_id,p_payload->>'currency',paid,p_event_id,eligible);
  update payment_returns set correlation_id=p_correlation_id where provider=p_provider and payment_id=payment;
  if eligible then
    insert into event_revenue(event_id,organizer_id,amount,currency,ticket_id,original_amount,verified) values(e.id,t.organizer_id,t.host_amount,t.currency,t.id,t.host_amount,true);
    if referrer is not null and referrer<>t.user_id then
      insert into referral_commissions(referrer_id,referred_user_id,transaction_id,transaction_type,gross_transaction_amount,platform_fee_amount,commission_amount,original_commission_amount,idempotency_key,currency)
        values(referrer,t.user_id,t.id,'event_ticket',t.amount_paid,t.platform_fee,round(t.amount_paid*0.1,4),round(t.amount_paid*0.1,4),p_provider||':'||p_event_id,t.currency);
    end if;
    update event_tickets set status='confirmed' where id=t.id;
  elsif t.status not in ('confirmed','refund_pending','refunded','legacy_hold') then update event_tickets set status='refund_pending' where id=t.id;
  end if;
  perform apply_pending_capture_refunds(p_provider,payment,p_correlation_id);
  if eligible and exists(select 1 from event_tickets where id=t.id and status='confirmed') then
    insert into notifications(user_id,type,actor_id,entity_type,entity_id,message) values(t.user_id,'event_ticket_confirmed',t.organizer_id,'event',e.id,'Your event ticket is confirmed.');
  end if;
  insert into financial_audit_log(target_user_id,action,amount,currency,provider,provider_event_id,correlation_id,metadata)
    values(t.user_id,case when eligible then 'ticket_paid' else 'ticket_payment_return_queued' end,paid::numeric/100,p_payload->>'currency',p_provider,p_event_id,p_correlation_id,jsonb_build_object('ticket_id',t.id,'payment_id',payment));
  update checkout_reconciliations set status='settled',last_error=null where entity_type='ticket' and entity_id=t.id and status<>'processing';
  return true;
end $$;

alter function process_refund_event(text,text,text,bigint,text,text) rename to process_refund_event_047;
revoke all on function process_refund_event_047(text,text,text,bigint,text,text) from public,anon,authenticated,service_role;
create function process_refund_event(p_provider text,p_refund_id text,p_payment_id text,p_amount_minor bigint,p_currency text,p_correlation_id text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare c payment_captures; previous payment_refunds; receipt refund_inbox; t event_tickets; referrer uuid; total bigint; wallet record; pending payout_requests; applied boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_provider||':capture:'||p_payment_id,0));
  select * into c from payment_captures where provider=p_provider and payment_id=p_payment_id;
  if not found or c.entity_type<>'ticket' then
    applied:=process_refund_event_047(p_provider,p_refund_id,p_payment_id,p_amount_minor,p_currency,p_correlation_id);
    update payment_returns r set status='completed',claim_token=null,claimed_at=null where r.provider=p_provider and r.payment_id=p_payment_id and exists(select 1 from payment_captures x where x.provider=p_provider and x.payment_id=p_payment_id and refunded_minor=charged_minor);
    return applied;
  end if;
  if p_refund_id is null or length(p_refund_id) not between 1 and 150 or p_amount_minor is null or p_amount_minor<=0 or p_currency is null then raise exception 'Invalid refund' using errcode='P1004'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_provider||':refund:'||p_refund_id,0));
  select * into receipt from refund_inbox where provider=p_provider and refund_id=p_refund_id;
  if found and (receipt.payment_id<>p_payment_id or receipt.amount_minor<>p_amount_minor or receipt.currency<>p_currency) then raise exception 'Refund identity conflict' using errcode='P1001'; end if;
  select referrer_id into referrer from referral_commissions where idempotency_key=p_provider||':'||c.event_id and c.credited;
  perform 1 from users where id in (c.user_id,c.recipient_id,referrer) order by id for update;
  select * into t from event_tickets where id=c.entity_id;
  perform 1 from events where id=t.event_id for update;
  select * into t from event_tickets where id=c.entity_id for update;
  select * into previous from payment_refunds where provider=p_provider and refund_id=p_refund_id;
  if found then
    if previous.payment_id<>p_payment_id or previous.amount_minor<>p_amount_minor or previous.currency<>p_currency then raise exception 'Refund identity conflict' using errcode='P1001'; end if;
    return false;
  end if;
  if c.currency<>p_currency or c.refunded_minor+p_amount_minor>c.charged_minor then raise exception 'Refund amount or currency mismatch' using errcode='P1002'; end if;
  total:=c.refunded_minor+p_amount_minor;
  insert into payment_refunds(provider,refund_id,payment_id,amount_minor,currency,correlation_id) values(p_provider,p_refund_id,p_payment_id,p_amount_minor,p_currency,p_correlation_id);
  update payment_captures set refunded_minor=total where provider=p_provider and payment_id=p_payment_id;
  if c.credited then
    update event_revenue set amount=round(original_amount*(c.charged_minor-total)/c.charged_minor,2) where ticket_id=t.id;
    update referral_commissions set commission_amount=round(original_commission_amount*(c.charged_minor-total)/c.charged_minor,4),reversed_at=case when total=c.charged_minor then now() else null end where idempotency_key=p_provider||':'||c.event_id;
  end if;
  if total=c.charged_minor and (c.credited or not exists(select 1 from payment_captures where entity_type='ticket' and entity_id=t.id and credited and refunded_minor<charged_minor)) then update event_tickets set status='refunded' where id=t.id; end if;
  for wallet in select c.recipient_id as user_id,c.currency as currency where c.credited union select referrer,c.currency where referrer is not null loop
    for pending in select * from payout_requests where user_id=wallet.user_id and currency=wallet.currency and status='pending' order by created_at desc,id for update loop
      exit when (creator_balance(wallet.user_id,wallet.currency)->>'available')::numeric>=0;
      update payout_requests set status='cancelled',last_error='Cancelled after payment refund' where id=pending.id;
      insert into financial_audit_log(target_user_id,action,amount,currency,provider,provider_event_id,correlation_id,metadata)
        values(wallet.user_id,'payout_cancelled_after_refund',pending.amount,pending.currency,p_provider,p_refund_id,p_correlation_id,jsonb_build_object('payout_id',pending.id));
    end loop;
  end loop;
  insert into financial_audit_log(target_user_id,action,amount,currency,provider,provider_event_id,correlation_id,metadata)
    values(c.user_id,'payment_refunded',p_amount_minor::numeric/100,p_currency,p_provider,p_refund_id,p_correlation_id,jsonb_build_object('payment_id',p_payment_id,'entity_type','ticket','entity_id',t.id,'total_refunded_minor',total));
  if total=c.charged_minor then
    update payment_returns set status='completed',claim_token=null,claimed_at=null where provider=p_provider and payment_id=p_payment_id;
    insert into notifications(user_id,type,entity_type,entity_id,message) values(c.user_id,'event_ticket_refunded','event',t.event_id,'Your event payment was refunded.');
  end if;
  update refund_inbox set status='processed',claimed_at=null where provider=p_provider and refund_id=p_refund_id;
  return true;
end $$;

create or replace function creator_balance(p_user_id uuid,p_currency text)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  with earned as (
    select coalesce(sum(coalesce(recipient_amount,creator_amount)-refunded_recipient_amount),0) as tips from tips where coalesce(recipient_id,creator_id)=p_user_id and status in ('completed','refunded') and currency=p_currency
  ), commission as (
    select coalesce(sum(commission_amount),0) as referrals from referral_commissions where referrer_id=p_user_id and reversed_at is null and currency=p_currency
  ), events as (
    select coalesce(sum(amount),0) as revenue from event_revenue where organizer_id=p_user_id and currency=p_currency and verified
  ), withdrawn as (
    select coalesce(sum(amount) filter(where status in ('pending','processing')),0) as reserved,coalesce(sum(amount) filter(where status='completed'),0) as paid from payout_requests where user_id=p_user_id and currency=p_currency
  ) select jsonb_build_object('currency',p_currency,'tips',tips::text,'referrals',referrals::text,'events',revenue::text,'earned',(tips+referrals+revenue)::text,'reserved',reserved::text,'paid',paid::text,'available',(tips+referrals+revenue-reserved-paid)::text) from earned,commission,events,withdrawn;
$$;

create function claim_payment_returns(p_limit integer default 3)
returns table(provider text,payment_id text,reason text,status text,provider_refund_id text,attempts integer,claim_token uuid,currency text,charged_minor bigint,refunded_minor bigint) language sql security definer set search_path=public,pg_temp as $$
  with candidates as (
    select r.provider,r.payment_id from payment_returns r where r.status in ('pending','submitted','unknown','processing') and r.next_attempt_at<=now() and (r.claimed_at is null or r.claimed_at<now()-interval '2 minutes')
    order by r.next_attempt_at,r.payment_id for update skip locked limit greatest(1,least(p_limit,3))
  ), claimed as (
    update payment_returns r set claim_token=gen_random_uuid(),claimed_at=now(),attempts=r.attempts+1 from candidates c where r.provider=c.provider and r.payment_id=c.payment_id returning r.*
  ) select r.provider,r.payment_id,r.reason,r.status,r.provider_refund_id,r.attempts,r.claim_token,c.currency,c.charged_minor,c.refunded_minor from claimed r join payment_captures c using(provider,payment_id);
$$;
create function update_payment_return(p_provider text,p_payment_id text,p_claim uuid,p_status text,p_refund_id text,p_error text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare previous payment_returns;
begin
  if p_status not in ('pending','processing','submitted','unknown','completed','failed') then raise exception 'Invalid return state' using errcode='P1004'; end if;
  select * into previous from payment_returns where provider=p_provider and payment_id=p_payment_id and claim_token=p_claim for update;
  if not found then return false; end if;
  update payment_returns set status=p_status,provider_refund_id=coalesce(provider_refund_id,p_refund_id),last_error=left(p_error,100),
    claim_token=case when p_status='processing' then claim_token else null end,claimed_at=case when p_status='processing' then claimed_at else null end,
    next_attempt_at=now()+make_interval(secs=>least(21600,greatest(60,30*power(2,least(attempts,10))::integer))) where provider=p_provider and payment_id=p_payment_id and claim_token=p_claim;
  if previous.status is distinct from p_status or previous.last_error is distinct from p_error or previous.provider_refund_id is null and p_refund_id is not null then
    insert into financial_audit_log(target_user_id,action,provider,provider_event_id,correlation_id,metadata)
      select c.user_id,'payment_return_'||p_status,p_provider,p_refund_id,previous.correlation_id,jsonb_build_object('payment_id',p_payment_id,'attempt',previous.attempts,'error',p_error) from payment_captures c where c.provider=p_provider and c.payment_id=p_payment_id;
  end if;
  return true;
end $$;

alter function financial_integrity_snapshot() rename to financial_integrity_snapshot_047;
revoke all on function financial_integrity_snapshot_047() from public,anon,authenticated,service_role;
create function financial_integrity_snapshot()
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select financial_integrity_snapshot_047()||jsonb_build_object('unresolvedPaymentReturns',(select count(*) from payment_returns where status in ('unknown','failed') or status<>'completed' and created_at<now()-interval '25 hours'),'legacyEventTickets',(select count(*) from event_tickets where status='legacy_hold')+(select count(*) from event_revenue where not verified));
$$;
revoke all on function reserve_event_ticket(uuid,uuid,text,text),record_ticket_checkout(uuid,uuid,text,text),process_payment_event(text,text,jsonb,text),process_refund_event(text,text,text,bigint,text,text),claim_payment_returns(integer),update_payment_return(text,text,uuid,text,text,text),financial_integrity_snapshot() from public,anon,authenticated;
grant execute on function reserve_event_ticket(uuid,uuid,text,text),record_ticket_checkout(uuid,uuid,text,text),process_payment_event(text,text,jsonb,text),process_refund_event(text,text,text,bigint,text,text),claim_payment_returns(integer),update_payment_return(text,text,uuid,text,text,text),financial_integrity_snapshot() to service_role;
revoke all on function queue_uncredited_payment() from public,anon,authenticated,service_role;

create function reconcile_payment_return(p_actor uuid,p_provider text,p_payment_id text,p_refund_id text,p_key text,p_evidence jsonb,p_correlation_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare c payment_captures; previous content_intents; referrer uuid; result jsonb; fingerprint text:=jsonb_build_array(p_provider,p_payment_id,p_refund_id)::text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_provider||':capture:'||p_payment_id,0));
  select * into c from payment_captures where provider=p_provider and payment_id=p_payment_id;
  if not found then raise exception 'Payment unavailable' using errcode='P1005'; end if;
  select referrer_id into referrer from referral_commissions where idempotency_key=p_provider||':'||c.event_id;
  perform 1 from users where id in (p_actor,c.user_id,c.recipient_id,referrer) order by id for update;
  if not exists(select 1 from users where id=p_actor and is_admin and not is_banned and deleted_at is null) then raise exception 'Admin required' using errcode='P1003'; end if;
  if p_key is null or length(p_key) not between 8 and 200 or p_refund_id is null or length(p_refund_id) not between 1 and 150 or p_evidence->>'status' is null or p_evidence->>'status' not in ('succeeded','submitted') then raise exception 'Invalid refund evidence' using errcode='P1004'; end if;
  select * into previous from content_intents where actor_id=p_actor and action='payment_return' and intent_key=p_key;
  if found then
    if previous.fingerprint<>fingerprint then raise exception 'Conflicting return intent' using errcode='P1001'; end if;
    return previous.response;
  end if;
  perform 1 from payment_returns where provider=p_provider and payment_id=p_payment_id for update;
  if not found then raise exception 'Return unavailable' using errcode='P1005'; end if;
  if p_evidence->>'status'<>'succeeded' and exists(select 1 from payment_returns r where r.provider=p_provider and r.payment_id=p_payment_id and r.provider_refund_id is not null and r.provider_refund_id<>p_refund_id
    and not exists(select 1 from payment_refunds f where f.provider=p_provider and f.payment_id=p_payment_id and f.refund_id=r.provider_refund_id)) then raise exception 'Refund binding changed' using errcode='P1001'; end if;
  update payment_returns set provider_refund_id=p_refund_id,status='submitted',claim_token=null,claimed_at=null,next_attempt_at=now(),last_error=null where provider=p_provider and payment_id=p_payment_id;
  if p_evidence->>'status'='succeeded' then
    if p_evidence#>>'{refund,refundId}' is distinct from p_refund_id or p_evidence#>>'{refund,paymentId}' is distinct from p_payment_id then raise exception 'Refund evidence mismatch' using errcode='P1003'; end if;
    perform process_refund_event(p_provider,p_refund_id,p_payment_id,(p_evidence#>>'{refund,amountMinor}')::bigint,p_evidence#>>'{refund,currency}',p_correlation_id);
  end if;
  update payment_returns set status='completed' where provider=p_provider and payment_id=p_payment_id and exists(select 1 from payment_captures where provider=p_provider and payment_id=p_payment_id and refunded_minor=charged_minor);
  select jsonb_build_object('status',status,'refund_id',provider_refund_id) into result from payment_returns where provider=p_provider and payment_id=p_payment_id;
  insert into content_intents values(p_actor,'payment_return',p_key,fingerprint,result);
  insert into financial_audit_log(actor_user_id,target_user_id,action,provider,provider_event_id,idempotency_key,correlation_id,metadata)
    values(p_actor,c.user_id,'payment_return_reconciled',p_provider,p_refund_id,p_key,p_correlation_id,jsonb_build_object('payment_id',p_payment_id,'evidence',p_evidence));
  return result;
end $$;
revoke all on function reconcile_payment_return(uuid,text,text,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function reconcile_payment_return(uuid,text,text,text,text,jsonb,text) to service_role;

create function guard_ticket_snapshot()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if row(new.id,new.event_id,new.user_id,new.organizer_id,new.amount_paid,new.platform_fee,new.host_amount,new.currency,new.provider,new.created_at,new.idempotency_key) is distinct from row(old.id,old.event_id,old.user_id,old.organizer_id,old.amount_paid,old.platform_fee,old.host_amount,old.currency,old.provider,old.created_at,old.idempotency_key) then raise exception 'Ticket purchase snapshot is immutable' using errcode='P1003'; end if;
  return new;
end $$;
create trigger guard_ticket_snapshot before update on event_tickets for each row execute function guard_ticket_snapshot();
revoke all on function guard_ticket_snapshot() from public,anon,authenticated,service_role;
notify pgrst,'reload schema';
