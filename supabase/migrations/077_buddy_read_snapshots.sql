create or replace function guard_buddy_membership()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare room buddy_reads;
begin
  perform 1 from users where id=new.user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1005';end if;
  select * into room from buddy_reads where id=new.buddy_read_id for update;
  if not found then raise exception 'Unknown buddy read' using errcode='P1005';end if;
  if exists(select 1 from buddy_read_members where buddy_read_id=room.id and user_id=new.user_id) then return new;end if;
  if not room.is_active or(room.is_private and room.created_by<>new.user_id) or not exists(select 1 from users where id=room.created_by and not is_banned and deleted_at is null) then raise exception 'Buddy read unavailable' using errcode='P1005';end if;
  if(select count(*) from buddy_read_members where buddy_read_id=room.id)>=room.max_participants then raise exception 'Buddy read full' using errcode='P1004';end if;
  return new;
end $$;
revoke all on function guard_buddy_membership() from public,anon,authenticated;

create index buddy_catalog_cursor on buddy_reads(created_at desc,id desc);
create index buddy_note_cursor on buddy_read_notes(buddy_read_id,created_at desc,id desc);

create function buddy_read_document(p_room uuid,p_user uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('id',r.id,'title',r.title,'book_id',r.book_id,'max_participants',r.max_participants,'current_chapter',r.current_chapter,'is_active',r.is_active,'is_private',r.is_private,'created_by',r.created_by,'created_at',r.created_at,
    'participant_count',members.total,'is_member',members.mine,'can_join',not members.mine and not r.is_private and r.is_active and members.total<r.max_participants and owner.active,
    'can_update',members.mine and r.is_active,
    'book',jsonb_build_object('id',b.id,'title',b.title,'author_name',b.author_name,'cover_url',b.cover_url,'isbn_13',b.isbn_13,'isbn_10',b.isbn_10,'language',b.language,'format',b.format))
  from buddy_reads r join books source on source.id=r.book_id join books b on b.id=coalesce(source.canonical_edition_id,source.id)
  cross join lateral(select count(*) as total,coalesce(bool_or(user_id=p_user),false) as mine from buddy_read_members where buddy_read_id=r.id) members
  cross join lateral(select exists(select 1 from users where id=r.created_by and not is_banned and deleted_at is null) as active) owner
  where r.id=p_room and(not r.is_private or r.created_by=p_user or members.mine);
$$;

create function buddy_catalog_snapshot(p_user uuid,p_scope text,p_before timestamptz default null,p_id uuid default null,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if p_scope not in('mine','open') then raise exception 'Invalid catalog' using errcode='P1004';end if;
  return(with page as materialized(
    select r.id,r.created_at from buddy_reads r where
      case when p_scope='mine' then exists(select 1 from buddy_read_members where buddy_read_id=r.id and user_id=p_user)
      else r.is_active and not r.is_private and not exists(select 1 from buddy_read_members where buddy_read_id=r.id and user_id=p_user)
        and exists(select 1 from users where id=r.created_by and not is_banned and deleted_at is null)
        and(select count(*) from buddy_read_members where buddy_read_id=r.id)<r.max_participants end
      and(p_before is null or(r.created_at,r.id)<(p_before,p_id))
    order by r.created_at desc,r.id desc limit greatest(1,least(coalesce(p_limit,20),50))+1
  )select jsonb_build_object('buddy_reads',coalesce((select jsonb_agg(buddy_read_document(id,p_user) order by created_at desc,id desc) from page),'[]'::jsonb)));
end $$;

create function buddy_detail_snapshot(p_user uuid,p_room uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  with room as(select buddy_read_document(p_room,p_user) as document)
  select jsonb_build_object('buddyRead',document,'book',document->'book','participants',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'username',u.username,'display_name',u.display_name,'avatar_url',u.avatar_url) order by m.joined_at,u.id) from buddy_read_members m join users u on u.id=m.user_id where m.buddy_read_id=p_room),'[]'::jsonb)) from room where document is not null;
$$;

create function buddy_notes_snapshot(p_user uuid,p_room uuid,p_before timestamptz default null,p_id uuid default null,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from buddy_read_members where buddy_read_id=p_room and user_id=p_user) then raise exception 'Not a participant' using errcode='P1003';end if;
  return(with page as materialized(select n.* from buddy_read_notes n where buddy_read_id=p_room and(p_before is null or(created_at,id)<(p_before,p_id)) order by created_at desc,id desc limit greatest(1,least(coalesce(p_limit,20),50))+1)
    select jsonb_build_object('notes',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'user_id',n.user_id,'content',n.content,'created_at',n.created_at,'reply_to_id',n.reply_to_id,'user',jsonb_build_object('display_name',u.display_name,'username',u.username,'avatar_url',u.avatar_url)) order by n.created_at desc,n.id desc) from page n join users u on u.id=n.user_id),'[]'::jsonb)));
end $$;
revoke all on function buddy_read_document(uuid,uuid),buddy_catalog_snapshot(uuid,text,timestamptz,uuid,integer),buddy_detail_snapshot(uuid,uuid),buddy_notes_snapshot(uuid,uuid,timestamptz,uuid,integer) from public,anon,authenticated;
grant execute on function buddy_catalog_snapshot(uuid,text,timestamptz,uuid,integer),buddy_detail_snapshot(uuid,uuid),buddy_notes_snapshot(uuid,uuid,timestamptz,uuid,integer) to service_role;
notify pgrst,'reload schema';
