create table goodreads_book_identities(
  goodreads_id text primary key check(goodreads_id ~ '^[1-9][0-9]{0,19}$'),
  book_id uuid not null references books(id) on delete cascade
);
create index goodreads_book_identity_book on goodreads_book_identities(book_id);
alter table goodreads_book_identities enable row level security;
revoke all on goodreads_book_identities from public,anon,authenticated;
grant select,insert,update,delete on goodreads_book_identities to service_role;
create or replace function store_catalog_book(p_data jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result books; matched integer; identity_key text; lock_key text;
begin
  identity_key:=coalesce(nullif(p_data->>'isbn_13',''),nullif(p_data->>'google_books_id',''),nullif(p_data->>'open_library_id',''),nullif(p_data->>'isbn_10',''),nullif(p_data->>'goodreads_id',''));
  if identity_key is null or length(coalesce(p_data->>'title','')) not between 1 and 500 or length(coalesce(p_data->>'author_name','')) not between 1 and 200 then raise exception 'Invalid catalog book' using errcode='P1004'; end if;
  for lock_key in select distinct value from jsonb_each_text(p_data) where key in ('isbn_13','isbn_10','google_books_id','open_library_id','goodreads_id') and value<>'' order by value loop
    perform pg_advisory_xact_lock(hashtextextended('catalog-book:'||lock_key,0));
  end loop;
  select count(*) into matched from books where google_books_id=p_data->>'google_books_id' or open_library_id=p_data->>'open_library_id' or isbn_13=p_data->>'isbn_13' or isbn_10=p_data->>'isbn_10' or id=(select book_id from goodreads_book_identities where goodreads_id=p_data->>'goodreads_id');
  if matched>1 then raise exception 'Conflicting catalog identities' using errcode='P1001'; end if;
  select * into result from books where google_books_id=p_data->>'google_books_id' or open_library_id=p_data->>'open_library_id' or isbn_13=p_data->>'isbn_13' or isbn_10=p_data->>'isbn_10' or id=(select book_id from goodreads_book_identities where goodreads_id=p_data->>'goodreads_id') order by created_at,id limit 1;
  if found then
    if p_data->>'goodreads_id' is not null then
      insert into goodreads_book_identities(goodreads_id,book_id) values(p_data->>'goodreads_id',result.id) on conflict do nothing;
      update books set isbn_10=coalesce(isbn_10,p_data->>'isbn_10'),isbn_13=coalesce(isbn_13,p_data->>'isbn_13') where id=result.id returning * into result;
    end if;
    return to_jsonb(result);
  end if;
  begin
    insert into books(google_books_id,open_library_id,isbn_10,isbn_13,title,subtitle,author_name,author_names,publisher,published_year,description,cover_url,page_count,genres,language,average_rating,ratings_count)
      values(p_data->>'google_books_id',p_data->>'open_library_id',p_data->>'isbn_10',p_data->>'isbn_13',p_data->>'title',p_data->>'subtitle',p_data->>'author_name',
        array(select jsonb_array_elements_text(coalesce(p_data->'author_names','[]'::jsonb))),p_data->>'publisher',(p_data->>'published_year')::integer,p_data->>'description',p_data->>'cover_url',(p_data->>'page_count')::integer,
        array(select jsonb_array_elements_text(coalesce(p_data->'genres','[]'::jsonb))),coalesce(p_data->>'language','en'),(p_data->>'average_rating')::numeric,coalesce((p_data->>'ratings_count')::integer,0)) returning * into result;
  exception when unique_violation then
    select * into result from books where google_books_id=p_data->>'google_books_id' or open_library_id=p_data->>'open_library_id' or isbn_13=p_data->>'isbn_13' or isbn_10=p_data->>'isbn_10' or id=(select book_id from goodreads_book_identities where goodreads_id=p_data->>'goodreads_id') order by created_at,id limit 1;
    if not found then raise; end if;
  end;
  if p_data->>'goodreads_id' is not null then insert into goodreads_book_identities(goodreads_id,book_id) values(p_data->>'goodreads_id',result.id) on conflict do nothing; end if;
  return to_jsonb(result);
end $$;

create function import_goodreads_library(p_user_id uuid,p_key text,p_rows jsonb,p_skipped integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare previous content_intents; fingerprint text; item jsonb; book jsonb; shelf uuid; book_ids uuid[]:='{}'; entries jsonb:='[]'; imported integer:=0; skipped integer:=p_skipped; result jsonb; lock_key text;
begin
  if p_key is null or length(p_key) not between 8 and 200 or p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)>2000 or p_skipped is null or p_skipped<0 or jsonb_array_length(p_rows)+p_skipped>2000 then raise exception 'Invalid import' using errcode='P1004'; end if;
  for lock_key in select distinct identity.value from jsonb_array_elements(p_rows) row_data cross join lateral jsonb_each_text(row_data->'book') identity
    where identity.key in ('isbn_13','isbn_10','google_books_id','open_library_id','goodreads_id') and identity.value<>'' order by identity.value loop
    perform pg_advisory_xact_lock(hashtextextended('catalog-book:'||lock_key,0));
  end loop;
  perform 1 from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003'; end if;
  fingerprint:=encode(sha256(convert_to(jsonb_build_object('rows',p_rows,'skipped',p_skipped)::text,'UTF8')),'hex');
  select * into previous from content_intents where actor_id=p_user_id and action='goodreads_import' and intent_key=p_key;
  if found then
    if previous.fingerprint<>fingerprint then raise exception 'Conflicting import intent' using errcode='P1001'; end if;
    return previous.response;
  end if;
  perform 1 from books b where b.isbn_13 in(select row_data->'book'->>'isbn_13' from jsonb_array_elements(p_rows) row_data)
    or b.isbn_10 in(select row_data->'book'->>'isbn_10' from jsonb_array_elements(p_rows) row_data)
    or b.google_books_id in(select row_data->'book'->>'google_books_id' from jsonb_array_elements(p_rows) row_data)
    or b.open_library_id in(select row_data->'book'->>'open_library_id' from jsonb_array_elements(p_rows) row_data)
    or b.id in(select identity.book_id from goodreads_book_identities identity join jsonb_array_elements(p_rows) row_data on identity.goodreads_id=row_data->'book'->>'goodreads_id') order by b.id for update;
  for item in select * from jsonb_array_elements(p_rows) loop
    if item->>'shelf' is null or item->>'shelf' not in ('want_to_read','currently_reading','have_read') then raise exception 'Invalid shelf' using errcode='P1004'; end if;
    select id into shelf from shelves where user_id=p_user_id and default_type=item->>'shelf' order by created_at,id limit 1;
    if not found then raise exception 'Default shelf unavailable' using errcode='P1005'; end if;
    book:=store_catalog_book(item->'book');
    if (book->>'id')::uuid=any(book_ids) or exists(select 1 from shelf_books where user_id=p_user_id and book_id=(book->>'id')::uuid) then skipped:=skipped+1;continue;end if;
    book_ids:=array_append(book_ids,(book->>'id')::uuid);
    entries:=entries||jsonb_build_array(jsonb_build_object('shelf_id',shelf,'book_id',book->>'id','finished_at',case when item->>'shelf'='have_read' then item->>'finished_at' else null end));
    imported:=imported+1;
  end loop;
  insert into shelf_books(user_id,shelf_id,book_id,finished_at)
    select p_user_id,entry.shelf_id,entry.book_id,entry.finished_at from jsonb_to_recordset(entries) entry(shelf_id uuid,book_id uuid,finished_at date);
  update books book set
    currently_reading_count=(select count(distinct sb.user_id) from shelf_books sb join shelves s on s.id=sb.shelf_id where sb.book_id=book.id and s.default_type='currently_reading'),
    have_read_count=(select count(distinct sb.user_id) from shelf_books sb join shelves s on s.id=sb.shelf_id where sb.book_id=book.id and s.default_type='have_read'),
    want_to_read_count=(select count(distinct sb.user_id) from shelf_books sb join shelves s on s.id=sb.shelf_id where sb.book_id=book.id and s.default_type='want_to_read') where book.id=any(book_ids);
  update users set books_read_count=count_verified_books(p_user_id) where id=p_user_id;
  result:=jsonb_build_object('imported',imported,'skipped',skipped);
  insert into content_intents(actor_id,action,intent_key,fingerprint,response) values(p_user_id,'goodreads_import',p_key,fingerprint,result);
  return result;
end $$;
revoke all on function store_catalog_book(jsonb),import_goodreads_library(uuid,text,jsonb,integer) from public,anon,authenticated;
grant execute on function store_catalog_book(jsonb),import_goodreads_library(uuid,text,jsonb,integer) to service_role;
notify pgrst,'reload schema';
