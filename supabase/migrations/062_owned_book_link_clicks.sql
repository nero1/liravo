alter table affiliate_link_clicks add column link_id text;
alter table affiliate_link_clicks add column store_id uuid references affiliate_stores(id) on delete set null;
revoke insert,update,delete on affiliate_link_clicks from anon,authenticated;

create function touch_affiliate_store_version()
returns trigger language plpgsql set search_path=public,pg_temp as $$begin new.updated_at:=clock_timestamp();return new;end $$;
create trigger touch_affiliate_store_version before update on affiliate_stores for each row execute function touch_affiliate_store_version();
revoke all on function touch_affiliate_store_version() from public,anon,authenticated;

create function record_book_link_click(p_user_id uuid,p_book_id uuid,p_link_id text,p_key text,p_link jsonb default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare previous content_intents;fingerprint text;store affiliate_stores;click_id uuid;result jsonb;
begin
  if p_key is null or length(p_key) not between 8 and 200 or p_link_id is null or p_link_id!~'^(worldcat|audible-(us|fr|de)|[a-f0-9-]{36}):[a-f0-9]{64}$' then raise exception 'Invalid click intent' using errcode='P1004';end if;
  perform 1 from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  fingerprint:=jsonb_build_array(p_book_id,p_link_id)::text;
  select * into previous from content_intents where actor_id=p_user_id and action='book:click' and intent_key=p_key;
  if found then
    if previous.fingerprint<>fingerprint then raise exception 'Conflicting click intent' using errcode='P1001';end if;
    return previous.response;
  end if;
  if p_link is null then raise exception 'Book link unavailable' using errcode='P1005';end if;
  if not coalesce(p_link->>'linkId'=p_link_id and length(p_link->>'name') between 1 and 100 and p_link->>'country'~'^[A-Z]{2}$'
    and jsonb_typeof(p_link->'isAffiliate')='boolean' and jsonb_typeof(p_link->'isPrimary')='boolean',false) then raise exception 'Invalid canonical link' using errcode='P1004';end if;
  perform 1 from books where id=p_book_id for key share;if not found then raise exception 'Book unavailable' using errcode='P1005';end if;
  if p_link->>'storeId' is not null then
    select * into store from affiliate_stores where id=(p_link->>'storeId')::uuid and is_active for share;
    if not found or store.id::text<>split_part(p_link_id,':',1) or (cardinality(store.countries)>0 and not(p_link->>'country'=any(store.countries))) then raise exception 'Book link unavailable' using errcode='P1005';end if;
    if store.updated_at is distinct from (p_link->>'storeVersion')::timestamptz or store.name is distinct from p_link->>'name'
      or store.is_non_affiliate=(p_link->>'isAffiliate')::boolean or (store.priority=1) is distinct from (p_link->>'isPrimary')::boolean then raise exception 'Book link changed' using errcode='P1001';end if;
  elsif split_part(p_link_id,':',1) not in ('worldcat','audible-us','audible-fr','audible-de') then raise exception 'Invalid fallback link' using errcode='P1004';end if;
  insert into affiliate_link_clicks(book_id,user_id_hash,link_type,store_name,country,is_affiliate,link_id,store_id)
    values(p_book_id,encode(sha256(convert_to(p_user_id::text,'UTF8')),'hex'),case when p_link_id like 'audible-%' then 'audio' when (p_link->>'isPrimary')::boolean then 'primary' else 'secondary' end,
      p_link->>'name',p_link->>'country',(p_link->>'isAffiliate')::boolean,p_link_id,(p_link->>'storeId')::uuid) returning id into click_id;
  result:=jsonb_build_object('ok',true,'clickId',click_id);
  insert into content_intents values(p_user_id,'book:click',p_key,fingerprint,result);
  return result;
end $$;
revoke all on function record_book_link_click(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function record_book_link_click(uuid,uuid,text,text,jsonb) to service_role;
notify pgrst,'reload schema';
