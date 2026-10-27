create table seed_records(kind text not null,key text not null,entity_id uuid,metadata jsonb not null default '{}',created_at timestamptz not null default now(),primary key(kind,key));
alter table seed_records enable row level security;
revoke all on seed_records from public,anon,authenticated;
grant select,insert,update,delete on seed_records to service_role;

do $$
declare item record; old_book books;
begin
  for item in select * from(values
    ('9780670026190','9780670026197','A Gentleman in Moscow','Amor Towles'),
    ('9780593311043','9780593318171','Klara and the Sun','Kazuo Ishiguro'),
    ('9780307477478','9780307387899','The Road','Cormac McCarthy')
  ) source(old_isbn,new_isbn,title,author) loop
    select * into old_book from books where isbn_13=item.old_isbn and title=item.title and author_name=item.author for update;
    if not found then continue; end if;
    if exists(select 1 from books where isbn_13=item.new_isbn) then
      update books set isbn_13=null,cover_url=case when cover_url like '%'||item.old_isbn||'%' then null else cover_url end where id=old_book.id;
      insert into financial_audit_log(action,correlation_id,metadata) values('catalog_identity_reconciliation_required','migration-054',jsonb_build_object('book_id',old_book.id,'old_isbn',item.old_isbn,'correct_isbn',item.new_isbn));
    else
      update books set isbn_13=item.new_isbn,cover_url=replace(cover_url,item.old_isbn,item.new_isbn) where id=old_book.id;
      insert into financial_audit_log(action,correlation_id,metadata) values('catalog_identity_corrected','migration-054',jsonb_build_object('book_id',old_book.id,'old_isbn',item.old_isbn,'correct_isbn',item.new_isbn));
    end if;
  end loop;
end $$;

create function seed_content_item(p_kind text,p_key text,p_data jsonb,p_actor_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare tracked seed_records; editor users; account jsonb; book jsonb; target uuid; created boolean:=false; repaired boolean:=false; links integer; lock_key text; ref text; prompt jsonb; legacy_email text; anchor date; item_date date;
begin
  if p_kind is null or p_kind not in ('editors','books','lists','challenges','prompts','reviews','quotes') or p_key is null or length(p_key) not between 1 and 200 or p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'Invalid seed item' using errcode='P1004'; end if;
  perform set_config('lock_timeout','5s',true);
  perform pg_advisory_xact_lock(hashtextextended('seed-content',0));
  if p_kind='books' then
    for lock_key in select distinct value from jsonb_each_text(p_data) where key in ('isbn_13','isbn_10','google_books_id','open_library_id','goodreads_id') and value<>'' order by value loop
      perform pg_advisory_xact_lock(hashtextextended('catalog-book:'||lock_key,0));
    end loop;
  end if;
  select * into editor from users where username='liravo_editors';
  perform 1 from users where id in (p_actor_id,editor.id) order by id for update;
  if p_actor_id is not null and not exists(select 1 from users where id=p_actor_id and is_admin and not is_banned and deleted_at is null) then raise exception 'Admin required' using errcode='P1003'; end if;
  if p_kind='editors' then
    if editor.id is not null then
      if to_regclass('auth.users') is not null then execute 'select email from auth.users where id=$1' into legacy_email using editor.id;end if;
      if (editor.id='00000000-0000-4000-a000-000000000001' or editor.is_verified_author and (editor.email='liravo_editors_system@liravo.internal' or legacy_email='liravo_editors_system@liravo.internal')) is not true then raise exception 'Editors identity requires reconciliation' using errcode='P1001'; end if;
      if editor.password_hash is not null or editor.google_id is not null or editor.telegram_id is not null then raise exception 'Editors account has login identities' using errcode='P1001';end if;
      if editor.is_banned or editor.deleted_at is not null then raise exception 'Editors account unavailable' using errcode='P1003';end if;
      target:=editor.id;
    else
      if exists(select 1 from users where id='00000000-0000-4000-a000-000000000001') then raise exception 'Editors identity conflict' using errcode='P1001'; end if;
      account:=create_direct_account('00000000-0000-4000-a000-000000000001','liravo_editors_system@liravo.internal','liravo_editors','Liravo Editors');target:=(account->>'id')::uuid;created:=true;
    end if;
    update users set user_types=array['creator'],is_verified_author=true,onboarding_complete=true,profile_visibility='public',shelf_visibility='public' where id=target;
  elsif p_kind='books' then
    created:=not exists(select 1 from books where isbn_13=p_data->>'isbn_13' or isbn_10=p_data->>'isbn_10' or google_books_id=p_data->>'google_books_id' or open_library_id=p_data->>'open_library_id');
    book:=store_catalog_book(p_data);target:=(book->>'id')::uuid;
    if p_data?'has_audiobook' then update books set has_audiobook=(p_data->>'has_audiobook')::boolean where id=target and has_audiobook is distinct from (p_data->>'has_audiobook')::boolean;end if;
  else
    if p_kind in ('lists','reviews','quotes') and (editor.id is null or not editor.is_verified_author or editor.deleted_at is not null or editor.is_banned) then raise exception 'Seed editors account first' using errcode='P1005'; end if;
    select * into tracked from seed_records where kind=p_kind and key=p_key;
    target:=tracked.entity_id;
    if p_kind='lists' then
      if length(coalesce(p_data->>'title','')) not between 1 and 200 or jsonb_typeof(p_data->'book_isbns') is distinct from 'array' or jsonb_array_length(p_data->'book_isbns')>1000 then raise exception 'Invalid seed list' using errcode='P1004';end if;
      for ref in select jsonb_array_elements_text(p_data->'book_isbns') loop
        if not exists(select 1 from books where isbn_13=ref) then raise exception 'Seed books before reading lists: %',ref using errcode='P1005';end if;
      end loop;
      if target is not null and not exists(select 1 from reading_lists where id=target and user_id=editor.id) then target:=null;end if;
      if target is null then select id into target from reading_lists where user_id=editor.id and name=p_data->>'title' order by created_at,id limit 1;end if;
      if target is null then insert into reading_lists(user_id,name,description,is_public) values(editor.id,p_data->>'title',p_data->>'description',true) returning id into target;created:=true;end if;
      insert into reading_list_books(list_id,book_id,position)
        select target,b.id,(source.ordinality-1)::integer from jsonb_array_elements_text(p_data->'book_isbns') with ordinality source(isbn,ordinality) join books b on b.isbn_13=source.isbn
        on conflict(list_id,book_id) do update set position=excluded.position where reading_list_books.position is distinct from excluded.position;
      get diagnostics links=row_count;repaired:=not created and links>0;
    elsif p_kind='challenges' then
      if length(coalesce(p_data->>'title','')) not between 1 and 200 or p_data->>'type' not in ('daily','weekly','monthly') or (p_data->>'end_date')::timestamptz<=(p_data->>'start_date')::timestamptz then raise exception 'Invalid seed challenge' using errcode='P1004';end if;
      if target is not null and not exists(select 1 from writing_challenges where id=target) then target:=null;end if;
      if target is null then select id into target from writing_challenges where title=p_data->>'title' order by created_at,id limit 1;end if;
      if target is null then insert into writing_challenges(title,description,type,start_date,end_date,is_active) values(p_data->>'title',p_data->>'description',p_data->>'type',(p_data->>'start_date')::timestamptz,(p_data->>'end_date')::timestamptz,(p_data->>'is_active')::boolean) returning id into target;created:=true;end if;
    elsif p_kind='prompts' then
      if p_data->>'offset' is null or p_data->>'offset' !~ '^[0-9]{1,3}$' or (p_data->>'offset')::integer>365 then raise exception 'Invalid prompt offset' using errcode='P1004';end if;
      if target is not null and not exists(select 1 from writing_prompts where id=target) then target:=null;end if;
      if target is null then
        insert into seed_records(kind,key,metadata) values('anchor','prompts',jsonb_build_object('start_date',(now() at time zone 'UTC')::date+1)) on conflict do nothing;
        select (metadata->>'start_date')::date into anchor from seed_records where kind='anchor' and key='prompts';
        item_date:=anchor+(p_data->>'offset')::integer;
        prompt:=publish_writing_prompt(item_date,p_data->>'prompt_text',p_data->>'topic_seed');target:=(prompt->'prompt'->>'id')::uuid;created:=(prompt->>'created')::boolean;
      end if;
    else
      if not exists(select 1 from books where id=(p_data->>'book_id')::uuid) then raise exception 'Seed book unavailable' using errcode='P1005';end if;
      if p_kind='reviews' then
        if target is not null and not exists(select 1 from reviews where id=target and user_id=editor.id) then target:=null;end if;
        if target is null then select id into target from reviews where user_id=editor.id and book_id=(p_data->>'book_id')::uuid order by created_at,id limit 1;end if;
        if target is null then insert into reviews(user_id,book_id,review_type,rating,content,mood_tags,has_spoilers,moderation_status) values(editor.id,(p_data->>'book_id')::uuid,p_data->>'review_type',(p_data->>'rating')::numeric,p_data->>'content',array(select jsonb_array_elements_text(p_data->'mood_tags')),false,'published') returning id into target;created:=true;end if;
      else
        if target is not null and not exists(select 1 from quotes where id=target and user_id=editor.id) then target:=null;end if;
        if target is null then select id into target from quotes where user_id=editor.id and book_id=(p_data->>'book_id')::uuid and content=p_data->>'content' order by created_at,id limit 1;end if;
        if target is null then insert into quotes(user_id,book_id,content,page_number) values(editor.id,(p_data->>'book_id')::uuid,p_data->>'content',(p_data->>'page_number')::integer) returning id into target;created:=true;end if;
      end if;
    end if;
  end if;
  insert into seed_records(kind,key,entity_id) values(p_kind,p_key,target) on conflict(kind,key) do update set entity_id=excluded.entity_id;
  if created or repaired then insert into financial_audit_log(actor_user_id,action,metadata) values(p_actor_id,'seed_'||p_kind,jsonb_build_object('key',p_key,'entity_id',target,'created',created,'repaired',repaired));end if;
  return jsonb_build_object('id',target,'created',created,'repaired',repaired);
end $$;
revoke all on function seed_content_item(text,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function seed_content_item(text,text,jsonb,uuid) to service_role;
notify pgrst,'reload schema';
