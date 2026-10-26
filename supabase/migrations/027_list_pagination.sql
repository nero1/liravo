-- The application contract uses name; preserve existing title data by renaming it.
do $$ begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='reading_lists' and column_name='title') then
    if exists(select 1 from information_schema.columns where table_schema='public' and table_name='reading_lists' and column_name='name') then
      raise exception 'Reconcile reading_lists.title and name before migration';
    end if;
    alter table reading_lists rename column title to name;
  end if;
end $$;
create index if not exists list_follows_user on reading_list_follows(user_id,list_id);
create index if not exists public_lists_cursor on reading_lists(created_at desc,id desc) where is_public;
create or replace function page_followed_lists(p_user_id uuid,p_before timestamptz,p_before_id uuid,p_limit integer default 51)
returns setof reading_lists language sql stable security definer set search_path=public,pg_temp as $$
  select l.* from reading_lists l where l.is_public
    and (p_before is null or (l.created_at,l.id)<(p_before,p_before_id))
    and exists(select 1 from reading_list_follows f where f.user_id=p_user_id and f.list_id=l.id)
    order by l.created_at desc,l.id desc limit greatest(1,least(p_limit,51));
$$;
revoke all on function page_followed_lists(uuid,timestamptz,uuid,integer) from public;
grant execute on function page_followed_lists(uuid,timestamptz,uuid,integer) to service_role;
