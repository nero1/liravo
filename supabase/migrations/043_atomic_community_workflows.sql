alter table author_verification_requests add column reviewed_by uuid references users(id) on delete set null,
  add column reviewed_at timestamptz;

create function validate_appeal_report()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare report content_reports; owner_id uuid;
begin
  if new.report_id is null then return new; end if;
  select * into report from content_reports where id=new.report_id;
  if not found then raise exception 'Report unavailable' using errcode='P1005'; end if;
  case report.entity_type
    when 'review' then select user_id into owner_id from reviews where id=report.entity_id;
    when 'quote' then select user_id into owner_id from quotes where id=report.entity_id;
    when 'user' then owner_id:=report.entity_id;
    else null;
  end case;
  if owner_id is distinct from new.user_id or report.status not in ('removed','warned') then raise exception 'Appealable action required' using errcode='P1003'; end if;
  return new;
end $$;
create trigger appeal_report_owner before insert on appeals for each row execute function validate_appeal_report();

create function apply_community_intent(p_actor_id uuid,p_action text,p_target uuid,p_key text,p_payload jsonb,p_correlation_id text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare previous content_intents; fingerprint text; result jsonb; related uuid[]; recipient uuid; actor users;
  qa author_qa; arc arcs; application arc_applications; appeal appeals; report content_reports;
  verification author_verification_requests; note community_notes; chain pass_the_book_chains; node pass_the_book_nodes;
  new_status text; next_position integer; changed boolean; old_answer text;
begin
  if p_key is null or length(p_key) not between 8 and 200 or p_payload is null or jsonb_typeof(p_payload)<>'object' or p_target is null then
    raise exception 'Invalid intent' using errcode='P1004';
  end if;
  related:=array[p_actor_id];
  case p_action
    when 'author_answer' then select array[asked_by,author_id] into related from author_qa where id=p_target;
    when 'arc_apply' then select array[author_id] into related from arcs where id=p_target;
    when 'arc_review' then select array[a.author_id,r.reader_id] into related from arcs a join arc_applications r on r.arc_id=a.id where a.id=p_target and r.id=(p_payload->>'applicationId')::uuid;
    when 'appeal_review' then select array[a.user_id,r.moderator_id] into related from appeals a left join content_reports r on r.id=a.report_id where a.id=p_target;
    when 'author_verify','admin_user' then related:=array[p_target];
    when 'chain_nominate' then related:=array[(p_payload->>'nominee_id')::uuid];
    when 'report_review' then
      select * into report from content_reports where id=p_target;
      case report.entity_type
        when 'review' then select user_id into recipient from reviews where id=report.entity_id;
        when 'quote' then select user_id into recipient from quotes where id=report.entity_id;
        when 'user' then recipient:=report.entity_id;
        else null;
      end case;
      select array_agg(id) into related from users where id in (recipient,report.reporter_id) or (is_admin and p_payload->>'status'='escalated');
    when 'community_note_review' then select array[author_id] into related from community_notes where id=p_target;
    when 'chain_create' then null;
    else raise exception 'Unknown community action' using errcode='P1004';
  end case;
  perform 1 from users where id=p_actor_id or id=any(related) order by id for update;
  select * into actor from users where id=p_actor_id and not is_banned;
  if not found then raise exception 'Forbidden' using errcode='P1003'; end if;
  if p_action in ('author_verify','admin_user') and not actor.is_admin then raise exception 'Admin access required' using errcode='P1003'; end if;
  if p_action in ('appeal_review','report_review','community_note_review') and not (actor.is_admin or actor.is_moderator) then
    raise exception 'Moderator access required' using errcode='P1003';
  end if;
  fingerprint:=encode(sha256(convert_to(jsonb_build_object('target',p_target,'payload',p_payload)::text,'UTF8')),'hex');
  select * into previous from content_intents where actor_id=p_actor_id and action=p_action and intent_key=p_key;
  if found then
    if previous.fingerprint<>fingerprint then raise exception 'Conflicting intent' using errcode='P1001'; end if;
    return previous.response;
  end if;
  case p_action
    when 'author_answer' then
      select * into qa from author_qa where id=p_target for update;
      if not found then raise exception 'Question unavailable' using errcode='P1005'; end if;
      if qa.author_id<>p_actor_id or not (actor.is_verified_author or 'author'=any(actor.user_types)) then raise exception 'Author access required' using errcode='P1003'; end if;
      if length(trim(coalesce(p_payload->>'answer',''))) not between 1 and 2000 then raise exception 'Invalid answer' using errcode='P1004'; end if;
      old_answer:=qa.answer;
      if qa.answer is distinct from p_payload->>'answer' then
        update author_qa set answer=p_payload->>'answer',answered_at=now() where id=p_target returning * into qa;
        if old_answer is null then
          insert into notifications(user_id,type,actor_id,entity_type,entity_id,message)
            values(qa.asked_by,'author_qa_answer',p_actor_id,'author_qa',qa.id,actor.display_name||' answered your question: '||left(qa.question,60));
        end if;
      end if;
      result:=jsonb_build_object('ok',true);
    when 'arc_apply' then
      select * into arc from arcs where id=p_target for update;
      if not found then raise exception 'ARC unavailable' using errcode='P1005'; end if;
      select * into application from arc_applications where arc_id=p_target and reader_id=p_actor_id;
      if not found then
        if arc.author_id=p_actor_id or not arc.is_active or arc.close_date<=now() then raise exception 'ARC unavailable' using errcode='P1004'; end if;
        insert into arc_applications(arc_id,reader_id) values(p_target,p_actor_id) returning * into application;
        insert into notifications(user_id,type,actor_id,entity_type,entity_id,message)
          values(arc.author_id,'buddy_read_invite',p_actor_id,'arc',arc.id,'A reader applied for your ARC.');
      end if;
      result:=jsonb_build_object('applied',true,'application',to_jsonb(application));
    when 'arc_review' then
      select * into arc from arcs where id=p_target for update;
      if not found then raise exception 'ARC unavailable' using errcode='P1005'; end if;
      if arc.author_id<>p_actor_id then raise exception 'Forbidden' using errcode='P1003'; end if;
      select * into application from arc_applications where arc_id=p_target and id=(p_payload->>'applicationId')::uuid for update;
      if not found then raise exception 'Application unavailable' using errcode='P1005'; end if;
      if jsonb_typeof(p_payload->'approved') is distinct from 'boolean' then raise exception 'Invalid decision' using errcode='P1004'; end if;
      new_status:=case when (p_payload->>'approved')::boolean then 'approved' else 'rejected' end;
      if application.status<>'pending' and application.status<>new_status then raise exception 'Decision is final' using errcode='P1001'; end if;
      if application.status='pending' then
        if new_status='approved' and (not arc.is_active or arc.close_date<=now() or (select count(*) from arc_applications where arc_id=p_target and status='approved')>=arc.reader_slots) then
          raise exception 'ARC slots unavailable' using errcode='P1001';
        end if;
        update arc_applications set status=new_status,reviewed_at=now() where id=application.id returning * into application;
        insert into notifications(user_id,type,actor_id,entity_type,entity_id,message)
          values(application.reader_id,'buddy_read_invite',p_actor_id,'arc',arc.id,case when new_status='approved' then 'Your ARC application has been approved!' else 'Your ARC application was not approved this time.' end);
      end if;
      result:=jsonb_build_object('application',to_jsonb(application));
    when 'author_verify' then
      if jsonb_typeof(p_payload->'approved') is distinct from 'boolean' then raise exception 'Invalid decision' using errcode='P1004'; end if;
      select * into verification from author_verification_requests where user_id=p_target order by created_at desc,id desc limit 1 for update;
      if not found then raise exception 'Verification request unavailable' using errcode='P1005'; end if;
      new_status:=case when (p_payload->>'approved')::boolean then 'approved' else 'rejected' end;
      if verification.status<>'pending' and verification.status<>new_status then raise exception 'Decision is final' using errcode='P1001'; end if;
      if verification.status='pending' then
        update author_verification_requests set status=new_status,reviewed_by=p_actor_id,reviewed_at=now() where id=verification.id;
        if new_status='approved' then update users set is_verified_author=true where id=p_target; end if;
        insert into notifications(user_id,type,actor_id,entity_type,entity_id,message) values(p_target,'author_qa_answer',p_actor_id,'author_verification_request',verification.id,
          case when new_status='approved' then 'Your author verification has been approved! You now have a verified author badge.' else 'Your author verification request was not approved at this time.' end);
        insert into moderation_log(moderator_id,target_user_id,action,entity_type,entity_id) values(p_actor_id,p_target,'author_'||new_status,'author_verification_request',verification.id);
      end if;
      select jsonb_build_object('user',jsonb_build_object('id',id,'username',username,'display_name',display_name,'is_verified_author',is_verified_author)) into result from users where id=p_target;
    when 'appeal_review' then
      select * into appeal from appeals where id=p_target for update;
      if not found then raise exception 'Appeal unavailable' using errcode='P1005'; end if;
      if appeal.user_id=p_actor_id then raise exception 'Cannot review your own appeal' using errcode='P1003'; end if;
      select * into report from content_reports where id=appeal.report_id for update;
      if found and report.moderator_id=p_actor_id then raise exception 'Independent appeal reviewer required' using errcode='P1003'; end if;
      new_status:=p_payload->>'status';
      if new_status is null or new_status not in ('approved','rejected') or length(coalesce(p_payload->>'note',''))>500 then raise exception 'Invalid decision' using errcode='P1004'; end if;
      if appeal.status<>'pending' and (appeal.status<>new_status or appeal.reviewer_note is distinct from p_payload->>'note') then raise exception 'Decision is final' using errcode='P1001'; end if;
      if appeal.status='pending' then
        if new_status='approved' and report.status='removed' then
          if report.entity_type='user' and not actor.is_admin then raise exception 'Admin account restoration required' using errcode='P1003'; end if;
          if not exists(select 1 from content_reports where id<>report.id and entity_type=report.entity_type and entity_id=report.entity_id and status='removed') then
            if report.entity_type='review' then update reviews set is_hidden=false,moderation_status='published' where id=report.entity_id and moderation_status='removed';
            elsif report.entity_type='quote' then update quotes set is_hidden=false where id=report.entity_id;
            elsif report.entity_type='user' and not exists(select 1 from moderation_log where target_user_id=report.entity_id and action='suspend_user' and created_at>report.resolved_at) then
              update users set is_suspended=false where id=report.entity_id;
            end if;
          end if;
        end if;
        if new_status='approved' and report.id is not null then update content_reports set status='approved',resolved_at=now() where id=report.id; end if;
        update appeals set status=new_status,reviewed_by=p_actor_id,reviewer_note=p_payload->>'note',reviewed_at=now() where id=p_target returning * into appeal;
        insert into notifications(user_id,type,actor_id,entity_type,entity_id,message) values(appeal.user_id,'appeal_decision',p_actor_id,'appeal',appeal.id,'Your appeal has been '||new_status||'. '||coalesce(appeal.reviewer_note,''));
        insert into moderation_log(moderator_id,target_user_id,report_id,action,reason,entity_type,entity_id) values(p_actor_id,appeal.user_id,appeal.report_id,'appeal_'||new_status,appeal.reviewer_note,'appeal',appeal.id);
      end if;
      result:=jsonb_build_object('appeal',to_jsonb(appeal)-'idempotency_key'-'request_hash');
    when 'community_note_review' then
      select * into note from community_notes where id=p_target for update;
      if not found then raise exception 'Note unavailable' using errcode='P1005'; end if;
      if note.author_id=p_actor_id then raise exception 'Independent reviewer required' using errcode='P1003'; end if;
      new_status:=p_payload->>'status';
      if new_status is null or new_status not in ('approved','rejected') then raise exception 'Invalid decision' using errcode='P1004'; end if;
      if note.status<>'pending' and note.status<>new_status then raise exception 'Decision is final' using errcode='P1001'; end if;
      if note.status='pending' then
        update community_notes set status=new_status,is_visible=new_status='approved',reviewed_by=p_actor_id,reviewed_at=now() where id=p_target returning * into note;
        insert into moderation_log(moderator_id,target_user_id,action,entity_type,entity_id) values(p_actor_id,note.author_id,'community_note_'||new_status,'community_note',note.id);
      end if;
      result:=jsonb_build_object('note',to_jsonb(note)-'idempotency_key'-'request_hash');
    when 'report_review' then
      select * into report from content_reports where id=p_target for update;
      if not found then raise exception 'Report unavailable' using errcode='P1005'; end if;
      if recipient=p_actor_id then raise exception 'Independent reviewer required' using errcode='P1003'; end if;
      new_status:=coalesce(p_payload->>'status',report.status);
      if new_status not in ('pending','approved','removed','warned','escalated') or length(coalesce(p_payload->>'note',''))>1000 then raise exception 'Invalid decision' using errcode='P1004'; end if;
      if report.status in ('approved','removed','warned') and report.status<>new_status then raise exception 'Decision is final' using errcode='P1001'; end if;
      if report.status='escalated' and new_status<>'escalated' and not actor.is_admin then raise exception 'Admin review required' using errcode='P1003'; end if;
      changed:=report.status<>new_status;
      if changed and new_status='removed' then
        if report.entity_type='review' then update reviews set is_hidden=true,moderation_status='removed' where id=report.entity_id;
        elsif report.entity_type='quote' then update quotes set is_hidden=true where id=report.entity_id;
        elsif report.entity_type='user' then
          if not actor.is_admin then raise exception 'Admin account moderation required' using errcode='P1003'; end if;
          update users set is_suspended=true where id=report.entity_id;
        else raise exception 'Unsupported removal target' using errcode='P1004'; end if;
      elsif changed and new_status='warned' and recipient is not null then
        insert into notifications(user_id,type,actor_id,entity_type,entity_id,message) values(recipient,'moderation_warning',p_actor_id,report.entity_type,report.entity_id,'Your '||report.entity_type||' has received a moderation warning. Reason: '||coalesce(p_payload->>'note','Community guidelines violation.'));
      elsif changed and new_status='escalated' then
        insert into notifications(user_id,type,actor_id,entity_type,entity_id,message) select id,'moderation_escalation',p_actor_id,'content_report',report.id,'Report #'||report.id||' has been escalated for admin review.' from users where is_admin and not is_banned;
      end if;
      if changed or report.moderator_note is distinct from p_payload->>'note' then
        update content_reports set status=new_status,moderator_id=p_actor_id,moderator_note=p_payload->>'note',resolved_at=case when new_status='pending' then null else now() end where id=p_target returning * into report;
        insert into moderation_log(moderator_id,report_id,action,reason,entity_type,entity_id) values(p_actor_id,report.id,new_status,p_payload->>'note',report.entity_type,report.entity_id);
      end if;
      result:=jsonb_build_object('report',to_jsonb(report)-'idempotency_key'-'request_hash');
    when 'admin_user' then
      if not exists(select 1 from users where id=p_target) then raise exception 'Unknown user' using errcode='P1005'; end if;
      if p_payload ? 'is_premium' then
        if jsonb_typeof(p_payload->'is_premium')<>'boolean' then raise exception 'Invalid premium state' using errcode='P1004'; end if;
        perform set_premium_override_atomic(p_actor_id,p_target,(p_payload->>'is_premium')::boolean,coalesce(nullif(p_correlation_id,''),'community:'||p_key));
      end if;
      if p_payload ? 'is_moderator' then
        if jsonb_typeof(p_payload->'is_moderator')<>'boolean' then raise exception 'Invalid moderator state' using errcode='P1004'; end if;
        update users set is_moderator=(p_payload->>'is_moderator')::boolean where id=p_target and is_moderator is distinct from (p_payload->>'is_moderator')::boolean;
        if found then insert into moderation_log(moderator_id,target_user_id,action) values(p_actor_id,p_target,case when (p_payload->>'is_moderator')::boolean then 'grant_moderator' else 'revoke_moderator' end); end if;
      end if;
      if p_payload ? 'is_suspended' then
        if jsonb_typeof(p_payload->'is_suspended')<>'boolean' then raise exception 'Invalid suspension state' using errcode='P1004'; end if;
        update users set is_suspended=(p_payload->>'is_suspended')::boolean where id=p_target and is_suspended is distinct from (p_payload->>'is_suspended')::boolean;
        if found then insert into moderation_log(moderator_id,target_user_id,action) values(p_actor_id,p_target,case when (p_payload->>'is_suspended')::boolean then 'suspend_user' else 'restore_user' end); end if;
      end if;
      result:=jsonb_build_object('updated',true);
    when 'chain_create' then
      if not exists(select 1 from books where id=p_target) or length(coalesce(p_payload->>'note',''))>500 then raise exception 'Invalid book chain' using errcode='P1004'; end if;
      insert into pass_the_book_chains(book_id,creator_id) values(p_target,p_actor_id) returning * into chain;
      insert into pass_the_book_nodes(chain_id,user_id,position,note) values(chain.id,p_actor_id,0,p_payload->>'note');
      result:=jsonb_build_object('chain',to_jsonb(chain));
    when 'chain_nominate' then
      select * into chain from pass_the_book_chains where id=p_target for update;
      if not found then raise exception 'Chain unavailable' using errcode='P1005'; end if;
      recipient:=(p_payload->>'nominee_id')::uuid;
      if recipient is null or recipient=p_actor_id or not exists(select 1 from users where id=recipient and not is_banned) or length(coalesce(p_payload->>'note',''))>500 then raise exception 'Invalid nominee' using errcode='P1004'; end if;
      select * into node from pass_the_book_nodes where chain_id=p_target and user_id=p_actor_id for update;
      if not found then raise exception 'Chain membership required' using errcode='P1003'; end if;
      if node.nominee_id is not null then
        if node.nominee_id<>recipient then raise exception 'Already passed this book' using errcode='P1001'; end if;
        select position into next_position from pass_the_book_nodes where chain_id=p_target and user_id=recipient;
      else
        if exists(select 1 from pass_the_book_nodes where chain_id=p_target and user_id=recipient) then raise exception 'Reader already in chain' using errcode='P1001'; end if;
        select coalesce(max(position),-1)+1 into next_position from pass_the_book_nodes where chain_id=p_target;
        update pass_the_book_nodes set nominee_id=recipient where id=node.id;
        insert into pass_the_book_nodes(chain_id,user_id,position,note) values(p_target,recipient,next_position,p_payload->>'note');
        insert into notifications(user_id,type,actor_id,entity_type,entity_id,message) values(recipient,'book_pass',p_actor_id,'pass_the_book_chain',p_target,actor.display_name||' passed a book to you in a chain!');
      end if;
      result:=jsonb_build_object('success',true,'position',next_position);
  end case;
  if result is null then raise exception 'Community result unavailable'; end if;
  insert into content_intents values(p_actor_id,p_action,p_key,fingerprint,result);
  return result;
end $$;
revoke all on function apply_community_intent(uuid,text,uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function apply_community_intent(uuid,text,uuid,text,jsonb,text) to service_role;
revoke insert,update,delete on arc_applications,pass_the_book_chains,pass_the_book_nodes,moderation_log from anon,authenticated;
revoke update on appeals,author_verification_requests,author_qa,content_reports,community_notes from anon,authenticated;
grant select,insert,update,delete on arc_applications,pass_the_book_chains,pass_the_book_nodes,moderation_log,author_verification_requests,appeals to service_role;
notify pgrst,'reload schema';

update reading_lists l set follower_count=(select count(*) from reading_list_follows f where f.list_id=l.id);
create function count_list_followers()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if tg_op='INSERT' then update reading_lists set follower_count=follower_count+1 where id=new.list_id; return new; end if;
  update reading_lists set follower_count=greatest(0,follower_count-1) where id=old.list_id; return old;
end $$;
create trigger list_follow_count after insert or delete on reading_list_follows for each row execute function count_list_followers();
create function set_list_follow(p_user_id uuid,p_list_id uuid,p_following boolean)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare target reading_lists;
begin
  perform 1 from users where id=p_user_id and not is_banned for update;
  if not found then raise exception 'Forbidden' using errcode='P1003'; end if;
  if p_following is null then raise exception 'Invalid follow state' using errcode='P1004'; end if;
  select * into target from reading_lists where id=p_list_id for update;
  if not found then
    if not p_following then return false; end if;
    raise exception 'List unavailable' using errcode='P1005';
  end if;
  if p_following then
    if not target.is_public and target.user_id<>p_user_id then raise exception 'List unavailable' using errcode='P1003'; end if;
    insert into reading_list_follows(list_id,user_id) values(p_list_id,p_user_id) on conflict do nothing;
  else delete from reading_list_follows where list_id=p_list_id and user_id=p_user_id; end if;
  return p_following;
end $$;
revoke all on function set_list_follow(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function set_list_follow(uuid,uuid,boolean) to service_role;
revoke insert,update,delete on reading_list_follows from anon,authenticated;
grant select,insert,delete on reading_list_follows to service_role;
notify pgrst,'reload schema';
