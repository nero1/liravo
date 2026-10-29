create table author_work_claims(
  author_id uuid not null references users(id) on delete cascade,
  work_id uuid not null references book_works(id),
  verified_by uuid references users(id) on delete set null,
  verified_at timestamptz not null default now(),
  primary key(author_id,work_id)
);
create index author_work_claims_work on author_work_claims(work_id,author_id);
alter table author_work_claims enable row level security;
revoke all on author_work_claims,author_books from public,anon,authenticated;
grant select,insert,update,delete on author_work_claims,author_books to service_role;

create table author_catalog_intents(
  actor_id uuid not null references users(id),
  intent_key text not null,
  request_hash text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key(actor_id,intent_key)
);
alter table author_catalog_intents enable row level security;
revoke all on author_catalog_intents from public,anon,authenticated;
grant select,insert on author_catalog_intents to service_role;

create function author_owns_book(p_author uuid,p_book uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from author_work_claims c join users u on u.id=c.author_id join books b on b.id=p_book
    where c.author_id=p_author and u.is_verified_author and not u.is_banned and u.deleted_at is null
      and canonical_book_work(c.work_id)=canonical_book_work(b.work_id));
$$;

create function set_author_work_claim(p_actor uuid,p_author uuid,p_book uuid,p_granted boolean,p_key text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare request_digest text;receipt author_catalog_intents;target_work uuid;result jsonb;previous jsonb;
begin
  if p_actor is null or p_author is null or p_book is null or p_granted is null or length(p_key) not between 8 and 200 or p_key is null then raise exception 'Invalid author catalog intent' using errcode='P1004';end if;
  perform set_config('lock_timeout','5s',true);
  perform pg_advisory_xact_lock(hashtextextended('catalog:identities',0));
  perform 1 from users where id in(p_actor,p_author) order by id for update;
  if not exists(select 1 from users where id=p_actor and is_admin and not is_banned and deleted_at is null) then raise exception 'Admin access required' using errcode='P1003';end if;
  request_digest:=encode(sha256(convert_to(jsonb_build_object('author',p_author,'book',p_book,'granted',p_granted)::text,'UTF8')),'hex');
  select * into receipt from author_catalog_intents where actor_id=p_actor and intent_key=p_key;
  if found then
    if receipt.request_hash<>request_digest then raise exception 'Intent already used' using errcode='P1001';end if;
    return receipt.response;
  end if;
  if not exists(select 1 from users where id=p_author) then raise exception 'Author unavailable' using errcode='P1005';end if;
  if p_granted and not exists(select 1 from users where id=p_author and is_verified_author and not is_banned and deleted_at is null) then raise exception 'Verify the author before linking works' using errcode='P1003';end if;
  select canonical_book_work(work_id) into target_work from books where id=p_book for share;
  if not found or target_work is null then raise exception 'Book unavailable' using errcode='P1005';end if;
  select coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) into previous from author_work_claims c where author_id=p_author and canonical_book_work(work_id)=target_work;
  if p_granted then
    insert into author_work_claims(author_id,work_id,verified_by) values(p_author,target_work,p_actor) on conflict do nothing;
  else
    delete from author_work_claims where author_id=p_author and canonical_book_work(work_id)=target_work;
    insert into book_catalog_audit(book_id,reason,previous_data,resolution)
      select book_id,'author_work_revoked',to_jsonb(a),jsonb_build_object('author_id',p_author,'work_id',target_work) from arcs a where author_id=p_author and is_active and canonical_book_work((select work_id from books where id=a.book_id))=target_work;
    update arcs a set is_active=false where author_id=p_author and is_active and canonical_book_work((select work_id from books where id=a.book_id))=target_work;
    insert into book_catalog_audit(book_id,reason,previous_data,resolution)
      select book_id,'author_post_work_revoked',to_jsonb(p),jsonb_build_object('book_id',null) from author_posts p where author_id=p_author and canonical_book_work((select work_id from books where id=p.book_id))=target_work;
    update author_posts p set book_id=null where author_id=p_author and canonical_book_work((select work_id from books where id=p.book_id))=target_work;
  end if;
  result:=jsonb_build_object('authorId',p_author,'bookId',p_book,'workId',target_work,'granted',p_granted);
  insert into moderation_log(moderator_id,target_user_id,action,entity_type,entity_id,notes)
    values(p_actor,p_author,case when p_granted then 'author_work_granted' else 'author_work_revoked' end,'book_work',target_work,jsonb_build_object('previous',previous,'result',result)::text);
  insert into author_catalog_intents(actor_id,intent_key,request_hash,response) values(p_actor,p_key,request_digest,result);
  return result;
end $$;

create function guard_author_book_link()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_table_name='arcs' then if not new.is_active then return new;end if;end if;
  if new.book_id is not null and not author_owns_book(new.author_id,new.book_id) then raise exception 'Verified work ownership required' using errcode='P1003';end if;
  return new;
end $$;
create trigger author_arc_work_guard before insert or update of book_id,author_id,is_active on arcs for each row execute function guard_author_book_link();
create trigger author_post_work_guard before insert or update of book_id,author_id on author_posts for each row execute function guard_author_book_link();

insert into book_catalog_audit(book_id,reason,previous_data,resolution)
  select book_id,'unverified_author_arc',to_jsonb(a),jsonb_build_object('is_active',false) from arcs a where is_active;
update arcs set is_active=false where is_active;
insert into book_catalog_audit(book_id,reason,previous_data,resolution)
  select book_id,'unverified_author_post',to_jsonb(p),jsonb_build_object('book_id',null) from author_posts p where book_id is not null;
update author_posts set book_id=null where book_id is not null;

create function guard_arc_work_application()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from arcs a where a.id=new.arc_id and a.is_active and (a.close_date is null or a.close_date>now()) and author_owns_book(a.author_id,a.book_id)) then raise exception 'Verified ARC ownership required' using errcode='P1003';end if;
  return new;
end $$;
create trigger arc_application_work_guard before insert on arc_applications for each row execute function guard_arc_work_application();
revoke all on function guard_arc_work_application() from public,anon,authenticated;

create function author_catalog_snapshot(p_author uuid,p_before timestamptz default null,p_id uuid default null,p_limit integer default 30)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  with owned as materialized(
    select b.* from books b where b.canonical_edition_id is null and b.work_id in(select canonical_book_work(c.work_id) from author_work_claims c join users u on u.id=c.author_id where c.author_id=p_author and u.is_verified_author and not u.is_banned and u.deleted_at is null)
  ), page as(
    select * from owned where p_before is null or(created_at,id)<(p_before,p_id) order by created_at desc,id desc limit greatest(1,least(coalesce(p_limit,30),50))+1
  )
  select jsonb_build_object('total',(select count(*) from owned),'books',coalesce((select jsonb_agg(jsonb_build_object('id',id,'work_id',canonical_book_work(work_id),'title',title,'author_name',author_name,'cover_url',cover_url,'isbn_13',isbn_13,'isbn_10',isbn_10,'language',language,'format',format,'published_year',published_year,'average_rating',average_rating,'ratings_count',ratings_count,'currently_reading_count',currently_reading_count,'want_to_read_count',want_to_read_count,'have_read_count',have_read_count,'created_at',created_at) order by created_at desc,id desc) from page),'[]'::jsonb));
$$;

revoke all on function author_owns_book(uuid,uuid),set_author_work_claim(uuid,uuid,uuid,boolean,text),guard_author_book_link(),author_catalog_snapshot(uuid,timestamptz,uuid,integer) from public,anon,authenticated;
grant execute on function author_owns_book(uuid,uuid),set_author_work_claim(uuid,uuid,uuid,boolean,text),author_catalog_snapshot(uuid,timestamptz,uuid,integer) to service_role;
notify pgrst,'reload schema';

create function book_authors_snapshot(p_book uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'username',username,'display_name',display_name,'avatar_url',avatar_url,'is_verified_author',is_verified_author) order by username),'[]'::jsonb)
  from users u where is_verified_author and not is_banned and deleted_at is null and u.id in(select c.author_id from author_work_claims c join books b on b.id=p_book where canonical_book_work(c.work_id)=canonical_book_work(b.work_id));
$$;

create function author_analytics_snapshot(p_author uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  with owned as materialized(select b.id,b.work_id from books b where b.work_id in(select canonical_book_work(work_id) from author_work_claims where author_id=p_author)),
  reading as materialized(select distinct o.work_id,sb.user_id,s.default_type from owned o join shelf_books sb on sb.book_id=o.id join shelves s on s.id=sb.shelf_id join users u on u.id=sb.user_id where not u.is_banned and u.deleted_at is null),
  visible_reviews as not materialized(select r.* from reviews r join owned o on o.id=r.book_id join users u on u.id=r.user_id where r.moderation_status='published' and not r.is_hidden and not u.is_banned and u.deleted_at is null),
  recent as(select r.*,b.title,u.display_name,u.username from visible_reviews r join books b on b.id=r.book_id join users u on u.id=r.user_id order by r.created_at desc,r.id desc limit 5)
  select jsonb_build_object('totalWantToReads',(select count(*) from reading where default_type='want_to_read'),
    'totalCurrentlyReading',(select count(*) from reading where default_type='currently_reading'),
    'totalHaveRead',(select count(*) from reading where default_type='have_read'),
    'totalReviews',(select count(*) from visible_reviews),
    'followerCount',(select count(*) from follows f join users u on u.id=f.follower_id where f.following_id=p_author and not u.is_banned and u.deleted_at is null),
    'recentReviews',coalesce((select jsonb_agg(jsonb_build_object('id',id,'rating',rating,'content',content,'created_at',created_at,'books',jsonb_build_object('title',title),'users',jsonb_build_object('display_name',display_name,'username',username)) order by created_at desc,id desc) from recent),'[]'::jsonb))
  from users where id=p_author and is_verified_author and not is_banned and deleted_at is null;
$$;

create function followed_author_books(p_user uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'author_name',author_name,'cover_url',cover_url) order by created_at desc,id desc),'[]'::jsonb)
  from(select b.* from books b where b.canonical_edition_id is null and b.work_id in(select canonical_book_work(c.work_id) from follows f join author_work_claims c on c.author_id=f.following_id join users u on u.id=c.author_id where f.follower_id=p_user and u.is_verified_author and not u.is_banned and u.deleted_at is null) order by b.created_at desc,b.id desc limit 10) books;
$$;
revoke all on function book_authors_snapshot(uuid),author_analytics_snapshot(uuid),followed_author_books(uuid) from public,anon,authenticated;
grant execute on function book_authors_snapshot(uuid),author_analytics_snapshot(uuid),followed_author_books(uuid) to service_role;
notify pgrst,'reload schema';
