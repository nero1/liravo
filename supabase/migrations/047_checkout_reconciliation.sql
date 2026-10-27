create table checkout_reconciliations (
  entity_type text not null check(entity_type in ('tip','subscription')),
  entity_id uuid not null,
  user_id uuid not null references users(id),
  provider text not null check(provider in ('paystack','dodopayments')),
  reference text not null,
  status text not null default 'pending' check(status in ('pending','processing','settled','failed')),
  attempts integer not null default 0,
  claim_token uuid,
  claimed_at timestamptz,
  last_checked_at timestamptz,
  next_attempt_at timestamptz not null default now()+interval '1 minute',
  scan_page integer not null default 0,
  last_error text,
  correlation_id text,
  created_at timestamptz not null default now(),
  primary key(entity_type,entity_id)
);
create index checkout_reconciliation_due on checkout_reconciliations(status,next_attempt_at);
alter table checkout_reconciliations enable row level security;
revoke all on checkout_reconciliations from public,anon,authenticated;
grant select on checkout_reconciliations to service_role;

create function enqueue_checkout_reconciliation()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare kind text:=case when tg_table_name='tips' then 'tip' else 'subscription' end; gateway text;
begin
  if new.user_id is null then return new; end if;
  gateway:=case when kind='tip' then case when new.currency='NGN' then 'paystack' else 'dodopayments' end else to_jsonb(new)->>'provider' end;
  if gateway not in ('paystack','dodopayments') then return new; end if;
  insert into checkout_reconciliations(entity_type,entity_id,user_id,provider,reference)
    values(kind,new.id,new.user_id,gateway,case when kind='tip' then 'tip_' else 'sub_' end||new.id) on conflict do nothing;
  return new;
end $$;
create trigger enqueue_tip_checkout after insert on tips for each row execute function enqueue_checkout_reconciliation();
create trigger enqueue_subscription_checkout after insert on subscriptions for each row execute function enqueue_checkout_reconciliation();
insert into checkout_reconciliations(entity_type,entity_id,user_id,provider,reference,created_at)
  select 'tip',id,user_id,case when currency='NGN' then 'paystack' else 'dodopayments' end,'tip_'||id,created_at from tips where user_id is not null and status='pending'
  union all select 'subscription',id,user_id,provider,'sub_'||id,created_at from subscriptions where provider in ('paystack','dodopayments') and (status='pending' or provider='dodopayments' and status='active');

create function record_checkout_session(p_user_id uuid,p_kind text,p_entity_id uuid,p_provider text,p_checkout_id text,p_url text)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare owner uuid; gateway text; previous text;
begin
  if p_kind is null or p_provider is null or p_checkout_id is null or p_url is null or p_kind not in ('tip','subscription') or p_provider not in ('paystack','dodopayments') or p_checkout_id !~ '^[a-zA-Z0-9_-]{1,150}$' or length(p_url) not between 1 and 2000 then raise exception 'Invalid checkout' using errcode='P1004'; end if;
  if (p_provider='paystack' and p_url !~ '^https://checkout\.paystack\.com(/|$)') or (p_provider='dodopayments' and p_url !~ '^https://([a-z0-9-]+\.)*dodopayments\.com(/|$)') then raise exception 'Invalid checkout destination' using errcode='P1004'; end if;
  perform 1 from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003'; end if;
  if p_kind='tip' then
    select user_id,case when currency='NGN' then 'paystack' else 'dodopayments' end,provider_checkout_id into owner,gateway,previous from tips where id=p_entity_id for update;
  else
    select user_id,provider,provider_checkout_id into owner,gateway,previous from subscriptions where id=p_entity_id for update;
  end if;
  if owner is distinct from p_user_id or gateway is distinct from p_provider then raise exception 'Checkout binding mismatch' using errcode='P1003'; end if;
  if previous is not null and previous<>p_checkout_id then raise exception 'Checkout identity changed' using errcode='P1001'; end if;
  if p_provider='paystack' and p_checkout_id<>(case when p_kind='tip' then 'tip_' else 'sub_' end||p_entity_id::text) then raise exception 'Checkout reference mismatch' using errcode='P1003'; end if;
  if p_kind='tip' then update tips set checkout_url=p_url,provider_checkout_id=p_checkout_id where id=p_entity_id;
  else update subscriptions set checkout_url=p_url,provider_checkout_id=p_checkout_id where id=p_entity_id; end if;
  update checkout_reconciliations set status='pending',attempts=0,last_checked_at=null,next_attempt_at=now()+interval '1 minute',last_error=null where entity_type=p_kind and entity_id=p_entity_id and status='failed';
end $$;

create function claim_checkout_reconciliations(p_user_id uuid default null,p_limit integer default 3)
returns setof checkout_reconciliations language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update checkout_reconciliations q set status='settled',claim_token=null,claimed_at=null
    where q.status in ('pending','processing','failed') and (p_user_id is null or q.user_id=p_user_id)
    and (q.entity_type='tip' or q.provider='paystack')
    and exists(select 1 from payment_captures c where c.entity_type=q.entity_type and c.entity_id=q.entity_id);
  return query with candidates as(
    select q.entity_type,q.entity_id from checkout_reconciliations q where (p_user_id is null or q.user_id=p_user_id)
      and ((q.status='pending' and (q.next_attempt_at<=now() or p_user_id is not null and q.last_checked_at is null)) or(q.status='processing' and q.claimed_at<now()-interval '2 minutes') or(q.status='failed' and p_user_id is not null and q.next_attempt_at<=now()))
      order by q.next_attempt_at,q.entity_id for update skip locked limit greatest(1,least(p_limit,3))
  ) update checkout_reconciliations q set status='processing',claim_token=gen_random_uuid(),claimed_at=now(),attempts=q.attempts+1
    from candidates c where q.entity_type=c.entity_type and q.entity_id=c.entity_id returning q.*;
end $$;
create function finish_checkout_reconciliation(p_kind text,p_entity_id uuid,p_claim uuid,p_ok boolean,p_settled boolean,p_page integer,p_delay integer,p_error text,p_correlation_id text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare job checkout_reconciliations;
begin
  select * into job from checkout_reconciliations where entity_type=p_kind and entity_id=p_entity_id and status='processing' and claim_token=p_claim for update;
  if not found then return false; end if;
  update checkout_reconciliations set status=case when p_settled then 'settled' when not p_ok and (attempts>=10 or p_error in ('BINDING_MISMATCH','AMOUNT_MISMATCH')) then 'failed' else 'pending' end,
    attempts=case when p_ok then 0 else attempts end,claim_token=null,claimed_at=null,last_checked_at=now(),scan_page=greatest(0,coalesce(p_page,0)),
    next_attempt_at=now()+make_interval(secs=>greatest(60,least(coalesce(p_delay,300),21600))),last_error=case when p_ok then null else left(p_error,64) end,correlation_id=p_correlation_id
    where entity_type=p_kind and entity_id=p_entity_id returning * into job;
  if job.status='failed' then
    insert into financial_audit_log(target_user_id,action,provider,correlation_id,metadata) values(job.user_id,'checkout_reconciliation_failed',job.provider,p_correlation_id,jsonb_build_object('kind',p_kind,'entity_id',p_entity_id,'error',job.last_error));
  end if;
  return true;
end $$;
revoke all on function record_checkout_session(uuid,text,uuid,text,text,text),claim_checkout_reconciliations(uuid,integer),finish_checkout_reconciliation(text,uuid,uuid,boolean,boolean,integer,integer,text,text) from public,anon,authenticated;
grant execute on function record_checkout_session(uuid,text,uuid,text,text,text),claim_checkout_reconciliations(uuid,integer),finish_checkout_reconciliation(text,uuid,uuid,boolean,boolean,integer,integer,text,text) to service_role;

alter function financial_integrity_snapshot() rename to financial_integrity_snapshot_046;
revoke all on function financial_integrity_snapshot_046() from public,anon,authenticated,service_role;
create function financial_integrity_snapshot()
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select financial_integrity_snapshot_046()||jsonb_build_object('unreconciledCheckouts',(select count(*) from checkout_reconciliations where status='failed' or status='processing' and claimed_at<now()-interval '5 minutes'));
$$;
revoke all on function financial_integrity_snapshot() from public,anon,authenticated;
grant execute on function financial_integrity_snapshot() to service_role;
notify pgrst,'reload schema';

alter table promoted_listings add column created_by uuid references users(id) on delete set null;
revoke insert,update,delete on promoted_listings from anon,authenticated;
create function apply_promotion_intent(p_actor uuid,p_action text,p_id uuid,p_key text,p_data jsonb,p_correlation_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare listing promoted_listings; previous content_intents; fingerprint text; result jsonb; recipient uuid; active_before boolean;
begin
  if p_action not in ('create','update','delete') or p_key is null or length(p_key) not between 8 and 200 or jsonb_typeof(p_data)<>'object' then raise exception 'Invalid promotion intent' using errcode='P1004'; end if;
  if exists(select 1 from jsonb_object_keys(p_data) as field where field not in ('book_id','author_id','start_date','end_date','placement','is_active')) then raise exception 'Invalid promotion fields' using errcode='P1004'; end if;
  if p_action='create' then recipient:=(p_data->>'author_id')::uuid;
  else select author_id into recipient from promoted_listings where id=p_id; end if;
  perform 1 from users where id in (p_actor,recipient) order by id for update;
  if not exists(select 1 from users where id=p_actor and is_admin and not is_banned and deleted_at is null) then raise exception 'Admin required' using errcode='P1003'; end if;
  fingerprint:=jsonb_build_array(p_id,p_data)::text;
  select * into previous from content_intents where actor_id=p_actor and action='promotion:'||p_action and intent_key=p_key;
  if found then
    if previous.fingerprint<>fingerprint then raise exception 'Conflicting promotion intent' using errcode='P1001'; end if;
    return previous.response;
  end if;
  if p_action='create' then
    if not exists(select 1 from books where id=(p_data->>'book_id')::uuid) then raise exception 'Book not found' using errcode='P1005'; end if;
    listing:=jsonb_populate_record(null::promoted_listings,p_data);
    listing.id:=gen_random_uuid();listing.created_by:=p_actor;listing.is_active:=coalesce(listing.is_active,true);listing.created_at:=now();listing.updated_at:=now();listing.clicks:=0;
    active_before:=false;
  else
    select * into listing from promoted_listings where id=p_id for update;
    if not found then raise exception 'Listing not found' using errcode='P1005'; end if;
    if listing.author_id is distinct from recipient then raise exception 'Listing changed' using errcode='P1001'; end if;
    if p_data?'book_id' or p_data?'author_id' then raise exception 'Promotion ownership is immutable' using errcode='P1004'; end if;
    active_before:=listing.is_active;
    if p_action='delete' then
      delete from promoted_listings where id=p_id;
      result:=jsonb_build_object('id',p_id,'deleted',true);
    else listing:=jsonb_populate_record(listing,p_data);listing.updated_at:=now(); end if;
  end if;
  if p_action<>'delete' then
    if listing.placement is null or listing.placement not in ('discover_top','book_page_sidebar') or (listing.start_date is not null and listing.end_date is not null and listing.end_date<=listing.start_date)
      or ((p_action='create' or listing.is_active) and (listing.start_date is null or listing.end_date is null)) then raise exception 'Invalid promotion dates or placement' using errcode='P1004'; end if;
    if listing.author_id is not null and not exists(select 1 from users where id=listing.author_id) then raise exception 'Author not found' using errcode='P1005'; end if;
    if p_action='create' then insert into promoted_listings select listing.*;
    else update promoted_listings set is_active=listing.is_active,start_date=listing.start_date,end_date=listing.end_date,placement=listing.placement,updated_at=now() where id=listing.id returning * into listing; end if;
    result:=to_jsonb(listing);
    if listing.is_active and not active_before and listing.author_id is not null then
      insert into notifications(user_id,type,actor_id,entity_type,entity_id,message) values(listing.author_id,'promoted_listing_activated',p_actor,'book',listing.book_id,'A promoted listing for your book was activated.');
    end if;
  end if;
  insert into content_intents values(p_actor,'promotion:'||p_action,p_key,fingerprint,result);
  insert into financial_audit_log(actor_user_id,target_user_id,action,idempotency_key,correlation_id,metadata)
    values(p_actor,recipient,'promotion_'||p_action,p_key,p_correlation_id,jsonb_build_object('listing_id',listing.id,'manual',true,'state',result));
  return result;
end $$;
revoke all on function apply_promotion_intent(uuid,text,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function apply_promotion_intent(uuid,text,uuid,text,jsonb,text) to service_role;
notify pgrst,'reload schema';

create function record_promotion_click(p_actor uuid,p_id uuid,p_key text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare previous content_intents; result jsonb; fingerprint text:=p_id::text;
begin
  if p_key is null or length(p_key) not between 8 and 200 or p_id is null then raise exception 'Invalid click intent' using errcode='P1004'; end if;
  perform 1 from users where id=p_actor and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003'; end if;
  select * into previous from content_intents where actor_id=p_actor and action='promotion:click' and intent_key=p_key;
  if found then
    if previous.fingerprint<>fingerprint then raise exception 'Conflicting click intent' using errcode='P1001'; end if;
    return previous.response;
  end if;
  update promoted_listings set clicks=clicks+1 where id=p_id and is_active and start_date<=now() and end_date>now();
  if not found then raise exception 'Promotion is not active' using errcode='P1005'; end if;
  result:=jsonb_build_object('ok',true);
  insert into content_intents values(p_actor,'promotion:click',p_key,fingerprint,result);
  return result;
end $$;
revoke all on function record_promotion_click(uuid,uuid,text) from public,anon,authenticated;
grant execute on function record_promotion_click(uuid,uuid,text) to service_role;
notify pgrst,'reload schema';

create function refresh_checkout_after_capture()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update checkout_reconciliations set
    status=case when status='processing' then status when new.entity_type='subscription' and new.provider='dodopayments' then 'pending' else 'settled' end,
    attempts=case when status='processing' then attempts else 0 end,
    next_attempt_at=case when status='processing' then next_attempt_at else now()+interval '6 hours' end,
    last_error=null where entity_type=new.entity_type and entity_id=new.entity_id;
  return new;
end $$;
create trigger refresh_checkout_after_capture after insert on payment_captures for each row execute function refresh_checkout_after_capture();
revoke all on function enqueue_checkout_reconciliation(),refresh_checkout_after_capture() from public,anon,authenticated,service_role;
