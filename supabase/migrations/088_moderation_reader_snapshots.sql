create index reports_queue_cursor on content_reports(status,created_at desc,id desc);
create index reports_all_cursor on content_reports(created_at desc,id desc);
create index moderation_log_cursor on moderation_log(created_at desc,id desc);

create function moderation_report_document(p_actor uuid,p_report uuid,p_admin boolean)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select (to_jsonb(r)-'idempotency_key'-'request_hash')||jsonb_build_object(
    'reporter',jsonb_build_object('username',reporter.username,'display_name',reporter.display_name),
    'moderator',case when moderator.id is null then null else jsonb_build_object('username',moderator.username,'display_name',moderator.display_name)end,
    'target',jsonb_build_object('owner_id',owner.id,'username',owner.username,'display_name',owner.display_name,'label',coalesce(b.title,owner.display_name),'content',left(coalesce(v.content,q.content,owner.bio),2000)),
    'allowed_actions',case when r.status not in('pending','escalated') or owner.id=p_actor or r.status='escalated' and not p_admin then '[]'::jsonb
      else jsonb_build_array('approve')||case when r.entity_type in('review','quote') and owner.id is not null or r.entity_type='user' and p_admin and owner.id is not null then '["remove"]'::jsonb else '[]'::jsonb end||case when owner.id is not null then '["warn"]'::jsonb else '[]'::jsonb end||case when r.status='pending' then '["escalate"]'::jsonb else '[]'::jsonb end end)
  from content_reports r join users reporter on reporter.id=r.reporter_id left join users moderator on moderator.id=r.moderator_id
    left join reviews v on r.entity_type='review' and v.id=r.entity_id left join quotes q on r.entity_type='quote' and q.id=r.entity_id
    left join users owner on owner.id=case r.entity_type when 'user' then r.entity_id when 'review' then v.user_id when 'quote' then q.user_id end
    left join books b on b.id=coalesce(v.book_id,q.book_id) where r.id=p_report;
$$;

create function moderation_catalog_snapshot(p_user uuid,p_scope text,p_status text default 'pending',p_at timestamptz default null,p_id uuid default null,p_limit integer default 20,p_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare admin boolean;staff boolean;
begin
  select is_admin,is_admin or is_moderator into admin,staff from users where id=p_user and not is_banned and deleted_at is null;
  if not found or not staff or p_scope='log' and not admin then raise exception 'Moderation access required' using errcode='P1003';end if;
  if p_scope is null or p_scope not in('reports','log','dashboard') or p_status is null or p_status not in('pending','approved','removed','warned','escalated','all') or p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset not between 0 and 200000 or (p_at is null)<>(p_id is null) then raise exception 'Invalid moderation page' using errcode='P1004';end if;
  if p_scope='dashboard' then return jsonb_build_object('isAdmin',admin,'pending',(select count(*)from content_reports where status='pending'),'today',(select count(*)from content_reports where created_at>=date_trunc('day',now()at time zone 'UTC')at time zone 'UTC'));end if;
  if p_scope='reports' then
    return jsonb_build_object('total',(select count(*)from content_reports where p_status='all' or status=p_status),'rows',coalesce((select jsonb_agg(jsonb_build_object('item',moderation_report_document(p_user,id,admin),'at',created_at,'key',id)order by created_at desc,id desc)from(select id,created_at from content_reports where(p_status='all' or status=p_status)and(p_at is null or(created_at,id)<(p_at,p_id))order by created_at desc,id desc limit p_limit+1 offset p_offset)page),'[]'::jsonb));
  end if;
  return jsonb_build_object('total',(select count(*)from moderation_log),'rows',coalesce((select jsonb_agg(jsonb_build_object('item',to_jsonb(page)||jsonb_build_object('moderator',case when u.id is null then null else jsonb_build_object('username',u.username,'display_name',u.display_name)end,'target',case when target.id is null then null else jsonb_build_object('username',target.username,'display_name',target.display_name)end),'at',page.created_at,'key',page.id)order by page.created_at desc,page.id desc)from(select * from moderation_log where p_at is null or(created_at,id)<(p_at,p_id)order by created_at desc,id desc limit p_limit+1 offset p_offset)page left join users u on u.id=page.moderator_id left join content_reports r on r.id=page.report_id left join reviews v on r.entity_type='review' and v.id=r.entity_id left join quotes q on r.entity_type='quote' and q.id=r.entity_id left join users target on target.id=coalesce(page.target_user_id,case r.entity_type when 'user' then r.entity_id when 'review' then v.user_id when 'quote' then q.user_id end)),'[]'::jsonb));
end $$;

create function moderation_receipt_snapshot(p_user uuid,p_report uuid,p_key text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare receipt jsonb;
begin
  if not exists(select 1 from users where id=p_user and(is_admin or is_moderator)and not is_banned and deleted_at is null)then raise exception 'Moderation access required' using errcode='P1003';end if;
  select response into receipt from content_intents where actor_id=p_user and action='report_review' and intent_key=p_key and response->'report'->>'id'=p_report::text;
  if receipt is null then raise exception 'Receipt unavailable' using errcode='P1005';end if;
  return receipt;
end $$;
revoke all on function moderation_report_document(uuid,uuid,boolean),moderation_catalog_snapshot(uuid,text,text,timestamptz,uuid,integer,integer),moderation_receipt_snapshot(uuid,uuid,text) from public,anon,authenticated;
grant execute on function moderation_catalog_snapshot(uuid,text,text,timestamptz,uuid,integer,integer),moderation_receipt_snapshot(uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
