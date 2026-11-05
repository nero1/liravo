create index arc_owner_cursor on arcs(author_id,created_at desc,id desc);
create index arc_public_cursor on arcs(created_at desc,id desc) where is_active;
create index arc_application_cursor on arc_applications(arc_id,applied_at desc,id desc) include(status,reader_id);

create or replace function guard_arc_work_application()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from users where id=new.reader_id and not is_banned and deleted_at is null) then raise exception 'Reader unavailable' using errcode='P1005';end if;
  if not exists(select 1 from arcs a where a.id=new.arc_id and a.author_id<>new.reader_id and a.is_active and(a.close_date is null or a.close_date>now()) and author_owns_book(a.author_id,a.book_id)) then raise exception 'Verified ARC ownership required' using errcode='P1003';end if;
  return new;
end $$;
create function guard_arc_application_decision()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if old.status<>'pending' and(new.status is distinct from old.status or new.reader_id is distinct from old.reader_id or new.arc_id is distinct from old.arc_id) then raise exception 'Decision is final' using errcode='P1001';end if;
  if new.status='approved' and old.status<>'approved' then
    if not exists(select 1 from users where id=new.reader_id and not is_banned and deleted_at is null) then raise exception 'Reader unavailable' using errcode='P1005';end if;
    if not exists(select 1 from arcs a where a.id=new.arc_id and a.is_active and(a.close_date is null or a.close_date>now()) and author_owns_book(a.author_id,a.book_id)) then raise exception 'ARC unavailable' using errcode='P1003';end if;
  end if;
  return new;
end $$;
create trigger arc_application_decision_guard before update of status,reader_id,arc_id on arc_applications for each row execute function guard_arc_application_decision();

create function arc_offer_document(p_arc uuid,p_user uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('id',a.id,'author_id',a.author_id,'book_id',a.book_id,'description',a.description,'reader_slots',a.reader_slots,'close_date',a.close_date,'is_active',a.is_active,'created_at',a.created_at,
    'title',b.title,'books',jsonb_build_object('id',b.id,'title',b.title,'author_name',b.author_name,'cover_url',b.cover_url,'isbn_13',b.isbn_13,'language',b.language,'format',b.format),
    'author',jsonb_build_object('id',u.id,'username',u.username,'display_name',u.display_name,'avatar_url',u.avatar_url,'is_verified_author',u.is_verified_author),
    'approved_count',counts.approved,'pending_count',case when p_user=a.author_id then counts.pending end,'total_applications',case when p_user=a.author_id then counts.total end,'slots_remaining',greatest(0,a.reader_slots-counts.approved),
    'my_application_status',mine.status,'is_open',availability.open,
    'can_apply',coalesce(p_user is not null and p_user<>a.author_id and mine.id is null and availability.open and counts.approved<a.reader_slots,false),
    'can_review',coalesce(p_user=a.author_id and availability.open and counts.approved<a.reader_slots,false))
  from arcs a join users u on u.id=a.author_id join books source on source.id=a.book_id join books b on b.id=coalesce(source.canonical_edition_id,source.id)
  cross join lateral(select count(*) as total,count(*) filter(where status='approved') as approved,count(*) filter(where status='pending') as pending from arc_applications where arc_id=a.id) counts
  cross join lateral(select a.is_active and(a.close_date is null or a.close_date>now()) and author_owns_book(a.author_id,a.book_id) as open) availability
  left join arc_applications mine on mine.arc_id=a.id and mine.reader_id=p_user where a.id=p_arc;
$$;

create function arc_catalog_snapshot(p_user uuid,p_owned boolean,p_before timestamptz default null,p_id uuid default null,p_author uuid default null,p_limit integer default 20)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  with page as materialized(
    select a.id,a.created_at from arcs a where
      (case when p_owned then a.author_id=p_user else(a.is_active and(a.close_date is null or a.close_date>now()) and author_owns_book(a.author_id,a.book_id)) or exists(select 1 from arc_applications m where m.arc_id=a.id and m.reader_id=p_user) end)
      and(p_author is null or a.author_id=p_author) and(p_before is null or(a.created_at,a.id)<(p_before,p_id))
    order by a.created_at desc,a.id desc limit greatest(1,least(coalesce(p_limit,20),50))+1
  )select jsonb_build_object('arcs',coalesce((select jsonb_agg(arc_offer_document(id,p_user) order by created_at desc,id desc) from page),'[]'::jsonb));
$$;

create function arc_application_snapshot(p_user uuid,p_arc uuid,p_status text default 'all',p_before timestamptz default null,p_id uuid default null,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare target arcs;result jsonb;
begin
  select * into target from arcs where id=p_arc;
  if not found then return null;end if;
  if target.author_id is distinct from p_user then raise exception 'Author access required' using errcode='P1003';end if;
  if p_status not in('all','pending','approved','rejected') then raise exception 'Invalid status' using errcode='P1004';end if;
  with page as materialized(
    select a.* from arc_applications a where arc_id=p_arc and(p_status='all' or status=p_status) and(p_before is null or(applied_at,id)<(p_before,p_id)) order by applied_at desc,id desc limit greatest(1,least(coalesce(p_limit,20),50))+1
  )select jsonb_build_object('arc',arc_offer_document(p_arc,p_user),
    'statistics',(select jsonb_build_object('total',count(*),'pending',count(*) filter(where status='pending'),'approved',count(*) filter(where status='approved'),'rejected',count(*) filter(where status='rejected')) from arc_applications where arc_id=p_arc),
    'applications',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('reader',jsonb_build_object('id',u.id,'display_name',u.display_name,'username',u.username,'avatar_url',u.avatar_url,'xp',u.xp,'active',not u.is_banned and u.deleted_at is null)) order by a.applied_at desc,a.id desc) from page a join users u on u.id=a.reader_id),'[]'::jsonb)) into result;
  return result;
end $$;
revoke all on arcs,arc_applications from public,anon,authenticated;
grant select,insert,update,delete on arcs,arc_applications to service_role;
revoke all on function guard_arc_work_application(),guard_arc_application_decision(),arc_offer_document(uuid,uuid),arc_catalog_snapshot(uuid,boolean,timestamptz,uuid,uuid,integer),arc_application_snapshot(uuid,uuid,text,timestamptz,uuid,integer) from public,anon,authenticated;
grant execute on function arc_catalog_snapshot(uuid,boolean,timestamptz,uuid,uuid,integer),arc_application_snapshot(uuid,uuid,text,timestamptz,uuid,integer) to service_role;
notify pgrst,'reload schema';
