create index shelf_books_latest_edition on shelf_books(shelf_id,user_id,updated_at desc,id desc);
create function shelf_edition_rows(p_shelf uuid)
returns table(entry jsonb,at timestamptz,edition_id uuid)language sql stable set search_path=public,pg_temp as $$
 with ranked as(
  select sb membership,coalesce(b.canonical_edition_id,b.id)edition_id,max(sb.added_at)over(partition by coalesce(b.canonical_edition_id,b.id))at,
   row_number()over(partition by coalesce(b.canonical_edition_id,b.id)order by sb.updated_at desc,sb.added_at desc,sb.id desc)position
  from shelf_books sb join shelves s on s.id=sb.shelf_id and s.user_id=sb.user_id join books b on b.id=sb.book_id where sb.shelf_id=p_shelf
 )select to_jsonb(membership)||jsonb_build_object('book_id',b.id,'source_book_id',(membership).book_id,'book',to_jsonb(b)),r.at,r.edition_id from ranked r join books b on b.id=r.edition_id where position=1;
$$;
create function shelf_catalog_snapshot(p_user uuid,p_book uuid default null,p_default boolean default null,p_at timestamptz default null,p_id uuid default null,p_limit integer default 50,p_year integer default extract(year from now()at time zone 'UTC')::integer)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare target uuid;page jsonb;
begin
 if not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null)then raise exception 'Account unavailable' using errcode='P1003';end if;
 if p_limit is null or p_limit not between 1 and 100 or p_year is null or p_year not between 2020 and 2099 or(p_at is null)<>(p_id is null)or(p_at is null)<>(p_default is null)then raise exception 'Invalid shelf page' using errcode='P1004';end if;
 if p_book is not null then select coalesce(canonical_edition_id,id)into target from books where id=p_book;if target is null then raise exception 'Book unavailable' using errcode='P1005';end if;end if;
 select coalesce(jsonb_agg((to_jsonb(s)-'idempotency_key'-'request_hash')||jsonb_build_object('book_count',(
  select count(distinct coalesce(b.canonical_edition_id,b.id))from shelf_books sb join books b on b.id=sb.book_id where sb.shelf_id=s.id and sb.user_id=p_user
 ),'contains_book',exists(select 1 from shelf_books sb join books b on b.id=sb.book_id where sb.shelf_id=s.id and sb.user_id=p_user and coalesce(b.canonical_edition_id,b.id)=target))order by s.is_default desc,s.created_at desc,s.id desc),'[]'::jsonb)into page
 from(select * from shelves where user_id=p_user and(p_at is null or(is_default::integer,created_at,id)<(p_default::integer,p_at,p_id))order by is_default desc,created_at desc,id desc limit p_limit+1)s;
 return jsonb_build_object('shelves',page,'total',(select count(*)from shelves where user_id=p_user),'selectedTotal',(
  select count(distinct s.id)from shelves s join shelf_books sb on sb.shelf_id=s.id and sb.user_id=p_user join books b on b.id=sb.book_id where s.user_id=p_user and coalesce(b.canonical_edition_id,b.id)=target
 ),'reading',reading_goal_snapshot(p_user,p_year));
end $$;
create function shelf_detail_snapshot(p_user uuid,p_shelf uuid,p_at timestamptz default null,p_id uuid default null,p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare shelf shelves;owner users;total bigint;page jsonb;
begin
 if not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null)then raise exception 'Account unavailable' using errcode='P1003';end if;
 if p_limit is null or p_limit not between 1 and 100 or(p_at is null)<>(p_id is null)then raise exception 'Invalid shelf page' using errcode='P1004';end if;
 select * into shelf from shelves where id=p_shelf;if not found then raise exception 'Shelf unavailable' using errcode='P1005';end if;
 if shelf.user_id<>p_user then
  select * into owner from users where id=shelf.user_id;
  if not found or owner.is_banned or owner.deleted_at is not null or not shelf.is_public or owner.shelf_visibility='private'then raise exception 'Shelf is private' using errcode='P1003';end if;
  if(owner.profile_visibility='followers_only'or owner.shelf_visibility='followers_only')and not exists(select 1 from follows where follower_id=p_user and following_id=owner.id)then raise exception 'Shelf is private' using errcode='P1003';end if;
 end if;
 select count(*)into total from shelf_edition_rows(p_shelf);
 select coalesce(jsonb_agg(jsonb_build_object('entry',entry,'at',at,'id',edition_id)order by at desc,edition_id desc),'[]'::jsonb)into page from(select * from shelf_edition_rows(p_shelf)where p_at is null or(at,edition_id)<(p_at,p_id)order by at desc,edition_id desc limit p_limit+1)rows;
 return jsonb_build_object('shelf',(to_jsonb(shelf)-'idempotency_key'-'request_hash')||jsonb_build_object('book_count',total),'total',total,'books',page);
end $$;
revoke all on function shelf_edition_rows(uuid),shelf_catalog_snapshot(uuid,uuid,boolean,timestamptz,uuid,integer,integer),shelf_detail_snapshot(uuid,uuid,timestamptz,uuid,integer)from public,anon,authenticated;
grant execute on function shelf_catalog_snapshot(uuid,uuid,boolean,timestamptz,uuid,integer,integer),shelf_detail_snapshot(uuid,uuid,timestamptz,uuid,integer)to service_role;
notify pgrst,'reload schema';
