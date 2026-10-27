create index captures_owned_recovery on payment_captures(user_id,entity_type,entity_id) where not credited;
alter function process_payment_event(text,text,jsonb,text) rename to process_payment_event_048;
revoke all on function process_payment_event_048(text,text,jsonb,text) from public,anon,authenticated,service_role;
create function process_payment_event(p_provider text,p_event_id text,p_payload jsonb,p_correlation_id text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare t tips; s subscriptions; c payment_captures; kind text; target uuid; owner uuid; recipient uuid; referrer uuid; payment text; paid bigint; tax bigint;
begin
  if p_payload?'ticket_id' or not (p_payload?'payment_id') then return process_payment_event_048(p_provider,p_event_id,p_payload,p_correlation_id); end if;
  if p_provider is null or p_provider not in ('paystack','dodopayments') or p_event_id is null or length(p_event_id) not between 8 and 200
    or p_payload->>'payment_id' is null or length(p_payload->>'payment_id') not between 1 and 150 or p_payload->>'paid_amount_minor' is null or p_payload->>'paid_amount_minor' !~ '^[0-9]+$'
    or p_payload->>'currency' is null or p_payload->>'currency' not in ('USD','NGN','EUR') or p_payload?'tipId' and p_payload?'subscription_id' then raise exception 'Invalid payment capture' using errcode='P1004'; end if;
  payment:=p_payload->>'payment_id';paid:=(p_payload->>'paid_amount_minor')::bigint;tax:=coalesce((p_payload->>'tax_minor')::bigint,0);
  if paid<=0 or tax<0 or tax>paid then raise exception 'Invalid payment amount' using errcode='P1004'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_provider||':capture:'||payment,0));
  if p_payload?'tipId' then
    kind:='tip';select * into t from tips where id=(p_payload->>'tipId')::uuid;
    if not found or t.user_id is null then raise exception 'Tip unavailable' using errcode='P1005'; end if;
    target:=t.id;owner:=t.user_id;recipient:=coalesce(t.recipient_id,t.creator_id);
  else
    kind:='subscription';select * into s from subscriptions where id=(p_payload->>'subscription_id')::uuid;
    if not found then raise exception 'Subscription unavailable' using errcode='P1005'; end if;
    if s.user_id is distinct from (p_payload->>'user_id')::uuid or s.provider is distinct from p_provider
      or (p_payload->>'provider_reference' is not null and s.provider_event_id is distinct from p_payload->>'provider_reference')
      or (s.provider_subscription_id is not null and p_payload->>'provider_subscription_id' is not null and s.provider_subscription_id<>p_payload->>'provider_subscription_id') then raise exception 'Payment binding mismatch' using errcode='P1003'; end if;
    target:=s.id;owner:=s.user_id;
  end if;
  select referred_by into referrer from users where id=owner;
  perform 1 from users where id in (owner,recipient,referrer) order by id for update;
  if kind='tip' then perform 1 from tips where id=target for update;
  else perform 1 from subscriptions where id=target for update; end if;
  begin
    return process_payment_event_048(p_provider,p_event_id,p_payload,p_correlation_id);
  exception when sqlstate 'P1002' then
    select * into c from payment_captures where provider=p_provider and payment_id=payment;
    if found then
      if c.entity_type<>kind or c.entity_id<>target or c.user_id<>owner or c.charged_minor<>paid or c.currency<>p_payload->>'currency' or c.event_id<>p_event_id then raise exception 'Payment capture conflict' using errcode='P1001'; end if;
      perform apply_pending_capture_refunds(p_provider,payment,p_correlation_id);
      return false;
    end if;
    if exists(select 1 from payment_events where provider=p_provider and event_id=p_event_id) then raise exception 'Payment event conflict' using errcode='P1001'; end if;
    insert into payment_events(provider,event_id,payload) values(p_provider,p_event_id,p_payload);
    insert into payment_captures(provider,payment_id,entity_type,entity_id,user_id,recipient_id,currency,charged_minor,event_id,credited)
      values(p_provider,payment,kind,target,owner,recipient,p_payload->>'currency',paid,p_event_id,false);
    update payment_returns set reason='amount_mismatch',correlation_id=p_correlation_id where provider=p_provider and payment_id=payment;
    if kind='subscription' and p_provider='dodopayments' and p_payload->>'provider_subscription_id' is not null then
      update subscriptions set provider_subscription_id=coalesce(provider_subscription_id,p_payload->>'provider_subscription_id') where id=target;
      insert into subscription_cancellations(subscription_id,correlation_id) values(target,p_correlation_id) on conflict do nothing;
      if found then insert into financial_audit_log(target_user_id,action,provider,correlation_id,metadata)
        values(owner,'subscription_cancellation_requested',p_provider,p_correlation_id,jsonb_build_object('subscription_id',target,'reason','payment_amount_mismatch')); end if;
    end if;
    insert into financial_audit_log(target_user_id,action,amount,currency,provider,provider_event_id,correlation_id,metadata)
      values(owner,'payment_amount_return_queued',paid::numeric/100,p_payload->>'currency',p_provider,p_event_id,p_correlation_id,jsonb_build_object('entity_type',kind,'entity_id',target,'payment_id',payment));
    perform apply_pending_capture_refunds(p_provider,payment,p_correlation_id);
    return true;
  end;
end $$;

create function read_payment_recovery(p_user_id uuid,p_kind text,p_entity_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if p_kind is null or p_kind not in ('tip','subscription','ticket') then raise exception 'Invalid recovery scope' using errcode='P1004'; end if;
  if not exists(select 1 from users where id=p_user_id and not is_banned and deleted_at is null) then raise exception 'Account unavailable' using errcode='P1003'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('currency',currency,'charged_minor',charged::text,'refunded_minor',refunded::text,'count',count)) from (
    select currency,sum(charged_minor) as charged,sum(refunded_minor) as refunded,count(*) as count from payment_captures where user_id=p_user_id and entity_type=p_kind and (p_entity_id is null or entity_id=p_entity_id) and not credited group by currency
  ) grouped),'[]'::jsonb);
end $$;
revoke all on function process_payment_event(text,text,jsonb,text),read_payment_recovery(uuid,text,uuid) from public,anon,authenticated;
grant execute on function process_payment_event(text,text,jsonb,text),read_payment_recovery(uuid,text,uuid) to service_role;
notify pgrst,'reload schema';
