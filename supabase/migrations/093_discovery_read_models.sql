create index discovery_recent_shelves on shelf_books(added_at desc,user_id,book_id);
create function discovery_shelf_rows(p_viewer uuid default null)
returns table(reader_id uuid,shelf_id uuid,default_type text,edition_id uuid,work_id uuid,added_at timestamptz,finished_at date,country text)
language sql stable as $$
 select u.id,s.id,s.default_type,b.id,b.work_id,sb.added_at,sb.finished_at,u.country
 from public.shelf_books sb join public.shelves s on s.id=sb.shelf_id and s.user_id=sb.user_id join public.users u on u.id=sb.user_id join public.books source on source.id=sb.book_id join public.books b on b.id=coalesce(source.canonical_edition_id,source.id)
 where not u.is_banned and u.deleted_at is null and(u.id=p_viewer or(s.is_public and u.shelf_visibility<>'private'
  and(u.profile_visibility='public'or exists(select 1 from public.follows where follower_id=p_viewer and following_id=u.id))
  and(u.shelf_visibility='public'or exists(select 1 from public.follows where follower_id=p_viewer and following_id=u.id))));
$$;
create function discovery_trending_snapshot(p_country text default null,p_limit integer default 10)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if p_limit is null or p_limit not between 1 and 10 or(p_country is not null and p_country!~'^[A-Z]{2}$')then raise exception 'Invalid discovery query' using errcode='P1004';end if;
 with activity as materialized(select * from discovery_shelf_rows()where added_at>=now()-interval '7 days'and added_at<=now()and(p_country is null or country=p_country)),ranked as(
  select work_id,count(distinct reader_id)readers,max(added_at)latest from activity group by work_id order by readers desc,latest desc,work_id limit p_limit
 )select coalesce(jsonb_agg(jsonb_build_object('book_id',b.id,'work_id',r.work_id,'count',r.readers,'book',jsonb_build_object('id',b.id,'title',b.title,'author_name',b.author_name,'cover_url',b.cover_url,'language',b.language,'format',b.format))order by r.readers desc,r.latest desc,r.work_id),'[]'::jsonb)into result
 from ranked r join lateral(select edition_id from activity where work_id=r.work_id group by edition_id order by count(distinct reader_id)desc,max(added_at)desc,edition_id limit 1)chosen on true join books b on b.id=chosen.edition_id;
 return result;
end $$;
create function discovery_gems_snapshot(p_limit integer default 10)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if p_limit is null or p_limit not between 1 and 10 then raise exception 'Invalid discovery query' using errcode='P1004';end if;
 with reviews as materialized(
  select canonical_book_work(b.work_id)work_id,avg(r.rating)rating,count(*)ratings from reviews r join books b on b.id=r.book_id join users u on u.id=r.user_id where r.moderation_status='published'and not r.is_hidden and not u.is_banned and u.deleted_at is null group by canonical_book_work(b.work_id)
 ),readers as(select work_id,count(distinct reader_id)readers from discovery_shelf_rows()where default_type='have_read'group by work_id),editions as(
  select b.*,canonical_book_work(b.work_id)root_work,coalesce(r.rating,case when b.ratings_count>0 and b.average_rating between 1 and 5 then b.average_rating end)score,coalesce(r.ratings,0)community_ratings,coalesce(readers.readers,0)public_readers
  from books b left join reviews r on r.work_id=canonical_book_work(b.work_id)left join readers on readers.work_id=canonical_book_work(b.work_id)where b.canonical_edition_id is null
 ),works as(select distinct on(root_work)* from editions where score>=4 and public_readers<50 order by root_work,score desc,community_ratings desc,ratings_count desc,id),page as(select * from works order by score desc,community_ratings desc,root_work limit p_limit)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'work_id',root_work,'title',title,'author_name',author_name,'cover_url',cover_url,'average_rating',round(score,2),'have_read_count',public_readers,'rating_source',case when community_ratings>0 then 'community'else 'catalog'end)order by score desc,community_ratings desc,root_work),'[]'::jsonb)into result from page;
 return result;
end $$;
create function discovery_friends_snapshot(p_user uuid,p_limit integer default 10)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null)then raise exception 'Account unavailable' using errcode='P1003';end if;
 if p_limit is null or p_limit not between 1 and 10 then raise exception 'Invalid discovery query' using errcode='P1004';end if;
 with visible as not materialized(select * from discovery_shelf_rows(p_user)),candidates as materialized(
  select v.* from visible v join follows f on f.following_id=v.reader_id and f.follower_id=p_user where not exists(select 1 from visible mine where mine.reader_id=p_user and mine.work_id=v.work_id)
 ),ranked as(select work_id,count(distinct reader_id)readers,max(added_at)latest from candidates group by work_id order by readers desc,latest desc,work_id limit p_limit)
 select coalesce(jsonb_agg(jsonb_build_object('book_id',b.id,'work_id',r.work_id,'count',r.readers,'book',jsonb_build_object('id',b.id,'title',b.title,'author_name',b.author_name,'cover_url',b.cover_url,'language',b.language,'format',b.format))order by r.readers desc,r.latest desc,r.work_id),'[]'::jsonb)into result
 from ranked r join lateral(select edition_id from candidates where work_id=r.work_id group by edition_id order by count(distinct reader_id)desc,max(added_at)desc,edition_id limit 1)chosen on true join books b on b.id=chosen.edition_id;
 return result;
end $$;
create function shelf_overlap_snapshot(p_user uuid,p_cohort uuid[]default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null)then raise exception 'Account unavailable' using errcode='P1003';end if;
 if p_cohort is not null and(cardinality(p_cohort)>20 or array_position(p_cohort,null)is not null)then raise exception 'Invalid reader cohort' using errcode='P1004';end if;
 with visible as not materialized(select * from discovery_shelf_rows(p_user)),mine as materialized(select distinct work_id from visible where reader_id=p_user and default_type='have_read'),matched as materialized(
  select v.reader_id,count(distinct v.work_id)overlap from visible v join mine on mine.work_id=v.work_id where v.reader_id<>p_user and v.default_type='have_read'and(select count(*)from mine)>=3 and(p_cohort is null or v.reader_id=any(p_cohort))group by v.reader_id having count(distinct v.work_id)>=3 order by overlap desc,v.reader_id limit 20
 ),candidates as materialized(
  select v.* from visible v join matched on matched.reader_id=v.reader_id where v.default_type='have_read'and not exists(select 1 from visible own where own.reader_id=p_user and own.work_id=v.work_id)
 ),ranked as(select work_id,count(distinct reader_id)readers,max(added_at)latest from candidates group by work_id order by readers desc,latest desc,work_id limit 10)
 select jsonb_build_object('signature',(select md5(coalesce(string_agg(work_id::text,','order by work_id),''))from mine),'cohort',coalesce((select jsonb_agg(reader_id order by overlap desc,reader_id)from matched),'[]'::jsonb),'books',coalesce((
  select jsonb_agg(jsonb_build_object('id',b.id,'work_id',r.work_id,'title',b.title,'author_name',b.author_name,'cover_url',b.cover_url)order by r.readers desc,r.latest desc,r.work_id)
  from ranked r join lateral(select edition_id from candidates where work_id=r.work_id group by edition_id order by count(distinct reader_id)desc,max(added_at)desc,edition_id limit 1)chosen on true join books b on b.id=chosen.edition_id
 ),'[]'::jsonb))into result;
 return result;
end $$;
create function recommendation_reader_page(p_at timestamptz default null,p_id uuid default null,p_limit integer default 40)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if p_limit is null or p_limit not between 1 and 100 or(p_at is null)<>(p_id is null)then raise exception 'Invalid reader page' using errcode='P1004';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'created_at',created_at)order by created_at,id),'[]'::jsonb)into result from(
  select u.id,u.created_at from users u where not u.is_banned and u.deleted_at is null and(p_at is null or(u.created_at,u.id)>(p_at,p_id))and(
   select count(distinct canonical_book_work(b.work_id))from shelves s join shelf_books sb on sb.shelf_id=s.id and sb.user_id=u.id join books b on b.id=sb.book_id where s.user_id=u.id and s.default_type='have_read'
  )>=3 order by u.created_at,u.id limit p_limit+1
 )page;
 return result;
end $$;
create or replace function followed_author_books(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null)then raise exception 'Account unavailable' using errcode='P1003';end if;
 return(select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'author_name',author_name,'cover_url',cover_url)order by created_at desc,id desc),'[]'::jsonb)from(
  select b.* from books b where b.canonical_edition_id is null and b.work_id in(select canonical_book_work(c.work_id)from follows f join author_work_claims c on c.author_id=f.following_id join users u on u.id=c.author_id where f.follower_id=p_user and u.is_verified_author and not u.is_banned and u.deleted_at is null)order by b.created_at desc,b.id desc limit 10
 )books);
end $$;
revoke all on function discovery_shelf_rows(uuid),discovery_trending_snapshot(text,integer),discovery_gems_snapshot(integer),discovery_friends_snapshot(uuid,integer),shelf_overlap_snapshot(uuid,uuid[]),recommendation_reader_page(timestamptz,uuid,integer)from public,anon,authenticated;
grant execute on function discovery_trending_snapshot(text,integer),discovery_gems_snapshot(integer),discovery_friends_snapshot(uuid,integer),shelf_overlap_snapshot(uuid,uuid[]),recommendation_reader_page(timestamptz,uuid,integer)to service_role;

create or replace function read_social_feed(p_user_id uuid,p_at timestamptz default null,p_id uuid default null,p_kind text default null,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  if p_limit is null or p_limit not between 1 and 50 or not((p_at is null and p_id is null and p_kind is null) or (p_at is not null and p_id is not null and p_kind is not null and p_kind in ('sb','rv'))) then raise exception 'Invalid feed cursor' using errcode='P1004';end if;
  if not exists(select 1 from users where id=p_user_id and not is_banned and deleted_at is null) then raise exception 'Account unavailable' using errcode='P1003';end if;
  with followed as (
    select u.id,u.display_name,u.username,u.avatar_url,u.shelf_visibility from follows f join users u on u.id=f.following_id
    where f.follower_id=p_user_id and not u.is_banned and u.deleted_at is null and u.profile_visibility in ('public','followers_only')
  ), candidates as (
    select 'sb'::text as kind,sb.id,sb.added_at as at,b.id as book_id,jsonb_build_object('type','shelf_book','id','sb-'||sb.id,'timestamp',sb.added_at,'userId',u.id,
      'user',jsonb_build_object('id',u.id,'display_name',u.display_name,'username',u.username,'avatar_url',u.avatar_url),
      'book',jsonb_build_object('id',b.id,'title',b.title,'author_name',b.author_name,'cover_url',b.cover_url),
      'shelf',jsonb_build_object('name',s.name,'default_type',s.default_type),'finishedAt',sb.finished_at) as item
    from followed u join shelf_books sb on sb.user_id=u.id join shelves s on s.id=sb.shelf_id and s.user_id=u.id join books source on source.id=sb.book_id join books b on b.id=coalesce(source.canonical_edition_id,source.id)
    where s.is_public and u.shelf_visibility in ('public','followers_only')
    union all
    select 'rv',r.id,r.created_at,b.id,jsonb_build_object('type','review','id','rv-'||r.id,'reviewId',r.id,'timestamp',r.created_at,'userId',u.id,
      'user',jsonb_build_object('id',u.id,'display_name',u.display_name,'username',u.username,'avatar_url',u.avatar_url),
      'book',jsonb_build_object('id',b.id,'title',b.title,'author_name',b.author_name,'cover_url',b.cover_url),
      'rating',r.rating,'reviewType',r.review_type,'excerpt',left(r.content,200),'hasSpoilers',r.has_spoilers)
    from followed u join reviews r on r.user_id=u.id join books source on source.id=r.book_id join books b on b.id=coalesce(source.canonical_edition_id,source.id) where r.moderation_status='published' and not r.is_hidden
  ), page as (
    select * from candidates where p_at is null or (at,kind,id)<(p_at,p_kind,p_id) order by at desc,kind desc,id desc limit p_limit+1
  ) select coalesce(jsonb_agg(item||jsonb_build_object('wantToRead',exists(select 1 from shelf_books mine join shelves own on own.id=mine.shelf_id where mine.user_id=p_user_id and own.user_id=p_user_id and own.default_type='want_to_read' and mine.book_id=any(book_edition_family(page.book_id)))) order by at desc,kind desc,id desc),'[]'::jsonb) into result from page;
  return result;
end $$;
notify pgrst,'reload schema';
