drop index books_admin_created;
create index books_admin_created on books(created_at desc,(id::text) desc)where canonical_edition_id is null;

create or replace function admin_catalog_snapshot(p_user uuid,p_scope text,p_search text default '',p_at timestamptz default null,p_key text default null,p_limit integer default 25,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare relation text;stamp text:='t.created_at';identity text:='t.id::text';document text:='to_jsonb(t)';predicate text:='true';result jsonb;
begin
  if not exists(select 1 from users where id=p_user and is_admin and not is_banned and deleted_at is null) then raise exception 'Admin access required' using errcode='P1003';end if;
  if p_limit is null or p_offset is null or p_search is null or p_limit not between 1 and 100 or p_offset not between 0 and 250000 or length(p_search)>200 or (p_at is null)<>(p_key is null) or length(p_key)not between 1 and 200 then raise exception 'Invalid catalog page' using errcode='P1004';end if;
  case p_scope
    when 'users' then relation:='users t';predicate:='t.username ilike ''%''||$1||''%''';document:='jsonb_build_object(''id'',t.id,''username'',t.username,''display_name'',t.display_name,''avatar_url'',t.avatar_url,''email'',t.email,''user_types'',t.user_types,''is_premium'',t.is_premium,''premium_override'',t.premium_override,''is_moderator'',t.is_moderator,''is_admin'',t.is_admin,''is_suspended'',t.is_suspended,''is_banned'',t.is_banned,''deleted_at'',t.deleted_at,''created_at'',t.created_at)';
    when 'books' then
      relation:='books t';document:='catalog_book_snapshot(t.id)||jsonb_build_object(''affiliate_click_count'',(select count(*)from affiliate_link_clicks c where c.book_id=any(book_edition_family(t.id))and c.is_affiliate))';
      predicate:='t.canonical_edition_id is null and($1='''' or t.search_vector@@websearch_to_tsquery(''simple'',$1))';
    when 'themes' then relation:='custom_themes t';identity:='t.name';
    when 'promotions' then relation:='promoted_listings t left join books b on b.id=t.book_id';document:='to_jsonb(t)||jsonb_build_object(''book'',case when b.id is null then null else jsonb_build_object(''title'',b.title,''author_name'',b.author_name)end)';
    when 'seasons' then relation:='seasonal_events t';stamp:='t.start_date';
    when 'writing' then relation:='writing_challenges t';document:='to_jsonb(t)||jsonb_build_object(''xp_reward'',25)';
    else raise exception 'Invalid admin catalog' using errcode='P1004';
  end case;
  execute format('select jsonb_build_object(''total'',(select count(*)from %s where %s),''rows'',coalesce((select jsonb_agg(jsonb_build_object(''item'',item,''at'',at,''key'',key)order by at desc,key desc)from(select %s as item,%s as at,%s as key from %s where %s and($2 is null or(%s,%s)<($2,$3))order by %s desc,%s desc limit $4+1 offset $5)page),''[]''::jsonb))',relation,predicate,document,stamp,identity,relation,predicate,stamp,identity,stamp,identity)
    into result using p_search,p_at,p_key,p_limit,p_offset;
  return result;
end $$;
revoke all on function admin_catalog_snapshot(uuid,text,text,timestamptz,text,integer,integer) from public,anon,authenticated;
grant execute on function admin_catalog_snapshot(uuid,text,text,timestamptz,text,integer,integer) to service_role;
notify pgrst,'reload schema';

create function admin_edition_audiobook_snapshot(p_actor uuid,p_book uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  if not exists(select 1 from users where id=p_actor and is_admin and not is_banned and deleted_at is null)then raise exception 'Admin access required' using errcode='P1003';end if;
  select jsonb_build_object('actorId',p_actor,'bookId',p_book,'editionId',b.id,'has_audiobook',b.has_audiobook)into result from books source join books b on b.id=coalesce(source.canonical_edition_id,source.id)where source.id=p_book;
  if result is null then raise exception 'Book unavailable' using errcode='P1005';end if;return result;
end $$;
create function set_admin_edition_audiobook(p_actor uuid,p_book uuid,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare edition uuid;
begin
  if p_enabled is null then raise exception 'Invalid audiobook state' using errcode='P1004';end if;
  perform set_config('lock_timeout','5s',true);
  perform pg_advisory_xact_lock_shared(hashtextextended('catalog:identities',0));
  perform 1 from users where id=p_actor and is_admin and not is_banned and deleted_at is null for update;if not found then raise exception 'Admin access required' using errcode='P1003';end if;
  select coalesce(canonical_edition_id,id)into edition from books where id=p_book;if edition is null then raise exception 'Book unavailable' using errcode='P1005';end if;
  perform 1 from books where id=any(book_edition_family(edition))order by id for update;
  update books set has_audiobook=p_enabled where id=edition and has_audiobook is distinct from p_enabled;
  return admin_edition_audiobook_snapshot(p_actor,p_book)||jsonb_build_object('updated',true);
end $$;
revoke all on function admin_edition_audiobook_snapshot(uuid,uuid),set_admin_edition_audiobook(uuid,uuid,boolean)from public,anon,authenticated;
grant execute on function admin_edition_audiobook_snapshot(uuid,uuid),set_admin_edition_audiobook(uuid,uuid,boolean)to service_role;
notify pgrst,'reload schema';
