alter table notifications add column message_key text check(message_key is null or length(message_key) between 1 and 100),
  add column message_values jsonb not null default '{}' check(jsonb_typeof(message_values)='object');

create function prepare_notification()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare recipient users;actor_name text;preference boolean:=true;parts text[];decision text;content text;context jsonb;
begin
  if tg_op='INSERT' then
    select * into recipient from users where id=new.user_id;
    if not found then return new;end if;
    preference:=case new.type when 'follow' then recipient.notify_follows when 'like' then recipient.notify_likes when 'review_like' then recipient.notify_likes
      when 'reply' then recipient.notify_replies when 'review_comment' then recipient.notify_replies when 'mention' then recipient.notify_mentions
      when 'author_announcement' then recipient.notify_author_announcements when 'new_release' then recipient.notify_new_releases
      when 'challenge_complete' then recipient.notify_challenge_completions when 'arc_granted' then recipient.notify_arc_grants
      when 'buddy_read_invite' then case when new.entity_type='arc' then recipient.notify_arc_grants else true end else true end;
    if not preference then return null;end if;
  elsif new.message is distinct from old.message and new.message_key is not distinct from old.message_key then
    new.message_key:=null;new.message_values:='{}'::jsonb;
  end if;
  if new.message_key is not null then return new;end if;
  select display_name into actor_name from users where id=new.actor_id and not is_banned and deleted_at is null;
  new.message_values:=jsonb_build_object('name',actor_name);
  case new.type
    when 'follow' then new.message_key:='follow';
    when 'like','review_like' then new.message_key:='reviewLike';
    when 'reply','review_comment' then new.message_key:='reviewReply';
    when 'mention' then new.message_key:='mention';
    when 'want_to_read' then new.message_key:='wantToRead';
    when 'challenge_complete' then new.message_key:='challengeComplete';
    when 'account_hardening' then new.message_key:='accountHardening';
    when 'referral' then new.message_key:='referral';new.message_values:=new.message_values||jsonb_build_object('xp',200);
    when 'author_announcement' then new.message_key:='authorAnnouncement';new.message_values:=new.message_values||jsonb_build_object('content',new.message);
    when 'author_qa_question','new_question' then new.message_key:='question';new.message_values:=new.message_values||jsonb_build_object('content',new.message);
    when 'author_verification_request' then new.message_key:='verificationRequest';
    when 'author_qa_answer' then
      if new.entity_type='author_verification_request' then
        new.message_key:=case when new.message='Your author verification has been approved! You now have a verified author badge.' then 'verificationApproved' when new.message='Your author verification request was not approved at this time.' then 'verificationRejected' else 'verificationUpdated' end;
      else
        select left(question,60) into content from author_qa where id=new.entity_id;
        new.message_key:=case when content is not null then 'answerDetail' else 'answer' end;new.message_values:=new.message_values||jsonb_build_object('content',content);
      end if;
    when 'buddy_read_invite','arc_granted' then
      if new.type='arc_granted' then new.message_key:='arcApproved';
      elsif new.entity_type='arc' then
        new.message_key:=case when new.message='A reader applied for your ARC.' then 'arcReceived' when new.message='Your ARC application has been approved!' then 'arcApproved' when new.message='Your ARC application was not approved this time.' then 'arcRejected' else 'arcUpdated' end;
      else new.message_key:='buddyInvite';end if;
    when 'book_pass','book_passed' then
      new.message_key:=case when new.entity_type='pass_the_book_chain' then 'bookChain' when new.message='A reader passed you a book.' then 'bookPassed' else 'bookPassedNote' end;
      new.message_values:=new.message_values||jsonb_build_object('content',new.message);
    when 'reading_goal_milestone' then
      parts:=regexp_match(new.message,'^You have read ([0-9]+) of ([0-9]+) books and reached ([0-9]+)% of your ([0-9]{4}) reading goal\.$');
      new.message_key:='readingGoalGeneric';
      if parts is not null then new.message_key:='readingGoal';new.message_values:=jsonb_build_object('count',parts[1]::numeric,'target',parts[2]::numeric,'percent',parts[3]::numeric,'year',parts[4]);end if;
    when 'badge_earned' then new.message_key:='badgeGeneric';new.message_values:=jsonb_build_object('content',new.message);
    when 'tip' then
      context:=nullif(current_setting('liravo.notification_context',true),'')::jsonb;
      if context->>'userId'=new.user_id::text and context->>'tipId'=new.entity_id::text then
        new.message_key:='tipAmount';new.message_values:=jsonb_build_object('amount',context->>'amount','currency',coalesce(context->>'currency','USD'));
      else
        parts:=regexp_match(new.message,'^You received a ([A-Z]{3}) ([0-9]+(?:\.[0-9]+)?) tip!$');
        new.message_key:='tip';if parts is not null then new.message_key:='tipAmount';new.message_values:=jsonb_build_object('currency',parts[1],'amount',parts[2]);end if;
      end if;
    when 'tip_refunded' then new.message_key:='tipRefunded';
    when 'event_ticket_confirmed' then new.message_key:='ticketConfirmed';
    when 'event_ticket_refunded' then new.message_key:='ticketRefunded';
    when 'promoted_listing_activated' then new.message_key:='promotionActivated';
    when 'appeal_decision' then
      parts:=regexp_match(new.message,'^Your appeal has been (approved|rejected)\. (.*)$','s');new.message_key:='appealUpdated';
      if parts is not null then new.message_key:=case parts[1] when 'approved' then 'appealApproved' else 'appealRejected' end;new.message_values:=jsonb_build_object('content',parts[2]);end if;
    when 'moderation_warning' then
      parts:=regexp_match(new.message,'^Your .+ has received a moderation warning\. Reason: (.*)$','s');
      new.message_key:='moderationWarning';new.message_values:=jsonb_build_object('content',case when parts[1]='Community guidelines violation.' then null else parts[1] end);
    when 'moderation_escalation' then new.message_key:='moderationEscalation';
    else new.message_key:='activity';
  end case;
  return new;
end $$;
revoke all on function prepare_notification() from public,anon,authenticated,service_role;
create trigger prepare_notification before insert or update of message,type,actor_id,entity_type,entity_id on notifications for each row execute function prepare_notification();
update notifications set message=message;
update notifications n set message_key='badge',message_values=jsonb_build_object('badgeId',b.id,'badgeName',b.name,'icon',b.icon) from(values('first_book','First Book','📖'),('bookworm_10','Bookworm','🐛'),('avid_reader_50','Avid Reader','📚'),('century_reader','Century Reader','💯'),('streak_365','365-Day Streak','🗓️'),('streak_7','Week Warrior','🔥'),('streak_30','Monthly Master','🏆'),('horror_head_5','Horror Head (5)','👻'),('horror_head_20','Horror Head (20)','👻'),('horror_head_50','Horror Head (50)','👻'),('romance_reader_5','Romance Reader (5)','💕'),('romance_reader_20','Romance Reader (20)','💕'),('romance_reader_50','Romance Reader (50)','💕'),('scifi_scholar_5','Sci-Fi Scholar (5)','🚀'),('scifi_scholar_20','Sci-Fi Scholar (20)','🚀'),('scifi_scholar_50','Sci-Fi Scholar (50)','🚀'),('fantasy_wanderer_5','Fantasy Wanderer (5)','🧙'),('fantasy_wanderer_20','Fantasy Wanderer (20)','🧙'),('fantasy_wanderer_50','Fantasy Wanderer (50)','🧙'),('nonfiction_thinker_5','Nonfiction Thinker (5)','🧠'),('nonfiction_thinker_20','Nonfiction Thinker (20)','🧠'),('nonfiction_thinker_50','Nonfiction Thinker (50)','🧠'),('mystery_maven_5','Mystery Maven (5)','🔍'),('mystery_maven_20','Mystery Maven (20)','🔍'),('mystery_maven_50','Mystery Maven (50)','🔍'),('historical_traveller_5','Historical Traveller (5)','🏛️'),('historical_traveller_20','Historical Traveller (20)','🏛️'),('historical_traveller_50','Historical Traveller (50)','🏛️'),('literary_devotee_5','Literary Devotee (5)','🎭'),('literary_devotee_20','Literary Devotee (20)','🎭'),('literary_devotee_50','Literary Devotee (50)','🎭'),('connector','Connector','🤝'),('ambassador','Ambassador','🌟'),('liravo_builder','Liravo Builder','🏗️'),('influencer','Influencer','⭐'),('spark','Spark','✨'),('authors_favourite','Author''s Favourite','🎖️'),('bookclub_host','Bookclub Host','🏠'),('social_butterfly','Social Butterfly','🦋'),('popular_reader','Popular Reader','👥'),('first_draft','First Draft','📝'),('workshop_regular','Workshop Regular','🛠️'),('prompt_runner','Prompt Runner','🏃'),('craft_scholar','Craft Scholar','🎓'),('writing_streak_7','Week Wordsmith','🔥'),('writing_streak_30','Monthly Manuscript','🏆'),('first_prompt','First Prompt','✏️'),('prolific_writer','Prolific Writer','📜'),('sprint_reader','Sprint Reader','⚡'),('weekend_warrior_speed','Weekend Warrior','🏖️'),('speed_reader_month','Speed Reader','💨'),('first_review','First Review','✍️'),('shelf_builder','Shelf Builder','🗂️'),('critic_10','Junior Critic','🖊️'),('critic_50','Senior Critic','📋'),('helpful_10','Helpful Reader','👍'),('helpful_50','Trusted Voice','🗣️'),('winter_reader_2024','Winter Reader 2024','❄️'),('summer_bookworm_2025','Summer Bookworm 2025','☀️'),('readathon_2025','Readathon Champion 2025','🏅'),('spooky_reader_oct','Spooky Reader','🎃'),('cozy_winter_reader','Cozy Winter Reader','🕯️')) b(id,name,icon) where n.type='badge_earned' and n.message=b.icon||' '||b.name and exists(select 1 from user_badges u where u.user_id=n.user_id and u.badge_id=b.id);
revoke insert,delete,update on notifications from anon,authenticated;
grant update(is_read) on notifications to authenticated;
grant select,insert,update,delete on notifications to service_role;

create or replace function award_badge_atomic(p_user_id uuid,p_badge_id text,p_xp integer,p_name text,p_icon text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if p_xp is null or p_xp<0 or p_xp>5000 or p_badge_id is null or length(p_badge_id) not between 1 and 100 then raise exception 'Invalid badge';end if;
  perform 1 from users where id=p_user_id for update;
  insert into user_badges(user_id,badge_id) values(p_user_id,p_badge_id) on conflict do nothing;
  if not found then return false;end if;
  perform award_xp_once(p_user_id,p_xp,'badge:'||p_badge_id,'badge:'||p_badge_id);
  insert into notifications(user_id,type,message,message_key,message_values) values(p_user_id,'badge_earned',p_icon||' '||p_name,'badge',jsonb_build_object('badgeId',p_badge_id,'badgeName',p_name,'icon',p_icon));
  return true;
end $$;
create or replace function award_reading_goal_milestones(p_user_id uuid,p_year integer)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare snapshot jsonb;threshold integer;receipt uuid;awarded integer:=0;
begin
  perform 1 from users where id=p_user_id and not is_banned and deleted_at is null for update;if not found then return 0;end if;
  snapshot:=reading_goal_snapshot(p_user_id,p_year);
  for threshold in select unnest(array[25,50,75,100]) loop
    if (snapshot#>>'{progress,percentage}')::numeric>=threshold then
      insert into reading_goal_milestones(user_id,year,milestone) values(p_user_id,p_year,threshold) on conflict do nothing returning id into receipt;
      if found then
        insert into notifications(user_id,type,message,message_key,message_values) values(p_user_id,'reading_goal_milestone',format('You have read %s of %s books and reached %s%% of your %s reading goal.',snapshot#>>'{progress,books_read}',snapshot#>>'{goal,target_books}',threshold,p_year),'readingGoal',jsonb_build_object('count',(snapshot#>>'{progress,books_read}')::integer,'target',(snapshot#>>'{goal,target_books}')::integer,'percent',threshold,'year',p_year::text));
        awarded:=awarded+1;
      end if;
    end if;
  end loop;
  return awarded;
end $$;
alter function process_outbox_event_atomic(uuid) rename to process_outbox_event_atomic_064;
revoke all on function process_outbox_event_atomic_064(uuid) from public,anon,authenticated,service_role;
create function process_outbox_event_atomic(p_event_id uuid)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare context jsonb;old_context text:=coalesce(current_setting('liravo.notification_context',true),'');result boolean;
begin
  select payload into context from outbox_events where id=p_event_id and event_type='notify_recipient';
  perform set_config('liravo.notification_context',coalesce(context::text,''),true);
  result:=process_outbox_event_atomic_064(p_event_id);
  perform set_config('liravo.notification_context',old_context,true);
  return result;
end $$;
revoke all on function process_outbox_event_atomic(uuid) from public,anon,authenticated;
grant execute on function process_outbox_event_atomic(uuid) to service_role;
notify pgrst,'reload schema';
