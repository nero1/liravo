create function book_review_snapshot(p_book_id uuid,p_limit integer default 50,p_after_helpful integer default null,p_after_created_at timestamptz default null,p_after_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare target uuid;result jsonb;
begin
  if p_limit is null or p_limit not between 1 and 50 or p_after_helpful<0 or num_nonnulls(p_after_helpful,p_after_created_at,p_after_id) not in (0,3) then raise exception 'Invalid review page' using errcode='P1004';end if;
  select coalesce(canonical_edition_id,id) into target from books where id=p_book_id;
  if target is null then return null;end if;
  with visible as not materialized(
    select r.id,r.book_id,r.user_id,r.rating,r.content,r.review_type,r.mood_tags,r.has_spoilers,r.likes_count,r.helpful_votes,r.unhelpful_votes,r.created_at,
      jsonb_build_object('id',u.id,'display_name',u.display_name,'avatar_url',u.avatar_url,'username',u.username) as "user"
    from reviews r join users u on u.id=r.user_id where r.book_id=any(book_edition_family(target)) and r.moderation_status='published' and not r.is_hidden and not u.is_banned and u.deleted_at is null
  ),page as(
    select * from visible where p_after_id is null or (helpful_votes,created_at,id)<(p_after_helpful,p_after_created_at,p_after_id)
      order by helpful_votes desc,created_at desc,id desc limit p_limit+1
  ),shown as(select * from page order by helpful_votes desc,created_at desc,id desc limit p_limit)
  select jsonb_build_object('bookId',target,'statistics',(
    select jsonb_build_object('ratings_count',count(*),'average_rating',round(avg(rating),2),'distribution',jsonb_build_object('1',count(*) filter(where rating=1),'2',count(*) filter(where rating=2),'3',count(*) filter(where rating=3),'4',count(*) filter(where rating=4),'5',count(*) filter(where rating=5))) from visible
  ),'reviews',(select coalesce(jsonb_agg(to_jsonb(s) order by helpful_votes desc,created_at desc,id desc),'[]'::jsonb) from shown s),'nextCursor',
    case when (select count(*) from page)>p_limit then(select jsonb_build_object('helpful',helpful_votes,'at',to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'id',id) from shown order by helpful_votes,created_at,id limit 1) end
  ) into result;
  return result;
end $$;
revoke all on function book_review_snapshot(uuid,integer,integer,timestamptz,uuid) from public,anon,authenticated;
grant execute on function book_review_snapshot(uuid,integer,integer,timestamptz,uuid) to service_role;
create index reviews_visible_helpfulness_cursor on reviews(book_id,helpful_votes desc,created_at desc,id desc) include(user_id,rating) where moderation_status='published' and not is_hidden;

insert into book_catalog_audit(book_id,reason,previous_data,resolution)
  select b.id,'legacy_review_rating_cache',jsonb_build_object('average_rating',b.average_rating,'ratings_count',b.ratings_count),jsonb_build_object('average_rating',null,'ratings_count',0)
  from books b where (b.average_rating is not null or b.ratings_count<>0) and exists(select 1 from reviews r where r.book_id=b.id);
update books b set average_rating=null,ratings_count=0 where exists(select 1 from reviews r where r.book_id=b.id);

alter function store_catalog_book(jsonb) rename to store_catalog_book_066;
revoke all on function store_catalog_book_066(jsonb) from public,anon,authenticated,service_role;
create function store_catalog_book(p_data jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  result:=store_catalog_book_066(p_data);
  if coalesce(current_setting('liravo.catalog_source',true),'')<>'goodreads' and p_data->>'google_books_id' is not null and p_data->>'average_rating' is not null and (p_data->>'ratings_count')::integer>0 then
    update books set average_rating=(p_data->>'average_rating')::numeric,ratings_count=(p_data->>'ratings_count')::integer,
      metadata_provenance=metadata_provenance||'{"average_rating":"google","ratings_count":"google"}'::jsonb where id=(result->>'id')::uuid returning to_jsonb(books.*) into result;
  end if;
  return result;
end $$;
revoke all on function store_catalog_book(jsonb) from public,anon,authenticated;
grant execute on function store_catalog_book(jsonb) to service_role;

create or replace function book_work_snapshot(p_work_id uuid,p_cursor uuid default null,p_limit integer default 50)
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
    select count(distinct sb.user_id) from shelf_books sb join books b on b.id=sb.book_id join users u on u.id=sb.user_id where b.work_id=target and not u.is_banned and u.deleted_at is null
  )) into statistics from reviews r join books b on b.id=r.book_id join users u on u.id=r.user_id where b.work_id=target and r.moderation_status='published' and not r.is_hidden and not u.is_banned and u.deleted_at is null;
  return jsonb_build_object('work',(select to_jsonb(w)||jsonb_build_object('open_library_id',coalesce(w.open_library_id,(select open_library_id from book_work_identifiers where work_id=target order by open_library_id limit 1))) from book_works w where id=target),'editions',page,'nextCursor',next_id,'statistics',statistics);
end $$;
notify pgrst,'reload schema';
