create index appeal_owner_cursor on appeals(user_id,created_at desc,id desc);
create index appeal_queue_cursor on appeals(status,created_at,id);
create index appeal_report_status on appeals(report_id,status,created_at desc);
create index appeal_action_cursor on content_reports(status,(coalesce(resolved_at,created_at)) desc,id desc);

create or replace function validate_appeal_report()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare report content_reports;owner_id uuid;kind text;
begin
  perform 1 from users where id=new.user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  if length(trim(new.reason)) not between 10 and 500 then raise exception 'Invalid appeal' using errcode='P1004';end if;
  if new.report_id is not null then
    select * into report from content_reports where id=new.report_id for share;
    if not found then raise exception 'Report unavailable' using errcode='P1005';end if;
    case report.entity_type when 'review' then select user_id into owner_id from reviews where id=report.entity_id;
      when 'quote' then select user_id into owner_id from quotes where id=report.entity_id;
      when 'user' then owner_id:=report.entity_id;else null;end case;
    if owner_id is distinct from new.user_id or report.status not in('removed','warned') then raise exception 'Appealable action required' using errcode='P1003';end if;
    kind:=case when report.entity_type='user' then 'profile' else report.entity_type end;
    if(new.content_type is not null and new.content_type<>kind)or(new.content_id is not null and new.content_id<>report.entity_id)then raise exception 'Conflicting appeal target' using errcode='P1004';end if;
    new.content_type:=kind;new.content_id:=report.entity_id;
  elsif new.content_type is not null or new.content_id is not null then
    case new.content_type when 'review' then select user_id into owner_id from reviews where id=new.content_id;
      when 'quote' then select user_id into owner_id from quotes where id=new.content_id;
      when 'profile' then owner_id:=new.content_id;
      when 'debate' then select user_id into owner_id from book_debates where id=new.content_id;else null;end case;
    if new.content_type is null or new.content_id is null or owner_id is distinct from new.user_id then raise exception 'Owned appeal target required' using errcode='P1003';end if;
  end if;
  return new;
end $$;

create function appeal_action_document(p_user uuid,p_report uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('id',r.id,'content_type',case when r.entity_type='user' then 'profile' else r.entity_type end,'status',r.status,'created_at',coalesce(r.resolved_at,r.created_at),
    'label',case when r.entity_type='review' then(select b.title from reviews v join books b on b.id=v.book_id where v.id=r.entity_id)
      when r.entity_type='quote' then(select b.title from quotes q join books b on b.id=q.book_id where q.id=r.entity_id)
      when r.entity_type='user' then(select display_name from users where id=r.entity_id) end,'moderator_note',r.moderator_note,'content',case when r.entity_type='review' then(select left(content,500) from reviews where id=r.entity_id) when r.entity_type='quote' then(select left(content,500) from quotes where id=r.entity_id)end,
    'pending_appeal_id',(select id from appeals where user_id=p_user and report_id=r.id and status='pending' order by created_at desc,id desc limit 1))
  from content_reports r where r.id=p_report and(r.entity_type='user' and r.entity_id=p_user or r.entity_type='review' and exists(select 1 from reviews where id=r.entity_id and user_id=p_user) or r.entity_type='quote' and exists(select 1 from quotes where id=r.entity_id and user_id=p_user));
$$;

create function appeal_document(p_user uuid,p_appeal uuid,p_staff boolean default false)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('id',a.id,'user_id',a.user_id,'report_id',a.report_id,'reason',a.reason,'content_type',a.content_type,'status',a.status,'created_at',a.created_at,'reviewer_note',a.reviewer_note,'reviewed_at',a.reviewed_at,
   'user',jsonb_build_object('username',u.username,'display_name',u.display_name),'action',appeal_action_document(a.user_id,a.report_id),
   'can_review',p_staff and a.status='pending' and a.user_id<>p_user and coalesce(r.moderator_id<>p_user,true) and(r.entity_type is distinct from 'user' or r.status<>'removed' or exists(select 1 from users where id=p_user and is_admin)))
 from appeals a join users u on u.id=a.user_id left join content_reports r on r.id=a.report_id where a.id=p_appeal and(a.user_id=p_user or p_staff);
$$;

create function appeal_catalog_snapshot(p_user uuid,p_scope text default 'mine',p_status text default 'pending',p_at timestamptz default null,p_id uuid default null,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare staff boolean;
begin
  select is_admin or is_moderator into staff from users where id=p_user and not is_banned and deleted_at is null;
  if not found or p_scope='queue' and not staff then raise exception 'Account unavailable' using errcode='P1003';end if;
  if p_scope not in('mine','queue','actions') or p_status not in('pending','approved','rejected','all') then raise exception 'Invalid catalog' using errcode='P1004';end if;
  if p_scope='actions' then
    return(with page as materialized(select r.id,coalesce(r.resolved_at,r.created_at) as created_at from content_reports r where r.status in('removed','warned')
      and(r.entity_type='user' and r.entity_id=p_user or r.entity_type='review' and exists(select 1 from reviews where id=r.entity_id and user_id=p_user) or r.entity_type='quote' and exists(select 1 from quotes where id=r.entity_id and user_id=p_user))
      and(p_at is null or(coalesce(r.resolved_at,r.created_at),r.id)<(p_at,p_id)) order by coalesce(r.resolved_at,r.created_at) desc,r.id desc limit greatest(1,least(coalesce(p_limit,20),50))+1)
      select jsonb_build_object('actions',coalesce((select jsonb_agg(appeal_action_document(p_user,id) order by created_at desc,id desc) from page),'[]'::jsonb)));
  end if;
  return(with page as materialized(select a.id,a.created_at from appeals a where(case when p_scope='mine' then a.user_id=p_user else(p_status='all' or a.status=p_status)end)
    and(p_at is null or case when p_scope='queue' then(a.created_at,a.id)>(p_at,p_id)else(a.created_at,a.id)<(p_at,p_id)end)
    order by case when p_scope='queue' then a.created_at end asc,case when p_scope='queue' then a.id end asc,case when p_scope='mine' then a.created_at end desc,a.id desc limit greatest(1,least(coalesce(p_limit,20),50))+1)
    select jsonb_build_object('appeals',coalesce((select jsonb_agg(appeal_document(p_user,id,p_scope='queue') order by case when p_scope='queue' then created_at end asc,case when p_scope='queue' then id end asc,case when p_scope='mine' then created_at end desc,id desc) from page),'[]'::jsonb)));
end $$;
revoke all on function appeal_action_document(uuid,uuid),appeal_document(uuid,uuid,boolean),appeal_catalog_snapshot(uuid,text,text,timestamptz,uuid,integer) from public,anon,authenticated;
grant execute on function appeal_catalog_snapshot(uuid,text,text,timestamptz,uuid,integer) to service_role;
notify pgrst,'reload schema';

create function appeal_receipt_snapshot(p_user uuid,p_key text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare receipt jsonb;
begin
  if not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null) then raise exception 'Account unavailable' using errcode='P1003';end if;
  select response into receipt from content_intents where actor_id=p_user and action='appeals' and intent_key=p_key;
  if receipt is null then raise exception 'Receipt unavailable' using errcode='P1005';end if;
  return receipt;
end $$;
revoke all on function appeal_receipt_snapshot(uuid,text) from public,anon,authenticated;
grant execute on function appeal_receipt_snapshot(uuid,text) to service_role;
notify pgrst,'reload schema';
