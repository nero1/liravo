create index reviews_published_moods on reviews using gin(mood_tags) where moderation_status='published' and not is_hidden;
create function discover_mood_books(p_mood text,p_limit integer default 30,p_after_count integer default null,p_after_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  if p_mood is null or p_mood not in ('Dark','Cozy','Mind-bending','Funny','Emotional','Slow-burn','Fast-paced','Educational','Inspiring','Disturbing','Romantic','Intense')
    or p_limit is null or p_limit not between 1 and 50 or (p_after_count is null)<>(p_after_id is null) or p_after_count<1 then raise exception 'Invalid mood page' using errcode='P1004';end if;
  with counts as(
    select coalesce(b.canonical_edition_id,b.id) as id,count(distinct r.user_id)::integer as score
    from reviews r join books b on b.id=r.book_id join users u on u.id=r.user_id
    where r.mood_tags @> array[p_mood] and r.moderation_status='published' and not r.is_hidden and not u.is_banned and u.deleted_at is null
    group by coalesce(b.canonical_edition_id,b.id)
  ),page as(
    select b.*,c.score from counts c join books b on b.id=c.id
    where p_after_count is null or (c.score,b.id)<(p_after_count,p_after_id)
    order by c.score desc,b.id desc limit p_limit+1
  ),visible as(select * from page order by score desc,id desc limit p_limit)
  select jsonb_build_object('books',coalesce((select jsonb_agg(to_jsonb(v)-'score'||jsonb_build_object('mood_count',v.score) order by v.score desc,v.id desc) from visible v),'[]'::jsonb),
    'nextCursor',case when (select count(*) from page)>p_limit then (select jsonb_build_object('count',v.score,'id',v.id) from visible v order by v.score,v.id limit 1) else null end) into result;
  return result;
end $$;
revoke all on function discover_mood_books(text,integer,integer,uuid) from public,anon,authenticated;
grant execute on function discover_mood_books(text,integer,integer,uuid) to service_role;
notify pgrst,'reload schema';
