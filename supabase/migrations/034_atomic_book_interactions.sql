create function apply_book_interaction(p_user_id uuid,p_book_id uuid,p_action text,p_key text,p_review_id uuid default null,p_value boolean default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare previous content_intents; fingerprint text; result jsonb; shelf uuid; entry uuid; review reviews; old_vote boolean; active boolean;
begin
  if p_action not in ('reaction','helpfulness') or length(p_key) not between 8 and 200 or p_key is null then raise exception 'Invalid interaction'; end if;
  fingerprint:=jsonb_build_array(p_book_id,p_review_id,p_value)::text;
  perform 1 from users where id=p_user_id for update;
  if not found then raise exception 'Unknown actor' using errcode='P1003'; end if;
  select * into previous from content_intents where actor_id=p_user_id and action='book:'||p_action and intent_key=p_key;
  if found then
    if previous.fingerprint<>fingerprint then raise exception 'Conflicting interaction intent' using errcode='P1001'; end if;
    return previous.response;
  end if;
  perform 1 from books where id=p_book_id for update;
  if not found then raise exception 'Unknown book' using errcode='P1003'; end if;
  if p_action='reaction' then
    if p_review_id is not null or p_value is not null then raise exception 'Invalid reaction'; end if;
    select id into shelf from shelves where user_id=p_user_id and default_type='want_to_read';
    if not found then raise exception 'Missing shelf' using errcode='P1003'; end if;
    select id into entry from shelf_books where shelf_id=shelf and user_id=p_user_id and book_id=p_book_id;
    active:=not found;
    if active then
      insert into shelf_books(shelf_id,book_id,user_id) values(shelf,p_book_id,p_user_id);
      perform award_xp_once(p_user_id,5,'want_to_read','want-to-read:'||p_book_id);
    else delete from shelf_books where id=entry; end if;
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
revoke all on function apply_book_interaction(uuid,uuid,text,text,uuid,boolean),increment_review_helpfulness(uuid,integer,integer) from public;
do $$ declare role_name text; begin
  foreach role_name in array array['anon','authenticated'] loop
    if exists(select 1 from pg_roles where rolname=role_name) then
      execute format('revoke all on function apply_book_interaction(uuid,uuid,text,text,uuid,boolean),increment_review_helpfulness(uuid,integer,integer) from %I',role_name);
    end if;
  end loop;
end $$;
grant execute on function apply_book_interaction(uuid,uuid,text,text,uuid,boolean) to service_role;
