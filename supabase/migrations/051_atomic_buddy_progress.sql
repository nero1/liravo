update buddy_read_notes note set reply_to_id=null where reply_to_id is not null and not exists(select 1 from buddy_read_notes parent where parent.id=note.reply_to_id and parent.buddy_read_id=note.buddy_read_id);
create function guard_buddy_note_scope()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='UPDATE' and new.buddy_read_id=old.buddy_read_id and new.user_id=old.user_id and new.content=old.content and new.reply_to_id is null then return new; end if;
  perform 1 from users where id=new.user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003'; end if;
  perform 1 from buddy_reads where id=new.buddy_read_id and is_active for share;
  if not found then raise exception 'Buddy read unavailable' using errcode='P1005'; end if;
  perform 1 from buddy_read_members where buddy_read_id=new.buddy_read_id and user_id=new.user_id for share;
  if not found then raise exception 'Not a participant' using errcode='P1003'; end if;
  if length(trim(coalesce(new.content,''))) not between 1 and 2000 then raise exception 'Invalid note' using errcode='P1004'; end if;
  if new.reply_to_id is not null then
    perform 1 from buddy_read_notes where id=new.reply_to_id and buddy_read_id=new.buddy_read_id for share;
    if not found then raise exception 'Reply unavailable' using errcode='P1003'; end if;
  end if;
  return new;
end $$;
create trigger buddy_note_scope before insert or update on buddy_read_notes for each row execute function guard_buddy_note_scope();

create function update_buddy_progress(p_actor_id uuid,p_room_id uuid,p_key text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare previous content_intents; fingerprint text; room buddy_reads; note buddy_read_notes; result jsonb;
begin
  if p_key is null or length(p_key) not between 8 and 200 or p_payload is null or jsonb_typeof(p_payload)<>'object'
    or not(p_payload?'current_chapter' or p_payload?'note') or exists(select 1 from jsonb_object_keys(p_payload) key where key not in ('current_chapter','note'))
    or (p_payload?'current_chapter' and (jsonb_typeof(p_payload->'current_chapter')<>'number' or p_payload->>'current_chapter' !~ '^[0-9]{1,6}$' or (p_payload->>'current_chapter')::integer not between 1 and 200000))
    or (p_payload?'note' and (jsonb_typeof(p_payload->'note')<>'string' or length(trim(p_payload->>'note')) not between 1 and 2000)) then raise exception 'Invalid progress' using errcode='P1004'; end if;
  perform 1 from users where id=p_actor_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003'; end if;
  fingerprint:=encode(sha256(convert_to(jsonb_build_object('room',p_room_id,'payload',p_payload)::text,'UTF8')),'hex');
  select * into previous from content_intents where actor_id=p_actor_id and action='buddy_update' and intent_key=p_key;
  if found then
    if previous.fingerprint<>fingerprint then raise exception 'Conflicting intent' using errcode='P1001'; end if;
    return previous.response;
  end if;
  select * into room from buddy_reads where id=p_room_id for update;
  if not found or not room.is_active then raise exception 'Buddy read unavailable' using errcode='P1005'; end if;
  perform 1 from buddy_read_members where buddy_read_id=p_room_id and user_id=p_actor_id for share;
  if not found then raise exception 'Not a participant' using errcode='P1003'; end if;
  if p_payload?'current_chapter' then update buddy_reads set current_chapter=(p_payload->>'current_chapter')::integer where id=p_room_id returning * into room; end if;
  if p_payload?'note' then insert into buddy_read_notes(buddy_read_id,user_id,content) values(p_room_id,p_actor_id,p_payload->>'note') returning * into note; end if;
  result:=jsonb_build_object('updated',true,'current_chapter',room.current_chapter,'note',case when note.id is null then null else to_jsonb(note)-'idempotency_key'-'request_hash' end);
  insert into content_intents(actor_id,action,intent_key,fingerprint,response) values(p_actor_id,'buddy_update',p_key,fingerprint,result);
  return result;
end $$;
revoke all on function guard_buddy_note_scope(),update_buddy_progress(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function update_buddy_progress(uuid,uuid,text,jsonb) to service_role;
notify pgrst,'reload schema';

create function buddy_read_visible(p_room_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from buddy_reads room where room.id=p_room_id and (not room.is_private or room.created_by=auth.uid() or exists(select 1 from buddy_read_members member where member.buddy_read_id=room.id and member.user_id=auth.uid())));
$$;
drop policy buddy_reads_select on buddy_reads;
create policy buddy_reads_select on buddy_reads for select using(buddy_read_visible(id));
drop policy buddy_read_members_select on buddy_read_members;
create policy buddy_read_members_select on buddy_read_members for select using(buddy_read_visible(buddy_read_id));
revoke all on function buddy_read_visible(uuid) from public;
grant execute on function buddy_read_visible(uuid) to anon,authenticated,service_role;
