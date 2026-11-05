create index shelf_books_feed on shelf_books(user_id,added_at desc,id desc);
create index reviews_feed on reviews(user_id,created_at desc,id desc) where moderation_status='published' and not is_hidden;
create function read_social_feed(p_user_id uuid,p_at timestamptz default null,p_id uuid default null,p_kind text default null,p_limit integer default 20)
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
    from followed u join shelf_books sb on sb.user_id=u.id join shelves s on s.id=sb.shelf_id and s.user_id=u.id join books b on b.id=sb.book_id
    where s.is_public and u.shelf_visibility in ('public','followers_only')
    union all
    select 'rv',r.id,r.created_at,b.id,jsonb_build_object('type','review','id','rv-'||r.id,'reviewId',r.id,'timestamp',r.created_at,'userId',u.id,
      'user',jsonb_build_object('id',u.id,'display_name',u.display_name,'username',u.username,'avatar_url',u.avatar_url),
      'book',jsonb_build_object('id',b.id,'title',b.title,'author_name',b.author_name,'cover_url',b.cover_url),
      'rating',r.rating,'reviewType',r.review_type,'excerpt',left(r.content,200),'hasSpoilers',r.has_spoilers)
    from followed u join reviews r on r.user_id=u.id join books b on b.id=r.book_id where r.moderation_status='published' and not r.is_hidden
  ), page as (
    select * from candidates where p_at is null or (at,kind,id)<(p_at,p_kind,p_id) order by at desc,kind desc,id desc limit p_limit+1
  ) select coalesce(jsonb_agg(item||jsonb_build_object('wantToRead',exists(select 1 from shelf_books mine join shelves own on own.id=mine.shelf_id where mine.user_id=p_user_id and own.user_id=p_user_id and own.default_type='want_to_read' and mine.book_id=page.book_id)) order by at desc,kind desc,id desc),'[]'::jsonb) into result from page;
  return result;
end $$;
revoke all on function read_social_feed(uuid,timestamptz,uuid,text,integer) from public,anon,authenticated;
grant execute on function read_social_feed(uuid,timestamptz,uuid,text,integer) to service_role;
notify pgrst,'reload schema';
