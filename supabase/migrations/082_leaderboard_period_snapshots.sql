alter table review_helpfulness_votes add column cast_at timestamptz;
update review_helpfulness_votes set cast_at=created_at;
alter table review_helpfulness_votes alter column cast_at set not null;
create function stamp_helpfulness_vote()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if tg_op='INSERT' then new.cast_at:=coalesce(new.cast_at,new.created_at,clock_timestamp());
  elsif new.is_helpful is distinct from old.is_helpful then new.cast_at:=clock_timestamp();
  else new.cast_at:=old.cast_at;end if;
  return new;
end $$;
create trigger helpfulness_vote_time before insert or update on review_helpfulness_votes for each row execute function stamp_helpfulness_vote();
revoke all on function stamp_helpfulness_vote() from public,anon,authenticated;

create index xp_ledger_period_user on xp_ledger(created_at,user_id) include(amount);
create index helpfulness_period_review on review_helpfulness_votes(cast_at,review_id) where is_helpful;

create function leaderboard_snapshot(p_user uuid,p_type text default 'global',p_period text default 'weekly',p_country text default null,p_limit integer default 50,p_now timestamptz default now())
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare start_at timestamptz;end_at timestamptz;target_country text;
begin
  if p_type not in('global','national','friends','reviewers') or p_period not in('weekly','monthly','alltime') then raise exception 'Invalid leaderboard' using errcode='P1004';end if;
  if p_user is not null and not exists(select 1 from users where id=p_user and not is_banned and deleted_at is null) then raise exception 'Account unavailable' using errcode='P1003';end if;
  if p_type in('national','friends') and p_user is null then raise exception 'Account required' using errcode='P1003';end if;
  if p_type='national' then
    target_country:=upper(coalesce(p_country,(select u.country from users u where u.id=p_user)));
    if target_country is not null and target_country!~'^[A-Z]{2}$' then raise exception 'Invalid country' using errcode='P1004';end if;
  end if;
  if p_period<>'alltime' then
    start_at:=date_trunc(case when p_period='weekly' then 'week' else 'month' end,p_now at time zone 'UTC') at time zone 'UTC';
    end_at:=((start_at at time zone 'UTC')+case when p_period='weekly' then interval '1 week' else interval '1 month' end) at time zone 'UTC';
  end if;
  return(with candidates as materialized(select u.id,u.username,u.display_name,u.avatar_url,u.xp as lifetime_xp from users u
    where not u.is_banned and u.deleted_at is null and(u.profile_visibility='public' or u.id=p_user or exists(select 1 from follows where follower_id=p_user and following_id=u.id))
    and(p_type<>'national' or upper(u.country)=target_country)and(p_type<>'friends' or u.id=p_user or exists(select 1 from follows where follower_id=p_user and following_id=u.id))),
    period_xp as materialized(select x.user_id,sum(x.amount) as amount from xp_ledger x join candidates c on c.id=x.user_id where start_at is not null and x.created_at>=start_at and x.created_at<end_at and x.created_at<=p_now group by x.user_id),
    review_scores as materialized(select r.user_id,count(*) as helpful_votes,count(distinct r.id) as review_count from reviews r join candidates c on c.id=r.user_id join review_helpfulness_votes v on v.review_id=r.id and v.is_helpful
      where p_type='reviewers' and r.moderation_status='published' and not r.is_hidden and(start_at is null or v.cast_at>=start_at and v.cast_at<end_at and v.cast_at<=p_now) group by r.user_id),
    scores as(select c.*,case when p_type='reviewers' then coalesce(r.helpful_votes,0) when p_period='alltime' then c.lifetime_xp else coalesce(x.amount,0)end as score,
      case when p_period='alltime' then c.lifetime_xp else coalesce(x.amount,0)end as xp,coalesce(r.helpful_votes,0) as helpful_votes,coalesce(r.review_count,0) as review_count from candidates c left join period_xp x on x.user_id=c.id left join review_scores r on r.user_id=c.id where p_type<>'reviewers' or r.helpful_votes>0),
    ranked as(select row_number() over(order by score desc,id) as rank,* from scores),page as(select * from ranked order by rank limit greatest(1,least(coalesce(p_limit,50),100)))
    select jsonb_build_object('leaderboard',coalesce((select jsonb_agg(to_jsonb(page)-'score' order by rank) from page),'[]'::jsonb),'type',p_type,'period',p_period,'periodStart',start_at,'periodEnd',end_at,'country',target_country,'generatedAt',p_now));
end $$;
revoke all on function leaderboard_snapshot(uuid,text,text,text,integer,timestamptz) from public,anon,authenticated;
grant execute on function leaderboard_snapshot(uuid,text,text,text,integer,timestamptz) to service_role;
notify pgrst,'reload schema';
