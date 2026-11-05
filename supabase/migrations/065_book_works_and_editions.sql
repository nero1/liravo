create function catalog_isbn(p_value text,p_length integer)
returns text language plpgsql immutable set search_path=public,pg_temp as $$
declare code text:=upper(regexp_replace(p_value,'[[:space:]-]','','g'));total integer:=0;digit integer;i integer;
begin
  if code is null then return null;end if;
  if p_length=13 then
    if code !~ '^(978[0-9]{10}|979[1-9][0-9]{9})$' then return null;end if;
  elsif p_length=10 then
    if code !~ '^[0-9]{9}[0-9X]$' then return null;end if;
  else return null;end if;
  for i in 1..p_length loop
    digit:=case when substr(code,i,1)='X' then 10 else substr(code,i,1)::integer end;
    total:=total+digit*case when p_length=10 then 11-i when i%2=0 then 3 else 1 end;
  end loop;
  if total%(case when p_length=10 then 11 else 10 end)<>0 then return null;end if;
  return code;
end $$;
create function catalog_isbn13(p_isbn10 text)
returns text language plpgsql immutable set search_path=public,pg_temp as $$
declare prefix text;total integer:=0;i integer;
begin
  if catalog_isbn(p_isbn10,10) is null then return null;end if;
  prefix:='978'||substr(p_isbn10,1,9);
  for i in 1..12 loop total:=total+substr(prefix,i,1)::integer*case when i%2=0 then 3 else 1 end;end loop;
  return prefix||((10-total%10)%10)::text;
end $$;

create table book_works(
  id uuid primary key default gen_random_uuid(),
  title text not null check(length(title) between 1 and 500),
  author_name text not null,
  open_library_id text unique check(open_library_id ~ '^/works/OL[1-9][0-9]*W$'),
  merged_into uuid references book_works(id),
  created_at timestamptz not null default now(),
  check(merged_into is null or merged_into<>id)
);
alter table books add column work_id uuid references book_works(id),
  add column canonical_edition_id uuid references books(id) check(canonical_edition_id<>id),
  add column edition_name text check(length(edition_name)<=200),
  add column format text check(format in ('hardcover','paperback','ebook','audiobook'));
create index books_work_editions on books(work_id,id);
create index books_canonical_edition on books(canonical_edition_id) where canonical_edition_id is not null;
create table book_catalog_audit(
  id bigint generated always as identity primary key,
  book_id uuid not null,
  reason text not null,
  previous_data jsonb not null,
  resolution jsonb not null,
  created_at timestamptz not null default now()
);

create temporary table catalog_legacy_editions on commit drop as
with normalized as(
  select b.id,to_jsonb(b) as original,catalog_isbn(b.isbn_10,10) as code10,
    coalesce(catalog_isbn(b.isbn_13,13),catalog_isbn13(catalog_isbn(b.isbn_10,10))) as code13,b.created_at
  from books b
)
select *,case when code13 is null then id else first_value(id) over(partition by code13 order by created_at,id) end as canonical_id from normalized;
insert into book_works(id,title,author_name,open_library_id,created_at)
  select id,left(title,500),author_name,case when open_library_id ~ '^/works/OL[1-9][0-9]*W$' then open_library_id end,created_at from books;
update books set isbn_10=null,isbn_13=null;
update books b set work_id=n.canonical_id,
  canonical_edition_id=case when b.id<>n.canonical_id then n.canonical_id end,
  isbn_13=case when b.id=n.canonical_id then n.code13 end,
  isbn_10=case when b.id=n.canonical_id and (n.code13 is null or catalog_isbn13(n.code10)=n.code13) then n.code10 end,
  open_library_id=case when b.open_library_id ~ '^/books/OL[1-9][0-9]*M$' then b.open_library_id end
  from catalog_legacy_editions n where b.id=n.id;
update book_works w set merged_into=n.canonical_id from catalog_legacy_editions n where w.id=n.id and n.id<>n.canonical_id;
insert into book_catalog_audit(book_id,reason,previous_data,resolution)
  select b.id,'legacy_edition_identity',n.original,jsonb_build_object('work_id',b.work_id,'canonical_edition_id',b.canonical_edition_id,'isbn_10',b.isbn_10,'isbn_13',b.isbn_13,'open_library_id',b.open_library_id)
  from books b join catalog_legacy_editions n on n.id=b.id
  where n.original->>'isbn_10' is distinct from b.isbn_10 or n.original->>'isbn_13' is distinct from b.isbn_13
    or n.original->>'open_library_id' is distinct from b.open_library_id or b.canonical_edition_id is not null;
alter table books alter column work_id set not null;

create table book_edition_identifiers(
  provider text not null check(provider in ('google','openlibrary','goodreads')),
  identifier text not null check(length(identifier) between 1 and 200),
  book_id uuid not null references books(id) on delete cascade,
  primary key(provider,identifier)
);
create index book_edition_identifiers_book on book_edition_identifiers(book_id);
insert into book_edition_identifiers(provider,identifier,book_id)
  select 'google',google_books_id,coalesce(canonical_edition_id,id) from books where google_books_id is not null
  union all select 'openlibrary',open_library_id,coalesce(canonical_edition_id,id) from books where open_library_id is not null
  union all select 'goodreads',g.goodreads_id,coalesce(b.canonical_edition_id,b.id) from goodreads_book_identities g join books b on b.id=g.book_id;

create function canonical_book_work(p_id uuid)
returns uuid language plpgsql stable security definer set search_path=public,pg_temp as $$
declare current_id uuid:=p_id;target uuid;depth integer:=0;
begin
  loop
    select merged_into into target from book_works where id=current_id;
    if not found then return null;end if;
    if target is null then return current_id;end if;
    current_id:=target;depth:=depth+1;
    if depth>32 then raise exception 'Invalid work identity' using errcode='P1001';end if;
  end loop;
end $$;

create table book_work_identifiers(
  open_library_id text primary key check(open_library_id ~ '^/works/OL[1-9][0-9]*W$'),
  work_id uuid not null references book_works(id)
);
create index book_work_identifiers_work on book_work_identifiers(work_id);
insert into book_work_identifiers select open_library_id,canonical_book_work(id) from book_works where open_library_id is not null;
alter table book_work_identifiers enable row level security;
revoke all on book_work_identifiers from public,anon,authenticated;
grant select,insert,update,delete on book_work_identifiers to service_role;

create function guard_book_edition()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare code10 text;code13 text;
begin
  if tg_op='UPDATE' and new.work_id is not distinct from old.work_id and new.canonical_edition_id is not distinct from old.canonical_edition_id
    and new.isbn_10 is not distinct from old.isbn_10 and new.isbn_13 is not distinct from old.isbn_13
    and new.google_books_id is not distinct from old.google_books_id and new.open_library_id is not distinct from old.open_library_id then return new;end if;
  perform set_config('lock_timeout','5s',true);
  perform pg_advisory_xact_lock(hashtextextended('catalog:identities',0));
  code10:=catalog_isbn(new.isbn_10,10);code13:=catalog_isbn(new.isbn_13,13);
  if new.isbn_10 is not null and code10 is null or new.isbn_13 is not null and code13 is null
    or code10 is not null and code13 is not null and catalog_isbn13(code10)<>code13 then raise exception 'Invalid edition ISBN' using errcode='P1004';end if;
  new.isbn_10:=code10;new.isbn_13:=coalesce(code13,catalog_isbn13(code10));
  if new.open_library_id is not null and new.open_library_id !~ '^/books/OL[1-9][0-9]*M$' then raise exception 'An edition ID is required' using errcode='P1004';end if;
  if new.work_id is null then
    insert into book_works(id,title,author_name) values(new.id,new.title,new.author_name);new.work_id:=new.id;
  else new.work_id:=canonical_book_work(new.work_id);end if;
  if new.canonical_edition_id is not null and not exists(select 1 from books b where b.id=new.canonical_edition_id and b.canonical_edition_id is null and canonical_book_work(b.work_id)=new.work_id) then raise exception 'Invalid canonical edition' using errcode='P1004';end if;
  return new;
end $$;
create trigger aa_book_edition before insert or update on books for each row execute function guard_book_edition();
create function retain_book_edition_identifiers()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare identity record;target uuid:=coalesce(new.canonical_edition_id,new.id);existing uuid;
begin
  for identity in select * from (values('google',new.google_books_id),('openlibrary',new.open_library_id)) as source(provider,identifier) where identifier is not null loop
    select book_id into existing from book_edition_identifiers where provider=identity.provider and identifier=identity.identifier;
    if found and existing<>target then raise exception 'Conflicting edition identity' using errcode='P1001';end if;
    insert into book_edition_identifiers values(identity.provider,identity.identifier,target) on conflict do nothing;
  end loop;
  return new;
end $$;
create trigger retain_book_edition_identifiers after insert or update of google_books_id,open_library_id,canonical_edition_id on books for each row execute function retain_book_edition_identifiers();

create or replace function store_catalog_book(p_data jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result books;requested_work book_works;existing_work book_works;matched uuid[];code10 text;code13 text;work_key text:=nullif(p_data->>'open_library_work_id','');edition_key text:=nullif(p_data->>'open_library_id','');identity record;affected_users uuid[];
begin
  perform set_config('lock_timeout','5s',true);
  perform pg_advisory_xact_lock(hashtextextended('catalog:identities',0));
  code10:=catalog_isbn(p_data->>'isbn_10',10);code13:=catalog_isbn(p_data->>'isbn_13',13);
  if p_data->>'isbn_10' is not null and code10 is null or p_data->>'isbn_13' is not null and code13 is null
    or code10 is not null and code13 is not null and catalog_isbn13(code10)<>code13 then raise exception 'Invalid edition ISBN' using errcode='P1004';end if;
  code13:=coalesce(code13,catalog_isbn13(code10));
  if length(coalesce(p_data->>'title','')) not between 1 and 500 or length(coalesce(p_data->>'author_name','')) not between 1 and 200
    or coalesce(code13,p_data->>'google_books_id',edition_key,p_data->>'goodreads_id') is null
    or edition_key is not null and edition_key !~ '^/books/OL[1-9][0-9]*M$'
    or work_key is not null and work_key !~ '^/works/OL[1-9][0-9]*W$' then raise exception 'Invalid catalog edition' using errcode='P1004';end if;
  select array_agg(distinct id) into matched from(
    select coalesce(canonical_edition_id,id) as id from books where isbn_13=code13 or isbn_10=code10
    union select book_id from book_edition_identifiers where provider='google' and identifier=p_data->>'google_books_id' or provider='openlibrary' and identifier=edition_key or provider='goodreads' and identifier=p_data->>'goodreads_id'
    union select coalesce(b.canonical_edition_id,b.id) from goodreads_book_identities g join books b on b.id=g.book_id where g.goodreads_id=p_data->>'goodreads_id'
  ) identities;
  if cardinality(matched)>1 then raise exception 'Conflicting edition identities' using errcode='P1001';end if;
  if cardinality(matched)=1 then
    select * into result from books where id=matched[1];
    if code13 is not null and result.isbn_13 is not null and result.isbn_13<>code13 or result.format is not null and p_data->>'format' is not null and result.format<>p_data->>'format' then raise exception 'Provider identity names another edition' using errcode='P1001';end if;
  end if;
  if work_key is not null then
    select * into requested_work from book_works where id=canonical_book_work((select work_id from book_work_identifiers where open_library_id=work_key));
    if result.id is not null then
      select * into existing_work from book_works where id=canonical_book_work(result.work_id);
      if requested_work.id is distinct from existing_work.id and exists(select 1 from book_work_identifiers where work_id=existing_work.id and open_library_id<>work_key) then raise exception 'Conflicting work identity' using errcode='P1001';end if;
      if requested_work.id is null then
        update book_works set open_library_id=work_key,title=coalesce(p_data->>'work_title',title) where id=existing_work.id returning * into requested_work;
      elsif requested_work.id<>existing_work.id then
        select array_agg(distinct sb.user_id) into affected_users from shelf_books sb join books b on b.id=sb.book_id where b.work_id in (existing_work.id,requested_work.id);
        perform 1 from users where id=any(affected_users) order by id for update;
        insert into book_catalog_audit(book_id,reason,previous_data,resolution)
          select id,'provider_work_resolved',jsonb_build_object('work_id',work_id),jsonb_build_object('work_id',requested_work.id,'open_library_work_id',work_key,'isbn_13',code13,'open_library_id',edition_key) from books where work_id=existing_work.id;
        update book_work_identifiers set work_id=requested_work.id where work_id=existing_work.id;
        update book_works set merged_into=requested_work.id where id=existing_work.id;
        update books set work_id=requested_work.id where work_id=existing_work.id;
        update users set books_read_count=count_verified_books(id) where id=any(affected_users);
      end if;
    elsif requested_work.id is null then
      insert into book_works(title,author_name,open_library_id) values(coalesce(p_data->>'work_title',p_data->>'title'),p_data->>'author_name',work_key) returning * into requested_work;
    end if;
  end if;
  if requested_work.id is not null and p_data->>'work_title' is not null then update book_works set title=p_data->>'work_title' where id=requested_work.id;end if;
  if result.id is null then
    insert into books(work_id,google_books_id,open_library_id,isbn_10,isbn_13,title,subtitle,author_name,author_names,publisher,published_year,description,cover_url,page_count,genres,language,average_rating,ratings_count,edition_name,format)
      values(requested_work.id,p_data->>'google_books_id',edition_key,code10,code13,p_data->>'title',p_data->>'subtitle',p_data->>'author_name',
        array(select jsonb_array_elements_text(coalesce(p_data->'author_names','[]'::jsonb))),p_data->>'publisher',(p_data->>'published_year')::integer,p_data->>'description',p_data->>'cover_url',(p_data->>'page_count')::integer,
        array(select jsonb_array_elements_text(coalesce(p_data->'genres','[]'::jsonb))),coalesce(p_data->>'language','en'),(p_data->>'average_rating')::numeric,coalesce((p_data->>'ratings_count')::integer,0),p_data->>'edition_name',p_data->>'format') returning * into result;
  else
    update books set work_id=coalesce(requested_work.id,work_id),isbn_10=coalesce(isbn_10,code10),isbn_13=coalesce(isbn_13,code13),
      google_books_id=coalesce(google_books_id,p_data->>'google_books_id'),open_library_id=coalesce(open_library_id,edition_key),
      publisher=coalesce(publisher,p_data->>'publisher'),page_count=coalesce(page_count,(p_data->>'page_count')::integer),edition_name=coalesce(edition_name,p_data->>'edition_name'),format=coalesce(format,p_data->>'format')
      where id=result.id returning * into result;
  end if;
  for identity in select * from (values('google',p_data->>'google_books_id'),('openlibrary',edition_key),('goodreads',p_data->>'goodreads_id')) as source(provider,identifier) where identifier is not null loop
    insert into book_edition_identifiers values(identity.provider,identity.identifier,result.id) on conflict do nothing;
  end loop;
  if work_key is not null then insert into book_work_identifiers values(work_key,result.work_id) on conflict do nothing;end if;
  if p_data->>'goodreads_id' is not null then insert into goodreads_book_identities values(p_data->>'goodreads_id',result.id) on conflict do nothing;end if;
  return to_jsonb(result);
end $$;

alter function import_goodreads_library(uuid,text,jsonb,integer) rename to import_goodreads_library_052;
revoke all on function import_goodreads_library_052(uuid,text,jsonb,integer) from public,anon,authenticated,service_role;
create function import_goodreads_library(p_user_id uuid,p_key text,p_rows jsonb,p_skipped integer)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform set_config('lock_timeout','5s',true);
  perform pg_advisory_xact_lock(hashtextextended('catalog:identities',0));
  if exists(select 1 from jsonb_array_elements(p_rows) item where item->'book'->>'open_library_work_id' is not null) then raise exception 'Goodreads imports cannot assert provider work identities' using errcode='P1004';end if;
  return import_goodreads_library_052(p_user_id,p_key,p_rows,p_skipped);
end $$;
alter function seed_content_item(text,text,jsonb,uuid) rename to seed_content_item_054;
revoke all on function seed_content_item_054(text,text,jsonb,uuid) from public,anon,authenticated,service_role;
create function seed_content_item(p_kind text,p_key text,p_data jsonb,p_actor_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform set_config('lock_timeout','5s',true);
  perform pg_advisory_xact_lock(hashtextextended('catalog:identities',0));
  return seed_content_item_054(p_kind,p_key,p_data,p_actor_id);
end $$;

alter table book_works enable row level security;
alter table book_edition_identifiers enable row level security;
alter table book_catalog_audit enable row level security;
revoke all on book_works,book_edition_identifiers,book_catalog_audit from public,anon,authenticated;
revoke insert,update,delete on books from anon,authenticated;
grant select on book_works to anon,authenticated;
create policy public_book_works on book_works for select to anon,authenticated using(true);
grant select,insert,update,delete on book_works,book_edition_identifiers,book_catalog_audit to service_role;
revoke all on function catalog_isbn(text,integer),catalog_isbn13(text),canonical_book_work(uuid),guard_book_edition(),retain_book_edition_identifiers(),store_catalog_book(jsonb),import_goodreads_library(uuid,text,jsonb,integer),seed_content_item(text,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function store_catalog_book(jsonb),canonical_book_work(uuid),import_goodreads_library(uuid,text,jsonb,integer),seed_content_item(text,text,jsonb,uuid) to service_role;
notify pgrst,'reload schema';

create function book_work_snapshot(p_work_id uuid,p_cursor uuid default null,p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare target uuid:=canonical_book_work(p_work_id);page jsonb;next_id uuid;statistics jsonb;
begin
  if p_limit is null or p_limit not between 1 and 50 then raise exception 'Invalid edition page' using errcode='P1004';end if;
  if target is null then return null;end if;
  select coalesce(jsonb_agg(to_jsonb(b) order by b.id),'[]'::jsonb) into page from(
    select * from books where work_id=target and canonical_edition_id is null and (p_cursor is null or id>p_cursor) order by id limit p_limit+1
  ) b;
  if jsonb_array_length(page)>p_limit then page:=page-(p_limit);next_id:=(page->(p_limit-1)->>'id')::uuid;end if;
  select jsonb_build_object('ratings_count',count(*),'average_rating',round(avg(r.rating),2),'readers_count',(
    select count(distinct sb.user_id) from shelf_books sb join books b on b.id=sb.book_id where b.work_id=target
  )) into statistics from reviews r join books b on b.id=r.book_id where b.work_id=target and r.moderation_status='published' and not r.is_hidden;
  return jsonb_build_object('work',(select to_jsonb(w)||jsonb_build_object('open_library_id',coalesce(w.open_library_id,(select open_library_id from book_work_identifiers where work_id=target order by open_library_id limit 1))) from book_works w where id=target),'editions',page,'nextCursor',next_id,'statistics',statistics);
end $$;
revoke all on function book_work_snapshot(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function book_work_snapshot(uuid,uuid,integer) to service_role;
grant usage,select on sequence book_catalog_audit_id_seq to service_role;
notify pgrst,'reload schema';

create or replace function books_search_vector_update() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  new.search_vector:=to_tsvector('simple',coalesce(new.title,'')||' '||coalesce(new.author_name,'')||' '||coalesce(new.isbn_13,'')||' '||coalesce(new.isbn_10,''));return new;
end $$;
update books set search_vector=to_tsvector('simple',coalesce(title,'')||' '||coalesce(author_name,'')||' '||coalesce(isbn_13,'')||' '||coalesce(isbn_10,''));
revoke all on function books_search_vector_update() from public,anon,authenticated;
notify pgrst,'reload schema';

create table reading_work_completions(
  user_id uuid not null references users(id) on delete cascade,
  work_id uuid not null references book_works(id),
  book_id uuid references books(id) on delete set null,
  source text not null check(source in ('interactive','history')),
  completed_at timestamptz not null,
  rewarded_at timestamptz,
  primary key(user_id,work_id)
);
insert into reading_work_completions(user_id,work_id,book_id,source,completed_at,rewarded_at)
  select distinct on(c.user_id,b.work_id) c.user_id,b.work_id,c.book_id,c.source,c.completed_at,(
    select min(x.created_at) from xp_ledger x join books edition on x.event_key='finish_book:'||edition.id::text where x.user_id=c.user_id and x.reason='finish_book' and edition.work_id=b.work_id
  ) from reading_completions c join books b on b.id=c.book_id order by c.user_id,b.work_id,c.completed_at,(c.source='history') desc,c.book_id;
create function retain_reading_work_completion()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  insert into reading_work_completions(user_id,work_id,book_id,source,completed_at)
    select new.user_id,canonical_book_work(work_id),new.book_id,new.source,new.completed_at from books where id=new.book_id on conflict do nothing;
  return new;
end $$;
create trigger retain_reading_work_completion after insert on reading_completions for each row execute function retain_reading_work_completion();
alter table reading_work_completions enable row level security;
revoke all on reading_work_completions from public,anon,authenticated;
grant select on reading_work_completions to service_role;

alter function claim_reading_reward(uuid,text,uuid) rename to claim_reading_reward_063;
revoke all on function claim_reading_reward_063(uuid,text,uuid) from public,anon,authenticated,service_role;
create function claim_reading_reward(p_user_id uuid,p_action text,p_book_id uuid default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare target uuid;proof reading_work_completions;profile users;reward jsonb;previous_reward timestamptz;
begin
  if p_action<>'finish_book' then return claim_reading_reward_063(p_user_id,p_action,p_book_id);end if;
  perform set_config('lock_timeout','5s',true);
  perform pg_advisory_xact_lock_shared(hashtextextended('catalog:identities',0));
  select * into profile from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  select canonical_book_work(work_id) into target from books where id=p_book_id;
  select * into proof from reading_work_completions where user_id=p_user_id and canonical_book_work(work_id)=target order by completed_at,(source='history') desc,work_id limit 1;
  if proof.user_id is null or proof.source='history' or exists(select 1 from reading_work_completions where user_id=p_user_id and canonical_book_work(work_id)=target and rewarded_at is not null) then return jsonb_build_object('xp',profile.xp,'awarded',0);end if;
  select min(x.created_at) into previous_reward from xp_ledger x join books b on x.event_key='finish_book:'||b.id::text where x.user_id=p_user_id and x.reason='finish_book' and canonical_book_work(b.work_id)=target;
  if previous_reward is not null then
    update reading_work_completions set rewarded_at=previous_reward where user_id=p_user_id and work_id=proof.work_id;
    return jsonb_build_object('xp',profile.xp,'awarded',0);
  end if;
  reward:=claim_reading_reward_063(p_user_id,p_action,p_book_id);
  if (reward->>'awarded')::integer>0 then update reading_work_completions set rewarded_at=now() where user_id=p_user_id and work_id=proof.work_id;end if;
  return reward;
end $$;
create or replace function count_verified_books(p_user_id uuid)
returns integer language sql stable security definer set search_path=public,pg_temp as $$
  select count(distinct canonical_book_work(b.work_id))::integer from shelf_books sb join shelves s on s.id=sb.shelf_id join books b on b.id=sb.book_id
  where s.user_id=p_user_id and sb.user_id=p_user_id and s.default_type='have_read' and sb.finished_at is not null;
$$;
create or replace function reading_goal_snapshot(p_user_id uuid,p_year integer)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  with goal as(select * from reading_goals where user_id=p_user_id and year=p_year),completed as(
    select count(distinct canonical_book_work(b.work_id))::integer as count from shelf_books sb join shelves s on s.id=sb.shelf_id join books b on b.id=sb.book_id
    where s.user_id=p_user_id and sb.user_id=p_user_id and s.default_type='have_read' and sb.finished_at>=make_date(p_year,1,1) and sb.finished_at<make_date(p_year+1,1,1)
  ) select jsonb_build_object('goal',(select to_jsonb(goal) from goal),'progress',jsonb_build_object('books_read',completed.count,'year',p_year,'percentage',(select least(100,round(completed.count*100.0/target_books)) from goal))) from completed;
$$;
update users set books_read_count=count_verified_books(id);
revoke all on function retain_reading_work_completion(),claim_reading_reward(uuid,text,uuid) from public,anon,authenticated;
grant execute on function claim_reading_reward(uuid,text,uuid) to service_role;
notify pgrst,'reload schema';

create or replace function reading_challenge_progress(p_user_id uuid,p_challenge_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare target challenges; participant challenge_participants; books_finished integer; pages_read bigint;
begin
  select * into target from challenges where id=p_challenge_id;
  if not found then raise exception 'Challenge not found' using errcode='P1005'; end if;
  select * into participant from challenge_participants where challenge_id=target.id and user_id=p_user_id;
  if not found then return jsonb_build_object('joined',false,'progress',null); end if;
  select count(*)::integer,coalesce(sum(pages),0) into books_finished,pages_read from(
    select canonical_book_work(b.work_id) as work_id,max(coalesce(b.page_count,sb.progress_pages,0)) as pages from shelf_books sb join shelves s on s.id=sb.shelf_id join books b on b.id=sb.book_id
    where sb.user_id=p_user_id and s.user_id=p_user_id and s.default_type='have_read'
      and sb.finished_at>=greatest(coalesce(target.start_date,'-infinity'::timestamptz),participant.joined_at)::date
      and sb.finished_at<=least(coalesce(target.end_date,now()),now())::date group by canonical_book_work(b.work_id)
  ) finished;
  return jsonb_build_object('joined',true,'joinedAt',participant.joined_at,'progress',jsonb_build_object('booksFinished',books_finished,'pagesRead',pages_read,'goalBooks',target.goal_books,'goalPages',target.goal_pages,
    'booksPercent',case when target.goal_books>0 then least(100,round(books_finished*100.0/target.goal_books)) end,
    'pagesPercent',case when target.goal_pages>0 then least(100,round(pages_read*100.0/target.goal_pages)) end));
end $$;

create function count_reading_works(p_user_id uuid,p_genres text[] default null,p_since timestamptz default null,p_finished boolean default true)
returns integer language sql stable security definer set search_path=public,pg_temp as $$
  select count(distinct canonical_book_work(b.work_id))::integer from shelf_books sb join shelves s on s.id=sb.shelf_id join books b on b.id=sb.book_id
    where sb.user_id=p_user_id and s.user_id=p_user_id and (not p_finished or s.default_type='have_read' and sb.finished_at is not null)
    and (p_since is null or sb.finished_at>=p_since::date)
    and (p_genres is null or exists(select 1 from unnest(b.genres) tag cross join unnest(p_genres) wanted where lower(tag) like '%'||lower(wanted)||'%'));
$$;
revoke all on function count_reading_works(uuid,text[],timestamptz,boolean) from public,anon,authenticated;
grant execute on function count_reading_works(uuid,text[],timestamptz,boolean) to service_role;
notify pgrst,'reload schema';

create function book_edition_family(p_book_id uuid)
returns uuid[] language sql stable security definer set search_path=public,pg_temp as $$
  with target as(select coalesce(canonical_edition_id,id) as id from books where id=p_book_id)
  select coalesce(array_agg(b.id order by b.id),'{}'::uuid[]) from books b,target where b.id=target.id or b.canonical_edition_id=target.id;
$$;
create function catalog_book_snapshot(p_book_id uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  with target as(select coalesce(canonical_edition_id,id) as id from books where id=p_book_id),family as(select unnest(book_edition_family(p_book_id)) as id)
  select to_jsonb(b)||jsonb_build_object(
    'currently_reading_count',(select count(distinct sb.user_id) from shelf_books sb join shelves s on s.id=sb.shelf_id where sb.book_id in(select id from family) and s.default_type='currently_reading'),
    'want_to_read_count',(select count(distinct sb.user_id) from shelf_books sb join shelves s on s.id=sb.shelf_id where sb.book_id in(select id from family) and s.default_type='want_to_read'),
    'have_read_count',(select count(distinct sb.user_id) from shelf_books sb join shelves s on s.id=sb.shelf_id where sb.book_id in(select id from family) and s.default_type='have_read')
  ) from books b,target where b.id=target.id;
$$;
alter function set_shelf_membership(uuid,uuid,uuid,boolean) rename to set_shelf_membership_063;
revoke all on function set_shelf_membership_063(uuid,uuid,uuid,boolean) from public,anon,authenticated,service_role;
create function set_shelf_membership(p_user_id uuid,p_shelf_id uuid,p_book_id uuid,p_add boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare canonical_id uuid;existing_id uuid;family uuid[];result jsonb;
begin
  perform set_config('lock_timeout','5s',true);
  perform pg_advisory_xact_lock_shared(hashtextextended('catalog:identities',0));
  perform 1 from users where id=p_user_id and not is_banned and deleted_at is null for update;if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  select coalesce(canonical_edition_id,id) into canonical_id from books where id=p_book_id;
  if canonical_id is null then raise exception 'Book not found' using errcode='P1005';end if;
  family:=book_edition_family(canonical_id);perform 1 from books where id=any(family) order by id for update;
  if p_add then
    select book_id into existing_id from shelf_books where user_id=p_user_id and shelf_id=p_shelf_id and book_id=any(family) order by (book_id=canonical_id) desc,added_at,id limit 1;
    return set_shelf_membership_063(p_user_id,p_shelf_id,coalesce(existing_id,canonical_id),p_add);
  end if;
  for existing_id in select book_id from shelf_books where user_id=p_user_id and shelf_id=p_shelf_id and book_id=any(family) order by book_id loop
    result:=set_shelf_membership_063(p_user_id,p_shelf_id,existing_id,p_add);
  end loop;
  return coalesce(result,set_shelf_membership_063(p_user_id,p_shelf_id,canonical_id,p_add));
end $$;
revoke all on function book_edition_family(uuid),catalog_book_snapshot(uuid),set_shelf_membership(uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function book_edition_family(uuid),catalog_book_snapshot(uuid),set_shelf_membership(uuid,uuid,uuid,boolean) to service_role;
notify pgrst,'reload schema';

alter function award_xp_once(uuid,integer,text,text) rename to award_xp_once_024;
revoke all on function award_xp_once_024(uuid,integer,text,text) from public,anon,authenticated,service_role;
create function award_xp_once(p_user_id uuid,p_amount integer,p_reason text,p_event_key text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare target uuid;total integer;
begin
  if p_reason='write_review' and p_amount between 0 and 5000 and p_event_key ~ '^review:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    select xp into total from users where id=p_user_id for update;
    select coalesce(canonical_edition_id,id) into target from books where id=substr(p_event_key,8)::uuid;
    if target is not null then
      if exists(select 1 from xp_ledger where user_id=p_user_id and reason='write_review' and event_key in(select 'review:'||id::text from books where id=target or canonical_edition_id=target)) then return jsonb_build_object('xp',total,'awarded',0);end if;
      p_event_key:='review:'||target;
    end if;
  end if;
  return award_xp_once_024(p_user_id,p_amount,p_reason,p_event_key);
end $$;
revoke all on function award_xp_once(uuid,integer,text,text) from public,anon,authenticated;
grant execute on function award_xp_once(uuid,integer,text,text) to service_role;
notify pgrst,'reload schema';

create or replace function update_shelf_progress(p_user_id uuid,p_entry_id uuid,p_pages integer,p_percent numeric)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare entry shelf_books; pages integer; changed boolean;
begin
  perform set_config('lock_timeout','5s',true);
  perform pg_advisory_xact_lock_shared(hashtextextended('catalog:identities',0));
  if (p_pages is null and p_percent is null) or p_pages<0 or p_pages>100000 or p_percent<0 or p_percent>100 then raise exception 'Invalid progress' using errcode='P1004'; end if;
  perform 1 from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003'; end if;
  select sb.* into entry from shelf_books sb join shelves s on s.id=sb.shelf_id where sb.id=p_entry_id and sb.user_id=p_user_id and s.user_id=p_user_id for update of sb;
  if not found then raise exception 'Shelf entry not found' using errcode='P1005'; end if;
  select page_count into pages from books where id=(select coalesce(canonical_edition_id,id) from books where id=entry.book_id);
  if p_pages is not null and pages>0 and p_pages>pages then raise exception 'Progress exceeds page count' using errcode='P1004'; end if;
  if p_pages is not null and pages>0 then p_percent:=round(p_pages*100.0/pages,2); end if;
  changed:=(p_pages is not null and p_pages is distinct from entry.progress_pages) or (p_percent is not null and p_percent is distinct from entry.progress_percent);
  if changed then
    update shelf_books set progress_pages=coalesce(p_pages,progress_pages),progress_percent=coalesce(p_percent,progress_percent),updated_at=now() where id=entry.id returning * into entry;
    perform award_xp_once(p_user_id,5,'progress_update','progress:'||entry.id||':'||(now() at time zone 'UTC')::date);
  end if;
  return to_jsonb(entry);
end $$;

notify pgrst,'reload schema';

with corrections as(
  select sb.id,sb.book_id,sb.user_id,sb.progress_pages,sb.progress_percent,least(100,round(sb.progress_pages*100.0/canonical.page_count,2)) as percent
  from shelf_books sb join books edition on edition.id=sb.book_id join books canonical on canonical.id=edition.canonical_edition_id
  where sb.progress_pages is not null and canonical.page_count>0
),recorded as(
  insert into book_catalog_audit(book_id,reason,previous_data,resolution)
    select book_id,'legacy_progress_recalculated',jsonb_build_object('entry_id',id,'user_id',user_id,'pages',progress_pages,'percent',progress_percent),jsonb_build_object('percent',percent)
    from corrections where progress_percent is distinct from percent returning book_id
)
update shelf_books sb set progress_percent=corrections.percent from corrections where sb.id=corrections.id and sb.progress_percent is distinct from corrections.percent;
notify pgrst,'reload schema';

alter function apply_shelf_membership_intent(uuid,uuid,uuid,boolean,text) rename to apply_shelf_membership_intent_063;
revoke all on function apply_shelf_membership_intent_063(uuid,uuid,uuid,boolean,text) from public,anon,authenticated,service_role;
create function apply_shelf_membership_intent(p_user_id uuid,p_shelf_id uuid,p_book_id uuid,p_add boolean,p_key text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform set_config('lock_timeout','5s',true);
  perform pg_advisory_xact_lock_shared(hashtextextended('catalog:identities',0));
  return apply_shelf_membership_intent_063(p_user_id,p_shelf_id,p_book_id,p_add,p_key);
end $$;
revoke all on function apply_shelf_membership_intent(uuid,uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function apply_shelf_membership_intent(uuid,uuid,uuid,boolean,text) to service_role;
notify pgrst,'reload schema';
