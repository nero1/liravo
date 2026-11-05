create function canonical_workshop_member_count()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='INSERT' then new.member_count:=0;
  else select count(*)::integer into new.member_count from workshop_members where room_id=new.id;end if;
  return new;
end $$;
create trigger aa_workshop_initial_count before insert on workshop_rooms for each row execute function canonical_workshop_member_count();
create trigger canonical_workshop_member_count before update of member_count on workshop_rooms for each row execute function canonical_workshop_member_count();
revoke all on function canonical_workshop_member_count() from public,anon,authenticated,service_role;
update workshop_rooms r set member_count=(select count(*)::integer from workshop_members where room_id=r.id)
  where member_count<>(select count(*)::integer from workshop_members where room_id=r.id);
revoke insert,update,delete on workshop_rooms,workshop_members from anon,authenticated;
grant select,insert,update,delete on workshop_rooms,workshop_members to service_role;
notify pgrst,'reload schema';
