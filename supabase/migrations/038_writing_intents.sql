alter table writing_challenges add column if not exists goal_type text not null default 'submission_count' check(goal_type in ('word_count','submission_count'));
alter table writing_challenges add column if not exists goal_value integer not null default 1 check(goal_value>0);
alter table writing_challenges add column if not exists participant_count integer not null default 0;
create table if not exists writing_challenge_participants (
  challenge_id uuid not null references writing_challenges(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key(challenge_id,user_id)
);
create unique index if not exists writing_participant_identity on writing_challenge_participants(challenge_id,user_id);
alter table writing_challenge_participants enable row level security;
create policy writing_participants_read on writing_challenge_participants for select using(true);
revoke all on writing_challenge_participants from public,anon,authenticated;
grant select on writing_challenge_participants to anon,authenticated,service_role;
update writing_challenges c set participant_count=(select count(*) from writing_challenge_participants p where p.challenge_id=c.id);
create index if not exists best_answer_reward_events on xp_ledger(event_key) where reason='best_answer_chosen';

create function count_writing_participants()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='INSERT' then
    update writing_challenges set participant_count=participant_count+1 where id=new.challenge_id;
    return new;
  end if;
  update writing_challenges set participant_count=greatest(0,participant_count-1) where id=old.challenge_id;
  return old;
end $$;
create trigger writing_participants_count after insert or delete on writing_challenge_participants for each row execute function count_writing_participants();

create function apply_writing_intent(p_user_id uuid,p_kind text,p_target uuid,p_key text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare previous content_intents; fingerprint text; result jsonb; prompt writing_prompts; challenge writing_challenges;
  entry writing_challenge_submissions; question ask_writer_questions; answer ask_writer_answers;
  target_author uuid; body text; title text; words integer; wanted boolean; changed boolean; current_voted boolean;
begin
  if p_user_id is null or p_target is null or p_key is null or p_kind is null or p_payload is null or jsonb_typeof(p_payload)<>'object'
    or length(p_key) not between 8 and 200 or p_kind not in ('prompt','challenge','join','vote','best_answer') then
    raise exception 'Invalid writing intent' using errcode='P1004';
  end if;
  fingerprint:=encode(sha256(convert_to(jsonb_build_object('target',p_target,'payload',p_payload)::text,'UTF8')),'hex');
  select * into previous from content_intents where actor_id=p_user_id and action='writing:'||p_kind and intent_key=p_key;
  if found then
    if previous.fingerprint<>fingerprint then raise exception 'Conflicting writing intent' using errcode='P1001'; end if;
    return previous.response;
  end if;
  if p_kind='best_answer' then
    select user_id into target_author from ask_writer_answers where id=(p_payload->>'answer_id')::uuid and question_id=p_target;
  end if;
  perform 1 from users where id in (p_user_id,target_author) order by id for update;
  select * into previous from content_intents where actor_id=p_user_id and action='writing:'||p_kind and intent_key=p_key;
  if found then
    if previous.fingerprint<>fingerprint then raise exception 'Conflicting writing intent' using errcode='P1001'; end if;
    return previous.response;
  end if;

  if p_kind in ('prompt','challenge') then
    body:=btrim(p_payload->>'content');
    if body is null or length(body) not between 1 and 50000 then raise exception 'Invalid writing content' using errcode='P1004'; end if;
    words:=cardinality(regexp_split_to_array(body,'\s+'));
  end if;
  if p_kind='prompt' then
    if length(body) not between 50 and 2000 then raise exception 'Prompt response must contain 50–2000 characters' using errcode='P1004'; end if;
    select * into prompt from writing_prompts where id=p_target for share;
    if not found or not prompt.is_active or prompt.prompt_date>(now() at time zone 'UTC')::date then raise exception 'Prompt unavailable' using errcode='P1005'; end if;
    if exists(select 1 from writing_prompt_submissions where prompt_id=p_target and user_id=p_user_id) then raise exception 'Already submitted for this prompt' using errcode='P1001'; end if;
    insert into writing_prompt_submissions(user_id,prompt_id,content,word_count) values(p_user_id,p_target,body,words) returning to_jsonb(writing_prompt_submissions.*) into result;
    perform award_xp_once(p_user_id,10,'prompt_submission','prompt:'||p_target::text);
    perform increment_streak_atomic(p_user_id,'writing');
  elsif p_kind in ('challenge','join') then
    select * into challenge from writing_challenges where id=p_target for update;
    if not found then raise exception 'Challenge not found' using errcode='P1005'; end if;
    if not challenge.is_active or challenge.start_date>now() or challenge.end_date<now() then raise exception 'Challenge unavailable' using errcode='P1001'; end if;
    if p_kind='join' then
      insert into writing_challenge_participants(challenge_id,user_id) values(p_target,p_user_id) on conflict do nothing;
      select jsonb_build_object('success',true,'participant_count',participant_count) into result from writing_challenges where id=p_target;
    else
      title:=btrim(p_payload->>'title');
      if title is null or length(title) not between 1 and 200 then raise exception 'Invalid entry title' using errcode='P1004'; end if;
      select * into entry from writing_challenge_submissions where challenge_id=p_target and user_id=p_user_id for update;
      changed:=not found or entry.content is distinct from body or entry.title is distinct from title;
      insert into writing_challenge_participants(challenge_id,user_id) values(p_target,p_user_id) on conflict do nothing;
      insert into writing_challenge_submissions(user_id,challenge_id,title,content,body,word_count)
        values(p_user_id,p_target,title,body,body,words) on conflict(challenge_id,user_id) do update
        set title=excluded.title,content=excluded.content,body=excluded.body,word_count=excluded.word_count
        returning to_jsonb(writing_challenge_submissions.*) into result;
      perform award_xp_once(p_user_id,25,'challenge_submission','challenge:'||p_target::text);
      if changed then perform increment_streak_atomic(p_user_id,'writing'); end if;
    end if;
  elsif p_kind='vote' then
    select * into entry from writing_challenge_submissions where id=p_target for update;
    if not found then raise exception 'Submission not found' using errcode='P1005'; end if;
    if entry.user_id=p_user_id then raise exception 'Cannot vote on your own submission' using errcode='P1004'; end if;
    if jsonb_typeof(p_payload->'voted') is distinct from 'boolean' then raise exception 'Invalid vote' using errcode='P1004'; end if;
    wanted:=(p_payload->>'voted')::boolean;
    select exists(select 1 from writing_challenge_votes where user_id=p_user_id and submission_id=p_target) into current_voted;
    if wanted and not current_voted then
      insert into writing_challenge_votes(user_id,submission_id) values(p_user_id,p_target);
      update writing_challenge_submissions set community_votes=community_votes+1 where id=p_target;
    elsif not wanted and current_voted then
      delete from writing_challenge_votes where user_id=p_user_id and submission_id=p_target;
      update writing_challenge_submissions set community_votes=greatest(0,community_votes-1) where id=p_target;
    end if;
    select jsonb_build_object('voted',wanted,'community_votes',community_votes) into result from writing_challenge_submissions where id=p_target;
  else
    select * into answer from ask_writer_answers where id=(p_payload->>'answer_id')::uuid and question_id=p_target for share;
    if not found then raise exception 'Answer not found for this question' using errcode='P1005'; end if;
    select * into question from ask_writer_questions where id=p_target for update;
    if not found then raise exception 'Question not found' using errcode='P1005'; end if;
    if question.user_id<>p_user_id then raise exception 'Not your question' using errcode='P1003'; end if;
    if question.best_answer_id is not null and question.best_answer_id<>answer.id then raise exception 'Best answer already selected' using errcode='P1001'; end if;
    update ask_writer_questions set best_answer_id=answer.id where id=question.id;
    if answer.user_id<>p_user_id and not exists(select 1 from xp_ledger where reason='best_answer_chosen' and event_key='best-answer:'||question.id::text) then
      perform award_xp_once(answer.user_id,20,'best_answer_chosen','best-answer:'||question.id::text);
    end if;
    result:=jsonb_build_object('ok',true);
  end if;
  insert into content_intents(actor_id,action,intent_key,fingerprint,response) values(p_user_id,'writing:'||p_kind,p_key,fingerprint,result);
  return result;
end $$;
revoke all on function apply_writing_intent(uuid,text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function apply_writing_intent(uuid,text,uuid,text,jsonb) to service_role;
revoke all on function increment_challenge_vote(uuid,integer) from public,anon,authenticated,service_role;

create function publish_writing_prompt(p_date date,p_text text,p_theme text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare prompt writing_prompts;
begin
  if p_date is null or p_text is null or length(p_text) not between 10 and 500 or length(p_theme)>100 then raise exception 'Invalid daily prompt' using errcode='P1004'; end if;
  perform pg_advisory_xact_lock(hashtextextended('writing-prompt:'||p_date::text,0));
  select * into prompt from writing_prompts where prompt_date=p_date order by created_at,id limit 1 for update;
  if found then return jsonb_build_object('prompt',to_jsonb(prompt),'created',false); end if;
  insert into writing_prompts(prompt_date,prompt_text,topic_seed,is_active) values(p_date,p_text,p_theme,true) returning * into prompt;
  return jsonb_build_object('prompt',to_jsonb(prompt),'created',true);
end $$;
revoke all on function publish_writing_prompt(date,text,text) from public,anon,authenticated;
grant execute on function publish_writing_prompt(date,text,text) to service_role;
