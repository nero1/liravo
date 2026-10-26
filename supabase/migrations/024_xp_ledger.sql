create table xp_ledger (
  user_id uuid not null references users(id),
  event_key text not null,
  amount integer not null,
  reason text not null,
  created_at timestamptz not null default now(),
  primary key(user_id,event_key)
);
alter table xp_ledger enable row level security;
create or replace function award_xp_once(p_user_id uuid,p_amount integer,p_reason text,p_event_key text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare previous xp_ledger; total integer;
begin
  if p_amount<0 or p_amount>5000 or length(p_event_key) not between 1 and 512 then raise exception 'Invalid reward'; end if;
  perform 1 from users where id=p_user_id for update;
  if not found then raise exception 'Unknown user'; end if;
  select * into previous from xp_ledger where user_id=p_user_id and event_key=p_event_key;
  if found then
    if previous.amount<>p_amount or previous.reason<>p_reason then raise exception 'Conflicting reward'; end if;
    select xp into total from users where id=p_user_id;
    return jsonb_build_object('xp',total,'awarded',0);
  end if;
  insert into xp_ledger values(p_user_id,p_event_key,p_amount,p_reason,now());
  update users set xp=xp+p_amount where id=p_user_id returning xp into total;
  return jsonb_build_object('xp',total,'awarded',p_amount);
end $$;
revoke all on function award_xp_once(uuid,integer,text,text) from public;
grant execute on function award_xp_once(uuid,integer,text,text) to service_role;
