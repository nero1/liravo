create function reading_year_books(p_user uuid,p_year integer,p_public boolean default false)
returns table(work_id uuid,id uuid,title text,author_name text,page_count integer,pages integer,genres text[],finished_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
  select distinct on(canonical_book_work(b.work_id)) canonical_book_work(b.work_id),b.id,b.title,b.author_name,b.page_count,coalesce(b.page_count,greatest(0,sb.progress_pages),0),b.genres,sb.finished_at
  from shelf_books sb join shelves s on s.id=sb.shelf_id join books source on source.id=sb.book_id join books b on b.id=coalesce(source.canonical_edition_id,source.id)
  where sb.user_id=p_user and s.user_id=p_user and s.default_type='have_read' and(not p_public or s.is_public)
    and sb.finished_at>=make_timestamptz(p_year,1,1,0,0,0,'UTC') and sb.finished_at<make_timestamptz(p_year+1,1,1,0,0,0,'UTC')
  order by canonical_book_work(b.work_id),sb.finished_at desc,sb.id desc;
$$;

create function public_reading_year_snapshot(p_user uuid,p_year integer)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  with completed as materialized(select * from reading_year_books(p_user,p_year,true)),genres as(select genre,count(*) as n from completed cross join lateral unnest(genres) genre group by genre order by n desc,genre limit 3)
  select jsonb_build_object('userId',u.id,'displayName',u.display_name,'year',p_year,'booksRead',(select count(*) from completed),'pagesRead',(select coalesce(sum(pages),0) from completed),'topGenres',coalesce((select jsonb_agg(genre order by n desc,genre) from genres),'[]'::jsonb))
  from users u where u.id=p_user and not u.is_banned and u.deleted_at is null;
$$;

create function reading_year_snapshot(p_user uuid,p_year integer)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare profile users;result jsonb;start_at timestamptz:=make_timestamptz(p_year,1,1,0,0,0,'UTC');end_at timestamptz:=make_timestamptz(p_year+1,1,1,0,0,0,'UTC');
begin
  if p_year not between 1900 and 2200 then raise exception 'Invalid year' using errcode='P1004';end if;
  select * into profile from users where id=p_user and not is_banned and deleted_at is null;
  if not found then return null;end if;
  with completed as materialized(select * from reading_year_books(p_user,p_year)),
  genres as(select genre,count(*) as n from completed cross join lateral unnest(genres) genre group by genre order by n desc,genre limit 3),
  reviews_this_year as materialized(select * from reviews where user_id=p_user and moderation_status='published' and created_at>=start_at and created_at<end_at),
  metrics as(select count(*) as books,coalesce(sum(pages),0) as pages from completed),
  longest as(select title,page_count from completed where page_count>0 order by page_count desc,id limit 1),
  shortest as(select title,page_count from completed where page_count>0 order by page_count,id limit 1),
  month as(select extract(month from finished_at at time zone 'UTC')::int as n,count(*) as total from completed group by n order by total desc,n limit 1)
  select jsonb_build_object('stats',jsonb_build_object(
    'booksReadThisYear',metrics.books,'pagesReadThisYear',metrics.pages,'year',p_year,
    'averageRating',coalesce((select round(avg(rating),2) from reviews_this_year),0),
    'readingPace',round(metrics.books::numeric/case when p_year=extract(year from now() at time zone 'UTC') then extract(month from now() at time zone 'UTC') else 12 end,2),
    'favouriteGenre',(select genre from genres order by n desc,genre limit 1),
    'longestBook',(select to_jsonb(longest) from longest),'readingStreakMax',profile.max_reading_streak,
    'currentReadingStreak',case when profile.last_streak_date>=(now() at time zone 'UTC')::date-1 then profile.reading_streak else 0 end,
    'reviewsWrittenThisYear',(select count(*) from reviews_this_year),
    'quotesSavedThisYear',(select count(*) from quotes where user_id=p_user and not is_hidden and created_at>=start_at and created_at<end_at),
    'goal',reading_goal_snapshot(p_user,p_year)),
    'wrapped',jsonb_build_object('userId',p_user,'displayName',profile.display_name,'year',p_year,'booksRead',metrics.books,'pagesRead',metrics.pages,
      'topGenres',coalesce((select jsonb_agg(genre order by n desc,genre) from genres),'[]'::jsonb),
      'topMood',(select mood from reviews_this_year cross join lateral unnest(mood_tags) mood group by mood order by count(*) desc,mood limit 1),
      'streakMax',profile.max_reading_streak,'totalXp',profile.xp,'yearXp',(select coalesce(sum(amount),0) from xp_ledger where user_id=p_user and created_at>=start_at and created_at<end_at),
      'badgesEarned',(select count(*) from user_badges where user_id=p_user and awarded_at>=start_at and awarded_at<end_at),
      'favouriteAuthor',(select author_name from completed group by author_name order by count(*) desc,author_name limit 1),
      'longestBook',(select jsonb_build_object('title',title,'pageCount',page_count) from longest),
      'shortestBook',(select jsonb_build_object('title',title,'pageCount',page_count) from shortest),
      'mostActiveMonthNumber',(select n from month),'publicSummary',public_reading_year_snapshot(p_user,p_year))) into result from metrics;
  return result;
end $$;
revoke all on function reading_year_books(uuid,integer,boolean),public_reading_year_snapshot(uuid,integer),reading_year_snapshot(uuid,integer) from public,anon,authenticated;
grant execute on function public_reading_year_snapshot(uuid,integer),reading_year_snapshot(uuid,integer) to service_role;
notify pgrst,'reload schema';
