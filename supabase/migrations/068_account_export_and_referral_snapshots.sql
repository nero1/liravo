create index users_referred_by on users(referred_by) where referred_by is not null;
create function account_data_export(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare profile jsonb;
begin
  select jsonb_build_object('id',u.id,'username',u.username,'display_name',u.display_name,'email',u.email,'bio',u.bio,'country',u.country,'genres',u.genres,'user_types',u.user_types,'preferred_locale',u.preferred_locale,'created_at',u.created_at) into profile
    from users u where u.id=p_user_id and u.deleted_at is null and not u.is_banned;
  if profile is null then raise exception 'Account unavailable' using errcode='P1003';end if;
  return jsonb_build_object('exported_at',now(),'profile',profile,
    'shelves',coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at,s.id) from shelves s where s.user_id=p_user_id),'[]'::jsonb),
    'reading_history',coalesce((select jsonb_agg(to_jsonb(sb)||jsonb_build_object('books',jsonb_build_object('id',b.id,'work_id',b.work_id,'title',b.title,'author_name',b.author_name,'isbn_10',b.isbn_10,'isbn_13',b.isbn_13,'language',b.language,'format',b.format,'publisher',b.publisher,'published_year',b.published_year,'page_count',b.page_count,'google_books_id',b.google_books_id,'open_library_id',b.open_library_id,'goodreads_id',(select min(identifier) from book_edition_identifiers where book_id=b.id and provider='goodreads'),'identifiers',coalesce((select jsonb_agg(jsonb_build_object('provider',provider,'identifier',identifier) order by provider,identifier) from book_edition_identifiers where book_id=b.id),'[]'::jsonb)),'shelves',jsonb_build_object('id',s.id,'name',s.name,'default_type',s.default_type)) order by sb.added_at,sb.id)
      from shelf_books sb left join shelves s on s.id=sb.shelf_id and s.user_id=p_user_id join books original on original.id=sb.book_id join books b on b.id=coalesce(original.canonical_edition_id,original.id) where sb.user_id=p_user_id),'[]'::jsonb),
    'reviews',coalesce((select jsonb_agg(to_jsonb(r)-array['idempotency_key','request_hash'] order by r.created_at,r.id) from reviews r where r.user_id=p_user_id),'[]'::jsonb),
    'quotes',coalesce((select jsonb_agg(to_jsonb(q)-array['idempotency_key','request_hash'] order by q.created_at,q.id) from quotes q where q.user_id=p_user_id),'[]'::jsonb),
    'reading_sessions',coalesce((select jsonb_agg(to_jsonb(r)-array['idempotency_key','request_hash'] order by r.created_at,r.id) from reading_sessions r where r.user_id=p_user_id),'[]'::jsonb),
    'reading_goals',coalesce((select jsonb_agg(to_jsonb(g) order by g.year) from reading_goals g where g.user_id=p_user_id),'[]'::jsonb),
    'writing_prompt_submissions',coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at,s.id) from writing_prompt_submissions s where s.user_id=p_user_id),'[]'::jsonb),
    'xp_history',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at,x.event_key) from xp_ledger x where x.user_id=p_user_id),'[]'::jsonb),
    'tips_sent',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'recipient_id',t.recipient_id,'amount',t.amount,'currency',t.currency,'status',t.status,'created_at',t.created_at) order by t.created_at,t.id) from tips t where t.user_id=p_user_id),'[]'::jsonb));
end $$;
create function referral_statistics(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare code text;
begin
  select referral_code into code from users where id=p_user_id and deleted_at is null and not is_banned;
  if not found then raise exception 'Account unavailable' using errcode='P1003';end if;
  return jsonb_build_object('referralCode',code,
    'referralCount',(select count(*) from users where referred_by=p_user_id),
    'milestones',(select jsonb_agg(jsonb_build_object('id',m.id,'labelKey',m.label_key,'target',m.target,'xp',m.xp,'earned',exists(select 1 from user_badges where user_id=p_user_id and badge_id=m.id)) order by m.target) from(values('connector','connector',10,500),('ambassador','ambassador',50,2000),('liravo_builder','liravoBuilder',200,5000)) m(id,label_key,target,xp)),
    'xpFromReferrals',(select coalesce(sum(amount),0) from xp_ledger where user_id=p_user_id and reason in ('referral_signup','referral_milestone_10','referral_milestone_50','badge:connector','badge:ambassador','badge:liravo_builder')),
    'topReferrers',coalesce((select jsonb_agg(to_jsonb(r) order by r.count desc,r.id) from(select u.id,u.username,u.display_name,count(invited.id)::integer as count from users u join users invited on invited.referred_by=u.id where not u.is_banned and u.deleted_at is null and u.profile_visibility='public' group by u.id order by count(invited.id) desc,u.id limit 10) r),'[]'::jsonb),
    'earnedByCurrency',coalesce((select jsonb_object_agg(currency,amount) from(select currency,sum(commission_amount)::text as amount from referral_commissions where referrer_id=p_user_id and credited_at is not null group by currency) totals),'{}'::jsonb));
end $$;
create unique index referral_badge_outbox on outbox_events(aggregate_id) where aggregate_type='referrals' and event_type='check_badges';
alter function attribute_referral_atomic(uuid,text) rename to attribute_referral_atomic_036;
revoke all on function attribute_referral_atomic_036(uuid,text) from public,anon,authenticated,service_role;
create function attribute_referral_atomic(p_user_id uuid,p_code text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare referrer uuid;
begin
  referrer:=attribute_referral_atomic_036(p_user_id,p_code);
  if referrer is not null then
    insert into outbox_events(aggregate_type,aggregate_id,event_type,payload) values('referrals',p_user_id::text,'check_badges',jsonb_build_object('userId',referrer,'trigger','referral')) on conflict do nothing;
  end if;
  return referrer;
end $$;
revoke all on function attribute_referral_atomic(uuid,text) from public,anon,authenticated;
grant execute on function attribute_referral_atomic(uuid,text) to service_role;
insert into outbox_events(aggregate_type,aggregate_id,event_type,payload)
  select 'referrals','legacy:'||referred_by::text,'check_badges',jsonb_build_object('userId',referred_by,'trigger','referral') from users where referred_by is not null group by referred_by on conflict do nothing;
revoke all on function account_data_export(uuid),referral_statistics(uuid) from public,anon,authenticated;
grant execute on function account_data_export(uuid),referral_statistics(uuid) to service_role;
notify pgrst,'reload schema';
