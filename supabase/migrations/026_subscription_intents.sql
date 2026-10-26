alter table subscriptions add column if not exists idempotency_key text;
alter table subscriptions add column if not exists checkout_url text;
alter table subscriptions add column if not exists provider_subscription_id text;
alter table subscriptions add column if not exists last_provider_event_at timestamptz;
alter table subscriptions add column if not exists activated_at timestamptz;
alter table subscriptions add column if not exists cancelled_at timestamptz;
create unique index if not exists provider_subscription_binding on subscriptions(provider,provider_subscription_id) where provider_subscription_id is not null;
create unique index if not exists subscription_intent on subscriptions(user_id,idempotency_key);
create or replace function create_subscription_intent(p_user_id uuid,p_provider text,p_currency text,p_amount numeric,p_key text,p_correlation_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare s subscriptions;
begin
  if p_provider not in ('paystack','dodopayments') or p_currency not in ('USD','NGN') or p_amount<=0 or length(p_key) not between 8 and 200 then raise exception 'Invalid subscription'; end if;
  perform 1 from users where id=p_user_id for update;
  select * into s from subscriptions where user_id=p_user_id and idempotency_key=p_key;
  if found then
    if s.provider<>p_provider or s.currency<>p_currency or s.amount<>p_amount then raise exception 'Conflicting subscription intent'; end if;
  else
    insert into subscriptions(user_id,provider,currency,amount,status,idempotency_key)
      values(p_user_id,p_provider,p_currency,p_amount,'pending',p_key) returning * into s;
    update subscriptions set provider_event_id='sub_'||s.id::text where id=s.id;
    insert into financial_audit_log(actor_user_id,target_user_id,action,amount,currency,provider,idempotency_key,correlation_id,metadata)
      values(p_user_id,p_user_id,'subscription_create_pending',p_amount,p_currency,p_provider,p_key,p_correlation_id,jsonb_build_object('subscription_id',s.id));
  end if;
  return jsonb_build_object('id',s.id,'checkout_url',s.checkout_url);
end $$;
create or replace function cancel_subscriptions_atomic(p_user_id uuid,p_correlation_id text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform 1 from users where id=p_user_id for update;
  update subscriptions set status='cancelled',cancelled_at=now(),last_provider_event_at=now() where user_id=p_user_id and status='active';
  if found then
    update users set is_premium=false where id=p_user_id;
    insert into financial_audit_log(actor_user_id,target_user_id,action,correlation_id) values(p_user_id,p_user_id,'subscriptions_cancelled',p_correlation_id);
  end if;
end $$;
revoke all on function create_subscription_intent(uuid,text,text,numeric,text,text) from public;
revoke all on function cancel_subscriptions_atomic(uuid,text) from public;
grant execute on function create_subscription_intent(uuid,text,text,numeric,text,text) to service_role;
grant execute on function cancel_subscriptions_atomic(uuid,text) to service_role;
