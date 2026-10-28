alter table books add column metadata_source text not null default 'legacy'
  check(metadata_source in ('legacy','seed','goodreads','google','openlibrary')),
  add column metadata_provenance jsonb not null default '{}' check(jsonb_typeof(metadata_provenance)='object');

alter function apply_book_interaction(uuid,uuid,text,text,uuid,boolean) rename to apply_book_interaction_060;
revoke all on function apply_book_interaction_060(uuid,uuid,text,text,uuid,boolean) from public,anon,authenticated,service_role;
create function apply_book_interaction(p_user_id uuid,p_book_id uuid,p_action text,p_key text,p_review_id uuid default null,p_value boolean default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform set_config('lock_timeout','5s',true);
  perform pg_advisory_xact_lock_shared(hashtextextended('catalog:identities',0));
  return apply_book_interaction_060(p_user_id,p_book_id,p_action,p_key,p_review_id,p_value);
end $$;
revoke all on function apply_book_interaction(uuid,uuid,text,text,uuid,boolean) from public,anon,authenticated;
grant execute on function apply_book_interaction(uuid,uuid,text,text,uuid,boolean) to service_role;

alter function store_catalog_book(jsonb) rename to store_catalog_book_065;
revoke all on function store_catalog_book_065(jsonb) from public,anon,authenticated,service_role;
create function store_catalog_book(p_data jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare previous books;result books;raw jsonb;payload jsonb:=p_data;source_kind text;before_data jsonb;after_data jsonb;document jsonb;provenance jsonb;field text;candidate jsonb;current_value jsonb;field_source text;missing boolean;known boolean;
begin
  perform set_config('lock_timeout','5s',true);
  perform pg_advisory_xact_lock(hashtextextended('catalog:identities',0));
  source_kind:=case when current_setting('liravo.catalog_source',true)='goodreads' then 'goodreads'
    when p_data->>'open_library_id' is not null then 'openlibrary' when p_data->>'google_books_id' is not null then 'google'
    when p_data->>'goodreads_id' is not null then 'goodreads' else 'seed' end;
  select b.* into previous from books b where b.id in(
    select coalesce(canonical_edition_id,id) from books where isbn_13=coalesce(catalog_isbn(p_data->>'isbn_13',13),catalog_isbn13(catalog_isbn(p_data->>'isbn_10',10))) or isbn_10=catalog_isbn(p_data->>'isbn_10',10)
    union select book_id from book_edition_identifiers where provider='google' and identifier=p_data->>'google_books_id' or provider='openlibrary' and identifier=p_data->>'open_library_id' or provider='goodreads' and identifier=p_data->>'goodreads_id'
    union select coalesce(b.canonical_edition_id,b.id) from goodreads_book_identities g join books b on b.id=g.book_id where g.goodreads_id=p_data->>'goodreads_id'
  ) order by b.id limit 1;
  if previous.id is not null and (source_kind not in ('google','openlibrary') or coalesce(previous.metadata_provenance->>'format',previous.metadata_source) not in ('google','openlibrary')) then payload:=payload-'format';end if;
  if previous.id is not null and source_kind in ('google','openlibrary') and coalesce(previous.metadata_provenance->>'language',previous.metadata_source) in ('google','openlibrary')
    and previous.language<>'und' and nullif(p_data->>'language','und') is not null and split_part(lower(previous.language),'-',1)<>split_part(lower(p_data->>'language'),'-',1) then raise exception 'Conflicting edition language' using errcode='P1001';end if;
  raw:=store_catalog_book_065(payload);
  select * into result from books where id=(raw->>'id')::uuid;
  document:=to_jsonb(result);provenance:=coalesce(previous.metadata_provenance,'{}'::jsonb);
  for field in select unnest(array['title','subtitle','author_name','author_names','publisher','published_year','description','cover_url','page_count','genres','language','edition_name','format']) loop
    current_value:=case when previous.id is null then document->field else to_jsonb(previous)->field end;
    field_source:=coalesce(provenance->>field,previous.metadata_source,'legacy');
    provenance:=jsonb_set(provenance,array[field],to_jsonb(field_source));
    if previous.id is not null then document:=jsonb_set(document,array[field],coalesce(current_value,'null'::jsonb));end if;
    candidate:=p_data->field;
    missing:=current_value is null or current_value='null'::jsonb or current_value='[]'::jsonb or field='language' and current_value='"und"'::jsonb;
    known:=candidate is not null and candidate<>'null'::jsonb and candidate<>'[]'::jsonb and candidate<>'""'::jsonb
      and not(field='language' and candidate='"und"'::jsonb) and not(field='author_name' and candidate in ('"Unknown"'::jsonb,'"—"'::jsonb));
    if known and (previous.id is null or missing or field_source not in ('google','openlibrary') and source_kind in ('google','openlibrary')) then
      document:=jsonb_set(document,array[field],candidate);provenance:=jsonb_set(provenance,array[field],to_jsonb(source_kind));
    elsif previous.id is null and field='language' and not known then document:=jsonb_set(document,array[field],'"und"'::jsonb);end if;
  end loop;
  update books b set title=document->>'title',subtitle=document->>'subtitle',author_name=document->>'author_name',
    author_names=array(select jsonb_array_elements_text(document->'author_names')),publisher=document->>'publisher',published_year=(document->>'published_year')::integer,
    description=document->>'description',cover_url=document->>'cover_url',page_count=(document->>'page_count')::integer,
    genres=array(select jsonb_array_elements_text(document->'genres')),language=document->>'language',edition_name=document->>'edition_name',format=document->>'format',
    metadata_source=case when previous.id is null or previous.metadata_source not in ('google','openlibrary') and source_kind in ('google','openlibrary') then source_kind else b.metadata_source end,
    metadata_provenance=provenance where b.id=result.id returning * into result;
  if previous.id is not null then
    before_data:=to_jsonb(previous)-array['created_at','updated_at','currently_reading_count','want_to_read_count','have_read_count','search_vector','average_rating','ratings_count'];
    after_data:=to_jsonb(result)-array['created_at','updated_at','currently_reading_count','want_to_read_count','have_read_count','search_vector','average_rating','ratings_count'];
    if before_data is distinct from after_data then insert into book_catalog_audit(book_id,reason,previous_data,resolution) values(result.id,'edition_metadata_enriched',before_data,after_data||jsonb_build_object('provider',source_kind));end if;
    if result.page_count>0 and previous.page_count is distinct from result.page_count then
      with corrections as(
        select sb.id,sb.book_id,sb.user_id,sb.progress_pages,sb.progress_percent,least(100,round(sb.progress_pages*100.0/result.page_count,2)) as percent
        from shelf_books sb where sb.book_id=any(book_edition_family(result.id)) and sb.progress_pages is not null
      ),recorded as(
        insert into book_catalog_audit(book_id,reason,previous_data,resolution)
          select book_id,'provider_progress_recalculated',jsonb_build_object('entry_id',id,'user_id',user_id,'pages',progress_pages,'percent',progress_percent),jsonb_build_object('percent',percent)
          from corrections where progress_percent is distinct from percent returning book_id
      ) update shelf_books sb set progress_percent=corrections.percent from corrections where sb.id=corrections.id and sb.progress_percent is distinct from corrections.percent;
    end if;
  end if;
  return to_jsonb(result);
end $$;
revoke all on function store_catalog_book(jsonb) from public,anon,authenticated;
grant execute on function store_catalog_book(jsonb) to service_role;

create table legacy_goodreads_import_intents(
  actor_id uuid not null references users(id) on delete cascade,
  intent_key text not null,
  fingerprint text not null,
  primary key(actor_id,intent_key)
);
insert into legacy_goodreads_import_intents select actor_id,intent_key,fingerprint from content_intents where action='goodreads_import';
alter table legacy_goodreads_import_intents enable row level security;
revoke all on legacy_goodreads_import_intents from public,anon,authenticated,service_role;
grant select on legacy_goodreads_import_intents to service_role;
alter function import_goodreads_library(uuid,text,jsonb,integer) rename to import_goodreads_library_065;
revoke all on function import_goodreads_library_065(uuid,text,jsonb,integer) from public,anon,authenticated,service_role;
create function import_goodreads_library(p_user_id uuid,p_key text,p_rows jsonb,p_skipped integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;old_source text:=coalesce(current_setting('liravo.catalog_source',true),'');
begin
  perform set_config('lock_timeout','5s',true);
  perform pg_advisory_xact_lock(hashtextextended('catalog:identities',0));
  perform set_config('liravo.catalog_source','goodreads',true);
  result:=import_goodreads_library_065(p_user_id,p_key,p_rows,p_skipped);
  perform set_config('liravo.catalog_source',old_source,true);
  insert into legacy_goodreads_import_intents select actor_id,intent_key,fingerprint from content_intents where actor_id=p_user_id and action='goodreads_import' and intent_key=p_key on conflict do nothing;
  return result;
end $$;
create function import_goodreads_library_v2(p_user_id uuid,p_key text,p_rows jsonb,p_skipped integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare previous content_intents;legacy_rows jsonb;legacy_hash text;result jsonb;old_source text:=coalesce(current_setting('liravo.catalog_source',true),'');
begin
  if p_key is null or length(p_key) not between 8 and 200 or p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>2000 or p_skipped is null or p_skipped<0 or jsonb_array_length(p_rows)+p_skipped>2000 then raise exception 'Invalid import' using errcode='P1004';end if;
  perform set_config('lock_timeout','5s',true);
  perform pg_advisory_xact_lock(hashtextextended('catalog:identities',0));
  perform 1 from users where id=p_user_id and not is_banned and deleted_at is null for update;if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  select c.* into previous from content_intents c join legacy_goodreads_import_intents l on l.actor_id=c.actor_id and l.intent_key=c.intent_key and l.fingerprint=c.fingerprint
    where c.actor_id=p_user_id and c.action='goodreads_import' and c.intent_key=p_key;
  if found then
    select coalesce(jsonb_agg(item||jsonb_build_object('book',((item->'book')-array['format','edition_name','open_library_work_id','work_title'])||jsonb_build_object('publisher',null,'page_count',null,'published_year',null,'language','en')) order by ordinality),'[]'::jsonb) into legacy_rows from jsonb_array_elements(p_rows) with ordinality source(item,ordinality);
    legacy_hash:=encode(sha256(convert_to(jsonb_build_object('rows',legacy_rows,'skipped',p_skipped)::text,'UTF8')),'hex');
    if previous.fingerprint=legacy_hash then return previous.response;end if;
  end if;
  perform set_config('liravo.catalog_source','goodreads',true);
  result:=import_goodreads_library_065(p_user_id,p_key,p_rows,p_skipped);
  perform set_config('liravo.catalog_source',old_source,true);
  return result;
end $$;
revoke all on function import_goodreads_library(uuid,text,jsonb,integer),import_goodreads_library_v2(uuid,text,jsonb,integer) from public,anon,authenticated;
grant execute on function import_goodreads_library(uuid,text,jsonb,integer),import_goodreads_library_v2(uuid,text,jsonb,integer) to service_role;
notify pgrst,'reload schema';
