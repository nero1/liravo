create table review_conversions (
  actor_id uuid not null references users(id) on delete cascade,
  book_id uuid not null references books(id) on delete cascade,
  review_id uuid references reviews(id) on delete set null,
  reviewer_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(actor_id,book_id),
  check(reviewer_id is null or reviewer_id<>actor_id)
);
create index review_conversions_reviewer on review_conversions(reviewer_id,created_at desc) where reviewer_id is not null;
create index review_conversions_review on review_conversions(review_id) where review_id is not null;
create index review_conversions_week on review_conversions(created_at,reviewer_id) where reviewer_id is not null;
alter table review_conversions enable row level security;
revoke all on review_conversions from public,anon,authenticated;
grant select on review_conversions to service_role;

insert into review_conversions(actor_id,book_id,created_at)
  select sb.user_id,sb.book_id,min(sb.added_at) from shelf_books sb join shelves s on s.id=sb.shelf_id
  where s.user_id=sb.user_id and s.default_type='want_to_read' group by sb.user_id,sb.book_id on conflict do nothing;
insert into review_conversions(actor_id,book_id,created_at)
  select x.user_id,b.id,x.created_at from xp_ledger x join books b on x.event_key='want-to-read:'||b.id::text
  where x.reason='want_to_read' on conflict do nothing;

create function retain_want_to_read_decision()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if exists(select 1 from shelves where id=new.shelf_id and user_id=new.user_id and default_type='want_to_read') then
    insert into review_conversions(actor_id,book_id) values(new.user_id,new.book_id) on conflict do nothing;
  end if;
  return new;
end $$;
create trigger retain_want_to_read_decision after insert or update of shelf_id,book_id,user_id on shelf_books
  for each row execute function retain_want_to_read_decision();
revoke all on function retain_want_to_read_decision() from public,anon,authenticated;

create function read_creator_analytics(p_user_id uuid)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object(
    'follower_count',(select count(*) from follows where following_id=p_user_id),
    'review_count',(select count(*) from reviews where user_id=p_user_id and moderation_status='published' and not is_hidden),
    'want_to_read_triggered',(select count(*) from review_conversions where reviewer_id=p_user_id),
    'tips_received',(creator_balance(p_user_id,'USD')->>'tips')::numeric,
    'tips_received_by_currency',(select jsonb_object_agg(currency,(creator_balance(p_user_id,currency)->>'tips')::numeric) from unnest(array['USD','NGN','EUR']) currency)
  );
$$;

create function read_creator_leaderboard()
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
  with ranked as (
    select u.id as user_id,u.username,u.display_name,u.avatar_url,u.user_types,u.is_verified_author,count(*)::integer as want_to_read_score
    from review_conversions c join users u on u.id=c.reviewer_id
    where c.created_at>=(date_trunc('week',now() at time zone 'UTC') at time zone 'UTC')
      and not u.is_banned and u.deleted_at is null and u.profile_visibility='public'
      and (u.is_creator or u.is_verified_author or u.user_types&&array['creator','author'])
    group by u.id order by count(*) desc,u.username,u.id limit 50
  ) select jsonb_build_object('leaderboard',coalesce(jsonb_agg(to_jsonb(ranked)||jsonb_build_object('total_score',want_to_read_score)
    order by want_to_read_score desc,username,user_id),'[]'::jsonb),
    'week_start',date_trunc('week',now() at time zone 'UTC') at time zone 'UTC') from ranked;
$$;
revoke all on function read_creator_analytics(uuid),read_creator_leaderboard() from public,anon,authenticated;
grant execute on function read_creator_analytics(uuid),read_creator_leaderboard() to service_role;

create or replace function apply_book_interaction(p_user_id uuid,p_book_id uuid,p_action text,p_key text,p_review_id uuid default null,p_value boolean default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare previous content_intents; fingerprint text; result jsonb; shelf uuid; entry uuid; review reviews; old_vote boolean; active boolean; desired boolean; attributed integer;
begin
  if p_action not in ('reaction','helpfulness') or length(p_key) not between 8 and 200 or p_key is null then raise exception 'Invalid interaction'; end if;
  fingerprint:=jsonb_build_array(p_book_id,p_review_id,p_value)::text;
  perform 1 from users where id=p_user_id and not is_banned and deleted_at is null for update;
  if not found then raise exception 'Unknown actor' using errcode='P1003'; end if;
  select * into previous from content_intents where actor_id=p_user_id and action='book:'||p_action and intent_key=p_key;
  if found then
    if previous.fingerprint<>fingerprint then raise exception 'Conflicting interaction intent' using errcode='P1001'; end if;
    return previous.response;
  end if;
  perform 1 from books where id=p_book_id for update;
  if not found then raise exception 'Unknown book' using errcode='P1003'; end if;
  if p_action='reaction' then
    if p_review_id is not null then
      select r.* into review from reviews r join users u on u.id=r.user_id where r.id=p_review_id and r.book_id=p_book_id
        and r.user_id<>p_user_id and r.moderation_status='published' and not r.is_hidden and not u.is_banned and u.deleted_at is null
        and (u.profile_visibility='public' or (u.profile_visibility='followers_only' and exists(select 1 from follows where follower_id=p_user_id and following_id=u.id))) for update of r;
      if not found then raise exception 'Review unavailable' using errcode='P1003';end if;
    end if;
    select id into shelf from shelves where user_id=p_user_id and default_type='want_to_read';
    if not found then raise exception 'Missing shelf' using errcode='P1003'; end if;
    select id into entry from shelf_books where shelf_id=shelf and user_id=p_user_id and book_id=p_book_id;
    active:=found;desired:=coalesce(p_value,not active);
    if desired and not active then
      insert into review_conversions(actor_id,book_id,review_id,reviewer_id)
        values(p_user_id,p_book_id,p_review_id,case when p_review_id is not null then review.user_id end) on conflict do nothing;
      get diagnostics attributed=row_count;
      insert into shelf_books(shelf_id,book_id,user_id) values(shelf,p_book_id,p_user_id);
      perform award_xp_once(p_user_id,5,'want_to_read','want-to-read:'||p_book_id);
      if attributed=1 and p_review_id is not null then
        update reviews set want_to_read_count=(select count(*) from review_conversions where review_id=p_review_id) where id=p_review_id;
        insert into outbox_events(aggregate_type,aggregate_id,event_type,payload) values('review_conversions',p_user_id::text||':'||p_book_id::text,'check_badges',jsonb_build_object('userId',review.user_id,'trigger','want_to_read_triggered'));
      end if;
    elsif not desired and active then delete from shelf_books where id=entry;end if;
    active:=desired;
    update books set want_to_read_count=(select count(*) from shelf_books sb join shelves sh on sh.id=sb.shelf_id where sb.book_id=p_book_id and sh.default_type='want_to_read') where id=p_book_id;
    result:=jsonb_build_object('reacted',active);
  else
    if p_review_id is null or p_value is null then raise exception 'Invalid vote'; end if;
    select * into review from reviews where id=p_review_id and book_id=p_book_id and moderation_status='published' and not is_hidden for update;
    if not found then raise exception 'Review does not belong to book' using errcode='P1003'; end if;
    select is_helpful into old_vote from review_helpfulness_votes where review_id=p_review_id and user_id=p_user_id;
    if found and old_vote=p_value then
      delete from review_helpfulness_votes where review_id=p_review_id and user_id=p_user_id;
      old_vote:=null;
    else
      insert into review_helpfulness_votes(review_id,user_id,is_helpful) values(p_review_id,p_user_id,p_value)
        on conflict(review_id,user_id) do update set is_helpful=excluded.is_helpful;
      old_vote:=p_value;
    end if;
    update reviews set
      helpful_votes=(select count(*) from review_helpfulness_votes where review_id=p_review_id and is_helpful),
      unhelpful_votes=(select count(*) from review_helpfulness_votes where review_id=p_review_id and not is_helpful)
      where id=p_review_id returning * into review;
    result:=jsonb_build_object('vote',old_vote,'helpfulVotes',review.helpful_votes,'unhelpfulVotes',review.unhelpful_votes);
  end if;
  insert into content_intents values(p_user_id,'book:'||p_action,p_key,fingerprint,result);
  return result;
end $$;

notify pgrst,'reload schema';
