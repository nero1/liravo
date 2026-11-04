create index author_qa_owner_cursor on author_qa(author_id,created_at desc,id desc);
create function author_answer_has_text(p_answer text)
returns boolean language sql immutable set search_path=public,pg_temp as $$
 select length(regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(p_answer,''),'<[^>]*>','','g'),'&(?:nbsp|#0*160|#x0*a0);','','gi'),U&'[\00A0\200B\200C\200D\2060\FEFF]','','g'),'[[:space:]]','','g'))>0;
$$;
update author_qa set answer=null,answered_at=null where answer is not null and not author_answer_has_text(answer);
create function guard_author_answer_text()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if new.answer is not null and(not author_answer_has_text(new.answer)or length(new.answer)>2000)then raise exception 'Invalid answer' using errcode='P1004';end if;
 return new;
end $$;
create trigger author_answer_text_guard before insert or update of answer on author_qa for each row execute function guard_author_answer_text();
create function author_question_owner_snapshot(p_user uuid,p_state text default 'all',p_at timestamptz default null,p_id uuid default null,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null and(is_verified_author or 'author'=any(user_types)))then raise exception 'Author access required' using errcode='P1003';end if;
 if p_state is null or p_state not in('all','unanswered','answered')or p_limit is null or p_limit not between 1 and 50 or(p_at is null)<>(p_id is null)then raise exception 'Invalid question page' using errcode='P1004';end if;
 return jsonb_build_object('total',(select count(*)from author_qa where author_id=p_user),'unanswered',(select count(*)from author_qa where author_id=p_user and answer is null),'answered',(select count(*)from author_qa where author_id=p_user and answer is not null),'qa',coalesce((
 select jsonb_agg(to_jsonb(q)order by q.created_at desc,q.id desc)from(select id,author_id,asked_by,question,answer,created_at,answered_at,is_public from author_qa where author_id=p_user and(p_state='all'or(answer is null)=(p_state='unanswered'))and(p_at is null or(created_at,id)<(p_at,p_id))order by created_at desc,id desc limit p_limit+1)q),'[]'::jsonb));
end $$;
alter function apply_community_intent(uuid,text,uuid,text,jsonb,text)rename to apply_community_intent_before095;
create function apply_community_intent(p_actor_id uuid,p_action text,p_target uuid,p_key text,p_payload jsonb,p_correlation_id text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare result jsonb;legacy boolean;
begin
 if p_action='author_answer'then
  perform 1 from users where id=p_actor_id or id in(select asked_by from author_qa where id=p_target)order by id for update;
  if not exists(select 1 from users where id=p_actor_id and not is_banned and deleted_at is null and(is_verified_author or 'author'=any(user_types)))then raise exception 'Author access required' using errcode='P1003';end if;
  select exists(select 1 from content_intents where actor_id=p_actor_id and action=p_action and intent_key=p_key)into legacy;
 end if;
 result:=apply_community_intent_before095(p_actor_id,p_action,p_target,p_key,p_payload,p_correlation_id);
 if p_action<>'author_answer'or result?'qa'then return result;end if;
 if legacy then return result||jsonb_build_object('actorId',p_actor_id,'legacy',true);end if;
 result:=result||jsonb_build_object('actorId',p_actor_id,'requestKey',p_key,'qa',(select jsonb_build_object('id',id,'author_id',author_id,'asked_by',asked_by,'question',question,'answer',answer,'created_at',created_at,'answered_at',answered_at,'is_public',is_public)from author_qa where id=p_target and author_id=p_actor_id));
 update content_intents set response=result where actor_id=p_actor_id and action=p_action and intent_key=p_key;
 return result;
end $$;
create function author_answer_receipt_snapshot(p_user uuid,p_question uuid,p_key text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null and(is_verified_author or 'author'=any(user_types)))then raise exception 'Author access required' using errcode='P1003';end if;
 if p_question is null or p_key is null or length(p_key)not between 8 and 200 then raise exception 'Invalid receipt' using errcode='P1004';end if;
 select response into result from content_intents where actor_id=p_user and action='author_answer'and intent_key=p_key;
 if result is null or result->'qa'->>'id'is distinct from p_question::text or result->'qa'->>'author_id'is distinct from p_user::text then raise exception 'Receipt unavailable' using errcode='P1005';end if;
 return result;
end $$;
revoke all on function author_answer_has_text(text),guard_author_answer_text(),author_question_owner_snapshot(uuid,text,timestamptz,uuid,integer),apply_community_intent_before095(uuid,text,uuid,text,jsonb,text),apply_community_intent(uuid,text,uuid,text,jsonb,text),author_answer_receipt_snapshot(uuid,uuid,text)from public,anon,authenticated;
revoke all on function apply_community_intent_before095(uuid,text,uuid,text,jsonb,text)from service_role;
grant execute on function author_question_owner_snapshot(uuid,text,timestamptz,uuid,integer),apply_community_intent(uuid,text,uuid,text,jsonb,text),author_answer_receipt_snapshot(uuid,uuid,text)to service_role;
notify pgrst,'reload schema';
