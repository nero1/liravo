create function guard_reading_room_content()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare actor uuid;
begin
  actor:=case when tg_table_name='reading_room_posts' then (to_jsonb(new)->>'user_id')::uuid else coalesce((to_jsonb(new)->>'created_by')::uuid,(select created_by from reading_rooms where id=new.room_id)) end;
  perform 1 from users where id=actor and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  if length(trim(case when tg_table_name='reading_room_posts' then to_jsonb(new)->>'content' else to_jsonb(new)->>'title' end)) not between 1 and(case when tg_table_name='reading_room_posts' then 2000 else 200 end) then raise exception 'Invalid content' using errcode='P1004';end if;
  return new;
end $$;
create trigger aa_reading_room_post_guard before insert on reading_room_posts for each row execute function guard_reading_room_content();
create trigger aa_reading_room_milestone_guard before insert on reading_room_milestones for each row execute function guard_reading_room_content();
revoke all on function guard_reading_room_content() from public,anon,authenticated;
revoke insert,update,delete on reading_rooms,room_participants,reading_room_members,reading_room_posts,reading_room_milestones from anon,authenticated;

create index reading_room_catalog_cursor on reading_rooms(created_at desc,id desc);
create index reading_room_member_cursor on room_participants(room_id,joined_at desc,user_id desc);
create index reading_room_milestone_cursor on reading_room_milestones(room_id,unlock_date,id);
create index reading_room_post_cursor on reading_room_posts(room_id,milestone_id,created_at desc,id desc);

create function guard_reading_room_membership()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare room reading_rooms;
begin
  perform 1 from users where id=new.user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  select * into room from reading_rooms where id=new.room_id for update;
  if not found then raise exception 'Room unavailable' using errcode='P1005';end if;
  if exists(select 1 from room_participants where room_id=new.room_id and user_id=new.user_id) then return new;end if;
  if not room.is_active or not exists(select 1 from users where id=room.created_by and not is_banned and deleted_at is null) then raise exception 'Organizer unavailable' using errcode='P1003';end if;
  return new;
end $$;
create trigger reading_room_membership_guard before insert on room_participants for each row execute function guard_reading_room_membership();

create function assert_reading_room_access(p_user uuid,p_room uuid)
returns void language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null) or not reading_room_visible(p_room,p_user) then raise exception 'Room unavailable' using errcode='P1003';end if;
end $$;

create function reading_room_document(p_user uuid,p_room uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('id',r.id,'name',r.name,'book_id',r.book_id,'created_by',r.created_by,'created_at',r.created_at,'is_active',r.is_active,'is_public',r.is_public,
    'member_count',members.total,'is_member',members.mine or r.created_by=p_user,'can_join',not members.mine and r.created_by<>p_user and r.is_active and r.is_public and organizer.active,
    'can_post',r.is_active and(members.mine or r.created_by=p_user),'can_manage',r.is_active and r.created_by=p_user,
    'book',case when b.id is not null then jsonb_build_object('id',b.id,'title',b.title,'author_name',b.author_name,'cover_url',b.cover_url,'isbn_13',b.isbn_13,'language',b.language,'format',b.format) end)
  from reading_rooms r left join books source on source.id=r.book_id left join books b on b.id=coalesce(source.canonical_edition_id,source.id)
  cross join lateral(select count(*) as total,coalesce(bool_or(user_id=p_user),false) as mine from room_participants where room_id=r.id) members
  cross join lateral(select exists(select 1 from users where id=r.created_by and not is_banned and deleted_at is null) as active) organizer
  where r.id=p_room and reading_room_visible(r.id,p_user);
$$;

create function reading_room_catalog_snapshot(p_user uuid,p_scope text default 'public',p_at timestamptz default null,p_id uuid default null,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if p_scope not in('mine','public') then raise exception 'Invalid catalog' using errcode='P1004';end if;
  if not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null) then raise exception 'Account unavailable' using errcode='P1003';end if;
  return(with page as materialized(select r.id,r.created_at from reading_rooms r where
    (case when p_scope='mine' then r.created_by=p_user or exists(select 1 from room_participants where room_id=r.id and user_id=p_user)
     else r.is_public and r.is_active and exists(select 1 from users where id=r.created_by and not is_banned and deleted_at is null) end)
    and(p_at is null or(r.created_at,r.id)<(p_at,p_id)) order by r.created_at desc,r.id desc limit greatest(1,least(coalesce(p_limit,20),50))+1)
    select jsonb_build_object('rooms',coalesce((select jsonb_agg(reading_room_document(p_user,id) order by created_at desc,id desc) from page),'[]'::jsonb)));
end $$;

create function reading_room_detail_snapshot(p_user uuid,p_room uuid,p_at timestamptz default null,p_id uuid default null,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  perform assert_reading_room_access(p_user,p_room);
  return(with page as materialized(select u.id,u.username,u.display_name,u.avatar_url,m.joined_at from room_participants m join users u on u.id=m.user_id where m.room_id=p_room and(p_at is null or(m.joined_at,m.user_id)<(p_at,p_id)) order by m.joined_at desc,m.user_id desc limit greatest(1,least(coalesce(p_limit,20),50))+1)
    select jsonb_build_object('room',reading_room_document(p_user,p_room),'participants',coalesce((select jsonb_agg(to_jsonb(page) order by joined_at desc,id desc) from page),'[]'::jsonb)));
end $$;

create function reading_room_milestone_snapshot(p_user uuid,p_room uuid,p_at timestamptz default null,p_id uuid default null,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  perform assert_reading_room_access(p_user,p_room);
  return(with page as materialized(select m.id,m.room_id,m.created_by,m.title,m.unlock_date,m.created_at,m.unlock_date<=now() as is_unlocked,
    case when m.unlock_date<=now() then(select count(*) from reading_room_posts where milestone_id=m.id and room_id=m.room_id) else 0 end as post_count
    from reading_room_milestones m where room_id=p_room and(p_at is null or(unlock_date,id)>(p_at,p_id)) order by unlock_date,id limit greatest(1,least(coalesce(p_limit,20),50))+1)
    select jsonb_build_object('milestones',coalesce((select jsonb_agg(to_jsonb(page) order by unlock_date,id) from page),'[]'::jsonb),'serverNow',now(),'total',(select count(*) from reading_room_milestones where room_id=p_room)));
end $$;

create function reading_room_posts_snapshot(p_user uuid,p_room uuid,p_general boolean default false,p_milestone uuid default null,p_at timestamptz default null,p_id uuid default null,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  perform assert_reading_room_access(p_user,p_room);
  if p_milestone is not null and not exists(select 1 from reading_room_milestones where id=p_milestone and room_id=p_room and unlock_date<=now()) then raise exception 'Milestone unavailable' using errcode='P1003';end if;
  return(with page as materialized(select p.id,p.user_id,p.room_id,p.content,p.milestone_id,p.created_at,jsonb_build_object('id',u.id,'display_name',u.display_name,'username',u.username,'avatar_url',u.avatar_url) as users
    from reading_room_posts p join users u on u.id=p.user_id left join reading_room_milestones m on m.id=p.milestone_id and m.room_id=p.room_id
    where p.room_id=p_room and(p.milestone_id is null or m.unlock_date<=now()) and(not p_general or p.milestone_id is null) and(p_milestone is null or p.milestone_id=p_milestone)
      and(p_at is null or(p.created_at,p.id)<(p_at,p_id)) order by p.created_at desc,p.id desc limit greatest(1,least(coalesce(p_limit,20),50))+1)
    select jsonb_build_object('posts',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,id desc) from page),'[]'::jsonb)));
end $$;
revoke all on function guard_reading_room_membership(),assert_reading_room_access(uuid,uuid),reading_room_document(uuid,uuid),reading_room_catalog_snapshot(uuid,text,timestamptz,uuid,integer),reading_room_detail_snapshot(uuid,uuid,timestamptz,uuid,integer),reading_room_milestone_snapshot(uuid,uuid,timestamptz,uuid,integer),reading_room_posts_snapshot(uuid,uuid,boolean,uuid,timestamptz,uuid,integer) from public,anon,authenticated;
grant execute on function reading_room_catalog_snapshot(uuid,text,timestamptz,uuid,integer),reading_room_detail_snapshot(uuid,uuid,timestamptz,uuid,integer),reading_room_milestone_snapshot(uuid,uuid,timestamptz,uuid,integer),reading_room_posts_snapshot(uuid,uuid,boolean,uuid,timestamptz,uuid,integer) to service_role;
notify pgrst,'reload schema';
