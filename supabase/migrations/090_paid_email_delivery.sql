create table email_unsubscribe_proofs(
 token_hash text primary key check(token_hash~'^[a-f0-9]{64}$'),user_id uuid not null references users(id)on delete cascade,
 kind text not null check(kind in('weekly_digest','new_release_alert')),email_hash text not null,expires_at timestamptz not null default now()+interval '180 days',consumed_at timestamptz
);
create index email_unsubscribe_expiry on email_unsubscribe_proofs(expires_at);
alter table email_unsubscribe_proofs enable row level security;
revoke all on email_unsubscribe_proofs from public,anon,authenticated;
update users set unsubscribe_token=null where unsubscribe_token is not null;
alter table digest_deliveries add column claim_id uuid;
alter table digest_deliveries drop constraint digest_deliveries_status_check;
alter table digest_deliveries add constraint digest_deliveries_status_check check(status in('pending','sending','sent','skipped','failed','unknown'));
create index digest_email_pending on digest_deliveries(status,period_start,user_id);
create table digest_email_campaigns(period_start date primary key,user_cursor uuid,audience_complete boolean not null default false);
alter table digest_email_campaigns enable row level security;
revoke all on digest_email_campaigns from public,anon,authenticated;
grant select on digest_email_campaigns to service_role;

create table release_email_campaigns(post_id uuid primary key references author_posts(id)on delete cascade,follower_cursor uuid,audience_complete boolean not null default false,created_at timestamptz not null default now());
create table release_email_deliveries(
 post_id uuid not null references release_email_campaigns(post_id)on delete cascade,user_id uuid not null references users(id)on delete cascade,
 status text not null default 'pending' check(status in('pending','sending','sent','skipped','failed','unknown')),attempts integer not null default 0,claim_id uuid,message_id text,updated_at timestamptz not null default now(),primary key(post_id,user_id)
);
alter table release_email_campaigns enable row level security;
alter table release_email_deliveries enable row level security;
revoke all on release_email_campaigns,release_email_deliveries from public,anon,authenticated;
grant select on release_email_campaigns,release_email_deliveries to service_role;
create index release_email_pending on release_email_deliveries(status,updated_at,post_id,user_id);
create index release_email_audience on release_email_campaigns(created_at,post_id)where not audience_complete;
create index follows_release_audience on follows(following_id,follower_id,created_at);

create function enqueue_release_email()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.type='announcement' and new.book_id is not null then insert into release_email_campaigns(post_id,created_at)values(new.id,new.created_at)on conflict do nothing;end if;
 return new;
end $$;
create trigger author_release_email after insert or update of type,book_id on author_posts for each row execute function enqueue_release_email();
insert into release_email_campaigns(post_id,created_at)select id,created_at from author_posts where type='announcement' and book_id is not null and created_at>=now()-interval '24 hours';

create function cleanup_email_unsubscribe_proofs(p_limit integer default 1000)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare removed integer;
begin
 if p_limit is null or p_limit not between 1 and 10000 then raise exception 'Invalid cleanup page' using errcode='P1004';end if;
 delete from email_unsubscribe_proofs where token_hash in(select token_hash from email_unsubscribe_proofs where expires_at<=now()order by expires_at limit p_limit);get diagnostics removed=row_count;return removed;
end $$;
create function issue_email_unsubscribe(p_user uuid,p_kind text)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare profile users;token text:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
begin
 select * into profile from users where id=p_user and not is_banned and deleted_at is null and email_verified and email is not null;
 if not found or p_kind is null or p_kind not in('weekly_digest','new_release_alert')then raise exception 'Email unavailable' using errcode='P1003';end if;
 insert into email_unsubscribe_proofs(token_hash,user_id,kind,email_hash)values(encode(sha256(convert_to(token,'UTF8')),'hex'),p_user,p_kind,encode(sha256(convert_to(lower(profile.email),'UTF8')),'hex'));
 return token;
end $$;
create function consume_email_unsubscribe(p_hash text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare proof email_unsubscribe_proofs;profile users;owner uuid;
begin
 if p_hash is null or p_hash!~'^[a-f0-9]{64}$'then return false;end if;
 select user_id into owner from email_unsubscribe_proofs where token_hash=p_hash;if not found then return false;end if;
 select * into profile from users where id=owner and not is_banned and deleted_at is null and email_verified and email is not null for update;
 if not found then return false;end if;
 select * into proof from email_unsubscribe_proofs where token_hash=p_hash for update;
 if not found or proof.expires_at<=now() or proof.email_hash<>encode(sha256(convert_to(lower(profile.email),'UTF8')),'hex')then return false;end if;
 if proof.consumed_at is not null then return case proof.kind when 'weekly_digest' then not profile.email_digest_enabled else not profile.notify_new_releases end;end if;
 if proof.kind='weekly_digest' then update users set email_digest_enabled=false where id=owner;else update users set notify_new_releases=false where id=owner;end if;
 update email_unsubscribe_proofs set consumed_at=now()where token_hash=p_hash;
 return true;
end $$;

create function queue_paid_digest_audience(p_limit integer default 40)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare campaign digest_email_campaigns;recipient record;seen integer;last_id uuid;queued integer:=0;inserted integer;
begin
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'Invalid page' using errcode='P1004';end if;
 insert into digest_email_campaigns(period_start)values((date_trunc('week',now()at time zone 'UTC'))::date)on conflict do nothing;
 if(select count(*)from(select 1 from digest_deliveries where status='pending' or status='failed' and attempts<3 limit 80)pending)>=80 then return 0;end if;
 for campaign in select * from digest_email_campaigns where not audience_complete order by period_start limit 10 for update skip locked loop
  seen:=0;last_id:=campaign.user_cursor;
  for recipient in select id from users where(campaign.user_cursor is null or id>campaign.user_cursor)and not is_banned and deleted_at is null and email_verified and email is not null and email_digest_enabled and has_premium_access(id)order by id limit p_limit loop
   seen:=seen+1;last_id:=recipient.id;
   insert into digest_deliveries(user_id,period_start,status,attempts)values(recipient.id,campaign.period_start,'pending',0)on conflict do nothing;get diagnostics inserted=row_count;queued:=queued+inserted;
  end loop;
  update digest_email_campaigns set user_cursor=last_id,audience_complete=seen<p_limit where period_start=campaign.period_start;
 end loop;
 return queued;
end $$;
create function claim_paid_digest(p_user uuid,p_period date)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare profile users;delivery digest_deliveries;stats jsonb;claim uuid:=gen_random_uuid();
begin
 if p_period is null or extract(isodow from p_period)<>1 or p_period>(date_trunc('week',now()at time zone 'UTC'))::date then raise exception 'Invalid digest period' using errcode='P1004';end if;
 select * into profile from users where id=p_user for update;if not found then return null;end if;
 insert into digest_deliveries(user_id,period_start,status,attempts)values(p_user,p_period,'pending',0)on conflict do nothing;
 select * into delivery from digest_deliveries where user_id=p_user and period_start=p_period for update;
 if delivery.status='sending' and delivery.updated_at<now()-interval '5 minutes' then update digest_deliveries set status='unknown',updated_at=now()where user_id=p_user and period_start=p_period;return null;end if;
 if delivery.status not in('pending','failed')or delivery.attempts>=3 or delivery.status='failed' and delivery.updated_at>now()-interval '5 minutes' then return null;end if;
 if profile.is_banned or profile.deleted_at is not null or not profile.email_verified or profile.email is null or not profile.email_digest_enabled or not has_premium_access(p_user)then update digest_deliveries set status='skipped',updated_at=now()where user_id=p_user and period_start=p_period;return null;end if;
 select jsonb_build_object('newFollowers',(select count(*)from follows where following_id=p_user and created_at>=(p_period-7)::timestamp at time zone 'UTC' and created_at<p_period::timestamp at time zone 'UTC'),
  'newNotifications',(select count(*)from notifications where user_id=p_user and created_at>=(p_period-7)::timestamp at time zone 'UTC' and created_at<p_period::timestamp at time zone 'UTC'),
  'booksThisWeek',(select count(distinct canonical_book_work(b.work_id))from shelf_books s join books b on b.id=s.book_id where s.user_id=p_user and s.added_at>=(p_period-7)::timestamp at time zone 'UTC' and s.added_at<p_period::timestamp at time zone 'UTC'))into stats;
 if stats->>'newFollowers'='0' and stats->>'newNotifications'='0' and stats->>'booksThisWeek'='0'then update digest_deliveries set status='skipped',updated_at=now()where user_id=p_user and period_start=p_period;return null;end if;
 update digest_deliveries set status='sending',attempts=attempts+1,claim_id=claim,updated_at=now()where user_id=p_user and period_start=p_period;
 return jsonb_build_object('userId',p_user,'claimId',claim,'period',p_period,'email',profile.email,'displayName',profile.display_name,'username',profile.username,'locale',profile.preferred_locale,'stats',stats,'unsubscribeToken',issue_email_unsubscribe(p_user,'weekly_digest'));
end $$;
create function claim_digest_email_batch(p_limit integer default 4)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare batch jsonb;candidate record;claim jsonb;result jsonb:='[]'::jsonb;
begin
 if p_limit is null or p_limit not between 1 and 20 then raise exception 'Invalid delivery batch' using errcode='P1004';end if;
 perform pg_advisory_xact_lock(hashtextextended('email:digest-claim',0));
 update digest_deliveries set status='unknown',updated_at=now()where(user_id,period_start)in(select user_id,period_start from digest_deliveries where status='sending' and updated_at<now()-interval '5 minutes' order by updated_at limit 100);
 select coalesce(jsonb_agg(to_jsonb(page)order by page.period_start,page.user_id),'[]'::jsonb)into batch from(select user_id,period_start from digest_deliveries where status='pending' or status='failed' and attempts<3 and updated_at<=now()-interval '5 minutes' order by period_start,user_id limit p_limit)page;
 perform 1 from users where id in(select(value->>'user_id')::uuid from jsonb_array_elements(batch))order by id for update;
 for candidate in select(value->>'user_id')::uuid user_id,(value->>'period_start')::date period_start from jsonb_array_elements(batch)loop
  claim:=claim_paid_digest(candidate.user_id,candidate.period_start);if claim is not null then result:=result||jsonb_build_array(claim);end if;
 end loop;
 return jsonb_build_object('claims',result,'examined',jsonb_array_length(batch));
end $$;

create function queue_release_email_audience(p_campaigns integer default 10,p_followers integer default 40)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare campaign release_email_campaigns;post author_posts;follower record;seen integer;last_id uuid;queued integer:=0;inserted integer;
begin
 if p_campaigns is null or p_campaigns not between 1 and 20 or p_followers is null or p_followers not between 1 and 100 then raise exception 'Invalid audience page' using errcode='P1004';end if;
 if(select count(*)from(select 1 from release_email_deliveries where status='pending' or status='failed' and attempts<3 limit 80)pending)>=80 then return 0;end if;
 for campaign in select * from release_email_campaigns where not audience_complete order by created_at,post_id limit p_campaigns for update skip locked loop
  select * into post from author_posts where id=campaign.post_id;
  if not found or post.type<>'announcement' or post.book_id is null or not author_owns_book(post.author_id,post.book_id)then update release_email_campaigns set audience_complete=true where post_id=campaign.post_id;continue;end if;
  seen:=0;last_id:=campaign.follower_cursor;
  for follower in select f.follower_id,u.email,u.email_verified,u.is_banned,u.deleted_at,u.notify_new_releases from follows f join users u on u.id=f.follower_id where f.following_id=post.author_id and f.created_at<=post.created_at and(campaign.follower_cursor is null or f.follower_id>campaign.follower_cursor)order by f.follower_id limit p_followers loop
   seen:=seen+1;last_id:=follower.follower_id;
   if follower.email is not null and follower.email_verified and not follower.is_banned and follower.deleted_at is null and follower.notify_new_releases and has_premium_access(follower.follower_id)then insert into release_email_deliveries(post_id,user_id)values(post.id,follower.follower_id)on conflict do nothing;get diagnostics inserted=row_count;queued:=queued+inserted;end if;
  end loop;
  update release_email_campaigns set follower_cursor=last_id,audience_complete=seen<p_followers where post_id=campaign.post_id;
 end loop;
 return queued;
end $$;

create function claim_release_email_batch(p_limit integer default 4)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare candidate record;delivery release_email_deliveries;profile users;post author_posts;author users;book jsonb;claim uuid;batch jsonb;result jsonb:='[]'::jsonb;
begin
 if p_limit is null or p_limit not between 1 and 20 then raise exception 'Invalid delivery batch' using errcode='P1004';end if;
 perform pg_advisory_xact_lock(hashtextextended('email:release-claim',0));
 update release_email_deliveries set status='unknown',updated_at=now()where(post_id,user_id)in(select post_id,user_id from release_email_deliveries where status='sending' and updated_at<now()-interval '5 minutes' order by updated_at limit 100);
 select coalesce(jsonb_agg(to_jsonb(page)order by page.updated_at,page.post_id,page.user_id),'[]'::jsonb)into batch from(select post_id,user_id,updated_at from release_email_deliveries where status='pending' or status='failed' and attempts<3 and updated_at<=now()-interval '5 minutes' order by updated_at,post_id,user_id limit p_limit)page;
 perform 1 from users where id in(select(value->>'user_id')::uuid from jsonb_array_elements(batch))order by id for update;
 for candidate in select(value->>'post_id')::uuid post_id,(value->>'user_id')::uuid user_id from jsonb_array_elements(batch)loop
  select * into profile from users where id=candidate.user_id for update;
  select * into delivery from release_email_deliveries where post_id=candidate.post_id and user_id=candidate.user_id for update;
  if not found or delivery.status not in('pending','failed') or delivery.attempts>=3 or delivery.status='failed' and delivery.updated_at>now()-interval '5 minutes' then continue;end if;
  select * into post from author_posts where id=candidate.post_id;
  if profile.id is null or profile.is_banned or profile.deleted_at is not null or not profile.email_verified or profile.email is null or not profile.notify_new_releases or not has_premium_access(profile.id)or post.id is null or post.type<>'announcement' or post.book_id is null or not author_owns_book(post.author_id,post.book_id)or not exists(select 1 from follows where follower_id=profile.id and following_id=post.author_id and created_at<=post.created_at)then update release_email_deliveries set status='skipped',updated_at=now()where post_id=candidate.post_id and user_id=candidate.user_id;continue;end if;
  select * into author from users where id=post.author_id;book:=catalog_book_snapshot(post.book_id);claim:=gen_random_uuid();
  update release_email_deliveries set status='sending',attempts=attempts+1,claim_id=claim,updated_at=now()where post_id=candidate.post_id and user_id=candidate.user_id;
  result:=result||jsonb_build_array(jsonb_build_object('postId',post.id,'userId',profile.id,'claimId',claim,'email',profile.email,'displayName',profile.display_name,'locale',profile.preferred_locale,'authorName',author.display_name,'bookTitle',book->>'title','bookId',book->>'id','unsubscribeToken',issue_email_unsubscribe(profile.id,'new_release_alert')));
 end loop;
 return jsonb_build_object('claims',result,'examined',jsonb_array_length(batch));
end $$;

create function finish_paid_email(p_kind text,p_user uuid,p_claim uuid,p_status text,p_message text default null,p_period date default null,p_post uuid default null)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if p_status is null or p_status not in('sent','failed','unknown') or p_status='sent' and(nullif(trim(p_message),'')is null)then raise exception 'Invalid delivery receipt' using errcode='P1004';end if;
 if p_kind='weekly_digest' then update digest_deliveries set status=p_status,message_id=p_message,updated_at=now()where user_id=p_user and period_start=p_period and claim_id=p_claim and status='sending';
 elsif p_kind='new_release_alert' then update release_email_deliveries set status=p_status,message_id=p_message,updated_at=now()where user_id=p_user and post_id=p_post and claim_id=p_claim and status='sending';else raise exception 'Invalid email kind' using errcode='P1004';end if;
 if found then return true;end if;
 if p_kind='weekly_digest' then return exists(select 1 from digest_deliveries where user_id=p_user and period_start=p_period and claim_id=p_claim and status=p_status and message_id is not distinct from p_message);end if;
 return exists(select 1 from release_email_deliveries where user_id=p_user and post_id=p_post and claim_id=p_claim and status=p_status and message_id is not distinct from p_message);
end $$;

alter function financial_integrity_snapshot()rename to financial_integrity_snapshot_089;
revoke all on function financial_integrity_snapshot_089()from public,anon,authenticated,service_role;
create function financial_integrity_snapshot()
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select financial_integrity_snapshot_089()||jsonb_build_object('uncertainReleaseEmails',(select count(*)from release_email_deliveries where status='unknown' or status='sending' and updated_at<now()-interval '5 minutes'),'failedReleaseEmails',(select count(*)from release_email_deliveries where status='failed' and attempts>=3),'failedDigestEmails',(select count(*)from digest_deliveries where status='failed' and attempts>=3),'pendingDigestEmails',(select count(*)from digest_deliveries where status='pending' or status='failed' and attempts<3),'pendingReleaseEmails',(select count(*)from release_email_deliveries where status='pending' or status='failed' and attempts<3));
$$;
revoke all on function enqueue_release_email(),issue_email_unsubscribe(uuid,text),consume_email_unsubscribe(text),cleanup_email_unsubscribe_proofs(integer),queue_paid_digest_audience(integer),claim_paid_digest(uuid,date),claim_digest_email_batch(integer),queue_release_email_audience(integer,integer),claim_release_email_batch(integer),finish_paid_email(text,uuid,uuid,text,text,date,uuid),financial_integrity_snapshot()from public,anon,authenticated;
grant execute on function consume_email_unsubscribe(text),cleanup_email_unsubscribe_proofs(integer),queue_paid_digest_audience(integer),claim_paid_digest(uuid,date),claim_digest_email_batch(integer),queue_release_email_audience(integer,integer),claim_release_email_batch(integer),finish_paid_email(text,uuid,uuid,text,text,date,uuid),financial_integrity_snapshot()to service_role;
notify pgrst,'reload schema';
