create index writer_question_cursor on ask_writer_questions(created_at desc,id desc) include(user_id);
create index writer_answer_cursor on ask_writer_answers(question_id,created_at desc,id desc) include(user_id);

create function guard_writer_answer()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from users where id=new.user_id and not is_banned and deleted_at is null and(is_verified_author or xp>1000)) then raise exception 'Verified author or more than 1000 XP required' using errcode='P1003';end if;
  if not exists(select 1 from ask_writer_questions q join users u on u.id=q.user_id where q.id=new.question_id and not u.is_banned and u.deleted_at is null) then raise exception 'Question unavailable' using errcode='P1005';end if;
  if length(btrim(new.answer)) not between 20 and 5000 then raise exception 'Invalid answer' using errcode='P1004';end if;
  new.answer:=btrim(new.answer);return new;
end $$;
create trigger writer_answer_guard before insert on ask_writer_answers for each row execute function guard_writer_answer();

create function guard_writer_best_answer()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.best_answer_id is not null and not exists(select 1 from ask_writer_answers a join users u on u.id=a.user_id join users asker on asker.id=new.user_id where a.id=new.best_answer_id and a.question_id=new.id and not u.is_banned and u.deleted_at is null and not asker.is_banned and asker.deleted_at is null) then raise exception 'Answer unavailable' using errcode='P1005';end if;
  return new;
end $$;
create trigger writer_best_answer_guard before update of best_answer_id on ask_writer_questions for each row execute function guard_writer_best_answer();

create function notify_writer_question()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare recipient uuid;actor uuid;target uuid;question_text text;actor_name text;fact text;legacy text;
begin
  if tg_table_name='ask_writer_answers' then
    select user_id,id,question into recipient,target,question_text from ask_writer_questions where id=new.question_id;
    actor:=new.user_id;fact:='writerAnswer';legacy:='A writer answered your question.';
  else
    if new.best_answer_id is null or new.best_answer_id is not distinct from old.best_answer_id then return new;end if;
    select user_id into recipient from ask_writer_answers where id=new.best_answer_id;
    actor:=new.user_id;target:=new.id;question_text:=new.question;fact:='writerBestAnswer';legacy:='Your answer was selected as the best answer.';
  end if;
  if recipient is not null and recipient<>actor then
    select display_name into actor_name from users where id=actor;
    insert into notifications(user_id,type,actor_id,entity_type,entity_id,message,message_key,message_values) values(recipient,'reply',actor,'writer_question',target,legacy,fact,jsonb_build_object('name',actor_name,'content',question_text));
  end if;
  return new;
end $$;
create trigger writer_answer_notification after insert on ask_writer_answers for each row execute function notify_writer_question();
create trigger writer_best_notification after update of best_answer_id on ask_writer_questions for each row execute function notify_writer_question();

create function writer_question_catalog(p_filter text,p_cursor jsonb default null,p_limit integer default 20)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  with visible as materialized(
    select q.id,q.user_id,q.question,q.tags,q.created_at,(select count(*) from ask_writer_answers a join users answerer on answerer.id=a.user_id where a.question_id=q.id and not answerer.is_banned and answerer.deleted_at is null) as answer_count,
      jsonb_build_object('id',u.id,'username',u.username,'display_name',u.display_name,'avatar_url',u.avatar_url,'is_verified_author',u.is_verified_author) as author
    from ask_writer_questions q join users u on u.id=q.user_id where not u.is_banned and u.deleted_at is null
  ), filtered as materialized(select * from visible where p_filter<>'unanswered' or answer_count=0),page as(
    select * from filtered where p_cursor is null or(case when p_filter='most_answered' then(answer_count,created_at,id)<((p_cursor->>'count')::bigint,(p_cursor->>'at')::timestamptz,(p_cursor->>'id')::uuid) else(created_at,id)<((p_cursor->>'at')::timestamptz,(p_cursor->>'id')::uuid) end)
    order by case when p_filter='most_answered' then answer_count end desc,created_at desc,id desc limit greatest(1,least(coalesce(p_limit,20),50))+1
  )select jsonb_build_object('total',(select count(*) from filtered),'questions',coalesce((select jsonb_agg(to_jsonb(page) order by case when p_filter='most_answered' then answer_count end desc,created_at desc,id desc) from page),'[]'::jsonb));
$$;

create function writer_question_thread(p_question uuid,p_viewer uuid default null,p_before timestamptz default null,p_id uuid default null,p_limit integer default 20)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  with question as(select q.*,jsonb_build_object('id',u.id,'username',u.username,'display_name',u.display_name,'avatar_url',u.avatar_url,'is_verified_author',u.is_verified_author) as author from ask_writer_questions q join users u on u.id=q.user_id where q.id=p_question and not u.is_banned and u.deleted_at is null),
  visible_answers as not materialized(select a.*,jsonb_build_object('id',u.id,'username',u.username,'display_name',u.display_name,'avatar_url',u.avatar_url,'is_verified_author',u.is_verified_author) as author from ask_writer_answers a join users u on u.id=a.user_id where a.question_id=p_question and not u.is_banned and u.deleted_at is null),
  page as(select * from visible_answers where id is distinct from(select best_answer_id from question) and(p_before is null or(created_at,id)<(p_before,p_id)) order by created_at desc,id desc limit greatest(1,least(coalesce(p_limit,20),50))+1)
  select jsonb_build_object('question',jsonb_build_object('id',q.id,'user_id',q.user_id,'question',q.question,'tags',q.tags,'created_at',q.created_at,'author',q.author,'answer_count',(select count(*) from visible_answers)),
    'bestAnswer',(select to_jsonb(a) from visible_answers a where a.id=q.best_answer_id),
    'answers',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,id desc) from page),'[]'::jsonb),
    'actorId',p_viewer,'isOwner',coalesce(q.user_id=p_viewer,false),
    'canAnswer',exists(select 1 from users where id=p_viewer and not is_banned and deleted_at is null and(is_verified_author or xp>1000))) from question q;
$$;
revoke all on ask_writer_questions,ask_writer_answers from public,anon,authenticated;
grant select,insert,update,delete on ask_writer_questions,ask_writer_answers to service_role;
revoke all on function guard_writer_answer(),guard_writer_best_answer(),notify_writer_question(),writer_question_catalog(text,jsonb,integer),writer_question_thread(uuid,uuid,timestamptz,uuid,integer) from public,anon,authenticated;
grant execute on function writer_question_catalog(text,jsonb,integer),writer_question_thread(uuid,uuid,timestamptz,uuid,integer) to service_role;
notify pgrst,'reload schema';
