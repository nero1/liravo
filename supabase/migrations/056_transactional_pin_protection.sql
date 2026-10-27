create function set_account_pin(p_user_id uuid,p_expected_hash text,p_new_hash text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare profile users;
begin
  if p_new_hash is null or p_new_hash !~ '^\$2[aby]\$12\$[./A-Za-z0-9]{53}$' then raise exception 'Invalid PIN hash' using errcode='P1004';end if;
  select * into profile from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  if profile.pin_hash is distinct from p_expected_hash then raise exception 'PIN changed; retry' using errcode='P1001';end if;
  if profile.pin_hash=p_new_hash then return false;end if;
  update users set pin_hash=p_new_hash where id=p_user_id;
  insert into security_events(user_id,event_type,metadata) values(p_user_id,'pin_set',jsonb_build_object('source','settings','replaced',profile.pin_hash is not null));
  return true;
end $$;

alter function create_payout_request_atomic(uuid,numeric,text,text,text,text) rename to create_payout_request_040;
revoke all on function create_payout_request_040(uuid,numeric,text,text,text,text) from public,anon,authenticated,service_role;
create function create_payout_request_atomic(p_user_id uuid,p_amount numeric,p_method text,p_idempotency_key text,p_correlation_id text,p_currency text default 'USD',p_pin_hash text default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare expected text;
begin
  select pin_hash into expected from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  if expected is distinct from p_pin_hash then raise exception 'PIN confirmation required' using errcode='P1003';end if;
  return create_payout_request_040(p_user_id,p_amount,p_method,p_idempotency_key,p_correlation_id,p_currency);
end $$;

create function save_payout_destination(p_user_id uuid,p_key text,p_data jsonb,p_pin_hash text,p_correlation_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare expected text; previous content_intents; fingerprint text; result jsonb:='{"saved":true}';
begin
  if p_key is null or length(p_key) not between 8 and 200 or p_data is null or jsonb_typeof(p_data)<>'object'
    or p_data->>'provider' is null or p_data->>'provider' not in ('manual','paystack') or p_data->>'currency' is null or p_data->>'currency' not in ('USD','NGN','EUR')
    or length(trim(coalesce(p_data->>'display_name',''))) not between 2 and 100 or length(coalesce(p_data->>'account_number','')) not between 4 and 80
    or p_data->>'account_number' !~ '^[a-zA-Z0-9 -]+$' or length(coalesce(p_data->>'bank_code','')) not between 2 and 40 or p_data->>'bank_code' !~ '^[a-zA-Z0-9-]+$'
    or p_data->>'provider'='paystack' and (p_data->>'currency'<>'NGN' or p_data->>'account_number' !~ '^[0-9]{10}$' or p_data->>'bank_code' !~ '^[0-9]+$') then raise exception 'Invalid destination' using errcode='P1004';end if;
  select pin_hash into expected from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  if expected is distinct from p_pin_hash then raise exception 'PIN confirmation required' using errcode='P1003';end if;
  fingerprint:=encode(sha256(convert_to(p_data::text,'UTF8')),'hex');
  select * into previous from content_intents where actor_id=p_user_id and action='payout_destination' and intent_key=p_key;
  if found then
    if previous.fingerprint<>fingerprint then raise exception 'Conflicting destination intent' using errcode='P1001';end if;
    return previous.response;
  end if;
  insert into user_payout_methods(user_id,provider,display_name,account_number,bank_code,currency,paystack_recipient_code)
    values(p_user_id,p_data->>'provider',p_data->>'display_name',p_data->>'account_number',p_data->>'bank_code',p_data->>'currency',null)
    on conflict(user_id,provider) do update set display_name=excluded.display_name,account_number=excluded.account_number,bank_code=excluded.bank_code,currency=excluded.currency,paystack_recipient_code=null;
  insert into content_intents(actor_id,action,intent_key,fingerprint,response) values(p_user_id,'payout_destination',p_key,fingerprint,result);
  insert into financial_audit_log(actor_user_id,target_user_id,action,idempotency_key,correlation_id,metadata)
    values(p_user_id,p_user_id,'payout_destination_saved',p_key,p_correlation_id,jsonb_build_object('provider',p_data->>'provider','currency',p_data->>'currency','account_last_four',right(p_data->>'account_number',4)));
  return result;
end $$;
revoke all on function set_account_pin(uuid,text,text),create_payout_request_atomic(uuid,numeric,text,text,text,text,text),save_payout_destination(uuid,text,jsonb,text,text) from public,anon,authenticated;
grant execute on function set_account_pin(uuid,text,text),create_payout_request_atomic(uuid,numeric,text,text,text,text,text),save_payout_destination(uuid,text,jsonb,text,text) to service_role;
revoke insert,update,delete on user_payout_methods from anon,authenticated;
notify pgrst,'reload schema';
