create index reading_list_book_cursor on reading_list_books(list_id,added_at desc,book_id desc);
create index reading_list_catalog_cursor on reading_lists(user_id,created_at desc,id desc);

create function reading_list_document(p_user uuid,p_list uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('id',l.id,'user_id',l.user_id,'name',l.name,'description',l.description,'is_public',l.is_public,'created_at',l.created_at,'updated_at',l.updated_at,
    'book_count',(select count(distinct coalesce(b.canonical_edition_id,b.id)) from reading_list_books lb join books b on b.id=lb.book_id where lb.list_id=l.id),
    'follower_count',(select count(*) from reading_list_follows where list_id=l.id),'is_following',exists(select 1 from reading_list_follows where list_id=l.id and user_id=p_user))
  from reading_lists l where l.id=p_list and(l.is_public or l.user_id=p_user);
$$;

create function reading_list_catalog_snapshot(p_user uuid,p_scope text default 'mine',p_at timestamptz default null,p_id uuid default null,p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if p_scope not in('mine','followed') then raise exception 'Invalid scope' using errcode='P1004';end if;
  if not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null) then raise exception 'Account unavailable' using errcode='P1003';end if;
  return(with page as materialized(select l.id,l.created_at from reading_lists l where
    (case when p_scope='mine' then l.user_id=p_user else l.is_public and exists(select 1 from reading_list_follows where list_id=l.id and user_id=p_user) end)
    and(p_at is null or(l.created_at,l.id)<(p_at,p_id)) order by l.created_at desc,l.id desc limit greatest(1,least(coalesce(p_limit,50),50))+1)
    select jsonb_build_object('lists',coalesce((select jsonb_agg(reading_list_document(p_user,id) order by created_at desc,id desc) from page),'[]'::jsonb)));
end $$;

create function reading_list_detail_snapshot(p_user uuid,p_list uuid,p_at timestamptz default null,p_id uuid default null,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare document jsonb;
begin
  if p_user is not null and not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null) then raise exception 'Account unavailable' using errcode='P1003';end if;
  document:=reading_list_document(p_user,p_list);
  if document is null then raise exception 'List unavailable' using errcode='P1005';end if;
  return(with entries as materialized(select distinct on(b.id) b.id,b.title,b.author_name,b.cover_url,b.isbn_10,b.isbn_13,b.language,b.format,lb.added_at
    from reading_list_books lb join books source on source.id=lb.book_id join books b on b.id=coalesce(source.canonical_edition_id,source.id)
    where lb.list_id=p_list order by b.id,lb.added_at desc,lb.book_id desc),page as materialized(select * from entries where p_at is null or(added_at,id)<(p_at,p_id) order by added_at desc,id desc limit greatest(1,least(coalesce(p_limit,20),50))+1)
    select jsonb_build_object('list',document,'books',coalesce((select jsonb_agg(to_jsonb(page) order by added_at desc,id desc) from page),'[]'::jsonb)));
end $$;

create function guard_reading_list()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform 1 from users where id=new.user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  if length(trim(new.name)) not between 1 and 100 or length(coalesce(new.description,''))>500 then raise exception 'Invalid list' using errcode='P1004';end if;
  return new;
end $$;
create trigger aa_reading_list_guard before insert or update of name,description,is_public on reading_lists for each row execute function guard_reading_list();

create function mutate_reading_list(p_user uuid,p_list uuid,p_action text,p_payload jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare target reading_lists;book uuid;
begin
  perform 1 from users where id=p_user and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  select * into target from reading_lists where id=p_list for update;
  if not found then
    if p_action='delete' then return jsonb_build_object('deleted',true);end if;
    raise exception 'List unavailable' using errcode='P1005';
  end if;
  if target.user_id<>p_user then raise exception 'List unavailable' using errcode='P1005';end if;
  if p_action='update' then
    if p_payload='{}'::jsonb or p_payload-array['name','description','is_public']<>'{}'::jsonb then raise exception 'Invalid update' using errcode='P1004';end if;
    update reading_lists set name=case when p_payload?'name' then trim(p_payload->>'name') else name end,
      description=case when p_payload?'description' then trim(p_payload->>'description') else description end,
      is_public=case when p_payload?'is_public' then(p_payload->>'is_public')::boolean else is_public end,updated_at=now() where id=p_list;
  elsif p_action='delete' then delete from reading_lists where id=p_list;return jsonb_build_object('deleted',true);
  elsif p_action in('add','remove') then
    select coalesce(canonical_edition_id,id) into book from books where id=(p_payload->>'book_id')::uuid;
    if book is null then raise exception 'Edition unavailable' using errcode='P1005';end if;
    if p_action='add' then
      if not exists(select 1 from reading_list_books lb join books b on b.id=lb.book_id where list_id=p_list and coalesce(b.canonical_edition_id,b.id)=book) then
        insert into reading_list_books(list_id,book_id) values(p_list,book) on conflict do nothing;
      end if;
    else delete from reading_list_books lb using books b where lb.book_id=b.id and lb.list_id=p_list and coalesce(b.canonical_edition_id,b.id)=book;end if;
  else raise exception 'Invalid action' using errcode='P1004';end if;
  return jsonb_build_object('list',reading_list_document(p_user,p_list),'bookId',book);
end $$;
revoke insert,update,delete on reading_lists,reading_list_books from anon,authenticated;
revoke all on function reading_list_document(uuid,uuid),reading_list_catalog_snapshot(uuid,text,timestamptz,uuid,integer),reading_list_detail_snapshot(uuid,uuid,timestamptz,uuid,integer),guard_reading_list(),mutate_reading_list(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function reading_list_catalog_snapshot(uuid,text,timestamptz,uuid,integer),reading_list_detail_snapshot(uuid,uuid,timestamptz,uuid,integer),mutate_reading_list(uuid,uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';
