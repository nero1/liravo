create or replace function taste_profile_input(p_user_id uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  with finished as materialized(
    select distinct on(canonical_book_work(b.work_id)) canonical_book_work(b.work_id) as work_id,b.id,sb.finished_at
    from shelf_books sb join shelves s on s.id=sb.shelf_id join books source on source.id=sb.book_id join books b on b.id=coalesce(source.canonical_edition_id,source.id)
    where sb.user_id=p_user_id and s.user_id=p_user_id and s.default_type='have_read' and sb.finished_at is not null
    order by canonical_book_work(b.work_id),sb.finished_at desc,sb.id desc
  ), recent as(select * from finished order by finished_at desc,id limit 20), entries as(
    select b.id,left(b.title,500) as title,b.genres[1:10] as genres,r.finished_at,
      (select jsonb_build_object('rating',v.rating,'moods',v.mood_tags[1:10]) from reviews v where v.user_id=p_user_id and v.book_id=any(book_edition_family(b.id)) order by v.created_at desc,v.id desc limit 1) as review
    from recent r join books b on b.id=r.id
  ) select jsonb_build_object('locale',case when u.preferred_locale in ('en','fr','de') then u.preferred_locale else 'en' end,'books',coalesce((select jsonb_agg(to_jsonb(e) order by e.finished_at desc,e.id) from entries e),'[]'::jsonb)) from users u where u.id=p_user_id;
$$;
revoke all on function taste_profile_input(uuid) from public,anon,authenticated;
grant execute on function taste_profile_input(uuid) to service_role;
notify pgrst,'reload schema';
