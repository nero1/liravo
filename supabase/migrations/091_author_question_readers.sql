create index author_qa_answer_cursor on author_qa(author_id,coalesce(answered_at,created_at) desc,id desc)where is_public and answer is not null;
create function author_question_snapshot(p_author uuid,p_at timestamptz default null,p_id uuid default null,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from users where id=p_author and(is_verified_author or 'author'=any(user_types))and not is_banned and deleted_at is null)then raise exception 'Author unavailable' using errcode='P1005';end if;
 if p_limit is null or p_limit not between 1 and 50 or(p_at is null)<>(p_id is null)then raise exception 'Invalid question page' using errcode='P1004';end if;
 return jsonb_build_object('total',(select count(*)from author_qa where author_id=p_author and is_public and answer is not null),'qa',coalesce((select jsonb_agg(jsonb_build_object('id',id,'author_id',author_id,'asked_by',asked_by,'question',question,'answer',answer,'created_at',created_at,'answered_at',answered_at,'cursor_at',coalesce(answered_at,created_at))order by coalesce(answered_at,created_at) desc,id desc)from(select * from author_qa where author_id=p_author and is_public and answer is not null and(p_at is null or(coalesce(answered_at,created_at),id)<(p_at,p_id))order by coalesce(answered_at,created_at) desc,id desc limit p_limit+1)page),'[]'::jsonb));
end $$;
create function content_creation_receipt_snapshot(p_user uuid,p_action text,p_key text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare receipt jsonb;
begin
 if not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null)then raise exception 'Account unavailable' using errcode='P1003';end if;
 if p_action is null or p_action not in('shelves','author_qa')or p_key is null or length(p_key)not between 8 and 200 then raise exception 'Invalid receipt' using errcode='P1004';end if;
 select response into receipt from content_intents where actor_id=p_user and action=p_action and intent_key=p_key;
 if receipt is null then raise exception 'Receipt unavailable' using errcode='P1005';end if;
 return receipt;
end $$;
revoke all on function author_question_snapshot(uuid,timestamptz,uuid,integer),content_creation_receipt_snapshot(uuid,text,text)from public,anon,authenticated;
grant execute on function author_question_snapshot(uuid,timestamptz,uuid,integer),content_creation_receipt_snapshot(uuid,text,text)to service_role;
notify pgrst,'reload schema';
