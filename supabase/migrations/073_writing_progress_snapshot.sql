create or replace function writing_progress_snapshot(p_user_id uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  with entries as materialized (
    select 'prompt' as kind,coalesce(word_count,0) as words,created_at as submitted_at from writing_prompt_submissions where user_id=p_user_id
    union all
    select 'challenge',coalesce(word_count,0),submitted_at from writing_challenge_submissions where user_id=p_user_id
  ), weeks as (
    select (date_trunc('week',now() at time zone 'UTC')::date-7*n)::date as week_start from generate_series(0,6) n
  ), weekly as (
    select w.week_start,coalesce(sum(e.words),0) as words from weeks w left join entries e
      on e.submitted_at>=w.week_start::timestamp at time zone 'UTC'
      and e.submitted_at<(w.week_start+7)::timestamp at time zone 'UTC'
    group by w.week_start
  )
  select jsonb_build_object(
    'total_words',coalesce((select sum(words) from entries),0),
    'prompts_completed',(select count(*) from entries where kind='prompt'),
    'challenges_completed',(select count(*) from entries where kind='challenge'),
    'workshop_critiques',(select count(*) from workshop_feedback where user_id=p_user_id),
    'writing_streak',u.writing_streak,'xp',u.xp,
    'weekly_words',(select jsonb_agg(jsonb_build_object('week_start',week_start,'words',words) order by week_start) from weekly),
    'badges',coalesce((select jsonb_agg(jsonb_build_object('badge_id',badge_id,'awarded_at',awarded_at) order by awarded_at desc,badge_id) from user_badges where user_id=p_user_id and badge_id in ('first_draft','workshop_regular','prompt_runner','craft_scholar','writing_streak_7','writing_streak_30','first_prompt','prolific_writer')),'[]'::jsonb))
  from users u where u.id=p_user_id and not u.is_banned and u.deleted_at is null;
$$;
revoke all on function writing_progress_snapshot(uuid) from public,anon,authenticated;
grant execute on function writing_progress_snapshot(uuid) to service_role;
notify pgrst,'reload schema';
