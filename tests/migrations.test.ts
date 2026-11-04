import { createFormatter, createTranslator } from 'next-intl';
import en from '../messages/en.json';
import { it, expect, vi } from 'vitest';
import postgres from 'postgres';
import { readFileSync, readdirSync } from 'node:fs';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { INTEGRITY_SIGNALS } from '@/constants/cron';

vi.mock('@/lib/auth/getCurrentUser',()=>({getCurrentUser:vi.fn()}));
vi.mock('@/lib/rate-limit',async original=>({...await original<typeof import('@/lib/rate-limit')>(),checkRouteRateLimit:vi.fn(async()=>true)}));
vi.mock('next-intl/server',()=>({
  getTranslations:async(config:string|{namespace?:string}='admin')=>createTranslator({locale:'en',messages:en,namespace:(typeof config==='string'?config:config.namespace??'admin')as never}),
  getFormatter:async()=>createFormatter({locale:'en'}),
}));

it.skipIf(!process.env.MIGRATION_TEST_DATABASE_URL)('rehearses all migrations, outbox replay and concurrent payouts on local PostgreSQL', async () => {
  const url = process.env.MIGRATION_TEST_DATABASE_URL!;
  if (!['localhost','127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Migration rehearsal requires an isolated loopback database');
  const sql = postgres(url, { max: 4, prepare: false, ssl: false, onnotice: () => {} });
  let closeAdapter=async()=>{};
  try {
    const [row] = await sql`select count(*) as count from pg_tables where schemaname='public'`;
    if (Number(row.count) !== 0) throw new Error('Refusing to modify a nonempty database');
    await sql.unsafe(`
      do $$ begin if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if; end $$;
      do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if; end $$;
      do $$ begin if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;
      alter default privileges in schema public grant select on tables to anon, authenticated, service_role;
      alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
      create schema auth;
      create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.role() returns text language sql as $$select coalesce(current_setting('request.jwt.claim.role',true),'service_role')::text$$;
    `).simple();
    const migrations = readdirSync('supabase/migrations').filter(f => f.endsWith('.sql')).sort();
    const legacyUser='00000000-0000-4000-8000-000000009991';
    let legacyAuthor:{owner:string;book:string;arc:string;post:string}|undefined;
    let legacyWorkshop:{id:string;owner:string}|undefined;
    let legacyRating:string|undefined;
    let legacyNotification:{owner:string;badge:string;goal:string}|undefined;
    let legacyEditions:{owner:string;ids:string[];reviewId:string}|undefined;
    let legacyImport:{owner:string;rows:unknown[];response:unknown}|undefined;
    for (const file of migrations) {
      if(file.startsWith('074_')){
        const owner=legacyNotification!.owner,book=(await sql`insert into books(title,author_name) values('Unverified legacy author book','Other author') returning id`)[0].id;
        await sql`insert into author_books(author_id,book_id) values(${owner},${book})`;
        const arc=(await sql`insert into arcs(author_id,book_id,description,is_active) values(${owner},${book},'Legacy offer',true) returning id`)[0].id;
        const post=(await sql`insert into author_posts(author_id,title,body,type,book_id) values(${owner},'Legacy post','A linked post','announcement',${book}) returning id`)[0].id;
        legacyAuthor={owner,book,arc,post};
      }
      if(file.startsWith('072_')){
        const owner=legacyNotification!.owner,id=(await sql`insert into workshop_rooms(name,facilitator_id,max_members,member_count) values('Legacy workshop 072',${owner},8,1) returning id`)[0].id;
        expect((await sql`select member_count from workshop_rooms where id=${id}`)[0].member_count).toBe(2);legacyWorkshop={id,owner};
      }
      if(file.startsWith('071_')){
        const owner=legacyNotification!.owner;legacyRating=(await sql`insert into books(title,author_name,average_rating,ratings_count) values('Legacy mixed ratings 071','Author',4.6,100) returning id`)[0].id;
        await sql`insert into reviews(user_id,book_id,rating,content,review_type,moderation_status) values(${owner},${legacyRating!},5,'Legacy cached review','short','published')`;
      }
      if(file.startsWith('069_')){
        const owner=crypto.randomUUID();await sql`select create_direct_account(${owner},'notifications-069@example.test','notifications_069','Notification reader')`;
        await sql`select award_badge_atomic(${owner},'first_book',50,'First Book','📖')`;
        const badge=(await sql`select id from notifications where user_id=${owner} and type='badge_earned'`)[0].id;
        const goal=(await sql`insert into notifications(user_id,type,message) values(${owner},'reading_goal_milestone','You have read 2 of 8 books and reached 25% of your 2026 reading goal.') returning id`)[0].id;
        legacyNotification={owner,badge,goal};
      }
      if(file.startsWith('066_')){
        const owner=crypto.randomUUID();await sql`select create_direct_account(${owner},'legacy-import-066@example.test','legacy_import_066','Legacy import')`;
        const {parseGoodreadsImport}=await import('@/lib/goodreads-import');
        const rows=parseGoodreadsImport('Book Id,Title,Author,Language,Publisher,Number of Pages,Exclusive Shelf\n966001,Legacy import,Author,fr,Éditeur,320,read').rows.map(row=>({...row,book:{...row.book,publisher:null,page_count:null,published_year:null,language:'en'}}));
        const response=(await sql`select import_goodreads_library(${owner},'legacy-parser-receipt',${sql.json(rows)},0) as result`)[0].result;
        legacyImport={owner,rows,response};
      }
      if(file.startsWith('065_')){
        const owner=crypto.randomUUID();await sql`select create_direct_account(${owner},'legacy-editions@example.test','legacy_editions_reader','Legacy edition reader')`;
        const rows=await sql`insert into books(title,author_name,isbn_10,isbn_13,open_library_id,page_count) values('Legacy C book','Legacy author','0-13-110362-8',null,'/works/OL980001W',200),('Legacy C edition','Legacy author',null,'9780131103627',null,300) returning id`;
        const shelf=(await sql`select id from shelves where user_id=${owner} and default_type='have_read'`)[0].id;await sql`select set_shelf_membership(${owner},${shelf},${rows[1].id},true)`;
        const entry=(await sql`select id from shelf_books where user_id=${owner} and book_id=${rows[1].id}`)[0].id;await sql`select update_shelf_progress(${owner},${entry},100,null)`;
        const review=(await sql`insert into reviews(user_id,book_id,rating,content,review_type,moderation_status,idempotency_key,request_hash) values(${owner},${rows[1].id},4,'Legacy edition history','short','published','legacy-edition-review',${'e'.repeat(64)}) returning id`)[0].id;
        await sql`insert into books(title,author_name,isbn_13,google_books_id) values('Legacy corrupt ISBN','Legacy author','9780306406158','legacy-corrupt-edition')`;
        await sql`select award_xp_once(${owner},20,'write_review',${'review:'+rows[1].id})`;
        legacyEditions={owner,ids:rows.map(row=>row.id),reviewId:review};
      }
      if(file.startsWith('063_')){
        const owner=crypto.randomUUID();await sql`select create_direct_account(${owner},'legacy-completion@example.test','legacy_completion_owner','Legacy completion')`;
        const book=(await sql`insert into books(title,author_name) values('Legacy completion','Fixture') returning id`)[0].id;
        const shelf=(await sql`select id from shelves where user_id=${owner} and default_type='have_read'`)[0].id;await sql`select set_shelf_membership(${owner},${shelf},${book},true)`;
      }
      if(file.startsWith('060_')){
        const owner=crypto.randomUUID();await sql`select create_direct_account(${owner},'legacy-conversion@example.test','legacy_conversion_owner','Legacy conversion')`;
        const books=await sql`insert into books(title,author_name) values('Legacy shelved conversion','Fixture'),('Legacy removed conversion','Fixture') returning id`;
        const shelf=(await sql`select id from shelves where user_id=${owner} and default_type='want_to_read'`)[0].id;
        await sql`select set_shelf_membership(${owner},${shelf},${books[0].id},true)`;
        await sql`select apply_book_interaction(${owner},${books[1].id},'reaction','legacy-conversion-add')`;
        await sql`select apply_book_interaction(${owner},${books[1].id},'reaction','legacy-conversion-remove')`;
      }
      if(file.startsWith('058_'))await sql.unsafe(`
        create schema storage;
        create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text not null);
        alter table storage.objects enable row level security;
        grant usage on schema storage to anon,authenticated;
        grant select,insert,update,delete on storage.objects to anon,authenticated;
        create policy fixture_storage_access on storage.objects for all to anon,authenticated using(true) with check(true);
        insert into storage.objects(bucket_id) values('avatars');
      `).simple();
      const legacy=file.startsWith('040_');
      if(legacy)await sql.unsafe(`
        insert into auth.users(id,email,raw_user_meta_data) values('${legacyUser}','legacy@example.test','{"username":"legacy_audit"}');
        insert into tips(id,user_id,recipient_id,amount,platform_fee,recipient_amount,currency,status) values('${legacyUser}','${legacyUser}','${legacyUser}',100,10,90,'USD','completed');
        insert into payouts(tip_id,recipient_id,amount,currency,status,provider) values('${legacyUser}','${legacyUser}',90,'USD','failed','paystack');
      `).simple();
      const legacyRefund=file.startsWith('041_');
      const legacyTicket=file.startsWith('048_');
      if(legacyTicket)await sql.unsafe(`
        insert into auth.users(id,email,raw_user_meta_data) values('${legacyUser}','legacy@example.test','{"username":"legacy_audit"}');
        insert into events(id,organizer_id,title,event_date,is_paid,ticket_price,currency) values('${legacyUser}','${legacyUser}','Legacy event',now()+interval '2 days',true,10,'USD');
        insert into event_tickets(id,event_id,user_id,amount_paid,currency,status) values('${legacyUser}','${legacyUser}','${legacyUser}',10,'USD','confirmed');
        insert into event_revenue(event_id,organizer_id,amount,currency) values('${legacyUser}','${legacyUser}',9,'USD');
      `).simple();
      if(legacyRefund)await sql.unsafe(`
        insert into auth.users(id,email,raw_user_meta_data) values('${legacyUser}','legacy@example.test','{"username":"legacy_audit"}');
        insert into tips(id,user_id,recipient_id,amount,platform_fee,recipient_amount,currency,status) values('${legacyUser}','${legacyUser}','${legacyUser}',100,10,90,'USD','refunded');
        insert into payment_events(provider,event_id,payload) values('paystack','charge:legacy-paid-refund','{"tipId":"${legacyUser}","status":"completed","payment_id":"legacy-paid-refund","paid_amount_minor":10000,"currency":"USD"}');
        insert into subscriptions(id,user_id,provider,status,amount,currency,provider_event_id,provider_subscription_id) values('${legacyUser}','${legacyUser}','dodopayments','active',4.99,'USD','sub_${legacyUser}','sub_legacy_period');
        insert into payment_events(provider,event_id,payload) values('dodopayments','payment:legacy-sub-paid','{"event":"subscription.activated","subscription_id":"${legacyUser}","user_id":"${legacyUser}","paid_amount_minor":499,"currency":"USD","provider_reference":"sub_${legacyUser}"}');
      `).simple();
      if(file.startsWith('050_')){
        const rolledBack=new Error('verified referral migration rollback');
        try{await sql.begin(async tx=>{
          const buyer=crypto.randomUUID(),referrer=crypto.randomUUID(),late=crypto.randomUUID();
          for(const [index,id] of [buyer,referrer,late].entries())await tx`insert into auth.users(id,email,raw_user_meta_data) values(${id},${'legacy-referral'+index+'@example.test'},${tx.json({username:'legacy_referral_'+index})})`;
          await tx`update users set referred_by=${referrer} where id in (${buyer},${late})`;
          await tx`insert into referrals(referrer_id,referred_id,created_at) values(${referrer},${buyer},now()-interval '1 day'),(${referrer},${late},now()+interval '1 day')`;
          const [sub]=await tx`select create_subscription_intent(${buyer},'dodopayments','USD',4.99,'legacy-referral-sub','referral-test') as subscription`;
          const charge={event:'subscription.activated',subscription_id:sub.subscription.id,user_id:buyer,provider_event_at:new Date().toISOString(),provider_subscription_id:'sub_legacy_referral',payment_id:'pay_legacy_referral',paid_amount_minor:499,tax_minor:0,currency:'USD',provider_reference:'sub_'+sub.subscription.id,period_end:new Date(Date.now()+30*86400000).toISOString()};
          await tx`select process_payment_event('dodopayments','payment:pay_legacy_referral',${tx.json(charge)},'referral-test')`;
          await tx`select process_refund_event('dodopayments','ref_legacy_referral','pay_legacy_referral',100,'USD','referral-test')`;
          expect((await tx`select commission_amount from referral_commissions where idempotency_key='dodopayments:payment:pay_legacy_referral'`)[0].commission_amount).toBe('0.0399');
          for(const [id,payment] of [[buyer,'pay_legacy_ngn'],[late,'pay_late_referral']]){
            const [intent]=await tx`select create_tip_transaction(${id},${referrer},100,10,90,'NGN',${payment},'referral-test') as tip`;
            await tx`select process_payment_event('paystack',${'charge:'+payment},${tx.json({tipId:intent.tip.id,status:'completed',payment_id:payment,providerReference:payment,paid_amount_minor:10000,tax_minor:0,currency:'NGN'})},'referral-test')`;
          }
          const migration=readFileSync(`supabase/migrations/${file}`,'utf8');
          await tx.unsafe(migration).simple();
          expect((await tx`select original_commission_amount,commission_amount,currency from referral_commissions where idempotency_key='dodopayments:payment:pay_legacy_referral'`)[0]).toMatchObject({original_commission_amount:'0.4990',commission_amount:'0.3990',currency:'USD'});
          expect((await tx`select original_commission_amount,commission_amount,currency from referral_commissions where idempotency_key='paystack:charge:pay_legacy_ngn'`)[0]).toMatchObject({original_commission_amount:'1.0000',commission_amount:'1.0000',currency:'NGN'});
          expect((await tx`select count(*)::int as count from referral_commissions where idempotency_key='paystack:charge:pay_late_referral'`)[0].count).toBe(0);
          expect((await tx`select amount from financial_audit_log where action='referral_commission_reconciled' and provider_event_id='payment:pay_legacy_referral'`)[0].amount).toBe('0.3591');
          await tx.unsafe(migration).simple();
          expect((await tx`select count(*)::int as count from financial_audit_log where action='referral_commission_reconciled'`)[0].count).toBe(2);
          throw rolledBack;
        });}catch(error){if(error!==rolledBack)throw error;}
      }
      if(file.startsWith('051_')){
        const rolledBack=new Error('verified legacy buddy rollback');
        try{await sql.begin(async tx=>{
          const user=crypto.randomUUID();await tx`insert into auth.users(id,email,raw_user_meta_data) values(${user},'legacy-buddy@example.test','{"username":"legacy_buddy_scope"}')`;
          const [book]=await tx`insert into books(title,author_name) values('Legacy buddy','Author') returning id`;
          const rooms=await tx`insert into buddy_reads(created_by,book_id,max_participants) values(${user},${book.id},3),(${user},${book.id},3) returning id`;
          for(const room of rooms)await tx`insert into buddy_read_members(buddy_read_id,user_id) values(${room.id},${user})`;
          const [parent]=await tx`insert into buddy_read_notes(buddy_read_id,user_id,content) values(${rooms[0].id},${user},'Legacy parent') returning id`;
          const [reply]=await tx`insert into buddy_read_notes(buddy_read_id,user_id,content,reply_to_id) values(${rooms[1].id},${user},'Legacy cross-group reply',${parent.id}) returning id`;
          await tx.unsafe(readFileSync(`supabase/migrations/${file}`,'utf8')).simple();
          expect((await tx`select reply_to_id,content from buddy_read_notes where id=${reply.id}`)[0]).toMatchObject({reply_to_id:null,content:'Legacy cross-group reply'});
          throw rolledBack;
        });}catch(error){if(error!==rolledBack)throw error;}
      }
      if(file.startsWith('053_')){
        const rolledBack=new Error('verified legacy theme rollback');
        try{await sql.begin(async tx=>{
          await tx`insert into custom_themes(name,is_active,updated_at) values('Legacy old',true,now()-interval '1 day'),('Legacy recent',true,now())`;
          await tx.unsafe(readFileSync(`supabase/migrations/${file}`,'utf8')).simple();
          expect((await tx`select name from custom_themes where is_active`).map(row=>row.name)).toEqual(['Legacy recent']);
          expect((await tx`select count(*)::int as count from financial_audit_log where action='theme_activation_reconciled'`)[0].count).toBe(1);
          throw rolledBack;
        });}catch(error){if(error!==rolledBack)throw error;}
      }
      if(file.startsWith('054_')){
        const rolledBack=new Error('verified legacy catalog rollback');
        try{await sql.begin(async tx=>{
          const [old]=await tx`insert into books(title,author_name,isbn_13,cover_url) values('A Gentleman in Moscow','Amor Towles','9780670026190','https://covers.openlibrary.org/b/isbn/9780670026190-L.jpg') returning id`;
          const [duplicate]=await tx`insert into books(title,author_name,isbn_13) values('Klara and the Sun','Kazuo Ishiguro','9780593311043') returning id`;
          await tx`insert into books(title,author_name,isbn_13) values('Klara and the Sun','Kazuo Ishiguro','9780593318171')`;
          await tx.unsafe(readFileSync(`supabase/migrations/${file}`,'utf8')).simple();
          expect((await tx`select isbn_13,cover_url from books where id=${old.id}`)[0]).toMatchObject({isbn_13:'9780670026197',cover_url:'https://covers.openlibrary.org/b/isbn/9780670026197-L.jpg'});
          expect((await tx`select isbn_13 from books where id=${duplicate.id}`)[0].isbn_13).toBeNull();
          expect((await tx`select count(*)::int as count from financial_audit_log where action='catalog_identity_reconciliation_required'`)[0].count).toBe(1);
          throw rolledBack;
        });}catch(error){if(error!==rolledBack)throw error;}
      }
      await sql.unsafe(readFileSync(`supabase/migrations/${file}`, 'utf8')).simple();
      if(legacyTicket){
        expect((await sql`select status from event_tickets where id=${legacyUser}`)[0].status).toBe('legacy_hold');
        expect(Number((await sql`select creator_balance(${legacyUser},'USD') as balance`)[0].balance.events)).toBe(0);
        expect((await sql`select count(*)::int as count from financial_audit_log where target_user_id=${legacyUser} and action='legacy_event_revenue_held'`)[0].count).toBe(1);
        await sql`delete from events where id=${legacyUser}`;
        await sql`delete from auth.users where id=${legacyUser}`;
      }
      if(legacyRefund){
        expect(Number((await sql`select creator_balance(${legacyUser},'USD') as balance`)[0].balance.available)).toBe(0);
        expect((await sql`select credited from payment_captures where payment_id='legacy-paid-refund'`)[0].credited).toBe(false);
        expect((await sql`select process_payment_event('paystack','charge:legacy-paid-refund',${sql.json({tipId:legacyUser,status:'completed',payment_id:'legacy-paid-refund',paid_amount_minor:10000,tax_minor:0,currency:'USD',providerReference:'legacy-paid-refund'})},'migration-rehearsal') as applied`)[0].applied).toBe(false);
        expect((await sql`select has_premium_access(${legacyUser}) as active`)[0].active).toBe(false);
        const reconciledPeriod={event:'subscription.activated',subscription_id:legacyUser,user_id:legacyUser,payment_id:'legacy-sub-paid',paid_amount_minor:499,tax_minor:0,currency:'USD',provider_reference:'sub_'+legacyUser,provider_subscription_id:'sub_legacy_period',provider_event_at:new Date().toISOString(),period_end:new Date(Date.now()+30*86400000).toISOString()};
        for(let replay=0;replay<2;replay++)expect((await sql`select process_payment_event('dodopayments','payment:legacy-sub-paid',${sql.json(reconciledPeriod)},'migration-rehearsal') as applied`)[0].applied).toBe(false);
        expect((await sql`select has_premium_access(${legacyUser}) as active`)[0].active).toBe(true);
        expect((await sql`select count(*)::int as count from financial_audit_log where action='billing_period_reconciled' and target_user_id=${legacyUser}`)[0].count).toBe(1);

        await sql`select process_refund_event('paystack','legacy-native-refund','legacy-paid-refund',10000,'USD','migration-rehearsal')`;
        expect(Number((await sql`select creator_balance(${legacyUser},'USD') as balance`)[0].balance.available)).toBe(0);
        await sql`delete from refund_inbox where payment_id='legacy-paid-refund'`;
        await sql`delete from payment_refunds where payment_id='legacy-paid-refund'`;
        await sql`delete from payment_captures where user_id=${legacyUser}`;
        await sql`delete from subscriptions where id=${legacyUser}`;
        await sql`delete from payment_events where event_id in ('charge:legacy-paid-refund','payment:legacy-sub-paid')`;
        await sql`delete from financial_audit_log where target_user_id=${legacyUser}`;
        await sql`delete from tips where id=${legacyUser}`;
        await sql`delete from auth.users where id=${legacyUser}`;
      }
      if(legacy){
        const [hold]=await sql`select method,status,amount,last_error from payout_requests where user_id=${legacyUser}`;
        expect(hold).toMatchObject({method:'manual',status:'processing',amount:'90.00',last_error:'Legacy transfer requires reconciliation'});
        expect(Number((await sql`select creator_balance(${legacyUser},'USD') as balance`)[0].balance.available)).toBe(0);
        await sql`delete from financial_audit_log where target_user_id=${legacyUser}`;
        await sql`delete from payout_requests where user_id=${legacyUser}`;
        await sql`delete from payouts where recipient_id=${legacyUser}`;
        await sql`delete from tips where recipient_id=${legacyUser}`;
        await sql`delete from auth.users where id=${legacyUser}`;
      }
    }
    const [functions] = await sql`select count(*) as count from pg_proc where proname in ('create_payout_request_atomic','process_payment_event','apply_social_intent','award_xp_once','process_outbox_event_atomic','create_subscription_intent')`;
    expect(Number(functions.count)).toBe(6);
    for (const role of ['anon', 'authenticated']) {
      const [access] = await sql`select
        has_column_privilege(${role},'public.users','id','SELECT') as profile,
        has_column_privilege(${role},'public.users','email','SELECT') as email,
        has_column_privilege(${role},'public.users','pin_hash','SELECT') as pin,
        has_column_privilege(${role},'public.users','totp_secret','SELECT') as totp,
        has_column_privilege(${role},'public.users','recovery_codes','SELECT') as recovery`;
      expect(access).toEqual({ profile: true, email: false, pin: false, totp: false, recovery: false });
      const routines = await sql`select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname in ('create_payout_request_atomic','create_tip_transaction','process_payment_event','apply_social_intent','award_xp_once','claim_outbox_events','process_outbox_event_atomic','create_subscription_intent','cancel_subscriptions_atomic','page_followed_lists','process_subscription_webhook','toggle_review_like_atomic','increment_xp','claim_digest_delivery','financial_integrity_snapshot','increment_streak_atomic','apply_book_interaction','increment_review_helpfulness','set_feature_flag_atomic','attribute_referral_atomic','request_subscription_cancellation','claim_subscription_cancellations','complete_subscription_cancellation','apply_writing_intent','increment_challenge_vote','publish_writing_prompt','has_premium_access','refresh_premium_access','set_premium_override_atomic','register_billing_account','reconcile_google_play_purchase','complete_google_play_delivery','expire_subscription_entitlements','process_payment_event_legacy','creator_balance','claim_payout_request','settle_payout_request','defer_payout_request','cancel_payout_request','release_legacy_payout_request','process_refund_event','claim_refund_reconciliation','reconcile_capture_and_refund','apply_pending_capture_refunds','award_badge_atomic','count_verified_books','join_content_group','fork_reading_list','cast_debate_vote','reading_room_visible','read_room_posts','apply_community_intent','set_list_follow','begin_factor_challenge','claim_factor_challenge','finish_factor_challenge','disable_factor_atomic','read_factor_session','cleanup_factor_sessions','create_direct_account')`;
      for (const routine of routines) {
        const [permissions] = await sql`select has_function_privilege(${role},${routine.oid}::oid,'EXECUTE') as allowed`;
        expect(permissions.allowed, `${role}:${routine.proname}`).toBe(false);
      }
    }
    const [service] = await sql`select has_column_privilege('service_role','public.users','totp_secret','SELECT') as secret,
      has_function_privilege('service_role','process_payment_event(text,text,jsonb,text)','EXECUTE') as payment`;
    expect(service).toEqual({ secret: true, payment: true });
    const recipient='00000000-0000-4000-8000-000000000095';
    const sender='00000000-0000-4000-8000-000000000096';
    const tip='00000000-0000-4000-8000-000000000097';
    await sql.unsafe(`
      insert into auth.users(id,email,raw_user_meta_data) values
        ('${recipient}','recipient@example.test','{"username":"audit_recipient"}'),
        ('${sender}','sender@example.test','{"username":"audit_sender"}');
      insert into tips(id,user_id,recipient_id,amount,platform_fee,recipient_amount,currency)
        values('${tip}','${sender}','${recipient}',100,10,90,'USD');
    `).simple();
    const payload={tipId:tip,status:'completed',payment_id:'rehearsal-charge',paid_amount_minor:10000,currency:'USD'};
    for(let i=0;i<2;i++) await sql.unsafe('select * from process_payment_event(p_provider => $1,p_event_id => $2,p_payload => $3,p_correlation_id => $4)', ['paystack','rehearsal-event',payload,'rehearsal']);
    const claims=await sql`select * from claim_outbox_events(10)`;
    for(const event of claims) await Promise.all([sql`select process_outbox_event_atomic(${event.id})`,sql`select process_outbox_event_atomic(${event.id})`]);
    const [notifications]=await sql`select count(*) as count from notifications where user_id=${recipient} and type='tip'`;
    const [reward]=await sql`select xp from users where id=${sender}`;
    expect(Number(notifications.count)).toBe(1); expect(reward.xp).toBe(5);
    await sql`insert into user_payout_methods(user_id,provider,display_name,account_number,bank_code,currency) values(${recipient},'manual','Audit account','1234567890','AUDIT','USD')`;
    const outcomes=await Promise.allSettled(['intent-a','intent-b'].map(key => sql.begin(async tx => {
      await tx`select create_payout_request_atomic(${recipient},60,'manual',${key},'rehearsal')`;
      await tx`select pg_sleep(0.2)`;
    })));
    expect(outcomes.filter(result=>result.status==='fulfilled')).toHaveLength(1);
    const [reserved]=await sql`select count(*) as count,sum(amount) as amount from payout_requests`;
    const [audit]=await sql`select count(*) as count from financial_audit_log where action='payout_requested'`;
    expect(Number(reserved.count)).toBe(1); expect(Number(reserved.amount)).toBe(60); expect(Number(audit.count)).toBe(1);
    await sql`insert into reading_lists(user_id,name,is_public,created_at)
      select ${recipient},'List '||i,(i<53),'2026-10-26T00:00:00Z'::timestamptz from generate_series(1,53) i`;
    await sql`insert into reading_list_follows(user_id,list_id) select ${sender},id from reading_lists`;
    const first=await sql`select * from page_followed_lists(${sender},null,null,51)`;
    const last=first[49];
    const second=await sql`select * from page_followed_lists(${sender},${last.created_at},${last.id},51)`;
    const combined=[...first.slice(0,50),...second];
    expect(first).toHaveLength(51); expect(second).toHaveLength(2);
    expect(new Set(combined.map(row=>row.id)).size).toBe(52);
    expect(combined.every(row=>row.is_public)).toBe(true);
    const digestClaims = await Promise.all(Array.from({length:4}, () => sql`select claim_digest_delivery(${sender},'2026-10-26'::date) as claimed`));
    expect(digestClaims.filter(rows => rows[0].claimed)).toHaveLength(1);
    await sql`update digest_deliveries set status='sent',message_id='provider-receipt' where user_id=${sender}`;
    expect((await sql`select claim_digest_delivery(${sender},'2026-10-26'::date) as claimed`)[0].claimed).toBe(false);
    for(let attempt=0;attempt<3;attempt++) {
      expect((await sql`select claim_digest_delivery(${recipient},'2026-10-26'::date) as claimed`)[0].claimed).toBe(true);
      await sql`update digest_deliveries set status='failed' where user_id=${recipient}`;
    }
    expect((await sql`select claim_digest_delivery(${recipient},'2026-10-26'::date) as claimed`)[0].claimed).toBe(false);
    await sql`update digest_deliveries set status='sending',updated_at=now()-interval '6 minutes' where user_id=${recipient}`;
    expect((await sql`select claim_digest_delivery(${recipient},'2026-10-26'::date) as claimed`)[0].claimed).toBe(false);
    expect((await sql`select status from digest_deliveries where user_id=${recipient}`)[0].status).toBe('unknown');
    const [snapshot] = await sql`select financial_integrity_snapshot() as anomalies`;
    expect(snapshot.anomalies).toMatchObject({ tipsWithoutPayout: 0, tipsWithoutOutbox: 0, payoutsWithoutAudit: 0, uncertainDigests: 1 });
    await sql`delete from financial_audit_log where action='payout_requested'`;
    expect((await sql`select financial_integrity_snapshot() as anomalies`)[0].anomalies.payoutsWithoutAudit).toBe(1);
    const [book] = await sql`insert into books(title,author_name) values('Intent test','Author') returning id`;
    vi.stubEnv('DATABASE_PROVIDER', 'railway');
    vi.stubEnv('DATABASE_URL', url);
    vi.stubEnv('DATABASE_SSL', 'false');
    const { contentIntent } = await import('@/lib/content-intents');
    const { getSql } = await import('@/lib/db/pg');
    closeAdapter=async()=>{await getSql().end();};
    try {
      const request = new Request('https://app.test/api/quotes', { headers: { 'Idempotency-Key': 'durable-content-key' } });
      const payload = { book_id: book.id, content: 'A stable quote', page_number: null };
      const records = await Promise.all(Array.from({length:4}, async () => (await contentIntent(request,sender,'quotes',payload)).insert()));
      expect(new Set(records.map(record => record.id)).size).toBe(1);
      expect((await sql`select count(*)::int as count from quotes where user_id=${sender}`)[0].count).toBe(1);
      expect(records[0]).not.toHaveProperty('idempotency_key');
      await expect(contentIntent(request,sender,'quotes',{ ...payload, content: 'Different quote' })).rejects.toMatchObject({status:409});
      const [before] = await sql`select xp from users where id=${sender}`;
      await sql`select award_xp_once(${sender},10,'post_quote',${`quote:${records[0].id}`})`;
      const rewards = await sql`select * from claim_outbox_events(20)`;
      for(const event of rewards) await sql`select process_outbox_event_atomic(${event.id})`;
      expect((await sql`select xp from users where id=${sender}`)[0].xp).toBe(before.xp+10);
      await sql`delete from quotes where id=${records[0].id}`;
      expect((await (await contentIntent(request,sender,'quotes',payload)).insert()).id).toBe(records[0].id);
      expect((await sql`select count(*)::int as count from quotes where user_id=${sender}`)[0].count).toBe(0);
      await sql`update users set is_admin=true where id=${recipient}`;
      const { getPgQueryBuilderFactory } = await import('@/lib/db/query-builder');
      const factory = getPgQueryBuilderFactory();
      const projected = await factory.from<{id:string}>('quotes').insert({user_id:sender,book_id:book.id,content:'Projection test'}).select('id').single();
      expect(projected.error).toBeNull(); expect(Object.keys(projected.data!)).toEqual(['id']);
      const listed = await factory.from<Array<{id:string}>>('quotes').select('id',{count:'exact'}).eq('user_id',sender).limit(1);
      expect(listed.count).toBe(1); expect(listed.data).toHaveLength(1);
      const removed = await factory.from<Array<{id:string}>>('quotes').delete().eq('id',projected.data!.id).select('id');
      expect(removed.data).toEqual([{id:projected.data!.id}]);
      const ownerPayloads: Array<[Parameters<typeof contentIntent>[2],Record<string,unknown>]> = [
        ['reviews',{book_id:book.id,rating:4,content:'A review',review_type:'short'}],
        ['buddy_reads',{book_id:book.id,max_participants:3,current_chapter:1,is_active:true}],
        ['ask_writer_questions',{question:'A test question?',tags:[],answer_count:0}],
        ['reading_sessions',{book_id:book.id,pages_read:2}],
      ];
      let questionId='', buddyId='', reviewId='';
      for(const [table,values] of ownerPayloads) {
        const intentRequest = new Request('https://app.test/api/content',{headers:{'Idempotency-Key':`table-intent-${table}`}});
        const row = await (await contentIntent(intentRequest,sender,table,values)).insert();
        expect((await (await contentIntent(intentRequest,sender,table,values)).insert()).id).toBe(row.id);
        if(table==='ask_writer_questions') questionId=row.id;
        if(table==='buddy_reads') buddyId=row.id;
        if(table==='reviews') reviewId=row.id;
        if(table==='reading_sessions') expect(row.started_at).toBeTruthy();
      }
      const third='00000000-0000-4000-8000-000000000094';
      await sql`insert into auth.users(id,email,raw_user_meta_data) values(${third},'third@example.test','{"username":"audit_third"}')`;
      await sql`update buddy_reads set max_participants=2 where id=${buddyId}`;
      const joins=await Promise.allSettled([recipient,third].map(member=>sql.begin(async tx=>{
        await tx`insert into buddy_read_members(buddy_read_id,user_id) values(${buddyId},${member})`;
        await tx`select pg_sleep(0.1)`;
      })));
      expect(joins.filter(result=>result.status==='fulfilled')).toHaveLength(1);
      expect((await sql`select count(*)::int as count from buddy_read_members where buddy_read_id=${buddyId}`)[0].count).toBe(2);
      const replayMember=await factory.from('buddy_read_members').upsert({buddy_read_id:buddyId,user_id:sender},{onConflict:'buddy_read_id,user_id',ignoreDuplicates:true});
      expect(replayMember.error).toBeNull();
      await expect(sql.begin(async tx=>{
        await tx`insert into quotes(user_id,book_id,content,idempotency_key,request_hash) values(${sender},${book.id},'Rollback test','rolled-back-key',${'a'.repeat(64)})`;
        throw new Error('Abort content transaction');
      })).rejects.toThrow('Abort content transaction');
      expect((await sql`select count(*)::int as count from content_intents where intent_key='rolled-back-key'`)[0].count).toBe(0);
      const react=()=>sql`select apply_book_interaction(${sender},${book.id},'reaction','reaction-intent') as result`;
      const reactions=await Promise.all(Array.from({length:4},react));
      expect(reactions.every(rows=>rows[0].result.reacted)).toBe(true);
      expect((await sql`select want_to_read_count from books where id=${book.id}`)[0].want_to_read_count).toBe(1);
      await sql`select apply_book_interaction(${sender},${book.id},'reaction','reaction-intent-2')`;
      await react();
      expect((await sql`select want_to_read_count from books where id=${book.id}`)[0].want_to_read_count).toBe(0);
      const vote=()=>sql`select apply_book_interaction(${sender},${book.id},'helpfulness','helpful-intent',${reviewId},true) as result`;
      await Promise.all(Array.from({length:4},vote));
      expect((await sql`select helpful_votes,unhelpful_votes from reviews where id=${reviewId}`)[0]).toEqual({helpful_votes:1,unhelpful_votes:0});
      await expect(sql`select apply_book_interaction(${sender},${book.id},'helpfulness','helpful-intent',${reviewId},false)`).rejects.toThrow('Conflicting');
      await sql`select apply_book_interaction(${sender},${book.id},'helpfulness','unhelpful-intent',${reviewId},false)`;
      await vote();
      expect((await sql`select helpful_votes,unhelpful_votes from reviews where id=${reviewId}`)[0]).toEqual({helpful_votes:0,unhelpful_votes:1});
      const embedded=await factory.from<{writer:{username:string};book:{title:string}}>('reviews').select('id,writer:user_id(username),book:books(title)').eq('id',reviewId).single();
      expect(embedded.error).toBeNull(); expect(embedded.data).toMatchObject({writer:{username:'audit_sender'},book:{title:'Intent test'}});
      const follow=await factory.from('follows').upsert({follower_id:sender,following_id:recipient},{onConflict:'follower_id,following_id'}).select('follower:users!follower_id(username),following:users!following_id(username)').single();
      expect(follow.error).toBeNull(); expect(follow.data).toEqual({follower:{username:'audit_sender'},following:{username:'audit_recipient'}});
      const nested=await factory.from('users').select('id,outgoing:follows!follower_id(following:following_id(username)),total:follows!follower_id(count),referrer:referred_by(username)').eq('id',sender).single();
      expect(nested.error).toBeNull(); expect(nested.data).toMatchObject({outgoing:[{following:{username:'audit_recipient'}}],total:[{count:1}],referrer:null});
      const ambiguous=await factory.from('follows').select('users(username)');
      expect(ambiguous.error?.message).toContain('Ambiguous relationship');
      vi.mocked(getCurrentUser).mockResolvedValue({id:recipient,email:'recipient@example.test'});
      await sql`update users set user_types=array['reader','author'],email='sender.contact@example.test' where id=${sender}`;
      const authorFilter=await factory.from<Array<{id:string}>>('users').select('id').contains('user_types',['author']).not('email','is',null).ilike('username','AUDIT_SENDER');
      expect(authorFilter.error).toBeNull(); expect(authorFilter.data).toEqual([{id:sender}]);
      const overlap=await factory.from<Array<{id:string}>>('users').select('id').eq('id',sender).overlaps('user_types',['author','creator']);
      expect(overlap.error).toBeNull();expect(overlap.data).toEqual([{id:sender}]);
      for(const values of [[],["author'});drop table books;--"]]){
        const result=await factory.from<Array<{id:string}>>('users').select('id').eq('id',sender).overlaps('user_types',values);
        expect(result.error).toBeNull();expect(result.data).toEqual([]);
      }
      const injection=await factory.from<Array<{id:string}>>('users').select('id').ilike('username',"%' OR true --");
      expect(injection.error).toBeNull(); expect(injection.data).toEqual([]);
      const { PgQueryBuilder } = await import('@/lib/db/query-builder');
      const execute=PgQueryBuilder.prototype.execute;
      const queryGuard=vi.spyOn(PgQueryBuilder.prototype,'execute').mockImplementation(async function(this: InstanceType<typeof PgQueryBuilder>) {
        const result=await execute.call(this);
        if(result.error) throw new Error(`Admin query failed: ${result.error.message}`);
        return result;
      });
      try {
        const pages=[
          await import('@/app/(app)/admin/page'),
          await import('@/app/(app)/admin/books/page'),
          await import('@/app/(app)/admin/promoted-listings/page'),
          await import('@/app/(app)/admin/seasonal-events/page'),
          await import('@/app/(app)/admin/writing-challenges/page'),
        ];
        for(const page of pages) expect(await page.default({searchParams:{}})).toBeTruthy();
      } finally { queryGuard.mockRestore(); }
      const originalWriter=(await sql`select is_verified_author from users where id=${recipient}`)[0].is_verified_author;await sql`update users set is_verified_author=true where id=${recipient}`;
      const answerRequest = new Request('https://app.test/api/content',{headers:{'Idempotency-Key':'answer-intent-key'}});
      const answerPayload = {question_id:questionId,answer:'A sufficiently detailed answer.'};
      await (await contentIntent(answerRequest,recipient,'ask_writer_answers',answerPayload)).insert();
      await (await contentIntent(answerRequest,recipient,'ask_writer_answers',answerPayload)).insert();
      expect((await sql`select answer_count from ask_writer_questions where id=${questionId}`)[0].answer_count).toBe(1);
      await sql`update users set is_verified_author=${originalWriter} where id=${recipient}`;
    } finally {
      vi.unstubAllEnvs();
    }
    await sql`update users set is_admin=true where id=${recipient}`;
    await expect(sql`select set_feature_flag_atomic(${sender},'google_auth',false)`).rejects.toThrow('Forbidden');
    await sql`update feature_flags set enabled=true where name in ('google_auth','telegram_auth')`;
    const disabled=await Promise.allSettled(['google_auth','telegram_auth'].map(name=>sql.begin(async tx=>{
      await tx`select set_feature_flag_atomic(${recipient},${name},false)`;
      await tx`select pg_sleep(0.1)`;
    })));
    expect(disabled.filter(result=>result.status==='fulfilled')).toHaveLength(1);
    expect((await sql`select count(*)::int as count from feature_flags where name in ('google_auth','telegram_auth') and enabled`)[0].count).toBe(1);
    await expect(sql`select set_feature_flag_atomic(${recipient},'unknown_flag',true)`).rejects.toThrow('Unknown flag');
    const referred='00000000-0000-4000-8000-000000000093';
    await sql`insert into auth.users(id,email,raw_user_meta_data) values(${referred},'referred@example.test','{"username":"audit_referred"}')`;
    const codes=await sql`select id,referral_code,xp from users where id in (${recipient},${sender}) order by id`;
    const assignments=await Promise.all(codes.map(ref=>sql`select attribute_referral_atomic(${referred},${ref.referral_code}) as referrer`));
    const winner=assignments[0][0].referrer;
    expect(assignments[1][0].referrer).toBe(winner);
    expect((await sql`select count(*)::int as count from referrals where referred_id=${referred}`)[0].count).toBe(1);
    expect((await sql`select count(*)::int as count from notifications where actor_id=${referred} and type='referral'`)[0].count).toBe(1);
    expect((await sql`select xp from users where id=${winner}`)[0].xp).toBe(codes.find(row=>row.id===winner)!.xp+200);
    await expect(sql.begin(async tx=>{
      await tx`select set_config('request.jwt.claim.role','authenticated',true)`;
      await tx`update users set referred_by=null where id=${referred}`;
    })).rejects.toThrow('Referral identity');
    await sql`insert into subscriptions(user_id,provider,status,amount,currency,provider_subscription_id) values
      (${recipient},'dodopayments','active',4.99,'USD','sub_cancel_rehearsal'),
      (${recipient},'paystack','active',7500,'NGN',null)`;
    await sql`update users set is_premium=true where id=${recipient}`;
    await Promise.all(Array.from({length:4},()=>sql`select request_subscription_cancellation(${recipient},'cancel-rehearsal')`));
    expect((await sql`select count(*)::int as count from subscription_cancellations`)[0].count).toBe(2);
    expect((await sql`select is_premium from users where id=${recipient}`)[0].is_premium).toBe(true);
    const cancellationClaims=(await Promise.all([sql`select * from claim_subscription_cancellations(${recipient},3)`,sql`select * from claim_subscription_cancellations(${recipient},3)`])).flat();
    expect(cancellationClaims).toHaveLength(2);
    for(const job of cancellationClaims) await Promise.all([sql`select complete_subscription_cancellation(${job.subscription_id})`,sql`select complete_subscription_cancellation(${job.subscription_id})`]);
    expect((await sql`select is_premium from users where id=${recipient}`)[0].is_premium).toBe(false);
    expect((await sql`select count(*)::int as count from financial_audit_log where action='subscription_cancelled'`)[0].count).toBe(2);
    await sql`update subscription_cancellations set status='processing',attempts=10,claimed_at=now()-interval '3 minutes'`;
    await sql`select * from claim_subscription_cancellations(null,3)`;
    expect((await sql`select financial_integrity_snapshot() as snapshot`)[0].snapshot.failedOutbox).toBe(2);
    expect((await sql`select has_function_privilege('service_role','cancel_subscriptions_atomic(uuid,text)','EXECUTE') as allowed`)[0].allowed).toBe(false);
    const publishedPrompts=await Promise.all(Array.from({length:6},()=>sql`select publish_writing_prompt(current_date+8,'Write a vivid story about an unlikely friendship.','Friendship') as result`));
    expect(publishedPrompts.filter(rows=>rows[0].result.created)).toHaveLength(1);
    expect(new Set(publishedPrompts.map(rows=>rows[0].result.prompt.id)).size).toBe(1);
    const [writingPrompt]=await sql`insert into writing_prompts(prompt_text,prompt_date) values('Write about a surprising journey.',current_date) returning id`;
    const promptPayload={content:'A thoughtful writing response with enough characters to meet the prompt minimum.'};
    const [writingXp]=await sql`select xp from users where id=${sender}`;
    const responses=await Promise.all(Array.from({length:4},()=>sql`select apply_writing_intent(${sender},'prompt',${writingPrompt.id},'writing-prompt-key',${sql.json(promptPayload)}) as response`));
    const responseId=responses[0][0].response.id;
    expect(responses.every(rows=>rows[0].response.id===responseId)).toBe(true);
    expect((await sql`select xp from users where id=${sender}`)[0].xp).toBe(writingXp.xp+10);
    await expect(sql`select apply_writing_intent(${sender},'prompt',${writingPrompt.id},'writing-prompt-key',${sql.json({content:'Different content'})})`).rejects.toThrow('Conflicting');
    await expect(sql`select apply_writing_intent(${sender},'prompt',${writingPrompt.id},'another-prompt-key',${sql.json(promptPayload)})`).rejects.toThrow('Already submitted');
    await sql`delete from writing_prompts where id=${writingPrompt.id}`;
    expect((await sql`select apply_writing_intent(${sender},'prompt',${writingPrompt.id},'writing-prompt-key',${sql.json(promptPayload)}) as response`)[0].response.id).toBe(responseId);
    const [writingChallenge]=await sql`insert into writing_challenges(title,type,start_date,end_date) values('Audit writing challenge','weekly',now()-interval '1 day',now()+interval '1 day') returning id`;
    await Promise.all([sender,recipient].flatMap(actor=>Array.from({length:3},()=>sql`select apply_writing_intent(${actor},'join',${writingChallenge.id},'writing-join-key','{}')`)));
    expect((await sql`select participant_count from writing_challenges where id=${writingChallenge.id}`)[0].participant_count).toBe(2);
    const challengePayload={title:'First entry',content:'One two three four five.'};
    const entries=await Promise.all(Array.from({length:4},()=>sql`select apply_writing_intent(${sender},'challenge',${writingChallenge.id},'writing-challenge-key',${sql.json(challengePayload)}) as response`));
    const entryId=entries[0][0].response.id;
    expect(entries.every(rows=>rows[0].response.id===entryId)).toBe(true);
    expect(entries[0][0].response.word_count).toBe(5);
    expect((await sql`select xp from users where id=${sender}`)[0].xp).toBe(writingXp.xp+35);
    await sql`select apply_writing_intent(${sender},'challenge',${writingChallenge.id},'writing-edit-key',${sql.json({...challengePayload,title:'Edited entry'})})`;
    await sql`select apply_writing_intent(${sender},'challenge',${writingChallenge.id},'writing-challenge-key',${sql.json(challengePayload)})`;
    expect((await sql`select title from writing_challenge_submissions where id=${entryId}`)[0].title).toBe('Edited entry');
    expect((await sql`select xp from users where id=${sender}`)[0].xp).toBe(writingXp.xp+35);
    await Promise.all(Array.from({length:4},()=>sql`select apply_writing_intent(${recipient},'vote',${entryId},'writing-vote-key','{"voted":true}')`));
    expect((await sql`select community_votes from writing_challenge_submissions where id=${entryId}`)[0].community_votes).toBe(1);
    await sql`select apply_writing_intent(${recipient},'vote',${entryId},'writing-unvote-key','{"voted":false}')`;
    await sql`select apply_writing_intent(${recipient},'vote',${entryId},'writing-vote-key','{"voted":true}')`;
    expect((await sql`select community_votes from writing_challenge_submissions where id=${entryId}`)[0].community_votes).toBe(0);
    await expect(sql`select apply_writing_intent(${sender},'vote',${entryId},'writing-self-vote','{"voted":true}')`).rejects.toThrow('own submission');
    const [bestQuestion]=await sql`insert into ask_writer_questions(user_id,question) values(${sender},'Which writing technique works best?') returning id`;
    const originalWriters=await sql`select id,is_verified_author from users where id in(${recipient},${referred})`;await sql`update users set is_verified_author=true where id in(${recipient},${referred})`;
    const bestCandidates=await sql`insert into ask_writer_answers(user_id,question_id,answer) values(${recipient},${bestQuestion.id},'First useful answer for testing.'),(${referred},${bestQuestion.id},'Second useful answer for testing.') returning id,user_id`;
    for(const writer of originalWriters)await sql`update users set is_verified_author=${writer.is_verified_author} where id=${writer.id}`;
    const bestOutcomes=await Promise.allSettled(bestCandidates.map(answer=>sql`select apply_writing_intent(${sender},'best_answer',${bestQuestion.id},${'best-answer-key-'+answer.id},${sql.json({answer_id:answer.id})})`));
    expect(bestOutcomes.filter(result=>result.status==='fulfilled')).toHaveLength(1);
    const [selectedAnswer]=await sql`select best_answer_id from ask_writer_questions where id=${bestQuestion.id}`;
    expect((await sql`select count(*)::int as count from xp_ledger where event_key=${'best-answer:'+bestQuestion.id}`)[0].count).toBe(1);
    const remainingAnswer=bestCandidates.find(answer=>answer.id!==selectedAnswer.best_answer_id)!;
    await expect(sql`select apply_writing_intent(${recipient},'best_answer',${bestQuestion.id},'foreign-best-answer',${sql.json({answer_id:remainingAnswer.id})})`).rejects.toThrow('Not your question');
    await sql`delete from ask_writer_answers where id=${selectedAnswer.best_answer_id}`;
    await sql`select apply_writing_intent(${sender},'best_answer',${bestQuestion.id},'replacement-best-answer',${sql.json({answer_id:remainingAnswer.id})})`;
    expect((await sql`select count(*)::int as count from xp_ledger where event_key=${'best-answer:'+bestQuestion.id}`)[0].count).toBe(1);
    const playUser='00000000-0000-4000-8000-000000008901',otherPlayUser='00000000-0000-4000-8000-000000008902';
    await sql`insert into auth.users(id,email,raw_user_meta_data) values(${playUser},'play@example.test','{"username":"audit_play"}'),(${otherPlayUser},'play2@example.test','{"username":"audit_play_two"}')`;
    const accountId='a'.repeat(64),otherAccountId='e'.repeat(64),playToken='gplay_'+'b'.repeat(64),linkedToken='gplay_'+'c'.repeat(64),otherPlayToken='gplay_'+'f'.repeat(64);
    await sql`select register_billing_account(${playUser},${accountId})`;
    await sql`select register_billing_account(${otherPlayUser},${otherAccountId})`;
    await expect(sql`select register_billing_account(${otherPlayUser},${accountId})`).rejects.toThrow('binding conflict');
    const [playClock]=await sql`select now() as verified,now()+interval '30 days' as expiry`;
    const verifyPlay=(actor:string,token:string,account:string|null,state='SUBSCRIPTION_STATE_ACTIVE',verified=playClock.verified,delivery:string|null=null,fingerprint:string|null=null,linked:string|null=null)=>sql`select reconcile_google_play_purchase(${actor},${token},'liravo_premium_monthly',${state},${playClock.expiry},${account},${linked},${verified},false,'play-rehearsal',${delivery},${fingerprint}) as result`;
    const playResults=await Promise.all(Array.from({length:4},()=>verifyPlay(playUser,playToken,accountId)));
    expect(new Set(playResults.map(rows=>rows[0].result.id)).size).toBe(1);
    expect((await sql`select count(*)::int as count from financial_audit_log where action='google_play_entitlement_verified' and target_user_id=${playUser}`)[0].count).toBe(1);
    expect((await sql`select is_premium from users where id=${playUser}`)[0].is_premium).toBe(true);
    await expect(verifyPlay(otherPlayUser,playToken,otherAccountId)).rejects.toThrow('another account');
    expect((await sql`select is_premium from users where id=${otherPlayUser}`)[0].is_premium).toBe(false);
    await expect(verifyPlay(otherPlayUser,otherPlayToken,null,'SUBSCRIPTION_STATE_ACTIVE',playClock.verified,null,null,playToken)).rejects.toThrow('Linked purchase');
    await verifyPlay(playUser,linkedToken,null,'SUBSCRIPTION_STATE_ACTIVE',playClock.verified,null,null,playToken);
    const [stalePlay]=await verifyPlay(playUser,playToken,accountId,'SUBSCRIPTION_STATE_EXPIRED',new Date(playClock.verified.getTime()-60000));
    expect(stalePlay.result).toMatchObject({active:true,providerState:'SUBSCRIPTION_STATE_ACTIVE'});
    expect((await sql`select status from subscriptions where provider_event_id=${playToken}`)[0].status).toBe('active');
    await verifyPlay(playUser,playToken,accountId,'SUBSCRIPTION_STATE_CANCELED',new Date(playClock.verified.getTime()+1));
    expect((await sql`select is_premium from users where id=${playUser}`)[0].is_premium).toBe(true);
    await verifyPlay(playUser,playToken,accountId,'SUBSCRIPTION_STATE_ACTIVE',new Date(playClock.verified.getTime()+2),'google-delivery-test','d'.repeat(64));
    expect((await sql`select status from billing_webhook_receipts where delivery_id='google-delivery-test'`)[0].status).toBe('pending_ack');
    await sql`select complete_google_play_delivery(${playUser},${playToken},true,'google-delivery-test',${'d'.repeat(64)},'play-rehearsal')`;
    await sql`select complete_google_play_delivery(${playUser},${playToken},true,'google-delivery-test',${'d'.repeat(64)},'play-rehearsal')`;
    expect((await sql`select count(*)::int as count from financial_audit_log where action='google_play_purchase_acknowledged' and target_user_id=${playUser}`)[0].count).toBe(1);
    await expect(verifyPlay(otherPlayUser,otherPlayToken,otherAccountId,'SUBSCRIPTION_STATE_ACTIVE',playClock.verified,'google-delivery-test','1'.repeat(64))).rejects.toThrow('delivery conflict');
    const deliveryRace=await Promise.allSettled([
      verifyPlay(playUser,playToken,accountId,'SUBSCRIPTION_STATE_ACTIVE',new Date(playClock.verified.getTime()+3),'google-delivery-race','2'.repeat(64)),
      verifyPlay(otherPlayUser,otherPlayToken,otherAccountId,'SUBSCRIPTION_STATE_ACTIVE',playClock.verified,'google-delivery-race','3'.repeat(64)),
    ]);
    expect(deliveryRace.filter(result=>result.status==='fulfilled')).toHaveLength(1);
    const [webSubscription]=await sql`select create_subscription_intent(${playUser},'paystack','USD',4.99,'play-web-intent','play-rehearsal') as result`;
    const webId=webSubscription.result.id;
    await sql`select process_payment_event('paystack','play-web-payment',${sql.json({event:'subscription.activated',subscription_id:webId,user_id:playUser,payment_id:'play-web-charge',period_end:new Date(Date.now()+30*86400000).toISOString(),provider_event_at:new Date().toISOString(),paid_amount_minor:499,currency:'USD',provider_reference:'sub_'+webId})},'play-rehearsal')`;
    expect((await sql`select request_subscription_cancellation(${playUser},'play-rehearsal') as count`)[0].count).toBe(1);
    const webClaims=await sql`select * from claim_subscription_cancellations(${playUser},3)`;
    expect(webClaims).toHaveLength(1);expect(webClaims[0].provider).toBe('paystack');
    await sql`select complete_subscription_cancellation(${webId})`;
    expect((await sql`select is_premium from users where id=${playUser}`)[0].is_premium).toBe(true);
    expect((await sql`select renewal_cancelled from subscriptions where id=${webId}`)[0].renewal_cancelled).toBe(true);
    await sql`update subscriptions set status='expired',current_period_end=now()-interval '1 second' where id=${webId}`;
    await sql`select set_premium_override_atomic(${recipient},${playUser},true,'play-rehearsal')`;
    for(const token of [playToken,linkedToken]) await verifyPlay(playUser,token,token===playToken?accountId:null,'SUBSCRIPTION_STATE_EXPIRED',new Date(playClock.verified.getTime()+10));
    expect((await sql`select is_premium from users where id=${playUser}`)[0].is_premium).toBe(true);
    await sql`select set_premium_override_atomic(${recipient},${playUser},false,'play-rehearsal')`;
    expect((await sql`select has_premium_access(${playUser}) as active`)[0].active).toBe(false);
    await expect(sql.begin(async tx=>{await tx`select set_config('request.jwt.claim.role','authenticated',true)`;await tx`update users set premium_override=true where id=${playUser}`;})).rejects.toThrow('service authorization');
    await verifyPlay(playUser,playToken,accountId,'SUBSCRIPTION_STATE_ACTIVE',new Date(playClock.verified.getTime()+20));
    await sql`update subscriptions set current_period_end=now()-interval '1 second' where provider_event_id=${playToken}`;
    expect((await sql`select has_premium_access(${playUser}) as active`)[0].active).toBe(false);
    await sql`select expire_subscription_entitlements(200)`;
    expect((await sql`select status from subscriptions where provider_event_id=${playToken}`)[0].status).toBe('expired');
    for(const role of ['anon','authenticated']) expect((await sql`select has_column_privilege(${role},'public.users','premium_override','SELECT') as allowed`)[0].allowed).toBe(false);
    await sql`update users set reading_streak=6,last_streak_date='2026-10-25',streak_freeze_tokens=0 where id=${sender}`;
    await expect(sql.begin(async tx => {
      await tx`select set_config('request.jwt.claim.role','authenticated',true)`;
      await tx`update users set reading_streak=30 where id=${sender}`;
    })).rejects.toThrow('Privileged');
    const [xpBefore] = await sql`select xp from users where id=${sender}`;
    await Promise.all(Array.from({length:4}, () => sql`select increment_streak_atomic(${sender},'reading','2026-10-26'::date)`));
    expect((await sql`select reading_streak,streak_freeze_tokens,xp from users where id=${sender}`)[0]).toEqual({reading_streak:7,streak_freeze_tokens:1,xp:xpBefore.xp+50});
    await sql`select increment_streak_atomic(${sender},'reading','2026-10-28'::date)`;
    expect((await sql`select reading_streak,streak_freeze_tokens from users where id=${sender}`)[0]).toEqual({reading_streak:8,streak_freeze_tokens:0});
    await sql`select increment_streak_atomic(${sender},'reading','2026-11-01'::date)`;
    expect((await sql`select reading_streak from users where id=${sender}`)[0].reading_streak).toBe(1);
    await sql`insert into tips(user_id,recipient_id,amount,platform_fee,recipient_amount,currency,status) values(${sender},${recipient},1000,100,900,'NGN','completed') returning id`;
    await sql`insert into user_payout_methods(user_id,provider,display_name,account_number,bank_code,currency) values(${recipient},'paystack','Audit NGN account','1234567890','058','NGN')`;
    const [ngnBalance]=await sql`select creator_balance(${recipient},'NGN') as balance`;
    expect(Number(ngnBalance.balance.available)).toBe(900);
    await expect(sql`select create_payout_request_atomic(${recipient},5,'paystack','wrong-currency-intent','rehearsal','USD')`).rejects.toThrow('Invalid payout');
    const [ngnPayout]=await sql`select create_payout_request_atomic(${recipient},600,'paystack','ngn-payout-intent','rehearsal','NGN') as id`;
    await sql`update user_payout_methods set account_number='9999999999' where user_id=${recipient} and provider='paystack'`;
    const payoutClaims=await Promise.all(Array.from({length:4},()=>sql`select claim_payout_request(${recipient},${ngnPayout.id},'rehearsal') as result`));
    expect(payoutClaims.filter(rows=>rows[0].result.claimed)).toHaveLength(1);
    const ngnClaim=payoutClaims.find(rows=>rows[0].result.claimed)![0].result;
    expect(ngnClaim.destination.account_number).toBe('1234567890');
    expect(Number((await sql`select creator_balance(${recipient},'NGN') as balance`)[0].balance.available)).toBe(300);
    await expect(sql`select cancel_payout_request(${recipient},${ngnPayout.id},'rehearsal')`).rejects.toThrow('processing');
    await expect(sql`select settle_payout_request(${recipient},${ngnPayout.id},'completed',${ngnClaim.transfer_reference},600,'USD','transfer-code','rehearsal')`).rejects.toThrow('mismatch');
    await sql`select defer_payout_request(${ngnPayout.id},${ngnClaim.attempts},'Ambiguous provider response')`;
    expect((await sql`select status from payout_requests where id=${ngnPayout.id}`)[0].status).toBe('processing');
    for(let replay=0;replay<2;replay++)await sql`select settle_payout_request(null,${ngnPayout.id},'completed',${ngnClaim.transfer_reference},600,'NGN','transfer-code','rehearsal')`;
    expect((await sql`select count(*)::int as count from financial_audit_log where action='payout_completed' and metadata->>'payout_id'=${ngnPayout.id}`)[0].count).toBe(1);
    await expect(sql`select settle_payout_request(null,${ngnPayout.id},'completed',${ngnClaim.transfer_reference},600,'NGN','other-transfer-code','rehearsal')`).rejects.toThrow('identity conflict');
    await sql`select settle_payout_request(null,${ngnPayout.id},'reversed',${ngnClaim.transfer_reference},600,'NGN','transfer-code','rehearsal')`;
    expect(Number((await sql`select creator_balance(${recipient},'NGN') as balance`)[0].balance.available)).toBe(900);
    const [cancelPayout]=await sql`select create_payout_request_atomic(${recipient},200,'paystack','ngn-cancel-intent','rehearsal','NGN') as id`;
    await expect(sql`select cancel_payout_request(${sender},${cancelPayout.id},'rehearsal')`).rejects.toThrow('Unknown payout');
    for(let replay=0;replay<2;replay++)await sql`select cancel_payout_request(${recipient},${cancelPayout.id},'rehearsal')`;
    expect(Number((await sql`select creator_balance(${recipient},'NGN') as balance`)[0].balance.available)).toBe(900);
    const [racePayout]=await sql`select create_payout_request_atomic(${recipient},200,'paystack','approval-cancel-race','rehearsal','NGN') as id`;
    const approvalRace=await Promise.allSettled([sql`select claim_payout_request(${recipient},${racePayout.id},'rehearsal') as result`,sql`select cancel_payout_request(${recipient},${racePayout.id},'rehearsal')`]);
    const [raceState]=await sql`select status,transfer_reference from payout_requests where id=${racePayout.id}`;
    expect(['processing','cancelled']).toContain(raceState.status);
    if(raceState.status==='processing') {
      expect(approvalRace[1].status).toBe('rejected');
      await sql`select settle_payout_request(null,${racePayout.id},'failed',${raceState.transfer_reference},200,'NGN','race-transfer','rehearsal')`;
    }else expect(approvalRace[0].status==='fulfilled'&&approvalRace[0].value[0].result.claimed).toBe(false);
    const [manualPayout]=await sql`select create_payout_request_atomic(${recipient},5,'manual','manual-payout-intent','rehearsal','USD') as id`;
    await expect(sql`select settle_payout_request(${recipient},${manualPayout.id},'completed','bank-receipt',5,'USD',null,'rehearsal')`).rejects.toThrow('Admin settlement');
    await expect(sql`select claim_payout_request(${sender},${manualPayout.id},'rehearsal')`).rejects.toThrow('Forbidden');
    await sql`select claim_payout_request(${recipient},${manualPayout.id},'rehearsal')`;
    await expect(sql`select settle_payout_request(null,${manualPayout.id},'completed','bank-receipt',5,'USD',null,'rehearsal')`).rejects.toThrow('Admin settlement');
    for(let replay=0;replay<2;replay++)await sql`select settle_payout_request(${recipient},${manualPayout.id},'completed','bank-receipt',5,'USD',null,'rehearsal')`;
    expect((await sql`select status from payout_requests where id=${manualPayout.id}`)[0].status).toBe('completed');
    expect((await sql`select count(*)::int as count from financial_audit_log where action='payout_completed' and metadata->>'payout_id'=${manualPayout.id}`)[0].count).toBe(1);
    const [legacyHold]=await sql`select create_payout_request_atomic(${recipient},5,'manual','legacy-reconciliation-fixture','rehearsal','USD') as id`;
    await sql`select claim_payout_request(${recipient},${legacyHold.id},'rehearsal')`;
    await expect(sql`select settle_payout_request(${recipient},${legacyHold.id},'completed','bank-receipt',5,'USD',null,'rehearsal')`).rejects.toThrow('duplicate key');
    await expect(sql`select release_legacy_payout_request(${recipient},${legacyHold.id},'bank-case-unpaid',5,'USD','rehearsal')`).rejects.toThrow('mismatch');
    await sql`update payout_requests set idempotency_key='legacy_tip_payout:test-fixture' where id=${legacyHold.id}`;
    await expect(sql`select release_legacy_payout_request(${sender},${legacyHold.id},'bank-case-unpaid',5,'USD','rehearsal')`).rejects.toThrow('Forbidden');
    await expect(sql`select release_legacy_payout_request(${recipient},${legacyHold.id},'bank-case-unpaid',6,'USD','rehearsal')`).rejects.toThrow('mismatch');
    for(let replay=0;replay<2;replay++)await sql`select release_legacy_payout_request(${recipient},${legacyHold.id},'bank-case-unpaid',5,'USD','rehearsal')`;
    expect((await sql`select status from payout_requests where id=${legacyHold.id}`)[0].status).toBe('failed');
    expect((await sql`select count(*)::int as count from financial_audit_log where action='legacy_payout_released' and metadata->>'payout_id'=${legacyHold.id}`)[0].count).toBe(1);
    const [beforeRefund]=await sql`select xp from users where id=${sender}`;
    const refund=(id:string,amount:number)=>sql`select process_refund_event('paystack',${id},'rehearsal-charge',${amount},'USD','refund-rehearsal') as applied`;
    expect((await refund('refund-half',5000))[0].applied).toBe(true);
    expect((await refund('refund-half',5000))[0].applied).toBe(false);
    await expect(refund('refund-half',4000)).rejects.toThrow('identity conflict');
    expect((await sql`select status,refunded_recipient_amount from tips where id=${tip}`)[0]).toEqual({status:'completed',refunded_recipient_amount:'45.00'});
    expect((await sql`select count(*)::int as count from payout_requests where user_id=${recipient} and status='pending' and currency='USD'`)[0].count).toBe(0);
    expect((await sql`select count(*)::int as count from financial_audit_log where action='payout_cancelled_after_refund' and target_user_id=${recipient}`)[0].count).toBe(1);
    const refundRace=await Promise.allSettled([refund('refund-race-a',3000),refund('refund-race-b',3000)]);
    expect(refundRace.filter(result=>result.status==='fulfilled')).toHaveLength(1);
    expect((await sql`select refunded_minor::int as amount from payment_captures where payment_id='rehearsal-charge'`)[0].amount).toBe(8000);
    await refund('refund-final',2000);
    expect((await sql`select status,refunded_recipient_amount from tips where id=${tip}`)[0]).toEqual({status:'refunded',refunded_recipient_amount:'90.00'});
    expect((await sql`select xp from users where id=${sender}`)[0].xp).toBe(beforeRefund.xp-5);
    await refund('refund-final',2000);
    expect((await sql`select xp from users where id=${sender}`)[0].xp).toBe(beforeRefund.xp-5);
    expect(Number((await sql`select creator_balance(${recipient},'USD') as balance`)[0].balance.available)).toBeLessThan(0);
    await expect(sql`select create_payout_request_atomic(${recipient},5,'manual','refunded-overdraft-intent','rehearsal','USD')`).rejects.toThrow('Insufficient');
    await sql`update users set referred_by=${playUser} where id=${sender}`;
    const [taxTip]=await sql`select create_tip_transaction(${sender},${recipient},100,10,90,'USD','tax-tip-intent','refund-rehearsal') as result`;
    await sql`select process_payment_event('dodopayments','payment:tax-tip-payment',${sql.json({tipId:taxTip.result.id,status:'completed',payment_id:'tax-tip-payment',paid_amount_minor:11000,tax_minor:1000,currency:'USD',providerReference:'tax-tip-payment'})},'refund-rehearsal')`;
    for(const [id,amount] of [['tax-refund-half',5500],['tax-refund-final',5500]] as const){
      await sql`select process_refund_event('dodopayments',${id},'tax-tip-payment',${amount},'USD','refund-rehearsal')`;
      const [commission]=await sql`select commission_amount,original_commission_amount,reversed_at from referral_commissions where idempotency_key='dodopayments:payment:tax-tip-payment'`;
      expect(Number(commission.original_commission_amount)).toBe(1);expect(Number(commission.commission_amount)).toBe(id==='tax-refund-half'?0.5:0);
      expect(commission.reversed_at!==null).toBe(id==='tax-refund-final');
    }
    const [beforeSkippedReward]=await sql`select xp from users where id=${sender}`;
    const skippedEvents=await sql`update outbox_events set status='processing' where aggregate_id=${taxTip.result.id} returning id`;
    for(const event of skippedEvents)expect((await sql`select process_outbox_event_atomic(${event.id}) as applied`)[0].applied).toBe(false);
    expect((await sql`select xp from users where id=${sender}`)[0].xp).toBe(beforeSkippedReward.xp);
    const refundUser='00000000-0000-4000-8000-000000009901';
    await sql`insert into auth.users(id,email,raw_user_meta_data) values(${refundUser},'refund@example.test',${sql.json({username:'refund_audit'})})`;
    const [refSub]=await sql`select create_subscription_intent(${refundUser},'dodopayments','USD',4.99,'refund-sub-intent','refund-rehearsal') as result`;
    const [periods]=await sql`select now()-interval '31 days' as older,now()-interval '1 day' as older_end,now() as current,now()+interval '30 days' as current_end`;
    for(const [id,at,end] of [['old-sub-payment',periods.older,periods.older_end],['new-sub-payment',periods.current,periods.current_end]]){
      await sql`select process_payment_event('dodopayments',${'payment:'+id},${sql.json({event:'subscription.activated',subscription_id:refSub.result.id,user_id:refundUser,payment_id:id,paid_amount_minor:499,tax_minor:0,currency:'USD',provider_event_at:at,period_end:end,provider_reference:'sub_'+refSub.result.id,provider_subscription_id:'sub_refund_remote'})},'refund-rehearsal')`;
    }
    await sql`select process_refund_event('dodopayments','old-sub-refund','old-sub-payment',499,'USD','refund-rehearsal')`;
    expect((await sql`select has_premium_access(${refundUser}) as active`)[0].active).toBe(true);
    await sql`select set_premium_override_atomic(${recipient},${refundUser},true,'refund-rehearsal')`;
    await sql`select process_refund_event('dodopayments','new-sub-refund-half','new-sub-payment',249,'USD','refund-rehearsal')`;
    expect((await sql`select status from subscriptions where id=${refSub.result.id}`)[0].status).toBe('active');
    await sql`select process_refund_event('dodopayments','new-sub-refund-final','new-sub-payment',250,'USD','refund-rehearsal')`;
    expect((await sql`select status from subscriptions where id=${refSub.result.id}`)[0].status).toBe('expired');
    expect((await sql`select has_premium_access(${refundUser}) as active`)[0].active).toBe(true);
    await sql`select set_premium_override_atomic(${recipient},${refundUser},false,'refund-rehearsal')`;
    expect((await sql`select has_premium_access(${refundUser}) as active`)[0].active).toBe(false);
    expect((await sql`select process_refund_event('paystack','refund-before-capture','late-charge',10000,'USD','refund-rehearsal') as applied`)[0].applied).toBeNull();
    expect((await sql`select status from refund_inbox where refund_id='refund-before-capture'`)[0].status).toBe('pending');
    await expect(sql`select process_refund_event('paystack','refund-before-capture','other-charge',10000,'USD','refund-rehearsal')`).rejects.toThrow('identity conflict');
    const refundClaims=await Promise.all(Array.from({length:4},()=>sql`select * from claim_refund_reconciliation(3)`));
    expect(refundClaims.flat()).toHaveLength(1);
    await sql`update refund_inbox set status='failed',attempts=10 where refund_id='refund-before-capture'`;
    const [lateTip]=await sql`select create_tip_transaction(${sender},${recipient},100,10,90,'USD','late-tip-intent','refund-rehearsal') as result`;
    const beforeLateBalance=(await sql`select creator_balance(${recipient},'USD') as balance`)[0].balance;
    const latePayload={tipId:lateTip.result.id,status:'completed',payment_id:'late-charge',paid_amount_minor:10000,currency:'USD',providerReference:'late-charge'};
    await Promise.all([
      sql`select process_payment_event('paystack','charge:late-charge',${sql.json(latePayload)},'refund-rehearsal')`,
      sql`select reconcile_capture_and_refund('paystack','refund-before-capture','late-charge',10000,'USD','charge:late-charge',${sql.json(latePayload)},'refund-rehearsal')`,
      sql`select reconcile_capture_and_refund('paystack','refund-before-capture','late-charge',10000,'USD','charge:late-charge',${sql.json(latePayload)},'refund-rehearsal')`,
    ]);
    expect((await sql`select count(*)::int as count from financial_audit_log where action='payment_refunded' and provider_event_id='refund-before-capture'`)[0].count).toBe(1);
    expect((await sql`select reconcile_capture_and_refund('paystack','refund-before-capture','late-charge',10000,'USD','charge:late-charge',${sql.json(latePayload)},'refund-rehearsal') as applied`)[0].applied).toBe(false);
    expect((await sql`select status from tips where id=${lateTip.result.id}`)[0].status).toBe('refunded');
    expect((await sql`select status from refund_inbox where refund_id='refund-before-capture'`)[0].status).toBe('processed');
    expect(Number((await sql`select creator_balance(${recipient},'USD') as balance`)[0].balance.available)).toBe(Number(beforeLateBalance.available));
    expect((await sql`select process_refund_event('paystack','refund-before-capture','late-charge',10000,'USD','refund-rehearsal') as applied`)[0].applied).toBe(false);
    await expect(sql`select process_refund_event('paystack','wrong-currency-refund','late-charge',1,'EUR','refund-rehearsal')`).rejects.toThrow('currency mismatch');
    for(const role of ['anon','authenticated'])for(const table of ['payment_captures','payment_refunds','refund_inbox','xp_reversals'])expect((await sql`select has_table_privilege(${role},${table},'SELECT') as allowed`)[0].allowed).toBe(false);
    const beforeDuplicate=(await sql`select creator_balance(${recipient},'USD') as balance`)[0].balance;
    const [duplicateTip]=await sql`select create_tip_transaction(${sender},${recipient},20,2,18,'USD','duplicate-tip-intent','refund-rehearsal') as result`;
    const duplicateCharge=(id:string)=>sql`select process_payment_event('paystack',${'charge:'+id},${sql.json({tipId:duplicateTip.result.id,status:'completed',payment_id:id,paid_amount_minor:2000,currency:'USD',providerReference:id})},'refund-rehearsal')`;
    await Promise.all([duplicateCharge('duplicate-charge-a'),duplicateCharge('duplicate-charge-b')]);
    const duplicateCaptures=await sql`select payment_id,credited from payment_captures where entity_id=${duplicateTip.result.id}`;
    expect(duplicateCaptures).toHaveLength(2);expect(duplicateCaptures.filter(row=>row.credited)).toHaveLength(1);
    expect(Number((await sql`select creator_balance(${recipient},'USD') as balance`)[0].balance.available)).toBe(Number(beforeDuplicate.available)+18);
    const uncredited=duplicateCaptures.find(row=>!row.credited)!,credited=duplicateCaptures.find(row=>row.credited)!;
    await sql`select process_refund_event('paystack','duplicate-charge-refund',${uncredited.payment_id},2000,'USD','refund-rehearsal')`;
    expect((await sql`select status,refunded_recipient_amount from tips where id=${duplicateTip.result.id}`)[0]).toEqual({status:'completed',refunded_recipient_amount:'0.00'});
    expect(Number((await sql`select creator_balance(${recipient},'USD') as balance`)[0].balance.available)).toBe(Number(beforeDuplicate.available)+18);
    await sql`select process_refund_event('paystack','original-charge-refund',${credited.payment_id},2000,'USD','refund-rehearsal')`;
    expect(Number((await sql`select creator_balance(${recipient},'USD') as balance`)[0].balance.available)).toBe(Number(beforeDuplicate.available));
    vi.stubEnv('DATABASE_PROVIDER','railway');vi.stubEnv('DATABASE_URL',url);vi.stubEnv('DATABASE_SSL','false');
    const createRequest=(key:string)=>new Request('https://app.test/api/content',{method:'POST',headers:{'Idempotency-Key':key}});
    const createContent=async(table:Parameters<typeof contentIntent>[2],key:string,payload:Record<string,unknown>,actor=recipient)=>(await contentIntent(createRequest(key),actor,table,payload)).insert();
    const replayLists=await Promise.all(Array.from({length:4},()=>createContent('reading_lists','root-list-replay',{name:'Replay list',description:null,is_public:true})));
    expect(new Set(replayLists.map(row=>row.id)).size).toBe(1);
    await expect(createContent('reading_lists','root-list-replay',{name:'Different list',is_public:true})).rejects.toMatchObject({status:409});
    await sql`insert into reading_list_books(list_id,book_id,position) values(${replayLists[0].id},${book.id},7)`;
    const forkResults=await Promise.all(Array.from({length:4},()=>sql`select fork_reading_list(${sender},${replayLists[0].id},'fork-replay-key') as result`));
    expect(new Set(forkResults.map(rows=>rows[0].result.id)).size).toBe(1);
    const forkId=forkResults[0][0].result.id;
    expect((await sql`select position from reading_list_books where list_id=${forkId}`)[0].position).toBe(7);
    await sql`delete from reading_lists where id=${replayLists[0].id}`;
    expect((await sql`select fork_reading_list(${sender},${replayLists[0].id},'fork-replay-key') as result`)[0].result.id).toBe(forkId);
    const room=await createContent('reading_rooms','reading-room-root',{name:'Root reading room',book_id:null,is_public:false,is_active:true});
    expect((await sql`select name,title,created_by,creator_id from reading_rooms where id=${room.id}`)[0]).toMatchObject({name:'Root reading room',title:'Root reading room',created_by:recipient,creator_id:recipient});
    expect((await sql`select count(*)::int as count from room_participants where room_id=${room.id}`)[0].count).toBe(1);
    await expect(sql`select join_content_group(${sender},'reading_room',${room.id})`).rejects.toThrow('unavailable');
    await expect(createContent('reading_room_posts','outsider-room-post',{room_id:room.id,content:'Private post'},sender)).rejects.toMatchObject({status:403});
    await expect(createContent('reading_room_milestones','outsider-milestone',{room_id:room.id,title:'Foreign milestone',unlock_date:new Date().toISOString()},sender)).rejects.toMatchObject({status:403});
    const milestone=await createContent('reading_room_milestones','future-milestone',{room_id:room.id,title:'Next chapter',unlock_date:new Date(Date.now()+86400000).toISOString()});
    await expect(createContent('reading_room_posts','locked-room-post',{room_id:room.id,content:'Spoiler',milestone_id:milestone.id})).rejects.toMatchObject({status:403});
    const roomPost=await createContent('reading_room_posts','owner-room-post',{room_id:room.id,content:'Private discussion',milestone_id:null});
    expect((await sql`select read_room_posts(${recipient},${room.id}) as posts`)[0].posts[0].id).toBe(roomPost.id);
    await expect(sql`select read_room_posts(${sender},${room.id})`).rejects.toThrow('unavailable');
    for(const [actor,visible] of [[recipient,1],[sender,0]] as const){
      const allowed=await sql.begin(async tx=>{await tx`select set_config('request.jwt.claim.sub',${actor},true)`;await tx`select set_config('request.jwt.claim.role','authenticated',true)`;await tx`set local role authenticated`;return tx`select count(*)::int as count from reading_room_posts where room_id=${room.id}`;});
      expect(allowed[0].count).toBe(visible);
    }
    const workshop=await createContent('workshop_rooms','workshop-root',{name:'Root workshop',topic:'Peer feedback',max_members:3,is_active:true});
    expect(workshop.member_count).toBe(1);
    const workshopJoiners=[sender,playUser,otherPlayUser];
    const workshopJoins=await Promise.allSettled(workshopJoiners.map(actor=>sql`select join_content_group(${actor},'workshop',${workshop.id})`));
    expect(workshopJoins.filter(result=>result.status==='fulfilled')).toHaveLength(2);
    expect((await sql`select member_count from workshop_rooms where id=${workshop.id}`)[0].member_count).toBe(3);
    expect((await sql`select join_content_group(${recipient},'workshop',${workshop.id}) as result`)[0].result.alreadyJoined).toBe(true);
    const excluded=workshopJoiners[workshopJoins.findIndex(result=>result.status==='rejected')];
    await expect(createContent('workshop_submissions','outsider-submission',{room_id:workshop.id,title:'No membership',excerpt:'not a member'},excluded)).rejects.toMatchObject({status:403});
    const workshopSubmission=await createContent('workshop_submissions','member-submission',{room_id:workshop.id,title:'My draft',excerpt:'three actual words'});
    expect(workshopSubmission.word_count).toBe(3);
    const workshopFeedback=await createContent('workshop_feedback','member-feedback',{submission_id:workshopSubmission.id,comment:'Helpful feedback'});
    expect((await createContent('workshop_feedback','member-feedback',{submission_id:workshopSubmission.id,comment:'Helpful feedback'})).id).toBe(workshopFeedback.id);
    await expect(createContent('workshop_feedback','duplicate-feedback',{submission_id:workshopSubmission.id,comment:'Another feedback'})).rejects.toMatchObject({status:409});
    await sql`update workshop_rooms set is_active=false where id=${workshop.id}`;
    await expect(createContent('workshop_submissions','closed-submission',{room_id:workshop.id,title:'Closed workshop',excerpt:'No new content'})).rejects.toMatchObject({status:422});
    for(const [actor,visible] of [[recipient,1],[excluded,0]] as const){
      const allowed=await sql.begin(async tx=>{await tx`select set_config('request.jwt.claim.sub',${actor},true)`;await tx`select set_config('request.jwt.claim.role','authenticated',true)`;await tx`set local role authenticated`;return tx`select count(*)::int as count from workshop_submissions where room_id=${workshop.id}`;});
      expect(allowed[0].count).toBe(visible);
    }
    await sql`insert into follows(follower_id,following_id) values(${recipient},${sender}) on conflict do nothing`;
    const passes=await Promise.all(Array.from({length:4},()=>createContent('book_passes','book-pass-root',{recipient_id:sender,book_id:book.id,message:'Try this book'})));
    expect(new Set(passes.map(row=>row.id)).size).toBe(1);
    expect((await sql`select count(*)::int as count from notifications where type='book_pass' and actor_id=${recipient} and user_id=${sender}`)[0].count).toBe(1);
    const debate=await createContent('book_debates','debate-root',{book_id:book.id,question:'Did the ending work?',yes_count:0,no_count:0,is_active:true});
    await Promise.all(Array.from({length:4},()=>sql`select cast_debate_vote(${sender},${debate.id},'yes')`));
    expect((await sql`select yes_count,no_count from book_debates where id=${debate.id}`)[0]).toEqual({yes_count:1,no_count:0});
    await expect(sql`select cast_debate_vote(${sender},${debate.id},'no')`).rejects.toThrow('final');
    const groupEvent=await createContent('events','event-root',{title:'Reading event',description:'Join us',event_date:new Date(Date.now()+86400000).toISOString(),is_paid:false,ticket_price:null,currency:'USD',max_attendees:1,book_id:book.id});
    const rsvps=await Promise.allSettled([sender,playUser].map(actor=>sql`select join_content_group(${actor},'event',${groupEvent.id})`));
    expect(rsvps.filter(result=>result.status==='fulfilled')).toHaveLength(1);
    expect((await sql`select count(*)::int as count from event_rsvps where event_id=${groupEvent.id}`)[0].count).toBe(1);
    const badgeXp=(await sql`select xp from users where id=${recipient}`)[0].xp;
    const badgeResults=await Promise.all(Array.from({length:4},()=>sql`select award_badge_atomic(${recipient},'test_atomic_badge',75,'Atomic badge','★') as awarded`));
    expect(badgeResults.filter(rows=>rows[0].awarded)).toHaveLength(1);
    expect((await sql`select xp from users where id=${recipient}`)[0].xp).toBe(badgeXp+75);
    expect((await sql`select count(*)::int as count from notifications where user_id=${recipient} and type='badge_earned' and message='★ Atomic badge'`)[0].count).toBe(1);
    await sql`insert into auth.users(id,email,raw_user_meta_data)
      select ('00000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'fan'||i||'@example.test',jsonb_build_object('username','fan_'||i) from generate_series(10001,10501) i`;
    await sql`insert into follows(follower_id,following_id) select id,${recipient} from users where username like 'fan_%' on conflict do nothing`;
    await sql`update users set is_verified_author=true where id=${recipient}`;
    await sql`insert into author_work_claims(author_id,work_id) select ${recipient},work_id from books where id=${book.id} on conflict do nothing`;
    const announcement=await createContent('author_posts','announcement-root',{title:'A new chapter',body:'Announcement body',book_id:book.id,type:'announcement'});
    const [announcementRow]=await sql`select content,body,created_at from author_posts where id=${announcement.id}`;
    expect(announcementRow.content).toBe(announcementRow.body);
    const [expectedAnnouncements]=await sql`select count(*)::int as count from follows f join users u on u.id=f.follower_id where following_id=${recipient} and f.created_at<=${announcementRow.created_at} and coalesce(u.notify_author_announcements,true)`;
    expect(expectedAnnouncements.count).toBeGreaterThan(500);
    for(let page=0;page<10;page++){
      const jobs=await sql`update outbox_events set status='processing' where aggregate_type='author_post' and aggregate_id=${announcement.id} and status='pending' returning id`;
      if(!jobs.length)break;
      for(const job of jobs)await Promise.all([sql`select process_outbox_event_atomic(${job.id})`,sql`select process_outbox_event_atomic(${job.id})`]);
    }
    expect((await sql`select count(*)::int as count from notifications where type='author_announcement' and entity_id=${announcement.id}`)[0].count).toBe(expectedAnnouncements.count);
    expect((await sql`select followers_notified from author_posts where id=${announcement.id}`)[0].followers_notified).toBe(true);
    const community=async(actor:string,action:string,target:string,key:string,payload:Record<string,string|number|boolean|null>)=>(await sql`select apply_community_intent(${actor},${action},${target},${key},${sql.json(payload)}) as result`)[0].result;
    await sql`update users set is_verified_author=true,user_types=array['author'] where id=${recipient}`;
    const qa=await createContent('author_qa','qa-community-root',{author_id:recipient,question:'How did you write this story?',is_public:true},sender);
    await Promise.all(Array.from({length:4},()=>community(recipient,'author_answer',qa.id,'qa-answer-replay',{answer:'One answer'})));
    expect((await sql`select count(*)::int as count from notifications where type='author_qa_answer' and entity_id=${qa.id}`)[0].count).toBe(1);
    await expect(community(recipient,'author_answer',qa.id,'qa-answer-replay',{answer:'Conflicting answer'})).rejects.toThrow('Conflicting');
    await community(recipient,'author_answer',qa.id,'qa-answer-edit',{answer:'Edited answer'});
    expect((await sql`select count(*)::int as count from notifications where type='author_qa_answer' and entity_id=${qa.id}`)[0].count).toBe(1);
    await expect(community(sender,'author_answer',qa.id,'foreign-answer-key',{answer:'Not mine'})).rejects.toThrow('Author access');
    const arc=await createContent('arcs','arc-community-root',{book_id:book.id,description:'One review slot',reader_slots:1,is_active:true});
    const applications=await Promise.all([sender,playUser].map(actor=>community(actor,'arc_apply',arc.id,'arc-apply-key',{})));
    await community(sender,'arc_apply',arc.id,'arc-apply-again',{});
    expect((await sql`select count(*)::int as count from notifications where type='buddy_read_invite' and entity_id=${arc.id} and user_id=${recipient}`)[0].count).toBe(2);
    const decisions=await Promise.allSettled(applications.map((result,index)=>community(recipient,'arc_review',arc.id,'arc-review-'+index,{applicationId:result.application.id,approved:true})));
    expect(decisions.filter(result=>result.status==='fulfilled')).toHaveLength(1);
    expect((await sql`select count(*)::int as count from arc_applications where arc_id=${arc.id} and status='approved'`)[0].count).toBe(1);
    const approvedIndex=decisions.findIndex(result=>result.status==='fulfilled');
    await community(recipient,'arc_review',arc.id,'arc-review-again',{applicationId:applications[approvedIndex].application.id,approved:true});
    expect((await sql`select count(*)::int as count from notifications where type='buddy_read_invite' and entity_id=${arc.id} and user_id<>${recipient}`)[0].count).toBe(1);
    const verification=await createContent('author_verification_requests','verification-community',{pen_name:'Fixture author',book_titles:'Fixture book'},playUser);
    await expect(community(sender,'author_verify',playUser,'foreign-author-grant',{approved:true})).rejects.toThrow('Admin');
    await Promise.all(Array.from({length:4},()=>community(recipient,'author_verify',playUser,'author-verification-review',{approved:true})));
    expect((await sql`select is_verified_author from users where id=${playUser}`)[0].is_verified_author).toBe(true);
    expect((await sql`select count(*)::int as count from notifications where entity_id=${verification.id}`)[0].count).toBe(1);
    const nextVerification=await createContent('author_verification_requests','verification-next-root',{pen_name:'Next fixture author',book_titles:'Next fixture book'},playUser);
    await community(recipient,'author_verify',playUser,'author-verification-review',{approved:true});
    expect((await sql`select status from author_verification_requests where id=${nextVerification.id}`)[0].status).toBe('pending');
    const [beforeRoleUpdate]=await sql`select premium_override,is_moderator from users where id=${playUser}`;
    await expect(community(recipient,'admin_user',playUser,'atomic-invalid-admin',{is_premium:!beforeRoleUpdate.premium_override,is_moderator:'invalid'})).rejects.toThrow('Invalid moderator');
    expect((await sql`select premium_override,is_moderator from users where id=${playUser}`)[0]).toEqual(beforeRoleUpdate);
    await Promise.all(Array.from({length:4},()=>community(recipient,'admin_user',playUser,'grant-community-mod',{is_moderator:true})));
    expect((await sql`select count(*)::int as count from moderation_log where target_user_id=${playUser} and action='grant_moderator'`)[0].count).toBe(1);
    const report=await createContent('content_reports','report-community-root',{entity_type:'user',entity_id:sender,reason:'Fixture report',status:'pending'});
    await Promise.all(Array.from({length:4},()=>community(recipient,'report_review',report.id,'warn-community-report',{status:'warned',note:'Please follow the rules'})));
    expect((await sql`select count(*)::int as count from notifications where user_id=${sender} and type='moderation_warning' and entity_id=${sender}`)[0].count).toBe(1);
    expect((await sql`select count(*)::int as count from moderation_log where report_id=${report.id}`)[0].count).toBe(1);
    const appeal=await createContent('appeals','appeal-community-root',{report_id:report.id,reason:'Please reconsider this warning',status:'pending'},sender);
    await expect(community(recipient,'appeal_review',appeal.id,'same-reviewer-appeal',{status:'approved',note:null})).rejects.toThrow('Independent');
    await Promise.all(Array.from({length:4},()=>community(playUser,'appeal_review',appeal.id,'independent-appeal-review',{status:'approved',note:'Reviewed independently'})));
    expect((await sql`select count(*)::int as count from notifications where entity_id=${appeal.id} and type='appeal_decision'`)[0].count).toBe(1);
    await expect(community(playUser,'appeal_review',appeal.id,'change-final-appeal',{status:'rejected',note:null})).rejects.toThrow('final');
    const note=await createContent('community_notes','community-note-root',{content_type:'review',content_id:book.id,note_text:'A sufficiently long contextual note',is_visible:false},sender);
    await Promise.all(Array.from({length:4},()=>community(playUser,'community_note_review',note.id,'approve-community-note',{status:'approved'})));
    expect((await sql`select is_visible from community_notes where id=${note.id}`)[0].is_visible).toBe(true);
    expect((await sql`select count(*)::int as count from moderation_log where entity_id=${note.id}`)[0].count).toBe(1);
    const targetReport=await createContent('content_reports','account-report-root',{entity_type:'user',entity_id:otherPlayUser,reason:'Fixture account report',status:'pending'});
    await expect(community(playUser,'report_review',targetReport.id,'mod-account-removal',{status:'removed',note:null})).rejects.toThrow('Admin account');
    expect((await sql`select status from content_reports where id=${targetReport.id}`)[0].status).toBe('pending');
    await community(recipient,'admin_user',playUser,'revoke-community-mod',{is_moderator:false});
    await expect(community(playUser,'community_note_review',note.id,'revoked-moderator-key',{status:'approved'})).rejects.toThrow('Moderator access');
    const chains=await Promise.all(Array.from({length:4},()=>community(recipient,'chain_create',book.id,'chain-create-replay',{note:'Start this chain'})));
    expect(new Set(chains.map(row=>row.chain.id)).size).toBe(1);
    const chainId=chains[0].chain.id;
    expect((await sql`select count(*)::int as count from pass_the_book_nodes where chain_id=${chainId}`)[0].count).toBe(1);
    const nominations=await Promise.allSettled([sender,playUser].map((nominee,index)=>community(recipient,'chain_nominate',chainId,'chain-nomination-'+index,{nominee_id:nominee,note:'Next reader'})));
    expect(nominations.filter(result=>result.status==='fulfilled')).toHaveLength(1);
    expect((await sql`select count(*)::int as count from pass_the_book_nodes where chain_id=${chainId}`)[0].count).toBe(2);
    const nominee=[sender,playUser][nominations.findIndex(result=>result.status==='fulfilled')];
    await community(recipient,'chain_nominate',chainId,'chain-nomination-repeat',{nominee_id:nominee,note:'Next reader'});
    expect((await sql`select count(*)::int as count from notifications where entity_id=${chainId} and type='book_pass'`)[0].count).toBe(1);
    await sql`delete from pass_the_book_chains where id=${chainId}`;
    expect((await community(recipient,'chain_create',book.id,'chain-create-replay',{note:'Start this chain'})).chain.id).toBe(chainId);
    const followedList=await createContent('reading_lists','follow-community-list',{name:'Follow once',is_public:true});
    await Promise.all(Array.from({length:4},()=>sql`select set_list_follow(${sender},${followedList.id},true)`));
    expect((await sql`select follower_count from reading_lists where id=${followedList.id}`)[0].follower_count).toBe(1);
    await Promise.all(Array.from({length:4},()=>sql`select set_list_follow(${sender},${followedList.id},false)`));
    expect((await sql`select follower_count from reading_lists where id=${followedList.id}`)[0].follower_count).toBe(0);
    await sql`update reading_lists set is_public=false where id=${followedList.id}`;
    await expect(sql`select set_list_follow(${sender},${followedList.id},true)`).rejects.toThrow('unavailable');
    const {GET:getPrivateList}=await import('@/app/api/lists/[id]/route');
    vi.mocked(getCurrentUser).mockResolvedValue({id:sender,email:'reader@example.test'});
    expect((await getPrivateList(new Request('http://localhost/api/lists/'+followedList.id) as Parameters<typeof getPrivateList>[0],{params:{id:followedList.id}})).status).toBe(404);
    vi.mocked(getCurrentUser).mockResolvedValue({id:recipient,email:'owner@example.test'});
    expect((await getPrivateList(new Request('http://localhost/api/lists/'+followedList.id) as Parameters<typeof getPrivateList>[0],{params:{id:followedList.id}})).status).toBe(200);
    await expect(createContent('appeals','foreign-report-appeal',{report_id:report.id,reason:'An unrelated appeal',status:'pending'},otherPlayUser)).rejects.toMatchObject({status:403});
    const removedReview=await createContent('reviews','appealed-review-root',{book_id:book.id,rating:3,content:'A review to restore'},sender);
    const removedReport=await createContent('content_reports','removed-review-report',{entity_type:'review',entity_id:removedReview.id,reason:'Fixture removal',status:'pending'});
    await community(recipient,'report_review',removedReport.id,'remove-review-intent',{status:'removed',note:'Review this removal'});
    expect((await sql`select is_hidden from reviews where id=${removedReview.id}`)[0].is_hidden).toBe(true);
    const removalAppeal=await createContent('appeals','removed-review-appeal',{report_id:removedReport.id,reason:'Please reconsider the removal',status:'pending'},sender);
    await community(recipient,'admin_user',playUser,'restore-community-mod',{is_moderator:true});
    await community(playUser,'appeal_review',removalAppeal.id,'restore-review-intent',{status:'approved',note:'Removal overturned'});
    expect((await sql`select is_hidden,moderation_status from reviews where id=${removedReview.id}`)[0]).toEqual({is_hidden:false,moderation_status:'published'});
    const {bulkAwardSeasonalBadge,checkAndAwardBadges}=await import('@/services/badges');
    expect(await bulkAwardSeasonalBadge('spooky_reader_oct',[sender,sender])).toEqual({awarded:1});
    expect(await bulkAwardSeasonalBadge('spooky_reader_oct',[sender])).toEqual({awarded:0});
    const [genreShelf]=await sql`insert into shelves(user_id,name,slug,default_type) values(${otherPlayUser},'Genre eligibility','genre-eligibility','want_to_read') returning id`;
    const genreBooks=await sql`insert into books(title,author_name,genres) select 'Horror fixture '||i,'Fixture author',array['Horror'] from generate_series(1,5) i returning id`;
    for(const genreBook of genreBooks)await sql`insert into shelf_books(shelf_id,book_id,user_id) values(${genreShelf.id},${genreBook.id},${otherPlayUser})`;
    expect(await checkAndAwardBadges(otherPlayUser,'finish_book_genre')).toEqual([]);
    await sql`update shelves set default_type='have_read' where id=${genreShelf.id}`;
    await sql`update shelf_books set finished_at=now() where shelf_id=${genreShelf.id}`;
    expect(await checkAndAwardBadges(otherPlayUser,'finish_book_genre')).toEqual(['horror_head_5']);
    expect(await checkAndAwardBadges(otherPlayUser,'finish_book_genre')).toEqual([]);
    {
    const mfa=await import('@/lib/auth/second-factor');
    const {generateSecret,generateSync}=await import('otplib');
    const bcrypt=await import('bcryptjs');
    vi.stubEnv('AUTH_ENCRYPTION_KEY',Buffer.alloc(32,9).toString('base64'));
    const mfaUser='00000000-0000-4000-8000-000000009950';
    await sql`select create_direct_account(${mfaUser},'mfa@example.test','mfa_fixture','MFA fixture',${await bcrypt.hash('fixture-password',4)})`;
    expect((await sql`select email from users where id=${mfaUser}`)[0].email).toBe('mfa@example.test');
    const secret=generateSecret(),enrollment=mfa.factorToken(),sessionToken=mfa.factorSessionToken(mfa.factorToken()),sessionHash=mfa.factorHash(sessionToken);
    const recoveryCodes=Array.from({length:8},(_,i)=>'ABCDE-1234'+i),recoveryHashes=await Promise.all(recoveryCodes.map(code=>bcrypt.hash(code,4)));
    const encrypted=mfa.encryptFactor(JSON.stringify({secret,recoveryCodes}));
    const code=generateSync({secret}),proof=await mfa.verifyFactorProof({id:mfaUser,email:'mfa@example.test',username:'mfa_fixture',totp_enabled:true,totp_secret:secret,recovery_codes:recoveryHashes,mfa_version:0,mfa_last_step:null,is_banned:false,deleted_at:null},{code});
    expect(proof).not.toBeNull();
    await sql`select begin_factor_challenge(${mfaUser},${mfa.factorHash(enrollment)},'setup',${sessionHash},${encrypted})`;
    await sql`select claim_factor_challenge(${mfa.factorHash(enrollment)},'setup')`;
    const confirm=()=>sql`select finish_factor_challenge(${mfa.factorHash(enrollment)},'setup',0,${proof!.step},null,${sessionHash},${mfa.encryptFactor(secret)},${recoveryHashes})`;
    await Promise.all([confirm(),confirm()]);
    expect((await sql`select count(*)::int as count from security_events where user_id=${mfaUser} and event_type='2fa_enabled'`)[0].count).toBe(1);
    expect((await sql`select totp_enabled,mfa_version from users where id=${mfaUser}`)[0]).toEqual({totp_enabled:true,mfa_version:1});
    expect((await mfa.readDirectSession(sessionToken))?.id).toBe(mfaUser);
    const challenge=async()=>{const token=mfa.factorToken(),hash=mfa.factorHash(token);await sql`select begin_factor_challenge(${mfaUser},${hash},'login',null)`;await sql`select claim_factor_challenge(${hash},'login')`;return {token,hash,grant:mfa.factorHash(mfa.factorSessionToken(token))};};
    const replayedStep=await challenge();
    await expect(sql`select finish_factor_challenge(${replayedStep.hash},'login',1,${proof!.step},null,${replayedStep.grant})`).rejects.toThrow('already used');
    const recoveryClaims=await Promise.all([challenge(),challenge()]);
    const recoveryRace=await Promise.allSettled(recoveryClaims.map(item=>sql`select finish_factor_challenge(${item.hash},'login',1,null,${recoveryHashes[0]},${item.grant})`));
    expect(recoveryRace.filter(result=>result.status==='fulfilled')).toHaveLength(1);
    const recovered=recoveryClaims[recoveryRace.findIndex(result=>result.status==='fulfilled')];
    await sql`select finish_factor_challenge(${recovered.hash},'login',1,null,null,${recovered.grant})`;
    expect((await sql`select count(*)::int as count from security_events where user_id=${mfaUser} and event_type='2fa_login'`)[0].count).toBe(1);
    expect((await sql`select cardinality(recovery_codes) as count from users where id=${mfaUser}`)[0].count).toBe(7);
    const exhausted=await challenge();
    for(let attempt=1;attempt<10;attempt++)expect((await sql`select claim_factor_challenge(${exhausted.hash},'login') as result`)[0].result).not.toBeNull();
    expect((await sql`select claim_factor_challenge(${exhausted.hash},'login') as result`)[0].result).toBeNull();
    const providerId=crypto.randomUUID(),providerHash=mfa.factorHash(`supabase:${mfaUser}:${providerId}`);
    async function providerVisible(){return sql.begin(async tx=>{await tx`select set_config('request.jwt.claim.sub',${mfaUser},true)`;await tx`select set_config('request.jwt.claim.role','authenticated',true)`;await tx`select set_config('request.jwt.claims',${JSON.stringify({sub:mfaUser,session_id:providerId})},true)`;await tx`set local role authenticated`;return tx`select id from users where id=${mfaUser}`;});}
    expect(await providerVisible()).toHaveLength(0);
    const providerChallenge=mfa.factorToken();
    await sql`select begin_factor_challenge(${mfaUser},${mfa.factorHash(providerChallenge)},'login',${providerHash})`;
    await sql`select claim_factor_challenge(${mfa.factorHash(providerChallenge)},'login')`;
    await expect(sql`select finish_factor_challenge(${mfa.factorHash(providerChallenge)},'login',1,null,${recoveryHashes[1]},${'b'.repeat(64)})`).rejects.toThrow('binding');
    await sql`select finish_factor_challenge(${mfa.factorHash(providerChallenge)},'login',1,null,${recoveryHashes[1]},${providerHash})`;
    expect(await providerVisible()).toHaveLength(1);
    const disabled=()=>sql`select disable_factor_atomic(${mfaUser},1,null,${recoveryHashes[2]},${sessionHash},'disable-mfa-replay',${mfa.factorHash('disable-payload')})`;
    await Promise.all([disabled(),disabled()]);
    expect((await sql`select count(*)::int as count from security_events where user_id=${mfaUser} and event_type='2fa_disabled'`)[0].count).toBe(1);
    expect((await sql`select totp_enabled,mfa_version from users where id=${mfaUser}`)[0]).toEqual({totp_enabled:false,mfa_version:2});
    expect(await mfa.readDirectSession(mfa.factorSessionToken(recovered.token))).toBeNull();
    expect((await mfa.readDirectSession(sessionToken))?.id).toBe(mfaUser);
    await expect(sql.begin(async tx=>{await tx`select set_config('request.jwt.claim.role','authenticated',true)`;await tx`update users set mfa_version=0 where id=${mfaUser}`;})).rejects.toThrow('service authorization');
    await sql`update auth_factor_challenges set expires_at=now()-interval '1 minute' where user_id=${mfaUser}`;
    expect((await sql`select claim_factor_challenge(${replayedStep.hash},'login') as result`)[0].result).toBeNull();
    expect(Number((await sql`select cleanup_factor_sessions(500) as count`)[0].count)).toBeGreaterThan(0);
    for(const role of ['anon','authenticated'])for(const relation of ['auth_factor_challenges','auth_factor_grants'])expect((await sql`select has_table_privilege(${role},${relation},'SELECT') as allowed`)[0].allowed).toBe(false);
    }
    {
    vi.stubEnv('DATABASE_PROVIDER','railway');vi.stubEnv('DATABASE_URL',url);vi.stubEnv('DATABASE_SSL','false');
    const reader=crypto.randomUUID(),other=crypto.randomUUID();
    await sql`insert into auth.users(id,email,raw_user_meta_data) values(${reader},'mobile-reader@example.test',${sql.json({username:'mobile_reader'})}),(${other},'mobile-other@example.test',${sql.json({username:'mobile_other'})})`;
    const {storeCatalogBook}=await import('@/services/books');
    const books=await Promise.all(Array.from({length:8},(_,index)=>storeCatalogBook({title:'Concurrent catalog',author_name:'Author',page_count:200,isbn_10:index%2?'0306406152':null,isbn_13:index%2?null:'9780306406157',google_books_id:'catalog-'+index})));
    expect(new Set(books.map(book=>book.id)).size).toBe(1);
    const bookId=books[0].id;
    const {contentIntent}=await import('@/lib/content-intents');
    const request=new Request('https://app.test/api/shelves',{headers:{'Idempotency-Key':'custom-shelf-replay'}});
    const custom=await Promise.all(Array.from({length:4},async()=> (await contentIntent(request,reader,'shelves',{name:'Reading club',description:null,is_public:false})).insert()));
    expect(new Set(custom.map(shelf=>shelf.id)).size).toBe(1);
    expect((await sql`select slug from shelves where id=${custom[0].id}`)[0].slug).toMatch(/^shelf-/);
    const [finishedShelf]=await sql`select id from shelves where user_id=${reader} and default_type='have_read'`;
    await Promise.all(Array.from({length:4},()=>sql`select set_shelf_membership(${reader},${finishedShelf.id},${bookId},true)`));
    const [entry]=await sql`select * from shelf_books where shelf_id=${finishedShelf.id} and book_id=${bookId}`;
    expect(entry.finished_at).not.toBeNull();
    await expect(sql`select set_shelf_membership(${other},${finishedShelf.id},${bookId},false)`).rejects.toThrow('Shelf not found');
    await Promise.all(Array.from({length:4},()=>sql`select update_shelf_progress(${reader},${entry.id},100,null)`));
    expect((await sql`select progress_percent from shelf_books where id=${entry.id}`)[0].progress_percent).toBe('50.00');
    expect((await sql`select count(*)::int as count from xp_ledger where user_id=${reader} and reason='progress_update'`)[0].count).toBe(1);
    await expect(sql`select update_shelf_progress(${other},${entry.id},100,null)`).rejects.toThrow('not found');
    await expect(sql`select update_shelf_progress(${reader},${entry.id},201,null)`).rejects.toThrow('exceeds');
    const year=new Date().getUTCFullYear();
    await Promise.all(Array.from({length:4},()=>sql`select set_reading_goal(${reader},${year},4)`));
    expect((await sql`select annual_reading_goal from users where id=${reader}`)[0].annual_reading_goal).toBe(4);
    expect((await sql`select reading_goal_snapshot(${reader},${year}) as result`)[0].result.progress).toMatchObject({books_read:1,percentage:25});
    await sql`select set_reading_goal(${reader},${year+1},100)`;
    expect((await sql`select annual_reading_goal from users where id=${reader}`)[0].annual_reading_goal).toBe(4);
    await Promise.all(Array.from({length:4},()=>sql`select award_reading_goal_milestones(${reader},${year})`));
    expect((await sql`select count(*)::int as count from notifications where user_id=${reader} and type='reading_goal_milestone'`)[0].count).toBe(1);
    const [challenge]=await sql`insert into challenges(title,start_date,end_date,goal_books,goal_pages) values('Reading contract',now()-interval '1 day',now()+interval '1 day',2,400) returning id`;
    await Promise.all(Array.from({length:4},()=>sql`select join_reading_challenge(${reader},${challenge.id})`));
    expect((await sql`select count(*)::int as count from challenge_participants where challenge_id=${challenge.id}`)[0].count).toBe(1);
    expect((await sql`select reading_challenge_progress(${reader},${challenge.id}) as result`)[0].result.progress).toMatchObject({booksFinished:1,pagesRead:200,booksPercent:50,pagesPercent:50});
    const {PgQueryBuilder}=await import('@/lib/db/query-builder');
    const now=new Date().toISOString();
    await sql`insert into challenges(title,start_date,end_date) values('Future challenge',now()+interval '1 day',now()+interval '2 days'),('Expired challenge',now()-interval '2 days',now()-interval '1 day')`;
    const filtered=await new PgQueryBuilder<{id:string}[]>('challenges').select('id').or(`start_date.is.null,start_date.lte.${now}`).or(`end_date.is.null,end_date.gt.${now}`);
    expect(filtered.error).toBeNull();
    expect((filtered.data as {id:string}[]).map(row=>row.id)).toContain(challenge.id);
    expect((filtered.data as {id:string}[])).toHaveLength(1);
    vi.mocked(getCurrentUser).mockResolvedValue({id:reader,email:'mobile-reader@example.test'});
    const {GET:readChallenge}=await import('@/app/api/challenges/[id]/route');
    expect((await readChallenge(new Request('https://app.test'),{params:{id:challenge.id}})).status).toBe(200);
    const {GET:readShelf}=await import('@/app/api/shelves/[id]/route');
    expect((await readShelf(new Request('https://app.test'),{params:{id:custom[0].id}})).status).toBe(200);
    vi.mocked(getCurrentUser).mockResolvedValue({id:other,email:'mobile-other@example.test'});
    expect((await readShelf(new Request('https://app.test'),{params:{id:custom[0].id}})).status).toBe(403);
    const {GET:readProfile}=await import('@/app/api/users/[id]/route');
    await sql`update users set profile_visibility='followers_only' where id=${reader}`;
    expect((await readProfile(new Request('https://app.test'),{params:{id:'mobile_reader'}})).status).toBe(403);
    await sql`insert into follows(follower_id,following_id) values(${other},${reader})`;
    const profileResponse=await readProfile(new Request('https://app.test'),{params:{id:'mobile_reader'}});
    expect(profileResponse.status).toBe(200);
    const profile=(await profileResponse.json()).user;
    expect(profile).not.toHaveProperty('email');expect(profile).not.toHaveProperty('totp_secret');
    const searchable=await new PgQueryBuilder<{id:string}[]>('books').select('id').textSearch('search_vector','Concurrent catalog',{type:'websearch',config:'simple'});
    expect(searchable.error).toBeNull();expect(searchable.data).toEqual([{id:bookId}]);
    const {GET:adminBooks}=await import('@/app/api/admin/books/route');
    await sql`update users set is_admin=true where id=${other}`;
    expect((await adminBooks(new Request('https://app.test/api/admin/books?search=Concurrent'))).status).toBe(200);
    const [debate]=await sql`insert into book_debates(book_id,user_id,question) values(${bookId},${reader},'A real debate question?') returning id`;
    const {GET:readDebate}=await import('@/app/api/debates/[id]/route');
    expect((await readDebate(new Request('https://app.test'),{params:{id:debate.id}})).status).toBe(200);
    const [event]=await sql`insert into events(organizer_id,title,event_date) values(${reader},'A real event',now()+interval '1 day') returning id`;
    const {GET:readEvent}=await import('@/app/api/events/[id]/route');
    expect((await readEvent(new Request('https://app.test'),{params:{id:event.id}})).status).toBe(200);
    const [room]=await sql`insert into reading_rooms(created_by,name,is_public) values(${reader},'A real private room',false) returning id`;
    const {GET:readRoom}=await import('@/app/api/reading-rooms/[id]/route');
    expect((await readRoom(new Request('https://app.test'),{params:{id:room.id}})).status).toBe(403);
    vi.mocked(getCurrentUser).mockResolvedValue({id:reader,email:'mobile-reader@example.test'});
    expect((await readRoom(new Request('https://app.test'),{params:{id:room.id}})).status).toBe(200);
    await sql`update users set annual_reading_goal=8 where id=${reader}`;
    expect((await sql`select target_books from reading_goals where user_id=${reader} and year=${year}`)[0].target_books).toBe(8);
    await expect(sql`update users set annual_reading_goal=-1 where id=${reader}`).rejects.toThrow('Invalid goal');
    const extraBooks=await sql`insert into books(title,author_name) values('Page book one','Author'),('Page book two','Author'),('Page book three','Author') returning id`;
    for(const book of extraBooks)await sql`select set_shelf_membership(${reader},${custom[0].id},${book.id},true)`;
    const firstPage=await (await readShelf(new Request('https://app.test?limit=2'),{params:{id:custom[0].id}})).json();
    expect(firstPage.books).toHaveLength(2);expect(firstPage.nextCursor).toBeTruthy();
    const secondPage=await (await readShelf(new Request('https://app.test?limit=2&cursor='+encodeURIComponent(firstPage.nextCursor)),{params:{id:custom[0].id}})).json();
    expect(secondPage.books).toHaveLength(1);expect(secondPage.nextCursor).toBeNull();
    expect(new Set([...firstPage.books,...secondPage.books].map(book=>book.id)).size).toBe(3);
    for(const role of ['anon','authenticated'])for(const routine of ['store_catalog_book(jsonb)','set_reading_goal(uuid,integer,integer)','reading_goal_snapshot(uuid,integer)','writing_progress_snapshot(uuid)','update_shelf_progress(uuid,uuid,integer,numeric)','set_shelf_membership(uuid,uuid,uuid,boolean)','join_reading_challenge(uuid,uuid)','reading_challenge_progress(uuid,uuid)','award_reading_goal_milestones(uuid,integer)'])expect((await sql`select has_function_privilege(${role},${routine},'EXECUTE') as allowed`)[0].allowed).toBe(false);
    }
    {
    vi.stubEnv('DATABASE_PROVIDER','railway');vi.stubEnv('DATABASE_URL',url);vi.stubEnv('DATABASE_SSL','false');
    const reader=crypto.randomUUID();
    await sql`insert into auth.users(id,email,raw_user_meta_data) values(${reader},'ai-profile-reader@example.test',${sql.json({username:'ai_profile_reader'})})`;
    await sql`update users set premium_override=true,user_types=array['newbie_writer'],genres=array['Fantasy'],preferred_locale='fr' where id=${reader}`;
    const {PUT:updateProfile}=await import('@/app/api/users/profile/route');
    const {NextRequest}=await import('next/server');
    vi.mocked(getCurrentUser).mockResolvedValue({id:reader,email:'ai-profile-reader@example.test'});
    const onboarding=await updateProfile(new NextRequest('https://app.test/api/users/profile',{method:'PUT',body:JSON.stringify({username:'ai_writer_onboarded',user_types:['newbie_writer'],genres:['Fantasy','Mystery','Thriller','Romance','Poetry'],onboarding_complete:true})}));
    expect(onboarding.status).toBe(200);
    const onboarded=(await onboarding.json()).user;
    expect(onboarded).toMatchObject({id:reader,username:'ai_writer_onboarded',onboarding_complete:true,user_types:['newbie_writer']});
    expect(onboarded).not.toHaveProperty('password_hash');expect(onboarded).not.toHaveProperty('totp_secret');
    expect((await updateProfile(new NextRequest('https://app.test/api/users/profile',{method:'PUT',body:JSON.stringify({is_admin:true})}))).status).toBe(422);
    await expect(sql`select update_profile_atomic(${reader},'{"is_admin":true}'::jsonb)`).rejects.toThrow('Invalid profile fields');
    await expect(sql`select update_profile_atomic(${reader},'{"genres":["Fantasy"]}'::jsonb)`).rejects.toThrow('five genres');
    const [shelf]=await sql`select id from shelves where user_id=${reader} and default_type='have_read'`;
    const books=await sql`insert into books(title,author_name,genres) values('Profile one','Author',array['Fantasy']),('Profile two','Author',array['Fantasy']),('Profile three','Author',array['History']) returning id`;
    for(const book of books)await sql`select set_shelf_membership(${reader},${shelf.id},${book.id},true)`;
    const source=(await sql`select taste_profile_input(${reader}) as source`)[0].source;
    expect(source.books).toHaveLength(3);
    const client=await import('@/lib/ai-client'),locks=await import('@/lib/locks'),profiles=await import('@/services/ai-profiles');
    const model=vi.spyOn(client,'callAI').mockResolvedValue({text:'{"summary":"Vous aimez les histoires imaginatives."}',provider:'deepseek'});
    const lease=vi.spyOn(locks,'withRedisLock').mockImplementation(async(_key,_ttl,task)=>task());
    try{
      const generated=await profiles.generateTasteProfile(reader);
      expect(generated.profile.top_genres).toEqual(['Fantasy','History']);
      expect((await profiles.generateTasteProfile(reader)).cached).toBe(true);
      expect(model).toHaveBeenCalledOnce();
      expect((await profiles.readTasteProfile(reader)).profile?.summary).toContain('imaginatives');
      const tasks=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(day=>({day,task:'Écrivez une scène.',goal:'300 mots'}));
      model.mockResolvedValueOnce({text:JSON.stringify(tasks),provider:'gemini'});
      const plan=await profiles.generateWritingPlan(reader);
      expect(plan.plan.tasks).toHaveLength(7);
      expect((await sql`select week_start::text from writing_plans where user_id=${reader}`)[0].week_start).toBe(profiles.writingWeekStart());
      await sql`update users set preferred_locale='de' where id=${reader}`;
      expect((await profiles.readTasteProfile(reader)).profile).toBeNull();
      await expect(sql`select save_taste_profile(${reader},${sql.json(source)},${'f'.repeat(64)},'profile-stale',${sql.json(generated.profile)},'deepseek')`).rejects.toThrow('changed');
      await sql`update users set preferred_locale='fr' where id=${reader}`;
      const raced=await Promise.all(Array.from({length:4},()=>sql`select save_taste_profile(${reader},${sql.json(source)},${'f'.repeat(64)},'profile-sql-race',${sql.json(generated.profile)},'deepseek') as profile`));
      expect(new Set(raced.map(rows=>rows[0].profile.generated_at)).size).toBe(1);
      expect((await sql`select count(*)::int as count from ai_taste_profiles where user_id=${reader}`)[0].count).toBe(1);
      async function browserProfiles(){return sql.begin(async tx=>{await tx`select set_config('request.jwt.claim.sub',${reader},true)`;await tx`select set_config('request.jwt.claim.role','authenticated',true)`;await tx`set local role authenticated`;return tx`select user_id from ai_taste_profiles`;});}
      expect(await browserProfiles()).toHaveLength(1);
      await sql`update users set premium_override=false where id=${reader}`;
      expect(await browserProfiles()).toHaveLength(0);
      await expect(profiles.readTasteProfile(reader)).rejects.toMatchObject({status:403});
      await expect(sql`select save_taste_profile(${reader},${sql.json(source)},${'f'.repeat(64)},'profile-sql-race',${sql.json(generated.profile)},'deepseek')`).rejects.toThrow('Premium required');
    }finally{model.mockRestore();lease.mockRestore();}
    for(const role of ['anon','authenticated']){
      for(const routine of ['taste_profile_input(uuid)','writing_plan_input(uuid)','save_taste_profile(uuid,jsonb,text,text,jsonb,text)','save_writing_plan(uuid,date,jsonb,text,text,jsonb,text)','update_profile_atomic(uuid,jsonb,text)'])expect((await sql`select has_function_privilege(${role},${routine},'EXECUTE') as allowed`)[0].allowed).toBe(false);
      for(const table of ['ai_taste_profiles','writing_plans'])expect((await sql`select has_table_privilege(${role},${table},'INSERT') as allowed`)[0].allowed).toBe(false);
    }
    }
    {
    vi.stubEnv('DATABASE_PROVIDER','railway');vi.stubEnv('DATABASE_URL',url);vi.stubEnv('DATABASE_SSL','false');
    vi.stubEnv('DODOPAYMENTS_API_KEY','isolated-provider-fixture');vi.stubEnv('DODOPAYMENTS_ENVIRONMENT','test_mode');vi.stubEnv('PAYSTACK_SECRET_KEY','isolated-provider-fixture');
    const buyer=crypto.randomUUID(),creator=crypto.randomUUID();
    await sql`insert into auth.users(id,email,raw_user_meta_data) values(${buyer},'checkout-buyer@example.test',${sql.json({username:'checkout_buyer'})}),(${creator},'checkout-creator@example.test',${sql.json({username:'checkout_creator'})})`;
    const [created]=await sql`select create_tip_transaction(${buyer},${creator},3,0.3,2.7,'USD','checkout-replay-intent','checkout-test') as tip`;
    const tipId=created.tip.id;
    await sql`select record_checkout_session(${buyer},'tip',${tipId},'dodopayments','cks_replay','https://checkout.dodopayments.com/replay')`;
    await expect(sql`select record_checkout_session(${creator},'tip',${tipId},'dodopayments','cks_replay','https://checkout.dodopayments.com/replay')`).rejects.toThrow('binding');
    await expect(sql`select record_checkout_session(${buyer},'tip',${tipId},'dodopayments','cks_changed','https://checkout.dodopayments.com/changed')`).rejects.toThrow('identity');
    const leases=await Promise.all(Array.from({length:4},()=>sql`select * from claim_checkout_reconciliations(${buyer},3)`));
    expect(leases.flat()).toHaveLength(1);const first=leases.flat()[0];
    expect(await sql`select * from claim_checkout_reconciliations(${creator},3)`).toHaveLength(0);
    await sql`update checkout_reconciliations set claimed_at=now()-interval '3 minutes' where entity_id=${tipId}`;
    const [reclaimed]=await sql`select * from claim_checkout_reconciliations(${buyer},3)`;
    expect(reclaimed.claim_token).not.toBe(first.claim_token);
    expect((await sql`select finish_checkout_reconciliation('tip',${tipId},${first.claim_token},true,true,0,60,null,'checkout-test') as applied`)[0].applied).toBe(false);
    await sql`select finish_checkout_reconciliation('tip',${tipId},${reclaimed.claim_token},false,false,0,60,'DEPENDENCY_FAILURE','checkout-test')`;
    await sql`update checkout_reconciliations set next_attempt_at=now() where entity_id=${tipId}`;
    const {drainCheckoutReconciliation}=await import('@/lib/checkout-reconciliation');
    const {capturedPaymentEvent}=await import('@/lib/refund-reconciliation');
    const paidAt=new Date().toISOString();
    const payment={payment_id:'pay_checkout_replay',status:'succeeded',total_amount:300,tax:0,currency:'USD',created_at:paidAt,metadata:{tip_id:tipId}};
    const transport=vi.spyOn(globalThis,'fetch').mockImplementation(async input=>{
      const target=String(input);
      if(target==='https://test.dodopayments.com/checkouts/cks_replay')return Response.json({id:'cks_replay',payment_status:'succeeded',payment_id:payment.payment_id});
      if(target==='https://test.dodopayments.com/payments/'+payment.payment_id)return Response.json(payment);
      throw new Error('Unexpected provider request');
    });
    try{
      expect(await drainCheckoutReconciliation('checkout-test',buyer)).toEqual({scanned:1,applied:1,failed:0});
      expect((await sql`select status from tips where id=${tipId}`)[0].status).toBe('completed');
      expect((await sql`select count(*)::int as count from payment_captures where entity_id=${tipId}`)[0].count).toBe(1);
      const event=await capturedPaymentEvent('dodopayments',payment);
      expect((await sql`select process_payment_event('dodopayments',${event.eventId},${sql.json(event.payload)},'checkout-webhook-replay') as applied`)[0].applied).toBe(false);
      expect((await drainCheckoutReconciliation('checkout-test',buyer)).scanned).toBe(0);
      expect(Number((await sql`select creator_balance(${creator},'USD') as balance`)[0].balance.available)).toBe(2.7);
      const [underpaid]=await sql`select create_tip_transaction(${buyer},${creator},5,0.5,4.5,'USD','checkout-underpaid-intent','checkout-test') as tip`;
      await sql`select record_checkout_session(${buyer},'tip',${underpaid.tip.id},'dodopayments','cks_underpaid','https://checkout.dodopayments.com/underpaid')`;
      transport.mockImplementation(async input=>String(input).includes('/checkouts/')?Response.json({id:'cks_underpaid',payment_status:'succeeded',payment_id:'pay_underpaid'}):Response.json({...payment,payment_id:'pay_underpaid',total_amount:400,metadata:{tip_id:underpaid.tip.id}}));
      expect((await drainCheckoutReconciliation('checkout-test',buyer)).failed).toBe(0);
      expect((await sql`select status,last_error from checkout_reconciliations where entity_id=${underpaid.tip.id}`)[0]).toMatchObject({status:'settled',last_error:null});
      expect((await sql`select charged_minor,credited from payment_captures where entity_id=${underpaid.tip.id}`)[0]).toMatchObject({charged_minor:'400',credited:false});
      expect((await sql`select status,reason from payment_returns where payment_id='pay_underpaid'`)[0]).toMatchObject({status:'pending',reason:'amount_mismatch'});
      const [intent]=await sql`select create_subscription_intent(${buyer},'dodopayments','USD',4.99,'renewal-recovery-intent','checkout-test') as subscription`;
      const subId=intent.subscription.id,remote='sub_recovery_fixture';
      await sql`update subscriptions set provider_subscription_id=${remote} where id=${subId}`;
      const renewal={payment_id:'pay_recovered_renewal',status:'succeeded',total_amount:499,tax:0,currency:'USD',created_at:paidAt,subscription_ids:[remote],service_periods:[{subscription_id:remote,starts_at:paidAt,ends_at:new Date(Date.now()+30*86400000).toISOString()}],metadata:{}};
      transport.mockImplementation(async input=>{
        const target=String(input);
        if(target.startsWith('https://test.dodopayments.com/payments?'))return Response.json({items:[{payment_id:renewal.payment_id}]});
        if(target==='https://test.dodopayments.com/payments/'+renewal.payment_id)return Response.json(renewal);
        throw new Error('Unexpected renewal request');
      });
      expect((await drainCheckoutReconciliation('checkout-test',buyer)).applied).toBe(1);
      expect((await sql`select has_premium_access(${buyer}) as active`)[0].active).toBe(true);
      expect((await sql`select status from checkout_reconciliations where entity_id=${subId}`)[0].status).toBe('pending');
      await sql`update checkout_reconciliations set next_attempt_at=now() where entity_id=${subId}`;
      expect((await drainCheckoutReconciliation('checkout-test',buyer)).applied).toBe(0);
      expect((await sql`select count(*)::int as count from payment_captures where entity_id=${subId}`)[0].count).toBe(1);
    }finally{transport.mockRestore();}
    for(const role of ['anon','authenticated']){
      expect((await sql`select has_table_privilege(${role},'checkout_reconciliations','SELECT') as allowed`)[0].allowed).toBe(false);
      for(const routine of ['record_checkout_session(uuid,text,uuid,text,text,text)','claim_checkout_reconciliations(uuid,integer)','finish_checkout_reconciliation(text,uuid,uuid,boolean,boolean,integer,integer,text,text)','financial_integrity_snapshot_046()'])expect((await sql`select has_function_privilege(${role},${routine},'EXECUTE') as allowed`)[0].allowed).toBe(false);
    }
    }
    {
    const admin=crypto.randomUUID(),author=crypto.randomUUID();
    await sql`insert into auth.users(id,email,raw_user_meta_data) values(${admin},'promotion-admin@example.test',${sql.json({username:'promotion_admin'})}),(${author},'promotion-author@example.test',${sql.json({username:'promotion_author'})})`;
    await sql`update users set is_admin=true where id=${admin}`;
    const [book]=await sql`insert into books(title,author_name) values('Promotion fixture','Author') returning id`;
    const payload={book_id:book.id,author_id:author,start_date:new Date().toISOString(),end_date:new Date(Date.now()+86400000).toISOString(),placement:'discover_top',is_active:true};
    const created=await Promise.all(Array.from({length:4},()=>sql`select apply_promotion_intent(${admin},'create',null,'manual-promotion-intent',${sql.json(payload)},'promotion-test') as listing`));
    const id=created[0][0].listing.id;
    expect(new Set(created.map(rows=>rows[0].listing.id)).size).toBe(1);
    expect((await sql`select count(*)::int as count from notifications where user_id=${author} and type='promoted_listing_activated'`)[0].count).toBe(1);
    expect((await sql`select count(*)::int as count from financial_audit_log where actor_user_id=${admin} and action='promotion_create'`)[0].count).toBe(1);
    await expect(sql`select apply_promotion_intent(${admin},'create',null,'manual-promotion-intent',${sql.json({...payload,is_active:false})},'promotion-test')`).rejects.toThrow('Conflicting');
    const {getActivePromotions}=await import('@/services/promotions');
    expect((await getActivePromotions('discover_top')).some(item=>item.listing_id===id&&item.id===book.id)).toBe(true);
    await Promise.all(Array.from({length:4},()=>sql`select record_promotion_click(${author},${id},'promotion-click-once')`));
    expect((await sql`select clicks from promoted_listings where id=${id}`)[0].clicks).toBe(1);
    await Promise.all(Array.from({length:3},()=>sql`select apply_promotion_intent(${admin},'update',${id},'manual-promotion-disable','{"is_active":false}'::jsonb,'promotion-test')`));
    expect((await sql`select is_active,created_by from promoted_listings where id=${id}`)[0]).toMatchObject({is_active:false,created_by:admin});
    await expect(sql`select record_promotion_click(${author},${id},'promotion-inactive-click')`).rejects.toThrow('not active');
    await expect(sql`select apply_promotion_intent(${author},'update',${id},'manual-promotion-forbidden','{"is_active":true}'::jsonb,'promotion-test')`).rejects.toThrow('Admin required');
    await expect(sql`select apply_promotion_intent(${admin},'update',${id},'manual-promotion-invalid',${sql.json({start_date:payload.end_date,end_date:payload.start_date})},'promotion-test')`).rejects.toThrow('Invalid promotion dates');
    await Promise.all(Array.from({length:3},()=>sql`select apply_promotion_intent(${admin},'delete',${id},'manual-promotion-delete','{}'::jsonb,'promotion-test')`));
    expect((await sql`select count(*)::int as count from promoted_listings where id=${id}`)[0].count).toBe(0);
    expect((await sql`select count(*)::int as count from financial_audit_log where actor_user_id=${admin} and action='promotion_delete'`)[0].count).toBe(1);
    for(const role of ['anon','authenticated']){
      expect((await sql`select has_function_privilege(${role},'apply_promotion_intent(uuid,text,uuid,text,jsonb,text)','EXECUTE') as allowed`)[0].allowed).toBe(false);
      expect((await sql`select has_table_privilege(${role},'promoted_listings','UPDATE') as allowed`)[0].allowed).toBe(false);
    }
    }
    {
    const host=crypto.randomUUID(),referrer=crypto.randomUUID(),a=crypto.randomUUID(),b=crypto.randomUUID(),c=crypto.randomUUID();
    for(const [index,id] of [host,referrer,a,b,c].entries())await sql`insert into auth.users(id,email,raw_user_meta_data) values(${id},${'tickets'+index+'@example.test'},${sql.json({username:'ticket_fixture_'+index})})`;
    await sql`update users set referred_by=${referrer} where id=${a}`;
    const [event]=await sql`insert into events(organizer_id,title,event_date,is_paid,ticket_price,currency,max_attendees) values(${host},'Paid capacity fixture',now()+interval '2 days',true,10,'USD',1) returning id`;
    const reserve=(actor:string,key:string,target=event.id)=>sql`select reserve_event_ticket(${actor},${target},${key},'ticket-test') as ticket`;
    await expect(reserve(host,'ticket-host-self-purchase')).rejects.toThrow('Event unavailable');
    const reserved=await Promise.all(Array.from({length:4},()=>reserve(a,'ticket-reservation-replay')));
    const ticket=reserved[0][0].ticket;
    expect(new Set(reserved.map(rows=>rows[0].ticket.id)).size).toBe(1);
    expect((await sql`select count(*)::int as count from event_revenue where ticket_id=${ticket.id}`)[0].count).toBe(0);
    expect((await sql`select count(*)::int as count from referral_commissions where transaction_id=${ticket.id}`)[0].count).toBe(0);
    await expect(reserve(b,'ticket-full-reservation')).rejects.toThrow('Event full');
    await expect(sql`select record_ticket_checkout(${b},${ticket.id},'cks_owned','https://checkout.dodopayments.com/ticket')`).rejects.toThrow('binding');
    await expect(sql`select record_ticket_checkout(${a},${ticket.id},'cks_owned','https://evil.test/ticket')`).rejects.toThrow('Invalid checkout');
    await sql`select record_ticket_checkout(${a},${ticket.id},'cks_owned','https://checkout.dodopayments.com/ticket')`;
    expect((await reserve(a,'ticket-alternate-intent'))[0].ticket.id).toBe(ticket.id);
    await sql`update events set ticket_price=20 where id=${event.id}`;
    await expect(sql`update event_tickets set amount_paid=20 where id=${ticket.id}`).rejects.toThrow('immutable');
    const payload={ticket_id:ticket.id,user_id:a,status:'completed',payment_id:'pay_ticket_once',paid_amount_minor:1000,tax_minor:0,currency:'USD',provider_reference:'ticket_'+ticket.id};
    const settle=(data=payload,id='payment:'+data.payment_id)=>sql`select process_payment_event('dodopayments',${id},${sql.json(data)},'ticket-test') as applied`;
    await expect(settle({...payload,user_id:b})).rejects.toThrow('binding');
    const captures=await Promise.all(Array.from({length:4},()=>settle()));
    expect(captures.filter(rows=>rows[0].applied)).toHaveLength(1);
    expect((await sql`select status from event_tickets where id=${ticket.id}`)[0].status).toBe('confirmed');
    expect((await sql`select count(*)::int as count from notifications where user_id=${a} and type='event_ticket_confirmed'`)[0].count).toBe(1);
    expect(Number((await sql`select creator_balance(${host},'USD') as balance`)[0].balance.available)).toBe(9);
    expect(Number((await sql`select creator_balance(${referrer},'USD') as balance`)[0].balance.available)).toBe(1);
    await settle({...payload,payment_id:'pay_ticket_duplicate'});
    expect((await sql`select credited from payment_captures where payment_id='pay_ticket_duplicate'`)[0].credited).toBe(false);
    expect((await sql`select status from payment_returns where payment_id='pay_ticket_duplicate'`)[0].status).toBe('pending');
    await sql`select process_refund_event('dodopayments','ref_ticket_duplicate','pay_ticket_duplicate',1000,'USD','ticket-test')`;
    expect((await sql`select status from event_tickets where id=${ticket.id}`)[0].status).toBe('confirmed');
    await sql`select process_refund_event('dodopayments','ref_ticket_partial','pay_ticket_once',400,'USD','ticket-test')`;
    expect(Number((await sql`select creator_balance(${host},'USD') as balance`)[0].balance.available)).toBe(5.4);
    expect(Number((await sql`select creator_balance(${referrer},'USD') as balance`)[0].balance.available)).toBe(0.6);
    expect((await sql`select process_refund_event('dodopayments','ref_ticket_partial','pay_ticket_once',400,'USD','ticket-test') as applied`)[0].applied).toBe(false);
    await sql`select process_refund_event('dodopayments','ref_ticket_rest','pay_ticket_once',600,'USD','ticket-test')`;
    expect((await sql`select status from event_tickets where id=${ticket.id}`)[0].status).toBe('refunded');
    expect(Number((await sql`select creator_balance(${host},'USD') as balance`)[0].balance.available)).toBe(0);
    expect(Number((await sql`select creator_balance(${referrer},'USD') as balance`)[0].balance.available)).toBe(0);
    await reserve(b,'ticket-seat-after-refund');
    const [lateEvent]=await sql`insert into events(organizer_id,title,event_date,is_paid,ticket_price,currency,max_attendees) values(${host},'Late payment fixture',now()+interval '2 days',true,10,'USD',1) returning id`;
    const [late]=await reserve(a,'ticket-expired-reservation',lateEvent.id);
    await sql`update event_tickets set reserved_until=now()-interval '1 minute' where id=${late.ticket.id}`;
    expect((await reserve(a,'ticket-expired-reservation',lateEvent.id))[0].ticket.id).toBe(late.ticket.id);
    await reserve(b,'ticket-replacement-reservation',lateEvent.id);
    await settle({...payload,ticket_id:late.ticket.id,payment_id:'pay_ticket_late',provider_reference:'ticket_'+late.ticket.id});
    expect((await sql`select status from event_tickets where id=${late.ticket.id}`)[0].status).toBe('refund_pending');
    expect((await sql`select credited from payment_captures where payment_id='pay_ticket_late'`)[0].credited).toBe(false);
    expect((await sql`select count(*)::int as count from event_revenue where event_id=${lateEvent.id}`)[0].count).toBe(0);
    await sql`update payment_returns set next_attempt_at=now()+interval '1 day' where payment_id<>'pay_ticket_late'`;
    const leases=await Promise.all(Array.from({length:4},()=>sql`select * from claim_payment_returns(3)`));
    expect(leases.flat()).toHaveLength(1);const lease=leases.flat()[0];
    expect((await sql`select update_payment_return('dodopayments','pay_ticket_late',${lease.claim_token},'processing',null,null) as applied`)[0].applied).toBe(true);
    await sql`update payment_returns set claimed_at=now()-interval '3 minutes',next_attempt_at=now() where payment_id='pay_ticket_late'`;
    const [reclaimed]=await sql`select * from claim_payment_returns(3)`;
    expect(reclaimed.claim_token).not.toBe(lease.claim_token);
    expect((await sql`select update_payment_return('dodopayments','pay_ticket_late',${lease.claim_token},'completed',null,null) as applied`)[0].applied).toBe(false);
    expect((await sql`select count(*)::int as count from financial_audit_log where action='payment_return_processing' and metadata->>'payment_id'='pay_ticket_late'`)[0].count).toBe(1);
    const [raceEvent]=await sql`insert into events(organizer_id,title,event_date,is_paid,ticket_price,currency,max_attendees) values(${host},'Reservation race',now()+interval '2 days',true,10,'NGN',1) returning id`;
    const race=await Promise.allSettled([reserve(a,'ticket-race-user-a',raceEvent.id),reserve(b,'ticket-race-user-b',raceEvent.id)]);
    expect(race.filter(result=>result.status==='fulfilled')).toHaveLength(1);
    const [preEvent]=await sql`insert into events(organizer_id,title,event_date,is_paid,ticket_price,currency) values(${host},'Refund before capture',now()+interval '2 days',true,10,'EUR') returning id`;
    const [before]=await reserve(c,'ticket-pre-refund',preEvent.id);
    expect((await sql`select process_refund_event('dodopayments','ref_ticket_before','pay_ticket_before',1000,'EUR','ticket-test') as applied`)[0].applied).toBe(null);
    await settle({...payload,ticket_id:before.ticket.id,user_id:c,payment_id:'pay_ticket_before',currency:'EUR',provider_reference:'ticket_'+before.ticket.id});
    expect((await sql`select status from event_tickets where id=${before.ticket.id}`)[0].status).toBe('refunded');
    expect((await sql`select count(*)::int as count from notifications where user_id=${c} and type='event_ticket_confirmed'`)[0].count).toBe(0);
    expect(Number((await sql`select creator_balance(${host},'EUR') as balance`)[0].balance.available)).toBe(0);
    const [underEvent]=await sql`insert into events(organizer_id,title,event_date,is_paid,ticket_price,currency) values(${host},'Underpayment fixture',now()+interval '2 days',true,10,'USD') returning id`;
    const [under]=await reserve(c,'ticket-underpaid',underEvent.id);
    await settle({...payload,ticket_id:under.ticket.id,user_id:c,payment_id:'pay_ticket_under',paid_amount_minor:900,provider_reference:'ticket_'+under.ticket.id});
    expect((await sql`select charged_minor,credited from payment_captures where payment_id='pay_ticket_under'`)[0]).toMatchObject({charged_minor:'900',credited:false});
    expect((await sql`select status from payment_returns where payment_id='pay_ticket_under'`)[0].status).toBe('pending');
    const evidence={status:'succeeded',refund:{refundId:'ref_ticket_under_verified',paymentId:'pay_ticket_under',amountMinor:900,currency:'USD'}};
    await expect(sql`select reconcile_payment_return(${a},'dodopayments','pay_ticket_under','ref_ticket_under_verified','ticket-admin-return',${sql.json(evidence)},'ticket-test')`).rejects.toThrow('Admin required');
    await sql`update users set is_admin=true where id=${host}`;
    const reconciled=await Promise.all(Array.from({length:3},()=>sql`select reconcile_payment_return(${host},'dodopayments','pay_ticket_under','ref_ticket_under_verified','ticket-admin-return',${sql.json(evidence)},'ticket-test') as result`));
    expect(reconciled[0][0].result.status).toBe('completed');
    expect((await sql`select count(*)::int as count from financial_audit_log where actor_user_id=${host} and action='payment_return_reconciled'`)[0].count).toBe(1);
    expect((await sql`select status from event_tickets where id=${under.ticket.id}`)[0].status).toBe('refunded');
    expect((await sql`select reconcile_payment_return(${host},'dodopayments','pay_ticket_under','ref_ticket_under_verified','ticket-admin-return-new-key',${sql.json(evidence)},'ticket-test') as result`)[0].result.status).toBe('completed');
    const firstPart={status:'succeeded',refund:{refundId:'ref_ticket_late_part',paymentId:'pay_ticket_late',amountMinor:400,currency:'USD'}};
    expect((await sql`select reconcile_payment_return(${host},'dodopayments','pay_ticket_late','ref_ticket_late_part','ticket-admin-partial-return',${sql.json(firstPart)},'ticket-test') as result`)[0].result.status).toBe('submitted');
    const secondPart={status:'succeeded',refund:{refundId:'ref_ticket_late_remaining',paymentId:'pay_ticket_late',amountMinor:600,currency:'USD'}};
    expect((await sql`select reconcile_payment_return(${host},'dodopayments','pay_ticket_late','ref_ticket_late_remaining','ticket-admin-remaining-return',${sql.json(secondPart)},'ticket-test') as result`)[0].result.status).toBe('completed');
    expect(Object.keys((await sql`select financial_integrity_snapshot() as snapshot`)[0].snapshot).sort()).toEqual([...INTEGRITY_SIGNALS].sort());
    const [localEvent]=await sql`insert into events(organizer_id,title,event_date,is_paid,ticket_price,currency) values(${host},'NGN referral fixture',now()+interval '2 days',true,10,'NGN') returning id`;
    const [local]=await reserve(a,'ticket-local-currency',localEvent.id);
    const localPayment={...payload,ticket_id:local.ticket.id,payment_id:'pay_ticket_ngn',currency:'NGN',provider_reference:'ticket_'+local.ticket.id};
    await sql`select process_payment_event('paystack','charge:pay_ticket_ngn',${sql.json(localPayment)},'ticket-test')`;
    expect(Number((await sql`select creator_balance(${referrer},'NGN') as balance`)[0].balance.available)).toBe(1);
    expect(Number((await sql`select creator_balance(${referrer},'USD') as balance`)[0].balance.available)).toBe(0);
    await sql`select process_refund_event('paystack','ref_ticket_ngn','pay_ticket_ngn',1000,'NGN','ticket-test')`;
    expect(Number((await sql`select creator_balance(${referrer},'NGN') as balance`)[0].balance.available)).toBe(0);
    for(const role of ['anon','authenticated']){
      expect((await sql`select has_table_privilege(${role},'event_tickets','INSERT') as allowed`)[0].allowed).toBe(false);
      expect((await sql`select has_table_privilege(${role},'payment_returns','SELECT') as allowed`)[0].allowed).toBe(false);
      for(const routine of ['reserve_event_ticket(uuid,uuid,text,text)','record_ticket_checkout(uuid,uuid,text,text)','process_payment_event_047(text,text,jsonb,text)','process_refund_event_047(text,text,text,bigint,text,text)','claim_payment_returns(integer)','update_payment_return(text,text,uuid,text,text,text)','reconcile_payment_return(uuid,text,text,text,text,jsonb,text)'])expect((await sql`select has_function_privilege(${role},${routine},'EXECUTE') as allowed`)[0].allowed).toBe(false);
    }
    }
    {
    const buyer=crypto.randomUUID(),creator=crypto.randomUUID(),referrer=crypto.randomUUID();
    for(const [index,id] of [buyer,creator,referrer].entries())await sql`insert into auth.users(id,email,raw_user_meta_data) values(${id},${'recovery'+index+'@example.test'},${sql.json({username:'recovery_fixture_'+index})})`;
    await sql`update users set referred_by=${referrer} where id=${buyer}`;
    const [intent]=await sql`select create_tip_transaction(${buyer},${creator},5,0.5,4.5,'USD','recovery-tip-intent','recovery-test') as tip`;
    const payload={tipId:intent.tip.id,status:'completed',providerReference:'pay_recovery_under',payment_id:'pay_recovery_under',paid_amount_minor:400,tax_minor:0,currency:'USD'};
    expect((await sql`select process_refund_event('dodopayments','ref_recovery_before','pay_recovery_under',100,'USD','recovery-test') as applied`)[0].applied).toBe(null);
    const applied=await Promise.all(Array.from({length:4},()=>sql`select process_payment_event('dodopayments','payment:pay_recovery_under',${sql.json(payload)},'recovery-test') as applied`));
    expect(applied.filter(rows=>rows[0].applied)).toHaveLength(1);
    expect((await sql`select charged_minor,refunded_minor,credited from payment_captures where payment_id='pay_recovery_under'`)[0]).toMatchObject({charged_minor:'400',refunded_minor:'100',credited:false});
    expect((await sql`select read_payment_recovery(${buyer},'tip',${intent.tip.id}) as summary`)[0].summary).toEqual([{currency:'USD',charged_minor:'400',refunded_minor:'100',count:1}]);
    expect((await sql`select read_payment_recovery(${creator},'tip',${intent.tip.id}) as summary`)[0].summary).toEqual([]);
    expect((await sql`select count(*)::int as count from outbox_events where aggregate_type='tip' and aggregate_id=${intent.tip.id}`)[0].count).toBe(0);
    expect(Number((await sql`select creator_balance(${creator},'USD') as balance`)[0].balance.available)).toBe(0);
    expect(Number((await sql`select creator_balance(${referrer},'USD') as balance`)[0].balance.available)).toBe(0);
    expect((await sql`select count(*)::int as count from financial_audit_log where provider_event_id='payment:pay_recovery_under' and action='payment_amount_return_queued'`)[0].count).toBe(1);
    await sql`select process_refund_event('dodopayments','ref_recovery_remaining','pay_recovery_under',300,'USD','recovery-test')`;
    expect((await sql`select status from payment_returns where payment_id='pay_recovery_under'`)[0].status).toBe('completed');
    for(const [payment,amount,currency] of [['pay_recovery_over',600,'USD'],['pay_recovery_currency',500,'EUR']] as const){
      await sql`select process_payment_event('dodopayments',${'payment:'+payment},${sql.json({...payload,payment_id:payment,providerReference:payment,paid_amount_minor:amount,currency})},'recovery-test')`;
      expect((await sql`select credited from payment_captures where payment_id=${payment}`)[0].credited).toBe(false);
      expect((await sql`select status from payment_returns where payment_id=${payment}`)[0].status).toBe('pending');
    }
    await expect(sql`select process_payment_event('dodopayments','payment:pay_recovery_over',${sql.json({...payload,payment_id:'pay_recovery_over',paid_amount_minor:700})},'recovery-test')`).rejects.toThrow('conflict');
    const [taxTip]=await sql`select create_tip_transaction(${buyer},${creator},5,0.5,4.5,'USD','recovery-taxed-tip','recovery-test') as tip`;
    await sql`select process_payment_event('dodopayments','payment:pay_recovery_taxed',${sql.json({...payload,tipId:taxTip.tip.id,payment_id:'pay_recovery_taxed',providerReference:'pay_recovery_taxed',paid_amount_minor:550,tax_minor:50})},'recovery-test')`;
    expect((await sql`select status from tips where id=${taxTip.tip.id}`)[0].status).toBe('completed');
    expect((await sql`select read_payment_recovery(${buyer},'tip',${taxTip.tip.id}) as summary`)[0].summary).toEqual([]);
    const [sub]=await sql`select create_subscription_intent(${buyer},'dodopayments','USD',4.99,'recovery-sub-intent','recovery-test') as subscription`;
    const charge={event:'subscription.activated',subscription_id:sub.subscription.id,user_id:buyer,provider_event_at:new Date().toISOString(),provider_subscription_id:'sub_recovery_wrong_amount',payment_id:'pay_recovery_subscription',paid_amount_minor:599,tax_minor:0,currency:'USD',provider_reference:'sub_'+sub.subscription.id,period_end:new Date(Date.now()+30*86400000).toISOString()};
    await expect(sql`select process_payment_event('dodopayments','payment:pay_recovery_foreign',${sql.json({...charge,user_id:creator,payment_id:'pay_recovery_foreign'})},'recovery-test')`).rejects.toThrow('binding');
    await sql`select process_payment_event('dodopayments','payment:pay_recovery_subscription',${sql.json(charge)},'recovery-test')`;
    expect((await sql`select has_premium_access(${buyer}) as active`)[0].active).toBe(false);
    expect((await sql`select status from subscription_cancellations where subscription_id=${sub.subscription.id}`)[0].status).toBe('pending');
    expect((await sql`select provider_subscription_id from subscriptions where id=${sub.subscription.id}`)[0].provider_subscription_id).toBe(charge.provider_subscription_id);
    expect((await sql`select status from payment_returns where payment_id= 'pay_recovery_subscription'`)[0].status).toBe('pending');
    for(const role of ['anon','authenticated'])expect((await sql`select has_function_privilege(${role},'read_payment_recovery(uuid,text,uuid)','EXECUTE') as allowed`)[0].allowed).toBe(false);
    expect((await sql`select has_function_privilege('service_role','process_payment_event_048(text,text,jsonb,text)','EXECUTE') as allowed`)[0].allowed).toBe(false);
    }
    {
    const buyer=crypto.randomUUID(),referrer=crypto.randomUUID();
    for(const [index,id] of [buyer,referrer].entries())await sql`insert into auth.users(id,email,raw_user_meta_data) values(${id},${'principal'+index+'@example.test'},${sql.json({username:'principal_fixture_'+index})})`;
    const [code]=await sql`select referral_code from users where id=${referrer}`;
    await sql`select attribute_referral_atomic(${buyer},${code.referral_code})`;
    for(const [currency,amount,provider] of [['USD',4.99,'dodopayments'],['NGN',7500,'paystack']] as const){
      const [sub]=await sql`select create_subscription_intent(${buyer},${provider},${currency},${amount},${'principal-sub-'+currency},'principal-test') as subscription`;
      const payment='pay_principal_'+currency,event=(provider==='paystack'?'charge:':'payment:')+payment;
      const payload={event:'subscription.activated',subscription_id:sub.subscription.id,user_id:buyer,provider_event_at:new Date().toISOString(),provider_subscription_id:'sub_principal_'+currency,payment_id:payment,paid_amount_minor:Math.round(amount*100),tax_minor:0,currency,provider_reference:'sub_'+sub.subscription.id,period_end:new Date(Date.now()+30*86400000).toISOString()};
      const applied=await Promise.all(Array.from({length:3},()=>sql`select process_payment_event(${provider},${event},${sql.json(payload)},'principal-test') as applied`));
      expect(applied.filter(rows=>rows[0].applied)).toHaveLength(1);
      expect(Number((await sql`select creator_balance(${referrer},${currency}) as balance`)[0].balance.available)).toBe(currency==='USD'?0.499:750);
      if(currency==='NGN'){
        await sql`insert into user_payout_methods(user_id,provider,display_name,account_number,bank_code,currency) values(${referrer},'manual','NGN fixture','1234567890','AUDIT','NGN')`;
        await sql`select create_payout_request_atomic(${referrer},500,'manual','principal-payout','principal-test','NGN')`;
      }
      const partial=currency==='USD'?100:150000;
      await sql`select process_refund_event(${provider},${'ref_principal_partial_'+currency},${payment},${partial},${currency},'principal-test')`;
      expect(Number((await sql`select commission_amount from referral_commissions where idempotency_key=${provider+':'+event}`)[0].commission_amount)).toBe(currency==='USD'?0.399:600);
      await sql`select process_refund_event(${provider},${'ref_principal_rest_'+currency},${payment},${Math.round(amount*100)-partial},${currency},'principal-test')`;
      expect(Number((await sql`select creator_balance(${referrer},${currency}) as balance`)[0].balance.available)).toBe(0);
      if(currency==='NGN')expect((await sql`select status from payout_requests where user_id=${referrer} and currency='NGN'`)[0].status).toBe('cancelled');
    }
    for(const routine of ['process_payment_event_legacy(text,text,jsonb,text)','process_refund_event_047(text,text,text,bigint,text,text)'])expect((await sql`select has_function_privilege('service_role',${routine},'EXECUTE') as allowed`)[0].allowed).toBe(false);
    }
    {
    const reader=crypto.randomUUID(),other=crypto.randomUUID();
    for(const [index,id] of [reader,other].entries())await sql`insert into auth.users(id,email,raw_user_meta_data) values(${id},${'reading-integrity'+index+'@example.test'},${sql.json({username:'reading_integrity_'+index})})`;
    const [book]=await sql`insert into books(title,author_name) values('Buddy integrity','Author') returning id`;
    const rooms=await sql`insert into buddy_reads(created_by,book_id,max_participants,current_chapter,is_active) values(${reader},${book.id},3,1,true),(${other},${book.id},3,1,true) returning id`;
    await sql`insert into buddy_read_members(buddy_read_id,user_id) values(${rooms[0].id},${reader}),(${rooms[1].id},${other})`;
    await sql`update buddy_reads set is_private=true where id=${rooms[1].id}`;
    await sql.begin(async tx=>{
      await tx`select set_config('request.jwt.claim.sub',${reader},true),set_config('request.jwt.claim.role','authenticated',true)`;
      await tx.unsafe('set local role authenticated');
      expect((await tx`select count(*)::int as count from buddy_reads where id in (${rooms[0].id},${rooms[1].id})`)[0].count).toBe(1);
      expect((await tx`select count(*)::int as count from buddy_read_members where buddy_read_id=${rooms[0].id}`)[0].count).toBe(1);
      expect((await tx`select count(*)::int as count from buddy_read_notes where buddy_read_id=${rooms[1].id}`)[0].count).toBe(0);
    });
    const update={current_chapter:3,note:'A shared update'};
    const updates=await Promise.all(Array.from({length:4},()=>sql`select update_buddy_progress(${reader},${rooms[0].id},'buddy-atomic-update',${sql.json(update)}) as result`));
    expect(new Set(updates.map(rows=>rows[0].result.note.id)).size).toBe(1);
    expect((await sql`select count(*)::int as count from buddy_read_notes where buddy_read_id=${rooms[0].id}`)[0].count).toBe(1);
    await expect(sql`select update_buddy_progress(${reader},${rooms[0].id},'buddy-atomic-update',${sql.json({...update,current_chapter:4})})`).rejects.toThrow('Conflicting');
    await expect(sql`select update_buddy_progress(${other},${rooms[0].id},'buddy-foreign-update',${sql.json(update)})`).rejects.toThrow('participant');
    await expect(sql`insert into buddy_read_notes(buddy_read_id,user_id,content,reply_to_id) values(${rooms[1].id},${other},'Foreign reply',${updates[0][0].result.note.id})`).rejects.toThrow('Reply unavailable');
    await sql.unsafe("create function reject_fixture_note() returns trigger language plpgsql as $$begin if new.content='rollback fixture' then raise exception 'fixture failure'; end if; return new; end $$; create trigger reject_fixture_note before insert on buddy_read_notes for each row execute function reject_fixture_note();").simple();
    await expect(sql`select update_buddy_progress(${reader},${rooms[0].id},'buddy-rollback-update',${sql.json({current_chapter:9,note:'rollback fixture'})})`).rejects.toThrow('fixture failure');
    expect((await sql`select current_chapter from buddy_reads where id=${rooms[0].id}`)[0].current_chapter).toBe(3);
    expect((await sql`select count(*)::int as count from content_intents where actor_id=${reader} and intent_key='buddy-rollback-update'`)[0].count).toBe(0);
    await sql.unsafe('drop trigger reject_fixture_note on buddy_read_notes;drop function reject_fixture_note();').simple();
    const [reply]=await sql`insert into buddy_read_notes(buddy_read_id,user_id,content,reply_to_id) values(${rooms[0].id},${reader},'Valid reply',${updates[0][0].result.note.id}) returning id`;
    await sql`update buddy_reads set is_active=false where id=${rooms[0].id}`;
    await sql`delete from buddy_read_notes where id=${updates[0][0].result.note.id}`;
    expect((await sql`select reply_to_id from buddy_read_notes where id=${reply.id}`)[0].reply_to_id).toBeNull();
    await expect(sql`insert into buddy_read_notes(buddy_read_id,user_id,content) values(${rooms[0].id},${reader},'Closed group')`).rejects.toThrow('unavailable');
    const {parseGoodreadsImport}=await import('@/lib/goodreads-import');
    const parsed=parseGoodreadsImport('Book Id,Title,Author,ISBN,Exclusive Shelf,Date Read\n9001,Import One,Author,0306406152,read,2025/10/20\n9002,Import Two,Author,,currently-reading,\n9003,Import One duplicate,Author,0306406152,to-read,\n,Missing identity,Author,,read,');
    const importRows=parsed.rows;
    const imports=await Promise.all(Array.from({length:4},()=>sql`select import_goodreads_library(${reader},'reading-import-once',${sql.json(importRows)},${parsed.skipped}) as result`));
    expect(imports.every(rows=>rows[0].result.imported===2&&rows[0].result.skipped===2)).toBe(true);
    expect((await sql`select count(*)::int as count from shelf_books where user_id=${reader}`)[0].count).toBe(2);
    expect((await sql`select count(distinct book_id)::int as count from goodreads_book_identities where goodreads_id in ('9001','9003')`)[0].count).toBe(1);
    expect((await sql`select finished_at::text as date from shelf_books sb join goodreads_book_identities i on i.book_id=sb.book_id where sb.user_id=${reader} and i.goodreads_id='9001'`)[0].date).toBe('2025-10-20');
    expect((await sql`select count(*)::int as count from xp_ledger where user_id=${reader}`)[0].count).toBe(0);
    expect((await sql`select books_read_count from users where id=${reader}`)[0].books_read_count).toBe(1);
    expect((await sql`select currently_reading_count from books where id=(select book_id from goodreads_book_identities where goodreads_id='9002')`)[0].currently_reading_count).toBe(1);
    expect((await sql`select import_goodreads_library(${reader},'reading-import-new-key',${sql.json(importRows)},${parsed.skipped}) as result`)[0].result).toEqual({imported:0,skipped:4});
    await expect(sql`select import_goodreads_library(${reader},'reading-import-once',${sql.json(importRows.slice(0,1))},0)`).rejects.toThrow('Conflicting');
    const invalid=[{book:{title:'Rollback catalog',author_name:'Author',goodreads_id:'999001'},shelf:'want_to_read',finished_at:null},{book:{title:'Invalid',author_name:'Author',goodreads_id:'999002'},shelf:'invalid',finished_at:null}];
    await expect(sql`select import_goodreads_library(${other},'reading-import-rollback',${sql.json(invalid)},0)`).rejects.toThrow('Invalid shelf');
    expect((await sql`select count(*)::int as count from books where title='Rollback catalog'`)[0].count).toBe(0);
    const third=crypto.randomUUID();await sql`insert into auth.users(id,email,raw_user_meta_data) values(${third},'import-third@example.test','{"username":"import_third"}')`;
    await sql`insert into goodreads_book_identities(goodreads_id,book_id) select case goodreads_id when '9001' then '9004' else '9005' end,book_id from goodreads_book_identities where goodreads_id in ('9001','9002')`;
    const aliases=(ids:string[])=>ids.map(id=>({book:{title:'Alias '+id,author_name:'Author',goodreads_id:id},shelf:'want_to_read',finished_at:null}));
    const parallelImports=await Promise.all([
      sql`select import_goodreads_library(${other},'reading-import-order-a',${sql.json(aliases(['9001','9002']))},0) as result`,
      sql`select import_goodreads_library(${third},'reading-import-order-b',${sql.json(aliases(['9005','9004']))},0) as result`,
    ]);
    expect(parallelImports.every(rows=>rows[0].result.imported===2)).toBe(true);
    expect((await sql`select want_to_read_count,currently_reading_count from books where id=(select book_id from goodreads_book_identities where goodreads_id='9002')`)[0]).toMatchObject({want_to_read_count:2,currently_reading_count:1});
    for(const role of ['anon','authenticated'])for(const routine of ['update_buddy_progress(uuid,uuid,text,jsonb)','import_goodreads_library(uuid,text,jsonb,integer)'])expect((await sql`select has_function_privilege(${role},${routine},'EXECUTE') as allowed`)[0].allowed).toBe(false);
    }
    {
    const admin=crypto.randomUUID(),other=crypto.randomUUID();
    for(const [index,id] of [admin,other].entries())await sql`insert into auth.users(id,email,raw_user_meta_data) values(${id},${'configuration'+index+'@example.test'},${sql.json({username:'configuration_'+index})})`;
    await sql`update users set is_admin=true where id=${admin}`;
    const apply=(action:string,key:string,payload:Record<string,unknown>,actor=admin)=>sql`select apply_admin_configuration(${actor},${action},${key},${sql.json(payload as never)},'configuration-test') as result`;
    const themes=await Promise.all(Array.from({length:4},()=>apply('theme_create','config-theme-create',{name:'Audit theme A',css_overrides:':root{--accent:#123456;}\n.dark{--background:#000;}'})));
    expect(new Set(themes.map(rows=>rows[0].result.id)).size).toBe(1);
    await apply('theme_create','config-theme-second',{name:'Audit theme B',css_overrides:''});
    await apply('theme_set','config-theme-activate',{name:'Audit theme A',is_active:true});
    await expect(apply('theme_set','config-theme-missing',{name:'Unknown theme',is_active:true})).rejects.toThrow('unavailable');
    expect((await sql`select name from custom_themes where is_active`)[0].name).toBe('Audit theme A');
    await Promise.all([apply('theme_set','config-theme-race-a',{name:'Audit theme A',is_active:true}),apply('theme_set','config-theme-race-b',{name:'Audit theme B',is_active:true})]);
    expect((await sql`select count(*)::int as count from custom_themes where is_active`)[0].count).toBe(1);
    await expect(sql`update custom_themes set is_active=true where not is_active`).rejects.toThrow('custom_theme_single_active');
    const [active]=await sql`select name from custom_themes where is_active`;
    const [inactive]=await sql`select name from custom_themes where not is_active limit 1`;
    await apply('theme_set','config-inactive-disable',{name:inactive.name,is_active:false});
    expect((await sql`select name from custom_themes where is_active`)[0].name).toBe(active.name);
    await expect(apply('theme_create','config-theme-create',{name:'Changed theme',css_overrides:''})).rejects.toThrow('Conflicting');
    await expect(apply('theme_create','config-unsafe-css',{name:'Unsafe theme',css_overrides:':root{--accent:url(https://evil.test);}' })).rejects.toThrow('Invalid theme CSS');
    expect((await sql`select count(*)::int as count from financial_audit_log where actor_user_id=${admin} and action='admin_theme_create' and idempotency_key='config-theme-create'`)[0].count).toBe(1);
    const store={name:'Fixture store',countries:['NG','NG'],url_template:'https://shop.example.test/?isbn={isbn}',affiliate_tag:null,is_active:true,priority:1,is_non_affiliate:false};
    const stores=await Promise.all(Array.from({length:3},()=>apply('store_create','config-store-create',store)));
    expect(new Set(stores.map(rows=>rows[0].result.id)).size).toBe(1);expect(stores[0][0].result.countries).toEqual(['NG']);
    await apply('store_update','config-store-edit',{...store,id:stores[0][0].result.id,is_active:false});
    const season={name:'Fixture season',theme:'Reading',badge_name:'Reader',start_date:new Date().toISOString(),end_date:new Date(Date.now()+86400000).toISOString(),is_published:true};
    const seasons=await Promise.all(Array.from({length:3},()=>apply('season_create','config-season-create',season)));
    expect(new Set(seasons.map(rows=>rows[0].result.id)).size).toBe(1);
    await apply('season_update','config-season-edit',{...season,id:seasons[0][0].result.id,is_published:false});
    await expect(apply('season_create','config-invalid-dates',{...season,end_date:season.start_date})).rejects.toThrow('Invalid seasonal');
    await expect(apply('theme_set','config-foreign-admin',{name:'Audit theme A',is_active:true},other)).rejects.toThrow('Admin required');
    await sql`update users set is_admin=false where id=${admin}`;
    await expect(apply('theme_create','config-theme-create',{name:'Audit theme A',css_overrides:':root{--accent:#123456;}\n.dark{--background:#000;}'})).rejects.toThrow('Admin required');
    for(const role of ['anon','authenticated'])expect((await sql`select has_function_privilege(${role},'apply_admin_configuration(uuid,text,text,jsonb,text)','EXECUTE') as allowed`)[0].allowed).toBe(false);
    }
    {
    const admin=crypto.randomUUID();await sql`insert into auth.users(id,email,raw_user_meta_data) values(${admin},'seed-admin@example.test','{"username":"seed_admin_fixture"}')`;
    await sql`update users set is_admin=true where id=${admin}`;
    const seed=(kind:string,key:string,data:Record<string,unknown>)=>sql`select seed_content_item(${kind},${key},${sql.json(data as never)},${admin}) as result`;
    const hostile=crypto.randomUUID();await sql`insert into auth.users(id,email,raw_user_meta_data) values(${hostile},'hostile-editor@example.test','{"username":"liravo_editors"}')`;
    await expect(seed('editors','system',{})).rejects.toThrow('Editors identity requires reconciliation');
    expect((await sql`select is_verified_author from users where id=${hostile}`)[0].is_verified_author).toBe(false);
    await sql`update users set username='hostile_editor_fixture' where id=${hostile}`;
    const legacyEditor=crypto.randomUUID();await sql`insert into auth.users(id,email,raw_user_meta_data) values(${legacyEditor},'liravo_editors_system@liravo.internal','{"username":"liravo_editors"}')`;
    await sql`update users set is_verified_author=true where id=${legacyEditor}`;
    expect((await seed('editors','system',{}))[0].result).toMatchObject({id:legacyEditor,created:false});
    await sql`delete from auth.users where id=${legacyEditor}`;
    const editors=await Promise.all(Array.from({length:3},()=>seed('editors','system',{})));
    expect(editors.filter(rows=>rows[0].result.created)).toHaveLength(1);const editor=editors[0][0].result.id;
    expect((await sql`select count(*)::int as count from shelves where user_id=${editor}`)[0].count).toBe(3);
    expect((await sql`select id from auth.users where id=${editor}`)[0].id).toBe(editor);
    await sql`update users set password_hash='fixture-login-identity' where id=${editor}`;
    await expect(seed('editors','system',{})).rejects.toThrow('login identities');
    await sql`update users set password_hash=null where id=${editor}`;
    const {seedCollection}=await import('../scripts/seed/items');
    const client={rpc:async(_name:string,args:{p_kind:string;p_key:string;p_data:Record<string,unknown>;p_actor_id:string|null})=>{
      try{return {data:(await seed(args.p_kind,args.p_key,args.p_data))[0].result,error:null};}catch(error){return {data:null,error:{message:error instanceof Error?error.message:'Seed failed'}};}
    }} as never;
    const books=await seedCollection(client,'books',admin);
    expect(books.errors).toEqual([]);expect(books.inserted+books.skipped).toBe(101);expect(Object.keys(books.ids)).toHaveLength(101);
    const list={title:'Partial seed list',description:'Fixture',book_isbns:['9780670026197','9780593318171']};
    const [partial]=await sql`insert into reading_lists(user_id,name,is_public) values(${editor},${list.title},true) returning id`;
    const lists=await Promise.all(Array.from({length:3},()=>seed('lists','partial-list',list)));
    expect(new Set(lists.map(rows=>rows[0].result.id))).toEqual(new Set([partial.id]));
    expect(lists.filter(rows=>rows[0].result.repaired)).toHaveLength(1);
    expect((await sql`select count(*)::int as count from reading_list_books where list_id=${partial.id}`)[0].count).toBe(2);
    await sql`delete from reading_list_books where list_id=${partial.id} and book_id=${books.ids['9780670026197']}`;
    expect((await seed('lists','partial-list',list))[0].result.repaired).toBe(true);
    await expect(seed('lists','missing-list',{...list,title:'Missing dependency',book_isbns:['0000000000000']})).rejects.toThrow('Seed books before');
    expect((await sql`select count(*)::int as count from reading_lists where user_id=${editor} and name='Missing dependency'`)[0].count).toBe(0);
    const challenge={title:'Seed race challenge',description:'Fixture',type:'weekly',start_date:new Date().toISOString(),end_date:new Date(Date.now()+86400000).toISOString(),is_active:true};
    const challenges=await Promise.all(Array.from({length:4},()=>seed('challenges','race-challenge',challenge)));
    expect(challenges.filter(rows=>rows[0].result.created)).toHaveLength(1);
    const prompt={prompt_text:'A sufficient seed prompt for the next day.',topic_seed:'Fixture',offset:90};
    const firstPrompt=(await seed('prompts','stable-prompt',prompt))[0].result.id;
    await sql`update seed_records set metadata=jsonb_build_object('start_date',(now() at time zone 'UTC')::date+20) where kind='anchor' and key='prompts'`;
    expect((await seed('prompts','stable-prompt',prompt))[0].result.id).toBe(firstPrompt);
    for(const kind of ['lists','challenges','prompts'] as const){const result=await seedCollection(client,kind,admin);expect(result.errors).toEqual([]);expect(result.inserted+result.skipped).toBe(kind==='lists'?20:kind==='challenges'?6:63);}
    expect((await sql`select count(*)::int as count from xp_ledger where user_id=${editor}`)[0].count).toBe(0);
    await sql`update users set is_admin=false where id=${admin}`;
    await expect(seed('challenges','race-challenge',challenge)).rejects.toThrow('Admin required');
    for(const role of ['anon','authenticated']){
      expect((await sql`select has_function_privilege(${role},'seed_content_item(text,text,jsonb,uuid)','EXECUTE') as allowed`)[0].allowed).toBe(false);
      expect((await sql`select has_table_privilege(${role},'seed_records','SELECT') as allowed`)[0].allowed).toBe(false);
    }
    }
    {
    const reader=crypto.randomUUID();await sql`insert into auth.users(id,email,raw_user_meta_data) values(${reader},'onboarding-pin@example.test','{"username":"onboarding_pin_fixture"}')`;
    const bcrypt=(await import('bcryptjs')).default,hash=await bcrypt.hash('2468',12);
    const changes={username:'onboarding_pin_saved',display_name:'Reader',user_types:['reader'],genres:['Fantasy','Mystery','Thriller','Romance','Poetry'],onboarding_complete:true};
    await expect(sql`select update_profile_atomic(${reader},${sql.json({...changes,genres:['Fantasy']})},${hash})`).rejects.toThrow('five genres');
    expect((await sql`select onboarding_complete,pin_hash from users where id=${reader}`)[0]).toMatchObject({onboarding_complete:false,pin_hash:null});
    await sql`select update_profile_atomic(${reader},${sql.json(changes)},${hash})`;
    expect((await sql`select onboarding_complete,pin_hash from users where id=${reader}`)[0]).toMatchObject({onboarding_complete:true,pin_hash:hash});
    await sql`select update_profile_atomic(${reader},${sql.json(changes)},${hash})`;
    expect((await sql`select count(*)::int as count from security_events where user_id=${reader} and event_type='pin_set'`)[0].count).toBe(1);
    await expect(sql`select update_profile_atomic(${reader},${sql.json(changes)},${await bcrypt.hash('1357',12)})`).rejects.toThrow('PIN changed');
    await expect(sql.begin(async tx=>{await tx`select set_config('request.jwt.claim.role','authenticated',true)`;await tx`update users set display_name='Bypass' where id=${reader}`;})).rejects.toThrow('profile API');
    await sql.begin(async tx=>{await tx`select set_config('request.jwt.claim.role','authenticated',true)`;await tx`update users set profile_visibility='followers_only' where id=${reader}`;});
    expect((await sql`select display_name,profile_visibility from users where id=${reader}`)[0]).toMatchObject({display_name:'Reader',profile_visibility:'followers_only'});
    expect((await sql`select has_function_privilege('service_role','update_profile_046(uuid,jsonb)','EXECUTE') as allowed`)[0].allowed).toBe(false);
    }
    {
    const buyer=crypto.randomUUID(),owner=crypto.randomUUID();
    for(const [index,id] of [buyer,owner].entries())await sql`insert into auth.users(id,email,raw_user_meta_data) values(${id},${'pin-wallet'+index+'@example.test'},${sql.json({username:'pin_wallet_'+index})})`;
    const bcrypt=(await import('bcryptjs')).default,hashA=await bcrypt.hash('2468',12),hashB=await bcrypt.hash('1357',12);
    const first=await Promise.allSettled([sql`select set_account_pin(${owner},null,${hashA})`,sql`select set_account_pin(${owner},null,${hashB})`]);
    expect(first.filter(result=>result.status==='fulfilled')).toHaveLength(1);
    const current=(await sql`select pin_hash from users where id=${owner}`)[0].pin_hash;
    expect((await sql`select set_account_pin(${owner},${current},${current}) as changed`)[0].changed).toBe(false);
    const bank={provider:'manual',display_name:'PIN fixture',account_number:'1234567890',bank_code:'AUDIT',currency:'USD'};
    await expect(sql`select save_payout_destination(${owner},'pin-bank-denied',${sql.json(bank)},null,'pin-test')`).rejects.toThrow('PIN confirmation');
    const banks=await Promise.all(Array.from({length:3},()=>sql`select save_payout_destination(${owner},'pin-bank-saved',${sql.json(bank)},${current},'pin-test') as result`));
    expect(banks.every(rows=>rows[0].result.saved)).toBe(true);
    expect((await sql`select count(*)::int as count from financial_audit_log where actor_user_id=${owner} and action='payout_destination_saved'`)[0].count).toBe(1);
    const [tip]=await sql`select create_tip_transaction(${buyer},${owner},100,10,90,'USD','pin-wallet-funding','pin-test') as tip`;
    await sql`select process_payment_event('paystack','charge:pin-wallet-funding',${sql.json({tipId:tip.tip.id,status:'completed',payment_id:'pin-wallet-funding',paid_amount_minor:10000,tax_minor:0,currency:'USD'})},'pin-test')`;
    await expect(sql`select create_payout_request_atomic(${owner},60,'manual','pin-payout-denied','pin-test','USD')`).rejects.toThrow('PIN confirmation');
    const payouts=await Promise.all(Array.from({length:3},()=>sql`select create_payout_request_atomic(${owner},60,'manual','pin-payout-once','pin-test','USD',${current}) as id`));
    expect(new Set(payouts.map(rows=>rows[0].id)).size).toBe(1);
    expect(Number((await sql`select creator_balance(${owner},'USD') as balance`)[0].balance.available)).toBe(30);
    const next=current===hashA?hashB:hashA;
    await sql`select set_account_pin(${owner},${current},${next})`;
    await expect(sql`select save_payout_destination(${owner},'pin-bank-stale-proof',${sql.json(bank)},${current},'pin-test')`).rejects.toThrow('PIN confirmation');
    await expect(sql`select create_payout_request_atomic(${owner},20,'manual','pin-payout-stale-proof','pin-test','USD',${current})`).rejects.toThrow('PIN confirmation');
    expect(Number((await sql`select creator_balance(${owner},'USD') as balance`)[0].balance.available)).toBe(30);
    await sql`select cancel_payout_request(${owner},${payouts[0][0].id},'pin-test')`;
    expect(Number((await sql`select creator_balance(${owner},'USD') as balance`)[0].balance.available)).toBe(90);
    for(const role of ['anon','authenticated'])for(const routine of ['set_account_pin(uuid,text,text)','create_payout_request_atomic(uuid,numeric,text,text,text,text,text)','save_payout_destination(uuid,text,jsonb,text,text)'])expect((await sql`select has_function_privilege(${role},${routine},'EXECUTE') as allowed`)[0].allowed).toBe(false);
    expect((await sql`select has_function_privilege('service_role','create_payout_request_040(uuid,numeric,text,text,text,text)','EXECUTE') as allowed`)[0].allowed).toBe(false);
    }
    {
    const owner=crypto.randomUUID(),other=crypto.randomUUID(),hashA='$2b$12$'+'a'.repeat(53),hashB='$2b$12$'+'b'.repeat(53);
    await sql`select create_direct_account(${owner},'email-old@example.test','email_proof_fixture','Email fixture')`;
    await sql`select create_direct_account(${other},'email-taken@example.test','email_other_fixture','Other email fixture')`;
    await sql`update users set email_verified=true,pin_hash=${hashA} where id=${owner}`;
    await expect(sql`select issue_email_challenge(${owner},'email-new@example.test','verify',${'a'.repeat(64)},null)`).rejects.toThrow('PIN confirmation');
    await sql`select issue_email_challenge(${owner},'email-new@example.test','verify',${'a'.repeat(64)},${hashA})`;
    expect((await sql`select email,email_verified from users where id=${owner}`)[0]).toEqual({email:'email-old@example.test',email_verified:true});
    await sql`select issue_account_recovery('email-old@example.test',${'b'.repeat(64)})`;
    expect((await sql`select count(*)::int as count from auth_email_challenges where user_id=${owner}`)[0].count).toBe(2);
    expect((await sql`select consume_email_challenge(${'a'.repeat(64)},'recover') as proof`)[0].proof).toBeNull();
    const verified=await Promise.all(Array.from({length:3},()=>sql`select consume_email_challenge(${'a'.repeat(64)},'verify') as proof`));
    expect(verified.filter(rows=>rows[0].proof!==null)).toHaveLength(1);
    expect((await sql`select email,email_verified from users where id=${owner}`)[0]).toEqual({email:'email-new@example.test',email_verified:true});
    expect((await sql`select count(*)::int as count from security_events where user_id=${owner} and event_type='email_verified'`)[0].count).toBe(1);
    expect((await sql`select consume_email_challenge(${'b'.repeat(64)},'recover') as proof`)[0].proof).toBeNull();
    await sql`select issue_account_recovery('email-new@example.test',${'c'.repeat(64)})`;
    const recovered=await Promise.all(Array.from({length:3},()=>sql`select consume_email_challenge(${'c'.repeat(64)},'recover') as proof`));
    expect(recovered.filter(rows=>rows[0].proof!==null)).toHaveLength(1);
    expect((await sql`select mfa_version,pin_hash from users where id=${owner}`)[0]).toMatchObject({mfa_version:1,pin_hash:hashA});
    expect((await sql`select count(*)::int as count from security_events where user_id=${owner} and event_type='account_recovery'`)[0].count).toBe(1);
    const cutoff=Number((await sql`select auth_not_before from users where id=${owner}`)[0].auth_not_before);expect(cutoff).toBeGreaterThan(0);
    await sql.begin(async tx=>{
      await tx`select set_config('request.jwt.claim.sub',${owner},true),set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claims',${JSON.stringify({sub:owner,iat:cutoff-1})},true)`;
      await tx`set local role authenticated`;
      expect((await tx`select factor_session_authorized() as allowed`)[0].allowed).toBe(false);
      await tx`select set_config('request.jwt.claims',${JSON.stringify({sub:owner,iat:cutoff+1})},true)`;
      expect((await tx`select factor_session_authorized() as allowed`)[0].allowed).toBe(true);
    });

    await sql`select issue_email_challenge(${owner},'email-later@example.test','verify',${'d'.repeat(64)},${hashA})`;
    await sql`select set_account_pin(${owner},${hashA},${hashB})`;
    expect((await sql`select consume_email_challenge(${'d'.repeat(64)},'verify') as proof`)[0].proof).toBeNull();
    await sql`select issue_email_challenge(${owner},'email-later@example.test','verify',${'e'.repeat(64)},${hashB})`;
    await sql`update auth_email_challenges set expires_at=now()-interval '1 second' where user_id=${owner} and purpose='verify'`;
    expect((await sql`select consume_email_challenge(${'e'.repeat(64)},'verify') as proof`)[0].proof).toBeNull();
    await expect(sql`select issue_email_challenge(${owner},'email-taken@example.test','verify',${'f'.repeat(64)},${hashB})`).rejects.toThrow('Email unavailable');
    await sql`select issue_email_challenge(${owner},'email-later@example.test','verify',${'1'.repeat(64)},${hashB})`;
    await sql`select issue_email_challenge(${other},'email-later@example.test','verify',${'2'.repeat(64)},null)`;
    const competing=await Promise.allSettled(['1','2'].map(char=>sql`select consume_email_challenge(${char.repeat(64)},'verify')`));
    expect(competing.filter(result=>result.status==='fulfilled')).toHaveLength(1);
    expect((await sql`select count(*)::int as count from users where email='email-later@example.test'`)[0].count).toBe(1);
    await sql`update users set email='EMAIL-MIXED@example.test',email_verified=true where id=${other}`;
    expect((await sql`select issue_account_recovery('email-mixed@example.test',${'3'.repeat(64)}) as proof`)[0].proof.id).toBe(other);
    expect((await sql`select issue_account_recovery('missing@example.test',${'4'.repeat(64)}) as proof`)[0].proof).toBeNull();
    const setup='5'.repeat(64),session='6'.repeat(64),recoveries=Array.from({length:8},(_,i)=>'fixture-'+i);
    await sql`select begin_factor_challenge(${owner},${setup},'setup',${session},'v1:fixture')`;
    await sql`select claim_factor_challenge(${setup},'setup')`;
    await expect(sql`select finish_factor_challenge(${setup},'setup',1,1,null,${session},'v1:fixture',${recoveries})`).rejects.toThrow('PIN confirmation');
    await expect(sql`select finish_factor_challenge(${setup},'setup',1,1,null,${session},'v1:fixture',${recoveries},${hashA})`).rejects.toThrow('PIN confirmation');
    await sql`select finish_factor_challenge(${setup},'setup',1,1,null,${session},'v1:fixture',${recoveries},${hashB})`;
    expect((await sql`select totp_enabled from users where id=${owner}`)[0].totp_enabled).toBe(true);
    for(const role of ['anon','authenticated']){
      for(const table of ['email_verification_tokens','auth_email_challenges'])expect((await sql`select has_table_privilege(${role},${table},'SELECT') as allowed`)[0].allowed).toBe(false);
      for(const routine of ['issue_email_challenge(uuid,text,text,text,text)','issue_account_recovery(text,text)','consume_email_challenge(text,text)','finish_factor_challenge(text,text,integer,bigint,text,text,text,text[],text)'])expect((await sql`select has_function_privilege(${role},${routine},'EXECUTE') as allowed`)[0].allowed).toBe(false);
    }
    expect((await sql`select has_function_privilege('service_role','finish_factor_challenge_044(text,text,integer,bigint,text,text,text,text[])','EXECUTE') as allowed`)[0].allowed).toBe(false);
    }
    {
    const owner=crypto.randomUUID(),other=crypto.randomUUID(),hashA='a'.repeat(64),hashB='b'.repeat(64);
    await sql`select create_direct_account(${owner},'avatar-owner@example.test','avatar_owner_fixture','Avatar owner')`;
    await sql`select create_direct_account(${other},'avatar-other@example.test','avatar_other_fixture','Avatar other')`;
    await sql`update users set avatar_url='https://cdn.test/original.jpg' where id=${owner}`;
    const staged=await Promise.all(Array.from({length:3},()=>sql`select begin_avatar_upload(${owner},${hashA},'s3','avatars') as upload`));
    expect(new Set(staged.map(rows=>rows[0].upload.id)).size).toBe(1);const first=staged[0][0].upload;
    expect(first.path).toBe('avatars/'+owner+'/'+first.id+'.webp');
    await expect(sql`select update_profile_atomic(${owner},${sql.json({avatar_upload_id:first.id})})`).rejects.toThrow('Avatar expired');
    await expect(sql`select finish_avatar_upload(${other},${first.id},${'https://cdn.test/'+first.path})`).rejects.toThrow('Upload expired');
    await sql`select finish_avatar_upload(${owner},${first.id},${'https://cdn.test/'+first.path})`;
    await expect(sql`select update_profile_atomic(${owner},${sql.json({display_name:'',avatar_upload_id:first.id})})`).rejects.toThrow('Invalid profile');
    expect((await sql`select avatar_url from users where id=${owner}`)[0].avatar_url).toBe('https://cdn.test/original.jpg');
    expect((await sql`select state from profile_avatar_uploads where id=${first.id}`)[0].state).toBe('uploaded');
    const changes={display_name:'Committed avatar',avatar_upload_id:first.id};
    for(let replay=0;replay<2;replay++)expect((await sql`select update_profile_atomic(${owner},${sql.json(changes)}) as profile`)[0].profile.avatar_url).toBe('https://cdn.test/'+first.path);
    expect((await sql`select count(*)::int as count from security_events where user_id=${owner} and event_type='avatar_changed'`)[0].count).toBe(1);
    await expect(sql`select update_profile_atomic(${other},${sql.json({avatar_upload_id:first.id})})`).rejects.toThrow('Avatar expired');
    await expect(sql`select update_profile_atomic(${other},${sql.json({avatar_url:'https://cdn.test/'+first.path})})`).rejects.toThrow('owned avatar');
    expect((await sql`select begin_avatar_upload(${owner},${hashA},'s3','avatars') as upload`)[0].upload.id).toBe(first.id);
    const second=(await sql`select begin_avatar_upload(${owner},${hashB},'s3','avatars') as upload`)[0].upload;
    await sql`select finish_avatar_upload(${owner},${second.id},${'https://cdn.test/'+second.path})`;
    await sql`select update_profile_atomic(${owner},${sql.json({avatar_upload_id:second.id})})`;
    expect((await sql`select state from profile_avatar_uploads where id=${first.id}`)[0].state).toBe('abandoned');
    await sql`update profile_avatar_uploads set expires_at=now()-interval '1 day' where id=${second.id}`;
    const claimed=(await Promise.all([sql`select * from claim_avatar_cleanup('s3',5)`,sql`select * from claim_avatar_cleanup('s3',5)`])).flat();
    expect(claimed.map(row=>row.id)).toEqual([first.id]);
    await expect(sql`select update_profile_atomic(${owner},${sql.json({avatar_upload_id:first.id})})`).rejects.toThrow('Avatar expired');
    expect((await sql`select finish_avatar_cleanup(${first.id},${crypto.randomUUID()},true) as finished`)[0].finished).toBe(false);
    expect((await sql`select finish_avatar_cleanup(${first.id},${claimed[0].claim_token},true) as finished`)[0].finished).toBe(true);
    expect((await sql`select finish_avatar_cleanup(${first.id},${claimed[0].claim_token},true) as finished`)[0].finished).toBe(true);
    expect((await sql`select count(*)::int as count from profile_avatar_uploads where id=${first.id}`)[0].count).toBe(0);
    const retry=(await sql`select begin_avatar_upload(${owner},${hashA},'s3','avatars') as upload`)[0].upload;expect(retry.path).not.toBe(first.path);
    await sql`update profile_avatar_uploads set expires_at=now()-interval '1 day' where id=${retry.id}`;
    const failed=(await sql`select * from claim_avatar_cleanup('s3',5)`)[0];expect(failed.id).toBe(retry.id);
    await sql`select finish_avatar_cleanup(${retry.id},${failed.claim_token},false)`;
    expect(await sql`select * from claim_avatar_cleanup('s3',5)`).toHaveLength(0);
    await sql`update profile_avatar_uploads set expires_at=now()-interval '1 day' where id=${retry.id}`;
    const reclaimed=(await sql`select * from claim_avatar_cleanup('s3',5)`)[0];expect(reclaimed.claim_token).not.toBe(failed.claim_token);
    expect((await sql`select finish_avatar_cleanup(${retry.id},${failed.claim_token},true) as finished`)[0].finished).toBe(false);
    await sql`select finish_avatar_cleanup(${retry.id},${reclaimed.claim_token},true)`;
    expect((await sql`select avatar_url from users where id=${owner}`)[0].avatar_url).toBe('https://cdn.test/'+second.path);
    await sql`delete from auth.users where id=${owner}`;
    expect((await sql`select user_id from profile_avatar_uploads where id=${second.id}`)[0].user_id).toBeNull();
    const orphan=(await sql`select * from claim_avatar_cleanup('s3',5)`)[0];expect(orphan.id).toBe(second.id);
    await sql`select finish_avatar_cleanup(${orphan.id},${orphan.claim_token},true)`;
    for(const role of ['anon','authenticated']){
      expect((await sql`select has_table_privilege(${role},'profile_avatar_uploads','SELECT') as allowed`)[0].allowed).toBe(false);
      for(const routine of ['begin_avatar_upload(uuid,text,text,text)','finish_avatar_upload(uuid,uuid,text)','claim_avatar_cleanup(text,integer)','finish_avatar_cleanup(uuid,uuid,boolean)'])expect((await sql`select has_function_privilege(${role},${routine},'EXECUTE') as allowed`)[0].allowed).toBe(false);
    }
    expect((await sql`select has_function_privilege('service_role','update_profile_055(uuid,jsonb,text)','EXECUTE') as allowed`)[0].allowed).toBe(false);
    for(const role of ['anon','authenticated'])await sql.begin(async tx=>{
      await tx.unsafe('set local role '+role);
      expect((await tx`select count(*)::int as count from storage.objects where bucket_id='avatars'`)[0].count).toBe(1);
      await expect(tx.savepoint(async save=>{await save`insert into storage.objects(bucket_id) values('avatars')`;})).rejects.toThrow('row-level security');
      expect(await tx`update storage.objects set bucket_id='other' where bucket_id='avatars' returning id`).toHaveLength(0);
      expect(await tx`delete from storage.objects where bucket_id='avatars' returning id`).toHaveLength(0);
      const [other]=await tx`insert into storage.objects(bucket_id) values('other') returning id`;
      await expect(tx.savepoint(async save=>{await save`update storage.objects set bucket_id='avatars' where id=${other.id}`;})).rejects.toThrow('row-level security');
      expect(await tx`delete from storage.objects where id=${other.id} returning id`).toHaveLength(1);
    });

    }
    {
    const owner=crypto.randomUUID(),collision=crypto.randomUUID(),hash='$2b$12$'+'a'.repeat(53);
    await sql`select create_direct_account(${owner},'MiXeD.Auth@example.test','auth_identity_fixture','Native account',${hash})`;
    expect((await sql`select find_direct_account(' mixed.AUTH@example.test ') as profile`)[0].profile.id).toBe(owner);
    expect((await sql`select find_direct_account('missing.auth@example.test') as profile`)[0].profile).toBeNull();
    await sql`select create_direct_account(${collision},'mixed.auth@example.test','auth_collision_fixture','Ambiguous account')`;
    await expect(sql`select find_direct_account('mixed.auth@example.test')`).rejects.toThrow('Ambiguous email');
    await sql`delete from auth.users where id=${collision}`;
    await expect(sql`select resolve_direct_social_identity('google','google-unverified','mixed.auth@example.test','Google name',null)`).rejects.toThrow('existing sign-in method');
    expect((await sql`select google_id from users where id=${owner}`)[0].google_id).toBeNull();
    await sql`update users set email_verified=true,totp_enabled=true,mfa_version=7,pin_hash=${hash} where id=${owner}`;
    const links=await Promise.allSettled(['google-race-a','google-race-b'].map(subject=>sql`select resolve_direct_social_identity('google',${subject},'mixed.auth@example.test','Google name',null) as profile`));
    expect(links.filter(result=>result.status==='fulfilled')).toHaveLength(1);
    const linked=(await sql`select google_id,email,pin_hash,mfa_version,totp_enabled from users where id=${owner}`)[0];
    expect(linked).toMatchObject({email:'MiXeD.Auth@example.test',pin_hash:hash,mfa_version:7,totp_enabled:true});
    await sql`update users set email='recovery.auth@example.test' where id=${owner}`;
    const stable=(await sql`select resolve_direct_social_identity('google',${linked.google_id},'mixed.auth@example.test','New name',null) as profile`)[0].profile;
    expect(stable).toMatchObject({id:owner,email:'recovery.auth@example.test',mfa_version:7,totp_enabled:true});
    expect((await sql`select count(*)::int as count from auth_factor_grants where user_id=${owner}`)[0].count).toBe(0);
    const google=await Promise.all(Array.from({length:3},()=>sql`select resolve_direct_social_identity('google','google-canonical-new','created.auth@example.test',${'Long name '.repeat(20)},null) as profile`));
    expect(new Set(google.map(rows=>rows[0].profile.id)).size).toBe(1);const created=google[0][0].profile;
    expect(created.email_verified).toBe(true);expect(created.username).toMatch(/^[a-z0-9_]{3,30}$/);expect(created.display_name.length).toBeLessThanOrEqual(50);expect(created.is_admin).toBe(false);
    const telegram=await Promise.all(Array.from({length:3},()=>sql`select resolve_direct_social_identity('telegram','599900000001',null,'Telegram fixture',null) as profile`));
    expect(new Set(telegram.map(rows=>rows[0].profile.id)).size).toBe(1);const social=telegram[0][0].profile;
    expect(social).toMatchObject({email:null,email_verified:false,telegram_id:'599900000001',is_admin:false});expect(social.username).toMatch(/^[a-z0-9_]{3,30}$/);
    await sql`update users set is_banned=true where id=${social.id}`;
    await expect(sql`select resolve_direct_social_identity('telegram','599900000001',null,'Telegram fixture',null)`).rejects.toThrow('Account unavailable');
    await sql`update users set deleted_at=now() where id=${owner}`;
    await expect(sql`select resolve_direct_social_identity('google',${linked.google_id},'mixed.auth@example.test','Name',null)`).rejects.toThrow('Account unavailable');
    await expect(sql`select resolve_direct_social_identity('telegram','599900000002','forged@example.test','Name',null)`).rejects.toThrow('Invalid provider identity');
    await expect(sql`select resolve_direct_social_identity('google','google-unsafe-avatar','safe.auth@example.test','Name','javascript:alert(1)')`).rejects.toThrow('Invalid provider identity');
    for(const role of ['anon','authenticated'])for(const routine of ['find_direct_account(text)','resolve_direct_social_identity(text,text,text,text,text)'])expect((await sql`select has_function_privilege(${role},${routine},'EXECUTE') as allowed`)[0].allowed).toBe(false);
    }
    {
    const actor=crypto.randomUUID(),reviewer=crypto.randomUUID(),other=crypto.randomUUID(),generic=crypto.randomUUID();
    const legacy=await sql`select c.reviewer_id from review_conversions c join users u on u.id=c.actor_id where u.username='legacy_conversion_owner'`;
    expect(legacy).toHaveLength(2);expect(legacy.every(row=>row.reviewer_id===null)).toBe(true);
    for(const [index,id] of [actor,reviewer,other,generic].entries())await sql`select create_direct_account(${id},${'conversion'+index+'@example.test'},${'conversion_fixture_'+index},'Conversion fixture')`;
    await sql`update users set is_creator=true where id in (${reviewer},${other})`;
    const books=await sql`insert into books(title,author_name) values('Conversion book','Fixture'),('Generic conversion','Fixture'),('Rollback conversion','Fixture') returning id`;
    const book=books[0].id,plain=books[1].id,rollback=books[2].id;
    const reviews=await sql`insert into reviews(user_id,book_id,rating,content) values(${reviewer},${book},4,'First review'),(${other},${book},5,'Second review'),(${reviewer},${plain},4,'Generic review'),(${reviewer},${rollback},4,'Rollback review') returning id`;
    const add=()=>sql`select apply_book_interaction(${actor},${book},'reaction','conversion-race',${reviews[0].id},true) as result`;
    expect((await Promise.all(Array.from({length:4},add))).every(rows=>rows[0].result.reacted)).toBe(true);
    expect((await sql`select count(*)::int as count from review_conversions where actor_id=${actor} and book_id=${book} and reviewer_id=${reviewer}`)[0].count).toBe(1);
    expect((await sql`select want_to_read_count from reviews where id=${reviews[0].id}`)[0].want_to_read_count).toBe(1);
    expect((await sql`select count(*)::int as count from outbox_events where aggregate_type='review_conversions' and event_type='check_badges' and aggregate_id=${actor+':'+book}`)[0].count).toBe(1);
    expect((await sql`select amount from xp_ledger where user_id=${actor} and event_key=${'want-to-read:'+book}`)[0].amount).toBe(5);
    await expect(sql`select apply_book_interaction(${actor},${book},'reaction','conversion-race',${reviews[1].id},true)`).rejects.toThrow('Conflicting');
    await sql`select apply_book_interaction(${actor},${book},'reaction','conversion-remove',null,false)`;
    await sql`select apply_book_interaction(${actor},${book},'reaction','conversion-other-review',${reviews[1].id},true)`;
    expect((await sql`select reviewer_id from review_conversions where actor_id=${actor} and book_id=${book}`)[0].reviewer_id).toBe(reviewer);
    expect((await sql`select want_to_read_count from reviews where id=${reviews[1].id}`)[0].want_to_read_count).toBe(0);
    const shelf=(await sql`select id from shelves where user_id=${generic} and default_type='want_to_read'`)[0].id;
    await sql`select set_shelf_membership(${generic},${shelf},${plain},true)`;await sql`select set_shelf_membership(${generic},${shelf},${plain},false)`;
    await sql`select apply_book_interaction(${generic},${plain},'reaction','conversion-generic',${reviews[2].id},true)`;
    expect((await sql`select reviewer_id from review_conversions where actor_id=${generic} and book_id=${plain}`)[0].reviewer_id).toBeNull();
    await expect(sql`select apply_book_interaction(${generic},${plain},'reaction','conversion-wrong-book',${reviews[0].id},true)`).rejects.toThrow('Review unavailable');
    await expect(sql`select apply_book_interaction(${reviewer},${book},'reaction','conversion-self',${reviews[0].id},true)`).rejects.toThrow('Review unavailable');
    await sql`update reviews set is_hidden=true where id=${reviews[1].id}`;
    await expect(sql`select apply_book_interaction(${generic},${book},'reaction','conversion-hidden',${reviews[1].id},true)`).rejects.toThrow('Review unavailable');
    await sql`insert into xp_ledger(user_id,event_key,amount,reason) values(${generic},${'want-to-read:'+rollback},7,'conflicting-fixture')`;
    await expect(sql`select apply_book_interaction(${generic},${rollback},'reaction','conversion-rollback',${reviews[3].id},true)`).rejects.toThrow('Conflicting reward');
    expect((await sql`select count(*)::int as count from review_conversions where actor_id=${generic} and book_id=${rollback}`)[0].count).toBe(0);
    expect((await sql`select count(*)::int as count from shelf_books where user_id=${generic} and book_id=${rollback}`)[0].count).toBe(0);
    const {checkAndAwardBadges}=await import('@/services/badges');
    expect(await checkAndAwardBadges(reviewer,'want_to_read_triggered')).toEqual(['spark']);
    expect(await checkAndAwardBadges(reviewer,'want_to_read_triggered')).toEqual([]);
    await sql`insert into tips(user_id,recipient_id,amount,platform_fee,recipient_amount,currency,status,refunded_recipient_amount) values(${actor},${reviewer},3,0.5,2.5,'USD','completed',0.5),(${generic},${reviewer},4,0.75,3.25,'USD','completed',0),(${generic},${reviewer},1000,100,900,'NGN','completed',0)`;
    const stats=(await sql`select read_creator_analytics(${reviewer}) as stats`)[0].stats;
    expect(stats).toMatchObject({want_to_read_triggered:1,tips_received:5.25,tips_received_by_currency:{USD:5.25,NGN:900,EUR:0}});
    let board=(await sql`select read_creator_leaderboard() as board`)[0].board;
    expect(board.leaderboard.find((entry:{user_id:string})=>entry.user_id===reviewer)).toMatchObject({want_to_read_score:1,total_score:1});
    expect(new Date(board.week_start).getUTCDay()).toBe(1);
    await sql`update review_conversions set created_at=now()-interval '8 days' where reviewer_id=${reviewer}`;
    board=(await sql`select read_creator_leaderboard() as board`)[0].board;expect(board.leaderboard.some((entry:{user_id:string})=>entry.user_id===reviewer)).toBe(false);
    expect((await sql`select read_creator_analytics(${reviewer}) as stats`)[0].stats.want_to_read_triggered).toBe(1);
    await sql`update review_conversions set created_at=now() where reviewer_id=${reviewer}`;await sql`update users set profile_visibility='followers_only' where id=${reviewer}`;
    board=(await sql`select read_creator_leaderboard() as board`)[0].board;expect(board.leaderboard.some((entry:{user_id:string})=>entry.user_id===reviewer)).toBe(false);
    for(const role of ['anon','authenticated']){
      expect((await sql`select has_table_privilege(${role},'review_conversions','INSERT') as allowed`)[0].allowed).toBe(false);
      for(const routine of ['read_creator_analytics(uuid)','read_creator_leaderboard()'])expect((await sql`select has_function_privilege(${role},${routine},'EXECUTE') as allowed`)[0].allowed).toBe(false);
    }
    }
    {
    const reader=crypto.randomUUID(),publisher=crypto.randomUUID(),outsider=crypto.randomUUID();
    for(const [index,id] of [reader,publisher,outsider].entries())await sql`select create_direct_account(${id},${'feed'+index+'@example.test'},${'feed_fixture_'+index},'Feed fixture')`;
    await sql`insert into follows(follower_id,following_id) values(${reader},${publisher})`;
    const books=await sql`insert into books(title,author_name) select 'Feed fixture '||i,'Fixture' from generate_series(1,24) i returning id`;
    const shelf=(await sql`select id from shelves where user_id=${publisher} and default_type='want_to_read'`)[0].id;
    for(const [index,book] of books.entries()){
      await sql`insert into shelf_books(shelf_id,book_id,user_id,added_at) values(${shelf},${book.id},${publisher},'2026-10-28T00:00:00.123000Z'::timestamptz+${index+1}*interval '1 microsecond')`;
      await sql`insert into reviews(user_id,book_id,rating,content,created_at) values(${publisher},${book.id},4,'Visible feed review','2026-10-28T00:00:00.123012Z')`;
    }
    await sql`insert into reviews(user_id,book_id,rating,content,is_hidden) values(${publisher},${books[0].id},4,'Hidden feed review',true),(${outsider},${books[0].id},4,'Unfollowed review',false)`;
    const privateShelf=(await sql`insert into shelves(user_id,name,slug,is_public) values(${publisher},'Private fixture','private-fixture',false) returning id`)[0].id;
    await sql`insert into shelf_books(shelf_id,book_id,user_id) values(${privateShelf},${books[0].id},${publisher})`;
    const ownShelf=(await sql`select id from shelves where user_id=${reader} and default_type='want_to_read'`)[0].id;
    await sql`select set_shelf_membership(${reader},${ownShelf},${books[0].id},true)`;
    const {getSocialFeed}=await import('@/lib/social-feed');let cursor:string|null=null;const ids:string[]=[];
    do{
      const page=await getSocialFeed(reader,cursor);expect(page.items.length).toBeLessThanOrEqual(20);
      for(const item of page.items){expect(item.userId).toBe(publisher);expect(item.user.id).toBe(publisher);expect(item.wantToRead).toBe(item.book.id===books[0].id);if(item.type==='shelf_book')expect(item.shelf.name).not.toBe('Private fixture');else expect(item.excerpt).toBe('Visible feed review');ids.push(item.id);}
      if(page.nextCursor)expect(JSON.parse(Buffer.from(page.nextCursor,'base64url').toString()).at).toContain('.123');
      cursor=page.nextCursor;
    }while(cursor);
    expect(ids).toHaveLength(48);expect(new Set(ids).size).toBe(48);
    const raw=async()=>((await sql`select read_social_feed(${reader},null,null,null,50) as items`)[0].items as {type:string}[]);
    await sql`update users set shelf_visibility='private' where id=${publisher}`;
    expect((await raw()).every(item=>item.type==='review')).toBe(true);expect(await raw()).toHaveLength(24);
    await sql`update users set is_banned=true where id=${publisher}`;expect(await raw()).toEqual([]);
    await sql`update users set is_banned=false,deleted_at=now() where id=${publisher}`;expect(await raw()).toEqual([]);
    await sql`update users set deleted_at=null where id=${publisher}`;await sql`delete from follows where follower_id=${reader} and following_id=${publisher}`;expect(await raw()).toEqual([]);
    await expect(sql`select read_social_feed(${reader},now(),${books[0].id},null,20)`).rejects.toThrow('Invalid feed cursor');
    for(const role of ['anon','authenticated'])expect((await sql`select has_function_privilege(${role},'read_social_feed(uuid,timestamptz,uuid,text,integer)','EXECUTE') as allowed`)[0].allowed).toBe(false);
    }
    {
    const actor=crypto.randomUUID();await sql`select create_direct_account(${actor},'click@example.test','click_fixture','Click fixture')`;
    const book=(await sql`insert into books(title,author_name) values('Click fixture','Fixture') returning id`)[0].id;
    const store=(await sql`insert into affiliate_stores(name,countries,url_template,priority,is_non_affiliate) values('Click fixture',array['NG'],'https://store.example.test/?isbn={isbn}',1,false) returning id,to_jsonb(affiliate_stores)->>'updated_at' as version`)[0];
    const linkId=store.id+':'+'a'.repeat(64),link={linkId,name:'Click fixture',storeId:store.id,storeVersion:store.version,country:'NG',isAffiliate:true,isPrimary:true};
    const click=()=>sql`select record_book_link_click(${actor},${book},${linkId},'fixture-click-intent',${sql.json(link)}) as receipt`;
    const receipts=await Promise.all(Array.from({length:4},click));expect(new Set(receipts.map(rows=>rows[0].receipt.clickId)).size).toBe(1);
    const rows=await sql`select user_id_hash,link_type,is_affiliate,store_name,country,store_id from affiliate_link_clicks where book_id=${book}`;
    expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({link_type:'primary',is_affiliate:true,store_name:'Click fixture',country:'NG',store_id:store.id});expect(rows[0].user_id_hash).toMatch(/^[a-f0-9]{64}$/);expect(rows[0].user_id_hash).not.toBe(actor);
    await expect(sql`select record_book_link_click(${actor},${book},${linkId},'fixture-forged-flag',${sql.json({...link,isAffiliate:false})})`).rejects.toThrow('Book link changed');
    await expect(sql`select record_book_link_click(${actor},${book},${linkId},'fixture-foreign-region',${sql.json({...link,country:'US'})})`).rejects.toThrow('Book link unavailable');
    await sql`update affiliate_stores set name='Changed click store' where id=${store.id}`;
    await expect(sql`select record_book_link_click(${actor},${book},${linkId},'fixture-stale-click',${sql.json(link)})`).rejects.toThrow('Book link changed');
    await sql`update affiliate_stores set is_active=false where id=${store.id}`;
    expect((await sql`select record_book_link_click(${actor},${book},${linkId},'fixture-click-intent',null) as receipt`)[0].receipt).toEqual(receipts[0][0].receipt);
    await expect(sql`select record_book_link_click(${actor},${book},${linkId},'fixture-disabled-click',${sql.json(link)})`).rejects.toThrow('Book link unavailable');
    await expect(sql`select record_book_link_click(${actor},${book},${'worldcat:'+ 'b'.repeat(64)},'fixture-click-intent',null)`).rejects.toThrow('Conflicting click intent');
    expect((await sql`select count(*)::int as count from affiliate_link_clicks where book_id=${book}`)[0].count).toBe(1);
    for(const role of ['anon','authenticated']){
      expect((await sql`select has_table_privilege(${role},'affiliate_link_clicks','INSERT') as allowed`)[0].allowed).toBe(false);
      expect((await sql`select has_function_privilege(${role},'record_book_link_click(uuid,uuid,text,text,jsonb)','EXECUTE') as allowed`)[0].allowed).toBe(false);
    }
    }
    {
    const actor=crypto.randomUUID(),reviewer=crypto.randomUUID();
    for(const [index,id] of [actor,reviewer].entries())await sql`select create_direct_account(${id},${'reward'+index+'@example.test'},${'reward_fixture_'+index},'Reward fixture')`;
    const books=await sql`insert into books(title,author_name) values('Live completion','Fixture'),('Imported completion','Fixture'),('Reward conversion','Fixture') returning id`;
    const shelf=(await sql`select id from shelves where user_id=${actor} and default_type='have_read'`)[0].id;
    const finish=()=>sql`select apply_shelf_membership_intent(${actor},${shelf},${books[0].id},true,'reward-completion-race') as receipt`;
    const completed=await Promise.all(Array.from({length:4},finish));expect(completed.every(rows=>rows[0].receipt.xp_awarded===50)).toBe(true);
    expect((await sql`select xp from users where id=${actor}`)[0].xp).toBe(50);
    expect((await sql`select count(*)::int as count from xp_ledger where user_id=${actor} and event_key=${'finish_book:'+books[0].id}`)[0].count).toBe(1);
    expect((await sql`select count(*)::int as count from outbox_events where aggregate_type='reading_completions' and aggregate_id=${actor+':'+books[0].id}`)[0].count).toBe(2);
    await expect(sql`select apply_shelf_membership_intent(${actor},${shelf},${books[1].id},true,'reward-completion-race')`).rejects.toThrow('Conflicting shelf intent');
    await sql`select apply_shelf_membership_intent(${actor},${shelf},${books[0].id},false,'reward-completion-remove')`;
    expect((await sql`select apply_shelf_membership_intent(${actor},${shelf},${books[0].id},true,'reward-completion-readd') as receipt`)[0].receipt.xp_awarded).toBe(0);
    expect((await sql`select claim_reading_reward(${actor},'finish_book',${books[0].id}) as reward`)[0].reward.awarded).toBe(0);
    await sql`insert into shelf_books(user_id,shelf_id,book_id,finished_at) values(${actor},${shelf},${books[1].id},current_date)`;
    expect((await sql`select claim_reading_reward(${actor},'finish_book',${books[1].id}) as reward`)[0].reward.awarded).toBe(0);
    await sql`select set_shelf_membership(${actor},${shelf},${books[1].id},false)`;
    expect((await sql`select set_shelf_membership(${actor},${shelf},${books[1].id},true) as receipt`)[0].receipt.xp_awarded).toBe(0);
    await sql`update shelf_books set finished_at=null where user_id=${actor} and shelf_id=${shelf} and book_id=${books[1].id}`;
    expect((await sql`select set_shelf_membership(${actor},${shelf},${books[1].id},true) as receipt`)[0].receipt.xp_awarded).toBe(0);
    expect((await sql`select books_read_count from users where id=${actor}`)[0].books_read_count).toBe(2);
    const legacy=(await sql`select u.id,sb.book_id,sb.shelf_id from users u join shelf_books sb on sb.user_id=u.id where u.username='legacy_completion_owner'`)[0];
    expect((await sql`select set_shelf_membership(${legacy.id},${legacy.shelf_id},${legacy.book_id},true) as receipt`)[0].receipt.xp_awarded).toBe(0);
    const daily=await Promise.all(Array.from({length:3},()=>sql`select claim_reading_reward(${actor},'daily_login',null) as reward`));expect(daily.reduce((sum,rows)=>sum+rows[0].reward.awarded,0)).toBe(3);
    await expect(sql`select claim_reading_reward(${actor},'add_book',${books[0].id})`).rejects.toThrow('Invalid reading reward');
    const review=(await sql`insert into reviews(user_id,book_id,rating,content) values(${reviewer},${books[2].id},4,'Reward review') returning id`)[0].id;
    await sql`select apply_book_interaction(${actor},${books[2].id},'reaction','reward-conversion',${review},true)`;
    const events=await sql`select id from outbox_events where aggregate_type='review_conversions' and event_type='award_xp' and aggregate_id=${actor+':'+books[2].id}`;expect(events).toHaveLength(1);
    await sql`update outbox_events set status='processing' where id=${events[0].id}`;
    await Promise.all(Array.from({length:4},()=>sql`select process_outbox_event_atomic(${events[0].id})`));
    expect((await sql`select xp from users where id=${reviewer}`)[0].xp).toBe(5);
    expect((await sql`select count(*)::int as count from xp_ledger where user_id=${reviewer} and reason='want_to_read_received'`)[0].count).toBe(1);
    await sql`select apply_book_interaction(${actor},${books[2].id},'reaction','reward-conversion-remove',null,false)`;await sql`select apply_book_interaction(${actor},${books[2].id},'reaction','reward-conversion-readd',${review},true)`;
    expect((await sql`select count(*)::int as count from outbox_events where aggregate_type='review_conversions' and event_type='award_xp' and aggregate_id=${actor+':'+books[2].id}`)[0].count).toBe(1);
    for(const role of ['anon','authenticated'])for(const routine of ['claim_reading_reward(uuid,text,uuid)','set_shelf_membership_045(uuid,uuid,uuid,boolean)','apply_shelf_membership_intent(uuid,uuid,uuid,boolean,text)'])expect((await sql`select has_function_privilege(${role},${routine},'EXECUTE') as allowed`)[0].allowed).toBe(false);
    expect((await sql`select has_function_privilege('service_role','set_shelf_membership_045(uuid,uuid,uuid,boolean)','EXECUTE') as allowed`)[0].allowed).toBe(false);
    }
    {
    const actor=crypto.randomUUID(),other=crypto.randomUUID();
    for(const [index,id] of [actor,other].entries())await sql`select create_direct_account(${id},${'streak-proof'+index+'@example.test'},${'streak_proof_'+index},'Streak proof')`;
    const book=(await sql`insert into books(title,author_name) values('Streak proof','Fixture') returning id`)[0].id;
    const {createHash}=await import('node:crypto'),payload={book_id:book,pages_read:10,ended_at:null,notes:null},hash=createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const sessions=new Map<number,string>();
    const add=async(day:number)=>{const id=crypto.randomUUID();sessions.set(day,id);await sql`insert into reading_sessions(id,user_id,book_id,pages_read,idempotency_key,request_hash,created_at) values(${id},${actor},${book},10,${'streak-proof-day-'+day},${hash},((now() at time zone 'UTC')::date-40+${day}::integer)::timestamptz)`;};
    for(const day of [0,1,2,3,4,5,7])await add(day);
    expect((await sql`select reading_streak from users where id=${actor}`)[0].reading_streak).toBe(1);
    await add(6);expect((await sql`select reading_streak,streak_freeze_tokens,xp from users where id=${actor}`)[0]).toEqual({reading_streak:8,streak_freeze_tokens:1,xp:90});
    await add(9);expect((await sql`select reading_streak,streak_freeze_tokens from users where id=${actor}`)[0]).toEqual({reading_streak:9,streak_freeze_tokens:0});
    await add(8);expect((await sql`select reading_streak,streak_freeze_tokens,xp,last_streak_date::text as last_day from users where id=${actor}`)[0]).toEqual({reading_streak:10,streak_freeze_tokens:1,xp:100,last_day:(await sql`select ((now() at time zone 'UTC')::date-31)::text as day`)[0].day});
    const {POST:logSession}=await import('@/app/api/reading-sessions/route');vi.mocked(getCurrentUser).mockResolvedValue({id:actor,email:'streak-proof0@example.test'});
    const replay=await logSession(new Request('https://app.test/api/reading-sessions',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'streak-proof-day-0'},body:JSON.stringify({book_id:book,pages_read:10})}));
    expect(replay.status).toBe(201);expect((await replay.json()).session.id).toBe(sessions.get(0));expect((await sql`select reading_streak,xp from users where id=${actor}`)[0]).toEqual({reading_streak:10,xp:100});
    await expect(sql`insert into reading_sessions(user_id,book_id,pages_read,idempotency_key,request_hash) values(${actor},${book},10,'streak-proof-day-0',${hash})`).rejects.toThrow('already committed');
    expect((await sql`select count(*)::int as count from reading_activity_days where user_id=${actor}`)[0].count).toBe(10);
    expect((await sql`select reading_streak,xp from users where id=${actor}`)[0]).toEqual({reading_streak:10,xp:100});
    const event=(await sql`insert into outbox_events(aggregate_type,aggregate_id,event_type,status,payload) values('reading_sessions',${sessions.get(0)!},'award_xp','processing',${sql.json({userId:other,amount:9999,readingStreak:true,eventKey:'forged-fixture-key'})}) returning id`)[0].id;
    const results=await Promise.all(Array.from({length:3},()=>sql`select process_outbox_event_atomic(${event}) as processed`));expect(results.filter(rows=>rows[0].processed)).toHaveLength(1);
    expect((await sql`select reading_streak,xp from users where id=${actor}`)[0]).toEqual({reading_streak:10,xp:100});expect((await sql`select xp from users where id=${other}`)[0].xp).toBe(0);
    const fakeKey='streak:reading:'+(await sql`select (now() at time zone 'UTC')::date::text as day`)[0].day;
    await sql`select award_xp_once(${actor},200,'reading_streak_30',${fakeKey})`;await sql`update users set reading_streak=99,last_streak_date=(now() at time zone 'UTC')::date,max_reading_streak=99 where id=${actor}`;
    await sql`select rebuild_reading_streak(${actor})`;expect((await sql`select reading_streak,max_reading_streak,streak_freeze_tokens,xp from users where id=${actor}`)[0]).toEqual({reading_streak:10,max_reading_streak:10,streak_freeze_tokens:1,xp:100});
    expect((await sql`select count(*)::int as count from xp_ledger where user_id=${actor} and event_key=${fakeKey}`)[0].count).toBe(0);
    const audits=(await sql`select count(*)::int as count from financial_audit_log where actor_user_id=${actor} and action='reading_streak_reconciled'`)[0].count;
    await sql`select rebuild_reading_streak(${actor})`;expect((await sql`select count(*)::int as count from financial_audit_log where actor_user_id=${actor} and action='reading_streak_reconciled'`)[0].count).toBe(audits);
    const denied=await logSession(new Request('https://app.test/api/reading-sessions',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'streak-proof-switched','X-Liravo-Actor':other},body:JSON.stringify({book_id:book,pages_read:10})}));expect(denied.status).toBe(409);
    const today=await logSession(new Request('https://app.test/api/reading-sessions',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'streak-proof-today'},body:JSON.stringify({book_id:book,pages_read:10})}));expect(today.status).toBe(201);
    expect((await sql`select reading_streak,max_reading_streak,xp from users where id=${actor}`)[0]).toEqual({reading_streak:1,max_reading_streak:10,xp:105});
    const {checkAndAwardBadges}=await import('@/services/badges');expect(await checkAndAwardBadges(actor,'streak')).toEqual(['streak_7']);expect(await checkAndAwardBadges(actor,'streak')).toEqual([]);
    expect((await sql`select xp from users where id=${actor}`)[0].xp).toBe(155);
    await sql`delete from books where id=${book}`;await sql`select rebuild_reading_streak(${actor})`;
    expect((await sql`select reading_streak,max_reading_streak,xp from users where id=${actor}`)[0]).toEqual({reading_streak:1,max_reading_streak:10,xp:155});
    expect((await sql`select count(*)::int as count from reading_activity_days where user_id=${actor}`)[0].count).toBe(11);
    for(const role of ['anon','authenticated']){
      expect((await sql`select has_table_privilege(${role},'reading_sessions','INSERT') as allowed`)[0].allowed).toBe(false);
      for(const routine of ['rebuild_reading_streak(uuid)','process_outbox_event_atomic_042(uuid)'])expect((await sql`select has_function_privilege(${role},${routine},'EXECUTE') as allowed`)[0].allowed).toBe(false);
    }
    }
    {
    const payload={title:'Edition integrity',author_name:'An author',open_library_work_id:'/works/OL990001W',work_title:'Edition integrity work'};
    const store=async(data:Record<string,unknown>)=>(await sql`select store_catalog_book(${sql.json({...payload,...data})}) as book`)[0].book;
    const saved=await Promise.all(Array.from({length:4},()=>store({open_library_id:'/books/OL990001M',google_books_id:'edition-integrity-a',isbn_13:'9780306406157',isbn_10:'0306406152',language:'en',page_count:200,format:'hardcover'})));
    expect(new Set(saved.map(book=>book.id)).size).toBe(1);const first=saved[0];
    const second=await store({title:'Une autre édition',open_library_id:'/books/OL990002M',google_books_id:'edition-integrity-b',isbn_13:'9780141439518',language:'fr',page_count:320,format:'paperback'});
    expect(first.id).not.toBe(second.id);expect(first.work_id).toBe(second.work_id);
    const alias=await store({google_books_id:'edition-integrity-alias',isbn_13:'9780306406157'});expect(alias.id).toBe(first.id);
    expect((await sql`select book_id from book_edition_identifiers where provider='google' and identifier='edition-integrity-alias'`)[0].book_id).toBe(first.id);
    await expect(store({google_books_id:'edition-integrity-a',isbn_13:'9780062316097'})).rejects.toMatchObject({code:'P1001'});
    await expect(store({open_library_id:'/works/OL990001W'})).rejects.toThrow('Invalid catalog edition');
    await expect(store({isbn_10:'0306406152',isbn_13:'9780141439518'})).rejects.toThrow('Invalid edition ISBN');
    await expect(store({isbn_13:'4006381333931'})).rejects.toThrow('Invalid edition ISBN');
    await expect(store({open_library_id:'/books/OL990001M',isbn_13:'9780306406157',format:'paperback'})).rejects.toMatchObject({code:'P1001'});
    const actor=crypto.randomUUID();await sql`select create_direct_account(${actor},'edition-integrity@example.test','edition_integrity_reader','Edition reader')`;
    const shelf=(await sql`select id from shelves where user_id=${actor} and default_type='have_read'`)[0].id;
    const results=await Promise.all([first,second].map(book=>sql`select set_shelf_membership(${actor},${shelf},${book.id},true) as result`));
    expect(results.map(rows=>rows[0].result.xp_awarded).sort((a,b)=>a-b)).toEqual([0,50]);
    expect((await sql`select books_read_count,xp from users where id=${actor}`)[0]).toEqual({books_read_count:1,xp:50});
    expect((await sql`select reading_goal_snapshot(${actor},extract(year from now() at time zone 'UTC')::integer) as result`)[0].result.progress.books_read).toBe(1);
    const snapshot=(await sql`select book_work_snapshot(${first.work_id},null,1) as result`)[0].result;expect(snapshot.editions).toHaveLength(1);expect(snapshot.nextCursor).toBeTruthy();
    const next=(await sql`select book_work_snapshot(${first.work_id},${snapshot.nextCursor},1) as result`)[0].result;expect(next.editions).toHaveLength(1);expect(next.editions[0].id).not.toBe(snapshot.editions[0].id);expect(next.nextCursor).toBeNull();
    await sql`delete from books where id in (${first.id},${second.id})`;
    const third=await store({open_library_id:'/books/OL990003M',isbn_13:'9780062316097'});expect(third.work_id).toBe(first.work_id);
    expect((await sql`select set_shelf_membership(${actor},${shelf},${third.id},true) as result`)[0].result.xp_awarded).toBe(0);
    expect((await sql`select count(*)::int as count from reading_work_completions where user_id=${actor} and rewarded_at is not null`)[0].count).toBe(1);
    const unrelated=await store({open_library_work_id:'/works/OL990002W',open_library_id:'/books/OL990004M',isbn_13:'9780525559474'});
    expect(unrelated.work_id).not.toBe(third.work_id);
    await expect(store({open_library_work_id:'/works/OL990002W',isbn_13:'9780062316097'})).rejects.toThrow('Conflicting work');
    for(const role of ['anon','authenticated'])for(const routine of ['store_catalog_book(jsonb)','book_work_snapshot(uuid,uuid,integer)','canonical_book_work(uuid)','claim_reading_reward_063(uuid,text,uuid)','import_goodreads_library_052(uuid,text,jsonb,integer)','seed_content_item_054(text,text,jsonb,uuid)'])expect((await sql`select has_function_privilege(${role},${routine},'EXECUTE') as allowed`)[0].allowed).toBe(false);
    }
    {
    expect(legacyEditions).toBeTruthy();const legacy=legacyEditions!;
    const rows=await sql`select id,work_id,canonical_edition_id,isbn_13,open_library_id from books where id in (${legacy.ids[0]},${legacy.ids[1]}) order by id`;
    const canonical=rows.find(row=>row.canonical_edition_id===null)!,alias=rows.find(row=>row.canonical_edition_id!==null)!;
    expect(alias.canonical_edition_id).toBe(canonical.id);expect(alias.work_id).toBe(canonical.work_id);expect(canonical.isbn_13).toBe('9780131103627');
    expect((await sql`select book_id from reviews where id=${legacy.reviewId}`)[0].book_id).toBe(legacy.ids[1]);
    expect((await sql`select book_id from shelf_books where user_id=${legacy.owner}`)[0].book_id).toBe(legacy.ids[1]);
    expect((await sql`select book_work_snapshot(${canonical.work_id}) as result`)[0].result.work.open_library_id).toBe('/works/OL980001W');
    expect((await sql`select count(*)::int as count from book_catalog_audit where book_id in (${legacy.ids[0]},${legacy.ids[1]})`)[0].count).toBeGreaterThanOrEqual(1);
    expect((await sql`select isbn_13 from books where google_books_id='legacy-corrupt-edition'`)[0].isbn_13).toBeNull();
    const {getBookById,getEditionIds}=await import('@/services/books');expect((await getBookById(alias.id))?.id).toBe(canonical.id);expect((await getEditionIds(canonical.id)).sort()).toEqual([...legacy.ids].sort());
    const shelf=(await sql`select id from shelves where user_id=${legacy.owner} and default_type='have_read'`)[0].id;
    const before=(await sql`select xp from users where id=${legacy.owner}`)[0].xp;
    expect((await sql`select award_xp_once(${legacy.owner},20,'write_review',${'review:'+canonical.id}) as result`)[0].result.awarded).toBe(0);
    expect((await sql`select set_shelf_membership(${legacy.owner},${shelf},${canonical.id},true) as result`)[0].result.xp_awarded).toBe(0);
    expect((await sql`select count(*)::int as count from shelf_books where user_id=${legacy.owner} and shelf_id=${shelf}`)[0].count).toBe(1);
    expect((await sql`select xp from users where id=${legacy.owner}`)[0].xp).toBe(before);
    expect((await getBookById(alias.id))?.have_read_count).toBe(1);
    const progress=(await sql`select sb.progress_percent,round(sb.progress_pages*100.0/b.page_count,2) as expected from shelf_books sb join books b on b.id=${canonical.id} where sb.user_id=${legacy.owner} and sb.shelf_id=${shelf}`)[0];expect(Number(progress.progress_percent)).toBe(Number(progress.expected));
    await sql`select set_shelf_membership(${legacy.owner},${shelf},${canonical.id},false)`;
    expect((await sql`select count(*)::int as count from shelf_books where user_id=${legacy.owner} and shelf_id=${shelf}`)[0].count).toBe(0);
    }
    {
    const store=async(data:Record<string,unknown>)=>(await sql`select store_catalog_book(${sql.json({title:'Work resolution fixture',author_name:'An author',...data})}) as book`)[0].book;
    const unknown=await store({google_books_id:'unresolved-work-fixture',isbn_13:'9780132350884'}),known=await store({open_library_id:'/books/OL970001M',open_library_work_id:'/works/OL970001W',isbn_13:'9780201616224'});
    const actor=crypto.randomUUID();await sql`select create_direct_account(${actor},'work-resolution@example.test','work_resolution_reader','Work resolution reader')`;
    const shelf=(await sql`select id from shelves where user_id=${actor} and default_type='have_read'`)[0].id;
    await sql`select set_shelf_membership(${actor},${shelf},${known.id},true)`;
    const {getBookById}=await import('@/services/books');expect((await getBookById(unknown.id))?.work_id).toBe(unknown.work_id);
    await Promise.all([store({open_library_id:'/books/OL970002M',open_library_work_id:'/works/OL970001W',isbn_13:'9780132350884'}),sql`select set_shelf_membership(${actor},${shelf},${unknown.id},true)`]);
    expect((await sql`select books_read_count from users where id=${actor}`)[0].books_read_count).toBe(1);
    expect((await getBookById(unknown.id))?.work_id).toBe(known.work_id);
    expect((await sql`select book_work_snapshot(${unknown.work_id}) as result`)[0].result.work.id).toBe(known.work_id);
    expect((await sql`select count(*)::int as count from book_catalog_audit where book_id=${unknown.id} and reason='provider_work_resolved'`)[0].count).toBe(1);
    const extra=await store({open_library_id:'/books/OL970003M',open_library_work_id:'/works/OL970001W',isbn_13:'9780735619678'});
    expect((await sql`select set_shelf_membership(${actor},${shelf},${extra.id},true) as result`)[0].result.xp_awarded).toBe(0);
    }
    {
    const actor=crypto.randomUUID();await sql`select create_direct_account(${actor},'work-resolution-race@example.test','work_resolution_race','Work race')`;
    const store=async(data:Record<string,unknown>)=>(await sql`select store_catalog_book(${sql.json({title:'Catalog lock race',author_name:'An author',...data})}) as book`)[0].book;
    const source=await store({google_books_id:'catalog-lock-source'}),target=await store({open_library_id:'/books/OL960001M',open_library_work_id:'/works/OL960001W'});
    const shelf=(await sql`select id from shelves where user_id=${actor} and default_type='have_read'`)[0].id;
    let signal:()=>void=()=>{},release:()=>void=()=>{};const ready=new Promise<void>(resolve=>{signal=resolve;}),held=new Promise<void>(resolve=>{release=resolve;});
    const first=sql.begin(async tx=>{await tx`select apply_shelf_membership_intent(${actor},${shelf},${source.id},true,'catalog-lock-race-source')`;signal();await held;});
    await ready;
    const resolveWork=store({google_books_id:'catalog-lock-source',open_library_work_id:'/works/OL960001W'}),second=sql`select apply_shelf_membership_intent(${actor},${shelf},${target.id},true,'catalog-lock-race-target')`;
    await new Promise(resolve=>setTimeout(resolve,100));release();await Promise.all([first,resolveWork,second]);
    expect((await sql`select books_read_count from users where id=${actor}`)[0].books_read_count).toBe(1);
    expect((await sql`select count_verified_books(${actor}) as count`)[0].count).toBe(1);
    expect((await sql`select count(*)::int as count from shelf_books where user_id=${actor} and shelf_id=${shelf}`)[0].count).toBe(2);
    }
    {
    expect(legacyImport).toBeTruthy();const legacy=legacyImport!;
    const {parseGoodreadsImport}=await import('@/lib/goodreads-import');
    const csv='Book Id,Title,Author,Language,Publisher,Binding,Number of Pages,Exclusive Shelf\n966001,Legacy import,Author,fr,Éditeur,Relié,320,read';
    const rows=parseGoodreadsImport(csv).rows;
    expect((await sql`select import_goodreads_library_v2(${legacy.owner},'legacy-parser-receipt',${sql.json(rows)},0) as result`)[0].result).toEqual(legacy.response);
    expect((await sql`select xp from users where id=${legacy.owner}`)[0].xp).toBe(0);
    const current=parseGoodreadsImport(csv.replaceAll('966001','966002')).rows;
    expect((await sql`select import_goodreads_library_v2(${legacy.owner},'new-parser-receipt',${sql.json(current)},0) as result`)[0].result.imported).toBe(1);
    const imported=(await sql`select b.* from books b join goodreads_book_identities g on g.book_id=b.id where g.goodreads_id='966002'`)[0];
    expect(imported).toMatchObject({language:'fr',publisher:'Éditeur',format:'hardcover',page_count:320,metadata_source:'goodreads'});
    const changed=current.map(row=>({...row,book:{...row.book,page_count:400}}));
    await expect(sql`select import_goodreads_library_v2(${legacy.owner},'new-parser-receipt',${sql.json(changed)},0)`).rejects.toThrow('Conflicting');
    const oldRows=legacy.rows.map(row=>{const item=row as {book:Record<string,unknown>};return {...item,book:{...item.book,goodreads_id:'966003'}};});
    const oldResponse=(await sql`select import_goodreads_library(${legacy.owner},'rolling-parser-receipt',${sql.json(oldRows)},0) as result`)[0].result;
    const rolling=rows.map(row=>({...row,book:{...row.book,goodreads_id:'966003'}}));
    expect((await sql`select import_goodreads_library_v2(${legacy.owner},'rolling-parser-receipt',${sql.json(rolling)},0) as result`)[0].result).toEqual(oldResponse);
    }
    {
    const actor=crypto.randomUUID();await sql`select create_direct_account(${actor},'metadata-066@example.test','metadata_066','Metadata reader')`;
    const store=async(data:Record<string,unknown>)=>(await sql`select store_catalog_book(${sql.json({title:'Verified title',author_name:'Verified author',google_books_id:'metadata-066',...data})}) as book`)[0].book;
    const first=await store({language:'und'});
    const fill=(await sql.begin(async tx=>{await tx`select set_config('liravo.catalog_source','goodreads',true)`;return tx`select store_catalog_book(${tx.json({title:'CSV title',author_name:'Author',google_books_id:'metadata-066',goodreads_id:'966004',isbn_13:'9780999660669',language:'fr',page_count:320,format:'paperback'})}) as book`;}))[0].book;
    const linked=await store({isbn_13:'9780999660669',language:'und'});
    expect(linked.id).toBe(first.id);
    expect(linked).toMatchObject({title:'Verified title',page_count:320,language:'fr',format:'paperback'});
    expect(linked.metadata_provenance).toMatchObject({title:'google',page_count:'goodreads',language:'goodreads',format:'goodreads'});
    const shelf=(await sql`select id from shelves where user_id=${actor} and default_type='currently_reading'`)[0].id;
    await sql`select set_shelf_membership(${actor},${shelf},${linked.id},true)`;
    const entry=(await sql`select id from shelf_books where user_id=${actor} and book_id=${linked.id}`)[0].id;
    await sql`select update_shelf_progress(${actor},${entry},160,null)`;
    const before=(await sql`select xp from users where id=${actor}`)[0].xp;
    const verified=await store({isbn_13:'9780999660669',open_library_id:'/books/OL966001M',language:'de',page_count:400,format:'hardcover',publisher:'Verified publisher'});
    expect(verified).toMatchObject({title:'Verified title',language:'de',page_count:400,format:'hardcover',publisher:'Verified publisher'});
    await expect(store({isbn_13:'9780999660669',open_library_id:'/books/OL966001M',language:'fr'})).rejects.toMatchObject({code:'P1001'});
    expect(verified.metadata_provenance).toMatchObject({title:'google',page_count:'openlibrary',language:'openlibrary',format:'openlibrary'});
    expect(Number((await sql`select progress_percent from shelf_books where id=${entry}`)[0].progress_percent)).toBe(40);
    expect((await sql`select xp from users where id=${actor}`)[0].xp).toBe(before);
    expect((await sql`select count(*)::int as count from book_catalog_audit where book_id=${verified.id} and reason='provider_progress_recalculated'`)[0].count).toBe(1);
    const again=await store({google_books_id:null,goodreads_id:'966004',isbn_13:'9780999660669',title:'CSV overwrite',language:'fr',page_count:800,publisher:'CSV publisher',format:'paperback'});
    expect(again).toMatchObject({title:'Verified title',language:'de',page_count:400,publisher:'Verified publisher',format:'hardcover'});
    const audit=(await sql`select count(*)::int as count from book_catalog_audit where book_id=${verified.id}`)[0].count;
    await store({isbn_13:'9780999660669',open_library_id:'/books/OL966001M',language:'de',page_count:400,format:'hardcover',publisher:'Verified publisher'});
    expect((await sql`select count(*)::int as count from book_catalog_audit where book_id=${verified.id}`)[0].count).toBe(audit);
    for(const role of ['anon','authenticated'])for(const routine of ['import_goodreads_library_v2(uuid,text,jsonb,integer)','store_catalog_book_065(jsonb)','apply_book_interaction_060(uuid,uuid,text,text,uuid,boolean)'])expect((await sql`select has_function_privilege(${role},${routine},'EXECUTE') as allowed`)[0].allowed).toBe(false);
    expect((await sql`select has_function_privilege('service_role','store_catalog_book_065(jsonb)','EXECUTE') as allowed`)[0].allowed).toBe(false);
    expect(fill.id).toBe(first.id);
    }
    {
    const actor=crypto.randomUUID(),banned=crypto.randomUUID();
    for(const [id,name] of [[actor,'mood_reader_067'],[banned,'mood_banned_067']])await sql`select create_direct_account(${id},${name+'@example.test'},${name},'Mood reader')`;
    const books=await sql`insert into books(title,author_name) select 'Mood fixture 067 '||n,'Author' from generate_series(1,64) n returning id`;
    await sql`insert into reviews(user_id,book_id,rating,content,review_type,moderation_status,mood_tags) select ${actor},id,4,'Mood fixture 067','short','published',array['Intense'] from books where id=any(${books.map(book=>book.id)})`;
    const excluded=await sql`insert into books(title,author_name) select 'Excluded mood 067 '||n,'Author' from generate_series(1,3) n returning id`;
    await sql`insert into reviews(user_id,book_id,rating,content,review_type,moderation_status,mood_tags,is_hidden) values(${actor},${excluded[0].id},4,'Hidden mood','short','published',array['Intense'],true),(${actor},${excluded[1].id},4,'Pending mood','short','pending',array['Intense'],false),(${banned},${excluded[2].id},4,'Banned reader','short','published',array['Intense'],false)`;
    await sql`update users set is_banned=true where id=${banned}`;
    const legacy=legacyEditions!,canonical=(await sql`select coalesce(canonical_edition_id,id) as id from books where id=${legacy.ids[1]}`)[0].id;
    await sql`update reviews set mood_tags=array['Intense'] where id=${legacy.reviewId}`;
    await sql`insert into reviews(user_id,book_id,rating,content,review_type,moderation_status,mood_tags) values(${legacy.owner},${legacy.ids[0]},4,'Canonical alias mood','short','published',array['Intense'])`;
    const {getMoodBooks}=await import('@/services/discovery');
    let page=await getMoodBooks('Intense',null,30),cursor=page.nextCursor;const results=[...page.books];expect(cursor).toBeTruthy();
    while(cursor){page=await getMoodBooks('Intense',cursor,30);results.push(...page.books);cursor=page.nextCursor;}
    expect(new Set(results.map(book=>book.id)).size).toBe(results.length);
    for(const book of books)expect(results.some(result=>result.id===book.id)).toBe(true);
    for(const book of excluded)expect(results.some(result=>result.id===book.id)).toBe(false);
    expect(results.find(book=>book.id===canonical)?.mood_count).toBe(1);
    const first=await getMoodBooks('Intense',null,1);
    await expect(getMoodBooks('Dark',first.nextCursor)).rejects.toThrow('Invalid mood cursor');
    for(const role of ['anon','authenticated'])expect((await sql`select has_function_privilege(${role},'discover_mood_books(text,integer,integer,uuid)','EXECUTE') as allowed`)[0].allowed).toBe(false);
    await expect(sql`select discover_mood_books('invalid',30,null,null)`).rejects.toMatchObject({code:'P1004'});
    const {GET}=await import('@/app/api/discover/mood/route');vi.mocked(getCurrentUser).mockResolvedValue({id:actor} as never);
    expect((await GET(new Request('https://app.test/api/discover/mood?mood=intense&limit=20'))).status).toBe(200);
    expect((await GET(new Request('https://app.test/api/discover/mood?mood=Intense&limit=999'))).status).toBe(400);
    vi.mocked(getCurrentUser).mockResolvedValue(null);expect((await GET(new Request('https://app.test/api/discover/mood?mood=Intense'))).status).toBe(401);
    }
    {
    const actor=crypto.randomUUID(),child=crypto.randomUUID(),legacyChild=crypto.randomUUID();
    for(const [id,name] of [[actor,'export_reader_068'],[child,'referral_child_068'],[legacyChild,'legacy_referral_child_068']])await sql`select create_direct_account(${id},${name+'@example.test'},${name},'Export reader')`;
    const shelf=(await sql`select id from shelves where user_id=${actor} and default_type='currently_reading'`)[0].id;
    const books=await sql`insert into books(title,author_name,page_count) select 'Export fixture 068 '||n,'Author',400 from generate_series(1,1201) n returning id`;
    await sql`insert into shelf_books(user_id,shelf_id,book_id,progress_pages,progress_percent) select ${actor},${shelf},id,160,40 from books where id=any(${books.map(book=>book.id)})`;
    const exported=(await sql`select account_data_export(${actor}) as data`)[0].data;
    expect(exported.reading_history).toHaveLength(1201);expect(exported.profile.id).toBe(actor);expect(new Set(exported.reading_history.map((entry:any)=>entry.book_id)).size).toBe(1201);
    expect(exported.reading_history[0].books).toHaveProperty('id');expect(exported.reading_history[0].books).toHaveProperty('identifiers');
    expect(exported.reading_history.every((entry:any)=>entry.books.page_count===400&&entry.progress_pages===160&&entry.progress_percent===40)).toBe(true);
    for(const key of ['pin_hash','totp_secret','password_hash','recovery_codes'])expect(exported.profile).not.toHaveProperty(key);
    expect((await sql`select account_data_export(${child}) as data`)[0].data.reading_history).toHaveLength(0);
    const legacy=legacyEditions!,legacyData=(await sql`select account_data_export(${legacy.owner}) as data`)[0].data;
    expect(legacyData.reviews.some((review:any)=>review.id===legacy.reviewId&&review.book_id===legacy.ids[1])).toBe(true);
    const code=(await sql`select referral_code from users where id=${actor}`)[0].referral_code;
    await Promise.all(Array.from({length:3},()=>sql`select attribute_referral_atomic(${child},${code})`));
    await sql`update users set referred_by=${actor} where id=${legacyChild}`;
    expect((await sql`select count(*)::int as count from outbox_events where aggregate_type='referrals' and aggregate_id=${child} and event_type='check_badges'`)[0].count).toBe(1);
    for(const [currency,amount] of [['USD',0.1],['NGN',2.5],['EUR',3]] as const)await sql`insert into referral_commissions(referrer_id,referred_user_id,transaction_id,transaction_type,gross_transaction_amount,platform_fee_amount,commission_amount,currency) values(${actor},${child},${'export-068-'+currency},'tip',${amount*100},${amount*10},${amount},${currency})`;
    const stats=(await sql`select referral_statistics(${actor}) as data`)[0].data;
    expect(stats).toMatchObject({referralCount:2,xpFromReferrals:200,referralCode:code});expect(stats.earnedByCurrency).toEqual({USD:'0.1000',NGN:'2.5000',EUR:'3.0000'});expect(stats.milestones.map((item:any)=>item.target)).toEqual([10,50,200]);
    await sql`update referral_commissions set commission_amount=0.04 where referrer_id=${actor} and currency='USD'`;
    expect((await sql`select referral_statistics(${actor}) as data`)[0].data.earnedByCurrency.USD).toBe('0.0400');
    await sql`update users set profile_visibility='followers_only' where id=${actor}`;
    expect((await sql`select referral_statistics(${actor}) as data`)[0].data.topReferrers.some((person:any)=>person.id===actor)).toBe(false);
    for(const role of ['anon','authenticated'])for(const routine of ['account_data_export(uuid)','referral_statistics(uuid)','attribute_referral_atomic_036(uuid,text)'])expect((await sql`select has_function_privilege(${role},${routine},'EXECUTE') as allowed`)[0].allowed).toBe(false);
    await sql`update users set is_banned=true where id=${child}`;await expect(sql`select account_data_export(${child})`).rejects.toMatchObject({code:'P1003'});
    }
    {
    const actor=legacyNotification!.owner,other=crypto.randomUUID();
    await sql`select create_direct_account(${other},'notifications-other-069@example.test','notifications_other_069','Other reader')`;
    const badge=(await sql`select message_key,message_values from notifications where id=${legacyNotification!.badge}`)[0];
    expect(badge).toMatchObject({message_key:'badge',message_values:{badgeId:'first_book',badgeName:'First Book'}});
    expect((await sql`select message_key,message_values from notifications where id=${legacyNotification!.goal}`)[0]).toMatchObject({message_key:'readingGoal',message_values:{count:2,target:8,percent:25,year:'2026'}});
    const {NOTIFICATION_KEYS,notificationPreference}=await import('@/lib/notification-preferences');
    for(const key of NOTIFICATION_KEYS)await sql`update users set ${sql(key)}=false where id=${actor}`;
    for(const [type,entity] of [['follow',null],['like',null],['review_like',null],['reply',null],['review_comment',null],['mention',null],['author_announcement',null],['new_release',null],['challenge_complete',null],['arc_granted',null],['buddy_read_invite','arc']] as const){
      expect(notificationPreference(type,entity)).toBeTruthy();
      expect(await sql`insert into notifications(user_id,type,entity_type,message) values(${actor},${type},${entity},'Opted out') returning id`).toHaveLength(0);
    }
    expect(await sql`insert into notifications(user_id,type,message) values(${actor},'tip_refunded','Financial history') returning id`).toHaveLength(1);
    expect(await sql`insert into notifications(user_id,type,message) values(${actor},'buddy_read_invite','Reading group') returning id`).toHaveLength(1);
    for(const key of NOTIFICATION_KEYS)await sql`update users set ${sql(key)}=true where id=${actor}`;
    const notice=(await sql`insert into notifications(user_id,type,actor_id,message) values(${actor},'follow',${other},'English legacy text') returning *`)[0];
    expect(notice).toMatchObject({message_key:'follow',message_values:{name:'Other reader'}});
    await sql`select award_badge_atomic(${actor},'custom_notice',10,'Prix personnalisé','★')`;
    expect((await sql`select message_key,message_values from notifications where user_id=${actor} and message_values->>'badgeId'='custom_notice'`)[0]).toMatchObject({message_key:'badge',message_values:{badgeName:'Prix personnalisé'}});
    const tipId=crypto.randomUUID(),payload={userId:actor,actorId:other,tipId,amount:'12.3456',currency:'NGN'};
    const event=(await sql`insert into outbox_events(aggregate_type,aggregate_id,event_type,payload,status) values('tip',${tipId},'notify_recipient',${sql.json(payload)},'processing') returning id`)[0].id;
    expect((await sql`select process_outbox_event_atomic(${event}) as ok`)[0].ok).toBe(true);
    expect((await sql`select process_outbox_event_atomic(${event}) as ok`)[0].ok).toBe(false);
    expect((await sql`select message_key,message_values from notifications where entity_id=${tipId}`)[0]).toMatchObject({message_key:'tipAmount',message_values:{amount:'12.3456',currency:'NGN'}});
    expect((await sql`select coalesce(current_setting('liravo.notification_context',true),'') as value`)[0].value).toBe('');
    for(const role of ['anon','authenticated'])for(const column of ['message','type','user_id','message_key','message_values'])expect((await sql`select has_column_privilege(${role},'notifications',${column},'UPDATE') as allowed`)[0].allowed).toBe(false);
    expect((await sql`select has_column_privilege('authenticated','notifications','is_read','UPDATE') as allowed`)[0].allowed).toBe(true);
    expect((await sql`select has_table_privilege('authenticated','notifications','INSERT') as allowed`)[0].allowed).toBe(false);
    await sql.begin(async tx=>{await tx`set local role authenticated`;await tx`select set_config('request.jwt.claim.sub',${actor},true)`;expect(await tx`update notifications set is_read=true where id=${notice.id} returning id`).toHaveLength(1);});
    const foreign=(await sql`insert into notifications(user_id,type,message) values(${other},'follow','Other') returning id`)[0].id;
    const {PATCH,GET}=await import('@/app/api/notifications/route');vi.mocked(getCurrentUser).mockResolvedValue({id:actor} as never);
    const request=(body:unknown,owner=actor)=>new Request('https://app.test/api/notifications',{method:'PATCH',headers:{'X-Liravo-Actor':owner},body:JSON.stringify(body)});
    expect((await PATCH(request({notification_id:foreign}))).status).toBe(404);
    expect((await PATCH(request({notification_id:notice.id}))).status).toBe(200);
    expect((await PATCH(request({notification_id:notice.id},other))).status).toBe(409);
    expect((await PATCH(request({message:'Forged'}))).status).toBe(400);
    const page=await(await GET(new Request('https://app.test/api/notifications'))).json();expect(page.actorId).toBe(actor);expect(page.notifications.every((n:any)=>n.user_id===actor&&n.message_key)).toBe(true);
    }
    {
    const actor=crypto.randomUUID(),rolledBack=crypto.randomUUID();
    const created=(await sql`select create_localized_direct_account(${actor},'locale070@example.test','locale_070','French reader','fr') as profile`)[0].profile;
    expect(created).toMatchObject({preferred_locale:'fr',locale_initialized:true});
    expect((await sql`select initialize_account_locale(${actor},'de') as locale`)[0].locale).toBe('fr');
    await sql`select initialize_account_locale(${actor},'de',true)`;expect((await sql`select initialize_account_locale(${actor},'fr') as locale`)[0].locale).toBe('de');
    await expect(sql`select create_localized_direct_account(${rolledBack},'rollback070@example.test','rollback_070','Rollback reader','xx')`).rejects.toMatchObject({code:'P1004'});expect(await sql`select id from users where id=${rolledBack}`).toHaveLength(0);
    const accounts=await Promise.all(Array.from({length:4},()=>sql`select resolve_localized_social_identity('google','locale-social070','locale-social070@example.test','Social reader',null,'fr') as profile`));
    const social=accounts[0][0].profile.id;expect(new Set(accounts.map(rows=>rows[0].profile.id)).size).toBe(1);expect(accounts.every(rows=>rows[0].profile.preferred_locale==='fr')).toBe(true);
    expect((await sql`select resolve_localized_social_identity('google','locale-social070','locale-social070@example.test','Social reader',null,'de') as profile`)[0].profile.preferred_locale).toBe('fr');
    const legacy=legacyNotification!.owner;expect((await sql`select locale_initialized from users where id=${legacy}`)[0].locale_initialized).toBe(true);await sql`update users set preferred_locale='de' where id=${legacy}`;expect((await sql`select initialize_account_locale(${legacy},'fr') as locale`)[0].locale).toBe('de');
    const managed=crypto.randomUUID();await sql`insert into auth.users(id,email,raw_user_meta_data) values(${managed},'managed070@example.test','{"username":"managed_070"}')`;
    expect((await sql`select locale_initialized from users where id=${managed}`)[0].locale_initialized).toBe(false);await sql`select initialize_account_locale(${managed},'fr')`;expect((await sql`select preferred_locale,locale_initialized from users where id=${managed}`)[0]).toEqual({preferred_locale:'fr',locale_initialized:true});
    for(const role of ['anon','authenticated']){
      expect((await sql`select has_column_privilege(${role},'users','locale_initialized','SELECT') as allowed`)[0].allowed).toBe(false);
      expect((await sql`select has_column_privilege(${role},'users','locale_initialized','UPDATE') as allowed`)[0].allowed).toBe(false);
      for(const routine of ['initialize_account_locale(uuid,text,boolean)','create_localized_direct_account(uuid,text,text,text,text,text)','resolve_localized_social_identity(text,text,text,text,text,text)'])expect((await sql`select has_function_privilege(${role},${routine},'EXECUTE') as allowed`)[0].allowed).toBe(false);
    }
    }
    {
    expect((await sql`select average_rating,ratings_count from books where id=${legacyRating!}`)[0]).toEqual({average_rating:null,ratings_count:0});
    expect((await sql`select previous_data,resolution from book_catalog_audit where book_id=${legacyRating!} and reason='legacy_review_rating_cache'`)[0]).toEqual({previous_data:{average_rating:4.6,ratings_count:100},resolution:{average_rating:null,ratings_count:0}});
    const actor=crypto.randomUUID(),banned=crypto.randomUUID(),deleted=crypto.randomUUID();
    for(const [id,name] of [[actor,'review_reader_071'],[banned,'review_banned_071'],[deleted,'review_deleted_071']])await sql`select create_direct_account(${id},${name+'@example.test'},${name},'Review reader')`;
    const book=(await sql`insert into books(title,author_name,average_rating,ratings_count) values('Review snapshot fixture 071','Author',4.6,100) returning id,work_id`)[0];
    const rows=await sql`insert into reviews(user_id,book_id,rating,content,review_type,moderation_status,created_at) select ${actor},${book.id},case when n<=20 then 5 else 1 end,'Review snapshot 071 '||n,'short','published','2026-10-28T10:00:00.123456Z'::timestamptz from generate_series(1,55) n returning id`;
    await sql`insert into reviews(user_id,book_id,rating,content,review_type,moderation_status,is_hidden) values(${actor},${book.id},1,'Hidden fixture','short','published',true),(${actor},${book.id},1,'Pending fixture','short','pending',false),(${banned},${book.id},1,'Banned fixture','short','published',false),(${deleted},${book.id},1,'Deleted fixture','short','published',false)`;
    await sql`update users set is_banned=true where id=${banned}`;await sql`update users set deleted_at=now() where id=${deleted}`;
    const {getBookReviews,ReviewCursorError}=await import('@/services/book-reviews');
    let page=(await getBookReviews(book.id,null,20))!,cursor=page.nextCursor;const found=[...page.reviews];
    expect(page.statistics).toEqual({ratings_count:55,average_rating:2.45,distribution:{1:35,2:0,3:0,4:0,5:20}});expect(page.reviews).toHaveLength(20);expect(cursor).toBeTruthy();
    while(cursor){page=(await getBookReviews(book.id,cursor,20))!;found.push(...page.reviews);cursor=page.nextCursor;expect(page.statistics.ratings_count).toBe(55);}
    expect(new Set(found.map(review=>review.id)).size).toBe(55);expect(found.every(review=>review.user.id===actor)).toBe(true);expect(found[0]).not.toHaveProperty('request_hash');
    const first=(await getBookReviews(book.id,null,1))!;await expect(getBookReviews(crypto.randomUUID(),first.nextCursor)).rejects.toBeInstanceOf(ReviewCursorError);
    await expect(getBookReviews(book.id,'invalid')).rejects.toBeInstanceOf(ReviewCursorError);expect(await getBookReviews(crypto.randomUUID())).toBeNull();
    await sql`update reviews set is_hidden=true where id=${rows[0].id}`;expect((await getBookReviews(book.id))!.statistics.ratings_count).toBe(54);
    await sql`delete from reviews where id=${rows[1].id}`;expect((await getBookReviews(book.id))!.statistics.ratings_count).toBe(53);
    expect((await sql`select average_rating,ratings_count from books where id=${book.id}`)[0]).toEqual({average_rating:'4.60',ratings_count:100});
    const work=(await sql`select book_work_snapshot(${book.work_id}) as data`)[0].data;expect(work.statistics).toMatchObject({ratings_count:53});
    const legacy=legacyEditions!,legacyPage=(await getBookReviews(legacy.ids[1]))!,canonical=(await getBookReviews(legacy.ids[0]))!;expect(legacyPage.bookId).toBe(canonical.bookId);expect(legacyPage.statistics).toEqual(canonical.statistics);expect(legacyPage.reviews.some(review=>review.id===legacy.reviewId)).toBe(true);
    const {GET}=await import('@/app/api/books/[id]/reviews/route');vi.mocked(getCurrentUser).mockResolvedValue({id:actor} as never);
    const result=await GET(new Request('https://app.test/api/books/'+book.id+'/reviews?limit=20'),{params:{id:book.id}});expect(result.status).toBe(200);expect((await result.json()).statistics.ratings_count).toBe(53);
    expect((await GET(new Request('https://app.test/api/books/'+book.id+'/reviews?limit=999'),{params:{id:book.id}})).status).toBe(400);
    vi.mocked(getCurrentUser).mockResolvedValue(null);expect((await GET(new Request('https://app.test/api/books/'+book.id+'/reviews'),{params:{id:book.id}})).status).toBe(401);
    await Promise.all(Array.from({length:10},(_,n)=>sql`insert into reviews(user_id,book_id,rating,content,review_type,moderation_status) values(${actor},${book.id},3,${'Concurrent review 071 '+n},'short','published')`));
    expect((await getBookReviews(book.id))!.statistics.ratings_count).toBe(63);
    const provider=(await sql`select store_catalog_book(${sql.json({google_books_id:'review-provider071',title:'Provider score 071',author_name:'Author',average_rating:4.2,ratings_count:321})}) as data`)[0].data;
    const refreshed=(await sql`select store_catalog_book(${sql.json({google_books_id:'review-provider071',title:'Provider score 071',author_name:'Author',average_rating:4.4,ratings_count:350})}) as data`)[0].data;expect(refreshed).toMatchObject({id:provider.id,average_rating:4.4,ratings_count:350,metadata_provenance:{average_rating:'google'}});
    await sql`select award_badge_atomic(${actor},'first_book',50,'First Book','📖')`;const {getEarnedBadges}=await import('@/services/badges');expect(await getEarnedBadges(actor)).toContainEqual({id:'first_book',name:'First Book',icon:'📖'});
    const {GET:profile}=await import('@/app/api/users/[id]/route');vi.mocked(getCurrentUser).mockResolvedValue({id:actor} as never);const profileData=await(await profile(new Request('https://app.test/api/users/review_reader_071'),{params:{id:'review_reader_071'}})).json();expect(profileData.user.badges).toContainEqual({id:'first_book',name:'First Book',icon:'📖'});
    for(const role of ['anon','authenticated'])expect((await sql`select has_function_privilege(${role},'book_review_snapshot(uuid,integer,integer,timestamptz,uuid)','EXECUTE') as allowed`)[0].allowed).toBe(false);expect((await sql`select has_function_privilege('service_role','store_catalog_book_066(jsonb)','EXECUTE') as allowed`)[0].allowed).toBe(false);
    }
    {
    const {id:room,owner}=legacyWorkshop!,other=crypto.randomUUID();await sql`select create_direct_account(${other},'workshop_other072@example.test','workshop_other072','Other writer')`;
    expect((await sql`select member_count from workshop_rooms where id=${room}`)[0].member_count).toBe(1);
    await sql`update workshop_rooms set member_count=999 where id=${room}`;expect((await sql`select member_count from workshop_rooms where id=${room}`)[0].member_count).toBe(1);
    const peers=Array.from({length:4},()=>crypto.randomUUID());for(const [n,id] of peers.entries())await sql`select create_direct_account(${id},${'workshop_peer072_'+n+'@example.test'},${'workshop_peer072_'+n},'Peer writer')`;
    await Promise.all(peers.flatMap(id=>Array.from({length:2},()=>sql`select join_content_group(${id},'workshop',${room})`)));
    expect((await sql`select member_count from workshop_rooms where id=${room}`)[0].member_count).toBe(5);
    expect((await sql`select count(*)::int as count from workshop_members where room_id=${room}`)[0].count).toBe(5);
    const submissions=await sql`insert into workshop_submissions(user_id,room_id,title,excerpt,created_at) select ${owner},${room},'Draft 072 '||n,'A useful writing excerpt '||n,'2026-10-29T00:00:00.123456Z'::timestamptz from generate_series(1,45) n returning id`;
    for(const [n,id] of [owner,...peers].entries())await sql`insert into workshop_feedback(user_id,submission_id,comment,created_at) values(${id},${submissions[0].id},${'Feedback 072 '+n},'2026-10-29T00:00:00.123456Z'::timestamptz)`;
    const {GET:metadata}=await import('@/app/api/write/workshops/[id]/route'),{GET:drafts}=await import('@/app/api/write/workshops/[id]/submissions/route'),{GET:feedback}=await import('@/app/api/write/workshops/[id]/submissions/[submissionId]/feedback/route');
    vi.mocked(getCurrentUser).mockResolvedValue({id:other} as never);for(const handler of [metadata,drafts])expect((await handler(new Request('https://app.test/workshop'),{params:{id:room}})).status).toBe(403);
    expect((await feedback(new Request('https://app.test/workshop'),{params:{id:room,submissionId:submissions[0].id}})).status).toBe(403);
    await sql.begin(async tx=>{await tx`set local role authenticated`;await tx`select set_config('request.jwt.claim.sub',${other},true)`;expect(await tx`select id from workshop_submissions where room_id=${room}`).toHaveLength(0);expect(await tx`select id from workshop_feedback where submission_id=${submissions[0].id}`).toHaveLength(0);});
    vi.mocked(getCurrentUser).mockResolvedValue({id:owner} as never);
    const summary=await(await metadata(new Request('https://app.test/workshop?summary=1'),{params:{id:room}})).json();expect(summary).toMatchObject({actorId:owner,room:{id:room,member_count:5}});expect(summary).not.toHaveProperty('submissions');expect(summary.room).not.toHaveProperty('request_hash');
    const collect=async(handler:typeof drafts|typeof feedback,params:{id:string;submissionId:string},key:'submissions'|'feedback')=>{let cursor:string|null=null;const found:string[]=[];do{const result:Response=await handler(new Request('https://app.test/workshop'+(cursor?'?cursor='+encodeURIComponent(cursor):'')),{params}),data:Record<string,any>=await result.json();expect(result.status).toBe(200);expect(data[key].length).toBeLessThanOrEqual(20);found.push(...data[key].map((row:any)=>row.id));cursor=data.nextCursor;}while(cursor);expect(found).toHaveLength(key==='submissions'?45:5);expect(new Set(found).size).toBe(key==='submissions'?45:5);};
    await collect(drafts,{id:room,submissionId:submissions[0].id},'submissions');await collect(feedback,{id:room,submissionId:submissions[0].id},'feedback');
    const foreign=(await sql`insert into workshop_rooms(name,facilitator_id,max_members) values('Other workshop 072',${owner},8) returning id`)[0].id;
    expect((await feedback(new Request('https://app.test/workshop'),{params:{id:foreign,submissionId:submissions[0].id}})).status).toBe(404);
    expect((await drafts(new Request('https://app.test/workshop?cursor=broken'),{params:{id:room}})).status).toBe(400);
    const changed=new Request('https://app.test/workshop',{headers:{'X-Liravo-Actor':other}});expect((await metadata(changed,{params:{id:room}})).status).toBe(409);expect((await drafts(changed,{params:{id:room}})).status).toBe(409);
    const {applyWritingIntent}=await import('@/lib/writing-intents');await expect(applyWritingIntent(changed,owner,'join',room,{})).rejects.toMatchObject({status:409});
    for(const role of ['anon','authenticated'])for(const table of ['workshop_rooms','workshop_members'])for(const privilege of ['INSERT','UPDATE','DELETE'])expect((await sql`select has_table_privilege(${role},${table},${privilege}) as allowed`)[0].allowed).toBe(false);
    const prompt=(await sql`insert into writing_prompts(prompt_text,topic_seed,prompt_date,is_active) values('Recovery prompt 072','Recovery','1972-01-01',true) returning id`)[0].id;
    await sql`select apply_writing_intent(${owner},'prompt',${prompt},'recover-prompt-072',${sql.json({content:'A useful prompt response '.repeat(4).trim()})})`;
    const {GET:readPrompt}=await import('@/app/api/write/prompts/[id]/route');const response=await readPrompt(new Request('https://app.test/prompt'),{params:{id:prompt}}),owned=await response.json();expect(response.status).toBe(200);expect(owned).toMatchObject({actorId:owner,submission:{user_id:owner,content:'A useful prompt response '.repeat(4).trim()}});expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    vi.mocked(getCurrentUser).mockResolvedValue({id:other} as never);expect((await(await readPrompt(new Request('https://app.test/prompt'),{params:{id:prompt}})).json()).submission).toBeNull();
    const challenge=(await sql`insert into writing_challenges(title,type,start_date,end_date,is_active) values('Recovery challenge 072','weekly',now()-interval '1 day',now()+interval '1 day',true) returning id`)[0].id;
    await sql`select apply_writing_intent(${owner},'challenge',${challenge},'recover-entry-072',${sql.json({title:'Owned draft',content:'A recovered challenge entry'})})`;
    const {GET:readChallenge}=await import('@/app/api/write/challenges/[id]/route');vi.mocked(getCurrentUser).mockResolvedValue({id:owner} as never);expect((await(await readChallenge(new Request('https://app.test/challenge'),{params:{id:challenge}})).json()).entry).toMatchObject({user_id:owner,title:'Owned draft',content:'A recovered challenge entry'});
    vi.mocked(getCurrentUser).mockResolvedValue({id:other} as never);expect((await(await readChallenge(new Request('https://app.test/challenge'),{params:{id:challenge}})).json()).entry).toBeNull();vi.mocked(getCurrentUser).mockResolvedValue({id:owner} as never);
    for(let n=0;n<35;n++)await sql`insert into workshop_rooms(name,facilitator_id,max_members,member_count) values(${'Catalog workshop 072 '+n},${owner},8,500)`;
    expect((await sql`select bool_and(member_count=1) as correct from workshop_rooms where name like 'Catalog workshop 072 %'`)[0].correct).toBe(true);
    const {GET:catalog}=await import('@/app/api/write/workshops/route');let cursor:string|null=null;const found:string[]=[];do{const result=await catalog(new Request('https://app.test/workshops'+(cursor?'?cursor='+encodeURIComponent(cursor):''))),page=await result.json();expect(result.status).toBe(200);expect(page.rooms.length).toBeLessThanOrEqual(30);found.push(...page.rooms.map((item:any)=>item.id));cursor=page.nextCursor;}while(cursor);expect(new Set(found).size).toBe(found.length);expect(found).toHaveLength((await sql`select count(*)::int as count from workshop_rooms where is_active`)[0].count);
    }
    {
    const owner=crypto.randomUUID();await sql`select create_direct_account(${owner},'progress073@example.test','progress_073','Progress writer')`;
    await sql`update users set reading_streak=27,writing_streak=3 where id=${owner}`;
    const prompts=await sql`insert into writing_prompts(prompt_text,topic_seed,prompt_date,is_active) select 'Progress prompt 073 '||n,'Progress','1981-01-01'::date+n,false from generate_series(1,1105) n returning id`;
    await sql`insert into writing_prompt_submissions(user_id,prompt_id,content,word_count,created_at) select ${owner},id,'Two words',2,date_trunc('week',now() at time zone 'UTC') at time zone 'UTC'-interval '1 second' from writing_prompts where id in ${sql(prompts.map(row=>row.id))}`;
    const challenge=(await sql`insert into writing_challenges(title,type) values('Progress challenge 073','weekly') returning id`)[0].id;
    await sql`insert into writing_challenge_submissions(user_id,challenge_id,content,word_count,submitted_at) values(${owner},${challenge},'A seven word entry for this challenge',7,date_trunc('week',now() at time zone 'UTC') at time zone 'UTC')`;
    const room=(await sql`insert into workshop_rooms(name,facilitator_id,max_members) values('Progress workshop 073',${owner},8) returning id`)[0].id;
    const drafts=await sql`insert into workshop_submissions(user_id,room_id,title,excerpt) values(${owner},${room},'Draft one','An excerpt'),(${owner},${room},'Draft two','Another excerpt') returning id`;
    await sql`insert into workshop_feedback(user_id,submission_id,comment) values(${owner},${drafts[0].id},'A useful critique')`;
    await sql`select award_badge_atomic(${owner},'first_draft',100,'First Draft','📝')`;
    const progress=(await sql`select writing_progress_snapshot(${owner}) as snapshot`)[0].snapshot;
    expect(progress).toMatchObject({total_words:2217,prompts_completed:1105,challenges_completed:1,workshop_critiques:1,writing_streak:3});
    expect(progress.weekly_words).toHaveLength(7);expect(progress.weekly_words.slice(0,5).every((week:any)=>week.words===0)).toBe(true);expect(progress.weekly_words[5].words).toBe(2210);expect(progress.weekly_words[6].words).toBe(7);
    expect(progress.badges).toEqual([expect.objectContaining({badge_id:'first_draft'})]);
    const {GET:readProgress}=await import('@/app/api/write/progress/route');
    vi.mocked(getCurrentUser).mockResolvedValue({id:owner} as never);
    const response=await readProgress(new Request('https://app.test/progress'));expect(response.status).toBe(200);expect(await response.json()).toEqual(progress);expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect((await readProgress(new Request('https://app.test/progress',{headers:{'X-Liravo-Actor':crypto.randomUUID()}}))).status).toBe(409);
    vi.mocked(getCurrentUser).mockResolvedValue(null);expect((await readProgress(new Request('https://app.test/progress'))).status).toBe(401);
    vi.mocked(getCurrentUser).mockResolvedValue({id:owner} as never);
    const known=(await sql`select id,isbn_13 from books where isbn_13 is not null and canonical_edition_id is null order by id limit 1`)[0];
    const provider=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('Providers offline'));
    try{
      const {GET:search}=await import('@/app/api/books/search/route');const response=await search(new Request('https://app.test/search?q='+known.isbn_13));
      expect(response.status).toBe(200);expect(await response.json()).toMatchObject({source:'local',books:[{id:known.id,isbn_13:known.isbn_13}]});expect(provider).not.toHaveBeenCalled();
    }finally{provider.mockRestore();}
    await sql`update users set is_banned=true where id=${owner}`;expect((await sql`select writing_progress_snapshot(${owner}) as snapshot`)[0].snapshot).toBeNull();
    vi.mocked(getCurrentUser).mockResolvedValue({id:owner} as never);expect((await readProgress(new Request('https://app.test/progress'))).status).toBe(503);
    }
    {
    expect((await sql`select is_active from arcs where id=${legacyAuthor!.arc}`)[0].is_active).toBe(false);
    expect((await sql`select book_id from author_posts where id=${legacyAuthor!.post}`)[0].book_id).toBeNull();
    expect((await sql`select author_owns_book(${legacyAuthor!.owner},${legacyAuthor!.book}) as owned`)[0].owned).toBe(false);
    expect((await sql`select count(*)::int as count from book_catalog_audit where book_id=${legacyAuthor!.book} and reason in('unverified_author_arc','unverified_author_post')`)[0].count).toBe(2);
    const admin=crypto.randomUUID(),author=crypto.randomUUID(),coauthor=crypto.randomUUID(),impostor=crypto.randomUUID();
    for(const [n,id] of [admin,author,coauthor,impostor].entries())await sql`select create_direct_account(${id},${'author074_'+n+'@example.test'},${'author074_'+n},'Identical editable name')`;
    await sql`update users set is_admin=true where id=${admin}`;await sql`update users set is_verified_author=true,user_types=array['author'] where id in(${author},${coauthor},${impostor})`;
    const store=async(payload:Record<string,unknown>)=>(await sql`select store_catalog_book(${sql.json({title:'Author catalog fixture',author_name:'Bibliographic pen name',...payload})}) as book`)[0].book;
    const first=await store({google_books_id:'author074-first'}),second=await store({open_library_id:'/books/OL740002M',open_library_work_id:'/works/OL740001W'});
    const grant=async(who:string,book:string,key:string,granted=true)=>(await sql`select set_author_work_claim(${admin},${who},${book},${granted},${key}) as result`)[0].result;
    const {contentIntent}=await import('@/lib/content-intents');
    const create=async(table:'arcs'|'author_posts',key:string,payload:Record<string,unknown>)=>(await contentIntent(new Request('https://app.test/content',{headers:{'Idempotency-Key':key}}),author,table,payload)).insert();
    const arcBody={book_id:first.id,description:'A verified offer',reader_slots:3,is_active:true};
    await expect(create('arcs','author074-unowned-arc',arcBody)).rejects.toMatchObject({status:403});
    await expect(create('author_posts','author074-unowned-post',{book_id:first.id,title:'Unowned book',body:'An announcement',type:'announcement'})).rejects.toMatchObject({status:403});
    await expect(sql`select set_author_work_claim(${author},${author},${first.id},true,'author074-self-grant')`).rejects.toThrow('Admin access');
    const results=await Promise.all(Array.from({length:4},()=>grant(author,first.id,'author074-grant-replay')));expect(results.every(row=>row.workId===first.work_id)).toBe(true);
    expect((await sql`select count(*)::int as count from author_work_claims where author_id=${author}`)[0].count).toBe(1);
    expect((await sql`select count(*)::int as count from moderation_log where target_user_id=${author} and action='author_work_granted'`)[0].count).toBe(1);
    await expect(grant(author,first.id,'author074-grant-replay',false)).rejects.toThrow('Intent already used');
    await store({google_books_id:'author074-first',open_library_id:'/books/OL740001M',open_library_work_id:'/works/OL740001W'});
    expect((await sql`select author_owns_book(${author},${second.id}) as owned`)[0].owned).toBe(true);
    const extra=await sql`insert into books(work_id,title,author_name,created_at) select ${second.work_id},'Author edition 074 '||n,'Bibliographic pen name','2026-10-29T00:00:00.123456Z' from generate_series(1,35) n returning id`;
    const alias=(await sql`insert into books(work_id,title,author_name,canonical_edition_id) values(${second.work_id},'Retained author edition alias','Bibliographic pen name',${second.id}) returning id`)[0].id;
    expect((await sql`select author_owns_book(${author},${alias}) as owned`)[0].owned).toBe(true);
    await grant(coauthor,second.id,'author074-coauthor');
    expect((await sql`select book_authors_snapshot(${second.id}) as authors`)[0].authors.map((row:any)=>row.id).sort()).toEqual([author,coauthor].sort());
    expect((await sql`select author_owns_book(${impostor},${first.id}) as owned`)[0].owned).toBe(false);
    const {getAuthorCatalog,getAuthorAnalytics}=await import('@/lib/author-catalog');let cursor:string|null=null;const found:string[]=[];do{const page=await getAuthorCatalog(author,cursor);expect(page.books.length).toBeLessThanOrEqual(30);found.push(...page.books.map(book=>book.id));cursor=page.nextCursor;}while(cursor);expect(found).toHaveLength(37);expect(new Set(found).size).toBe(37);
    const arc=await create('arcs','author074-owned-arc',{...arcBody,book_id:alias});
    const post=await create('author_posts','author074-owned-post',{book_id:second.id,title:'Owned book',body:'An announcement',type:'announcement'});
    await sql`update users set is_banned=true where id=${author}`;await expect(sql`insert into arc_applications(arc_id,reader_id) values(${arc.id},${coauthor})`).rejects.toThrow('Verified ARC ownership required');await sql`update users set is_banned=false where id=${author}`;
    await sql`insert into arc_applications(arc_id,reader_id) values(${arc.id},${coauthor})`;
    const shelf=(await sql`select id from shelves where user_id=${coauthor} and default_type='want_to_read'`)[0].id;
    await sql`insert into shelf_books(shelf_id,user_id,book_id) values(${shelf},${coauthor},${first.id}),(${shelf},${coauthor},${extra[0].id})`;
    await sql`insert into follows(follower_id,following_id) values(${coauthor},${author})`;
    await sql`insert into reviews(user_id,book_id,rating,content,review_type,moderation_status) values(${coauthor},${extra[34].id},5,'A full-catalog review','short','published')`;
    expect(await getAuthorAnalytics(author)).toMatchObject({totalWantToReads:1,totalReviews:1,followerCount:1});
    expect((await sql`select followed_author_books(${coauthor}) as books`)[0].books).toHaveLength(10);
    const {GET:readAuthor}=await import('@/app/api/author/[username]/route');const publicResponse=await readAuthor(new Request('https://app.test/author'),{params:{username:'author074_1'}});expect(publicResponse.status).toBe(200);expect(await publicResponse.json()).toMatchObject({followerCount:1,total:37,author:{id:author}});
    const {GET:readBooks}=await import('@/app/api/author/books/route');vi.mocked(getCurrentUser).mockResolvedValue({id:author} as never);expect((await readBooks(new Request('https://app.test/books'))).status).toBe(200);expect((await readBooks(new Request('https://app.test/books?cursor=invalid'))).status).toBe(400);
    const {GET:manage,PUT:update}=await import('@/app/api/admin/users/[id]/books/route');
    expect((await manage(new Request('https://app.test/admin'),{params:{id:author}})).status).toBe(403);
    vi.mocked(getCurrentUser).mockResolvedValue({id:admin} as never);const managed=await manage(new Request('https://app.test/admin?q=Author'),{params:{id:author}});expect(managed.status).toBe(200);expect(await managed.json()).toMatchObject({actorId:admin,total:37});
    const mismatched=new Request('https://app.test/admin',{method:'PUT',headers:{'X-Liravo-Actor':author,'Idempotency-Key':'author074-mismatch'},body:JSON.stringify({book_id:first.id,granted:true})});expect((await update(mismatched,{params:{id:author}})).status).toBe(409);
    await grant(author,second.id,'author074-revoke',false);expect((await sql`select author_owns_book(${author},${alias}) as owned`)[0].owned).toBe(false);
    expect((await sql`select is_active from arcs where id=${arc.id}`)[0].is_active).toBe(false);expect((await sql`select book_id from author_posts where id=${post.id}`)[0].book_id).toBeNull();
    await grant(author,first.id,'author074-grant-replay');expect((await sql`select author_owns_book(${author},${first.id}) as owned`)[0].owned).toBe(false);
    expect((await sql`select book_authors_snapshot(${first.id}) as authors`)[0].authors.map((row:any)=>row.id)).toEqual([coauthor]);
    await expect(sql`update arcs set is_active=true where id=${arc.id}`).rejects.toThrow('ownership required');
    for(const role of ['anon','authenticated']){
      for(const table of ['author_books','author_work_claims','author_catalog_intents'])for(const privilege of ['SELECT','INSERT','UPDATE','DELETE'])expect((await sql`select has_table_privilege(${role},${table},${privilege}) as allowed`)[0].allowed).toBe(false);
      for(const routine of ['set_author_work_claim(uuid,uuid,uuid,boolean,text)','author_owns_book(uuid,uuid)','author_catalog_snapshot(uuid,timestamptz,uuid,integer)','book_authors_snapshot(uuid)','author_analytics_snapshot(uuid)','followed_author_books(uuid)'])expect((await sql`select has_function_privilege(${role},${routine},'EXECUTE') as allowed`)[0].allowed).toBe(false);
    }
    }
    {
    const owner=crypto.randomUUID(),writer=crypto.randomUUID(),novice=crypto.randomUUID(),inactive=crypto.randomUUID(),inactiveOwner=crypto.randomUUID();
    for(const [n,id] of [owner,writer,novice,inactive,inactiveOwner].entries())await sql`select create_direct_account(${id},${'writer075_'+n+'@example.test'},${'writer075_'+n},'Question writer')`;
    await sql`update users set is_verified_author=true where id in(${writer},${inactive})`;await sql`update users set user_types=array['author'] where id=${novice}`;
    const questions=await sql`insert into ask_writer_questions(user_id,question,tags,created_at) select ${owner},'Writer pagination question 075 '||n,array['craft'],'2026-10-29T00:00:00.123456Z' from generate_series(1,45)n returning id`;
    const target=questions[0].id,answers=await sql`insert into ask_writer_answers(user_id,question_id,answer,created_at) select ${writer},${target},'A useful detailed writing answer '||n,'2026-10-29T00:00:00.123456Z' from generate_series(1,45)n returning id`;
    const hidden=(await sql`insert into ask_writer_answers(user_id,question_id,answer) values(${inactive},${target},'A response from a now inactive author') returning id`)[0].id;
    await sql`update users set is_banned=true where id=${inactive}`;
    await expect(sql`select apply_writing_intent(${owner},'best_answer',${target},'writer075-hidden-best',${sql.json({answer_id:hidden})})`).rejects.toThrow('Answer unavailable');
    const chosen=answers.map(row=>row.id).sort()[0],selection=(await sql`select apply_writing_intent(${owner},'best_answer',${target},'writer075-best-replay',${sql.json({answer_id:chosen})}) as result`)[0].result;expect(selection.ok).toBe(true);
    await sql`select apply_writing_intent(${owner},'best_answer',${target},'writer075-best-replay',${sql.json({answer_id:chosen})})`;
    expect((await sql`select count(*)::int as n from notifications where user_id=${writer} and entity_id=${target} and message_key='writerBestAnswer'`)[0].n).toBe(1);
    expect((await sql`select count(*)::int as n from xp_ledger where event_key=${'best-answer:'+target}`)[0].n).toBe(1);
    const {getWriterThread,getWriterQuestions}=await import('@/lib/writer-questions');
    const first=await getWriterThread(target,owner);expect(first).toMatchObject({actorId:owner,isOwner:true,canAnswer:false,question:{answer_count:45},bestAnswer:{id:chosen}});expect(first!.answers).toHaveLength(20);
    let cursor:string|null=null;const found:string[]=[];do{const page=await getWriterThread(target,owner,cursor);expect(page!.answers.length).toBeLessThanOrEqual(20);expect(page!.bestAnswer!.id).toBe(chosen);found.push(...page!.answers.map(row=>row.id));cursor=page!.nextCursor;}while(cursor);expect(found).toHaveLength(44);expect(new Set([...found,chosen]).size).toBe(45);expect(found).not.toContain(hidden);
    expect((await getWriterThread(target,novice))!.canAnswer).toBe(false);
    vi.mocked(getCurrentUser).mockResolvedValue({id:novice} as never);
    const {POST:answer}=await import('@/app/api/write/questions/[id]/answer/route'),{GET:read}=await import('@/app/api/write/questions/[id]/route'),{GET:list,POST:ask}=await import('@/app/api/write/questions/route');
    const answerRequest=(key:string,body:unknown={answer:'An API answer with enough detail'},actor=novice)=>new Request('https://app.test/answer',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key,'X-Liravo-Actor':actor},body:JSON.stringify(body)});
    expect((await answer(answerRequest('writer075-novice-answer'),{params:{id:target}})).status).toBe(403);
    await expect(sql`insert into ask_writer_answers(user_id,question_id,answer) values(${novice},${target},'Role selection must not grant answering rights')`).rejects.toThrow('Verified author');
    await sql`update users set xp=1000 where id=${novice}`;expect((await answer(answerRequest('writer075-boundary-answer'),{params:{id:target}})).status).toBe(403);
    await sql`update users set xp=1001 where id=${novice}`;expect((await getWriterThread(target,novice))!.canAnswer).toBe(true);
    expect((await answer(answerRequest('writer075-account-mismatch',undefined,writer),{params:{id:target}})).status).toBe(409);
    expect((await answer(answerRequest('writer075-blank-answer',{answer:' '.repeat(30)}),{params:{id:target}})).status).toBe(422);
    const before=(await sql`select count(*)::int as n from notifications where user_id=${owner} and entity_id=${target} and message_key='writerAnswer'`)[0].n;
    const response=await answer(answerRequest('writer075-answer-replay'),{params:{id:target}}),saved=await response.json();expect(response.status).toBe(201);expect(saved).toMatchObject({actorId:novice,answer:{user_id:novice,question_id:target,author:{id:novice}}});
    const replay=await answer(answerRequest('writer075-answer-replay'),{params:{id:target}});expect((await replay.json()).answer.id).toBe(saved.answer.id);
    expect((await sql`select count(*)::int as n from notifications where user_id=${owner} and entity_id=${target} and message_key='writerAnswer'`)[0].n).toBe(before+1);
    await sql`update users set notify_replies=false where id=${owner}`;expect((await answer(answerRequest('writer075-optout-answer'),{params:{id:target}})).status).toBe(201);
    expect((await sql`select count(*)::int as n from notifications where user_id=${owner} and entity_id=${target} and message_key='writerAnswer'`)[0].n).toBe(before+1);
    expect((await read(new Request('https://app.test/question?cursor='+encodeURIComponent(first!.nextCursor!)),{params:{id:questions[1].id}})).status).toBe(400);
    for(const url of ['?page=bad','?page=2','?filter=bad','?cursor=bad'])expect((await list(new Request('https://app.test/questions'+url))).status).toBe(400);
    const all=await getWriterQuestions('all');expect(all.nextCursor).toBeTruthy();expect((await list(new Request('https://app.test/questions?filter=unanswered&cursor='+encodeURIComponent(all.nextCursor!)))).status).toBe(400);
    for(const filter of ['all','unanswered','most_answered'] as const){let cursor:string|null=null;const ids:string[]=[];let expected=0;do{const page=await getWriterQuestions(filter,cursor);expected=page.total;expect(page.questions.length).toBeLessThanOrEqual(20);if(filter==='unanswered')expect(page.questions.every(row=>row.answer_count===0)).toBe(true);ids.push(...page.questions.map(row=>row.id));cursor=page.nextCursor;}while(cursor);expect(ids).toHaveLength(expected);expect(new Set(ids).size).toBe(expected);expect(ids).toContain(questions[1].id);}
    const hiddenQuestion=(await sql`insert into ask_writer_questions(user_id,question) values(${inactiveOwner},'A question by a now inactive writer') returning id`)[0].id;
    await sql`update users set deleted_at=now() where id=${inactiveOwner}`;
    expect(await getWriterThread(hiddenQuestion,writer)).toBeNull();vi.mocked(getCurrentUser).mockResolvedValue({id:writer} as never);expect((await read(new Request('https://app.test/question'),{params:{id:hiddenQuestion}})).status).toBe(404);
    expect((await answer(answerRequest('writer075-inactive-question',undefined,writer),{params:{id:hiddenQuestion}})).status).toBe(404);
    expect((await ask(new Request('https://app.test/questions',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'writer075-invalid-question'},body:JSON.stringify({question:' '.repeat(20),tags:[]})}))).status).toBe(422);
    vi.mocked(getCurrentUser).mockResolvedValue(null);const publicRead=await read(new Request('https://app.test/question'),{params:{id:target}});expect(publicRead.status).toBe(200);expect(await publicRead.json()).toMatchObject({actorId:null,isOwner:false,canAnswer:false});expect(publicRead.headers.get('Cache-Control')).toBe('private, no-store');
    for(const role of ['anon','authenticated']){
      for(const table of ['ask_writer_questions','ask_writer_answers'])for(const privilege of ['SELECT','INSERT','UPDATE','DELETE'])expect((await sql`select has_table_privilege(${role},${table},${privilege}) as allowed`)[0].allowed).toBe(false);
      for(const routine of ['writer_question_catalog(text,jsonb,integer)','writer_question_thread(uuid,uuid,timestamptz,uuid,integer)'])expect((await sql`select has_function_privilege(${role},${routine},'EXECUTE') as allowed`)[0].allowed).toBe(false);
    }
    }
    {
    const author=crypto.randomUUID(),first=crypto.randomUUID(),second=crypto.randomUUID(),observer=crypto.randomUUID();
    for(const [n,id] of [author,first,second,observer].entries())await sql`select create_direct_account(${id},${'arc076_'+n+'@example.test'},${'arc076_'+n},'ARC participant')`;
    await sql`update users set is_verified_author=true where id=${author}`;
    const book=(await sql`insert into books(title,author_name) values('ARC snapshot book 076','ARC author') returning id,work_id`)[0];await sql`insert into author_work_claims(author_id,work_id) values(${author},${book.work_id})`;
    const offers=await sql`insert into arcs(author_id,book_id,description,reader_slots,is_active,created_at) select ${author},${book.id},'ARC catalog 076 '||n,3,true,'2026-10-29T00:00:00.123456Z' from generate_series(1,35)n returning id`;
    const arc=offers[0].id;await sql`insert into arc_applications(arc_id,reader_id,status) values(${arc},${first},'approved'),(${arc},${second},'approved')`;
    const pending=[];for(let n=0;n<43;n++){const id=crypto.randomUUID();await sql`select create_direct_account(${id},${'arc076_pending_'+n+'@example.test'},${'arc076_pending_'+n},'Pending reader')`;pending.push((await sql`insert into arc_applications(arc_id,reader_id,applied_at) values(${arc},${id},'2026-10-29T00:00:00.123456Z') returning id,reader_id`)[0]);}
    const history=(await sql`insert into arcs(author_id,book_id,description,reader_slots,is_active) values(${author},${book.id},'Expired history 076',3,true) returning id`)[0].id;await sql`insert into arc_applications(arc_id,reader_id) values(${history},${observer})`;await sql`update arcs set close_date=now()-interval '1 day' where id=${history}`;
    const withdrawn=(await sql`insert into arcs(author_id,book_id,description,reader_slots,is_active) values(${author},${book.id},'Withdrawn offer 076',3,false) returning id`)[0].id;
    const {getArcs,getArcApplications}=await import('@/lib/arcs');
    let cursor:string|null=null;const ids:string[]=[];do{const page=await getArcs(observer,false,cursor,author);expect(page.arcs.length).toBeLessThanOrEqual(20);ids.push(...page.arcs.map(row=>row.id));cursor=page.nextCursor;}while(cursor);expect(ids).toHaveLength(36);expect(new Set(ids).size).toBe(36);expect(ids).toContain(history);expect(ids).not.toContain(withdrawn);
    const others=await getArcs(first,false,null,author);expect(others.arcs.some(row=>row.id===history)).toBe(false);
    const publicOffer=(await sql`select arc_offer_document(${arc},${observer}) as offer`)[0].offer;expect(publicOffer).toMatchObject({approved_count:2,slots_remaining:1,my_application_status:null,pending_count:null,total_applications:null});expect(JSON.stringify(publicOffer)).not.toContain(pending[0].reader_id);
    const expired=(await sql`select arc_offer_document(${history},${observer}) as offer`)[0].offer;expect(expired).toMatchObject({is_open:false,can_apply:false,my_application_status:'pending'});
    let appCursor:string|null=null;const apps:string[]=[];do{const page=await getArcApplications(author,arc,'all',appCursor);expect(page!.statistics).toEqual({total:45,pending:43,approved:2,rejected:0});expect(page!.applications.length).toBeLessThanOrEqual(20);apps.push(...page!.applications.map(row=>row.id));appCursor=page!.nextCursor;}while(appCursor);expect(apps).toHaveLength(45);expect(new Set(apps).size).toBe(45);
    const {GET:readApplications}=await import('@/app/api/author/arcs/[id]/applications/route'),{GET:readOffers}=await import('@/app/api/arcs/route'),{GET:readOwned}=await import('@/app/api/author/arcs/route'),{POST:decide}=await import('@/app/api/author/arcs/[id]/approve/route');
    vi.mocked(getCurrentUser).mockResolvedValue({id:observer} as never);expect((await readApplications(new Request('https://app.test/applications'),{params:{id:arc}})).status).toBe(403);
    const visible=await readOffers(new Request('https://app.test/arcs?authorId='+author));expect(visible.status).toBe(200);expect(visible.headers.get('Cache-Control')).toBe('private, no-store');expect((await visible.json()).actorId).toBe(observer);
    vi.mocked(getCurrentUser).mockResolvedValue({id:author} as never);expect((await readOwned(new Request('https://app.test/author/arcs'))).status).toBe(200);
    const firstPage=await getArcApplications(author,arc);expect((await readApplications(new Request('https://app.test/applications?status=pending&cursor='+encodeURIComponent(firstPage!.nextCursor!)),{params:{id:arc}})).status).toBe(400);
    expect((await readApplications(new Request('https://app.test/applications?cursor='+encodeURIComponent(firstPage!.nextCursor!)),{params:{id:offers[1].id}})).status).toBe(400);
    const inactive=pending[42];await sql`update users set is_banned=true where id=${inactive.reader_id}`;
    const request=(applicationId:string,approved:boolean,key:string,actor=author)=>new Request('https://app.test/approve',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key,'X-Liravo-Actor':actor},body:JSON.stringify({applicationId,approved})});
    expect((await decide(request(inactive.id,true,'arc076-inactive-approval'),{params:{id:arc}})).status).toBe(404);
    expect((await sql`select status from arc_applications where id=${inactive.id}`)[0].status).toBe('pending');
    const decisions=await Promise.all([pending[0],pending[1]].map(row=>decide(request(row.id,true,'arc076-last-slot-'+row.id),{params:{id:arc}})));expect(decisions.map(response=>response.status).sort()).toEqual([200,409]);
    const winning=await decisions.find(response=>response.status===200)!.json();expect(winning).toMatchObject({actorId:author,arcId:arc,application:{status:'approved',arc_id:arc}});
    const winningKey='arc076-last-slot-'+winning.application.id;expect((await decide(request(winning.application.id,true,winningKey),{params:{id:arc}})).status).toBe(200);
    await expect(sql`update arc_applications set status='rejected' where id=${winning.application.id}`).rejects.toThrow('Decision is final');
    expect((await decide(request(inactive.id,false,'arc076-inactive-rejection'),{params:{id:arc}})).status).toBe(200);expect((await decide(request(inactive.id,false,'arc076-inactive-rejection'),{params:{id:arc}})).status).toBe(200);
    expect((await sql`select count(*)::int as n from notifications where user_id=${inactive.reader_id} and entity_id=${arc}`)[0].n).toBe(1);
    const complete=await getArcApplications(author,arc);expect(complete).toMatchObject({statistics:{total:45,pending:41,approved:3,rejected:1},arc:{slots_remaining:0,can_review:false}});
    for(const status of ['pending','approved','rejected'] as const){let cursor:string|null=null;const rows:string[]=[];do{const page=await getArcApplications(author,arc,status,cursor);expect(page!.applications.every(row=>row.status===status)).toBe(true);rows.push(...page!.applications.map(row=>row.id));cursor=page!.nextCursor;}while(cursor);expect(rows).toHaveLength(complete!.statistics[status]);}
    const denied=await decide(request(pending[2].id,false,'arc076-actor-mismatch',observer),{params:{id:arc}});expect(denied.status).toBe(409);
    const own=await getArcs(author,true);expect((await readOffers(new Request('https://app.test/arcs?cursor='+encodeURIComponent(own.nextCursor!)))).status).toBe(400);
    for(const role of ['anon','authenticated']){
      for(const table of ['arcs','arc_applications'])for(const privilege of ['SELECT','INSERT','UPDATE','DELETE'])expect((await sql`select has_table_privilege(${role},${table},${privilege}) as allowed`)[0].allowed).toBe(false);
      for(const routine of ['arc_offer_document(uuid,uuid)','arc_catalog_snapshot(uuid,boolean,timestamptz,uuid,uuid,integer)','arc_application_snapshot(uuid,uuid,text,timestamptz,uuid,integer)'])expect((await sql`select has_function_privilege(${role},${routine},'EXECUTE') as allowed`)[0].allowed).toBe(false);
    }
    }
    {
      const owner=crypto.randomUUID(),other=crypto.randomUUID();for(const [id,name] of [[owner,'buddy077_owner'],[other,'buddy077_other']])await sql`select create_direct_account(${id},${name+'@example.test'},${name},${name})`;
      const [book]=await sql`insert into books(title,author_name) values('Buddy edition 077','Writer') returning id`;
      const [open]=await sql`insert into buddy_reads(book_id,created_by,title,max_participants) values(${book.id},${other},'Older open group',3) returning id`;
      const own:string[]=[];for(let i=0;i<23;i++){const [room]=await sql`insert into buddy_reads(book_id,created_by,title,max_participants) values(${book.id},${owner},${'Own group '+i},3) returning id`;own.push(room.id);await sql`insert into buddy_read_members(buddy_read_id,user_id) values(${room.id},${owner})`;}
      const [privateRoom]=await sql`insert into buddy_reads(book_id,created_by,is_private) values(${book.id},${other},true) returning id`;
      const {getBuddyReads,getBuddyDetail,getBuddyNotes,decodeBuddyCursor}=await import('@/lib/buddy-reads');
      const first=await getBuddyReads(owner,'mine');expect(first.buddy_reads).toHaveLength(20);expect(first.nextCursor).toBeTruthy();const second=await getBuddyReads(owner,'mine',first.nextCursor);expect(second.buddy_reads).toHaveLength(3);expect(new Set([...first.buddy_reads,...second.buddy_reads].map(row=>row.id)).size).toBe(23);
      expect(()=>decodeBuddyCursor(first.nextCursor,other,'mine')).toThrow('Invalid cursor');expect(()=>decodeBuddyCursor(first.nextCursor,owner,'open')).toThrow('Invalid cursor');
      const available=await getBuddyReads(owner,'open');expect(available.buddy_reads.some(row=>row.id===open.id)).toBe(true);expect(available.buddy_reads.some(row=>row.id===privateRoom.id)).toBe(false);expect(await getBuddyDetail(owner,privateRoom.id)).toBeNull();
      await sql`update users set is_banned=true where id=${other}`;await expect(sql`insert into buddy_read_members(buddy_read_id,user_id) values(${open.id},${owner})`).rejects.toThrow('unavailable');await sql`update users set is_banned=false where id=${other}`;
      const roomId=own[0],detail=await getBuddyDetail(owner,roomId);expect(detail).toMatchObject({actorId:owner,buddyRead:{title:'Own group 0',participant_count:1,is_member:true,can_update:true,book:{id:book.id,title:'Buddy edition 077'}},participants:[{id:owner}]});
      await expect(getBuddyNotes(other,roomId)).rejects.toMatchObject({status:403});
      for(let i=0;i<45;i++)await sql`insert into buddy_read_notes(buddy_read_id,user_id,content) values(${roomId},${owner},${'Note '+i})`;
      let cursor:string|null=null;const notes:string[]=[];do{const page=await getBuddyNotes(owner,roomId,cursor);notes.push(...page.notes.map(note=>note.id));cursor=page.nextCursor;}while(cursor);expect(notes).toHaveLength(45);expect(new Set(notes).size).toBe(45);
      const [alias]=await sql`insert into books(title,author_name,work_id,canonical_edition_id) select 'Retained alias','Writer',work_id,id from books where id=${book.id} returning id`;await sql`update buddy_reads set book_id=${alias.id} where id=${roomId}`;expect((await getBuddyDetail(owner,roomId))!.book.id).toBe(book.id);
      const notesPage=await getBuddyNotes(owner,roomId);expect(()=>decodeBuddyCursor(notesPage.nextCursor,owner,'notes.'+own[1])).toThrow('Invalid cursor');
      await sql`update buddy_reads set is_active=false where id=${roomId}`;expect((await getBuddyDetail(owner,roomId))!.buddyRead).toMatchObject({is_member:true,can_update:false,can_join:false});expect((await getBuddyReads(owner,'mine')).buddy_reads.some(row=>row.id===roomId)||second.buddy_reads.some(row=>row.id===roomId)).toBe(true);
      for(const role of ['anon','authenticated'])for(const routine of ['buddy_read_document(uuid,uuid)','buddy_catalog_snapshot(uuid,text,timestamptz,uuid,integer)','buddy_detail_snapshot(uuid,uuid)','buddy_notes_snapshot(uuid,uuid,timestamptz,uuid,integer)'])expect((await sql`select has_function_privilege(${role},${routine},'EXECUTE') as allowed`)[0].allowed).toBe(false);
    }
    {
      const actor=crypto.randomUUID(),year=2026;await sql`select create_direct_account(${actor},'reading078@example.test','reading078','Annual reader')`;
      const shelf=(await sql`select id from shelves where user_id=${actor} and default_type='have_read'`)[0].id;
      const books=await sql`insert into books(title,author_name,page_count,genres) select 'Reading 078 '||n,'Annual author',10,array['Fantasy'] from generate_series(1,1005) n returning id,work_id`;
      await sql`insert into shelf_books(shelf_id,user_id,book_id,finished_at) select ${shelf},${actor},id,'2026-12-31T23:59:59.500Z'::timestamptz from books where id in ${sql(books.map(book=>book.id))}`;
      const [edition]=await sql`insert into books(title,author_name,page_count,work_id) values('Another edition','Annual author',200,${books[0].work_id}) returning id`;
      const [alias]=await sql`insert into books(title,author_name,work_id,canonical_edition_id) values('Retained alias','Annual author',${books[1].work_id},${books[1].id}) returning id`;
      await sql`insert into shelf_books(shelf_id,user_id,book_id,finished_at) values(${shelf},${actor},${edition.id},'2026-06-01'),(${shelf},${actor},${alias.id},'2026-06-01')`;
      const extra=await sql`insert into books(title,author_name,page_count) values('Unknown length','Other author',null),('Custom shelf only','Other author',600),('Previous year','Other author',900),('Next year','Other author',900) returning id`;
      await sql`insert into shelf_books(shelf_id,user_id,book_id,finished_at,progress_pages) values(${shelf},${actor},${extra[0].id},'2026-12-31T23:59:59.999Z',80),(${shelf},${actor},${extra[2].id},'2025-12-31T23:59:59.999Z',900),(${shelf},${actor},${extra[3].id},'2027-01-01',900)`;
      const [custom]=await sql`insert into shelves(user_id,name,slug,is_public) values(${actor},'Other shelf','reading078_custom',true) returning id`;await sql`insert into shelf_books(shelf_id,user_id,book_id,finished_at) values(${custom.id},${actor},${extra[1].id},'2026-06-01')`;
      await sql`insert into reviews(user_id,book_id,rating,content,review_type,mood_tags,moderation_status,created_at) values(${actor},${books[0].id},4,'Published annual review','short',array['Cozy'],'published','2026-12-31T23:59:59.999Z'),(${actor},${books[1].id},1,'Hidden annual review','short',array['Dark'],'removed','2026-06-01'),(${actor},${books[2].id},5,'Previous review','short',array['Dark'],'published','2025-12-31')`;
      await sql`insert into quotes(user_id,book_id,content,is_hidden,created_at) values(${actor},${books[0].id},'Annual quote',false,'2026-12-31T23:59:59.999Z'),(${actor},${books[0].id},'Hidden quote',true,'2026-06-01')`;
      await sql`insert into user_badges(user_id,badge_id,awarded_at) values(${actor},'first_review','2026-12-31T23:59:59.999Z')`;
      await sql`insert into xp_ledger(user_id,event_key,amount,reason,created_at) values(${actor},'reading078-award',40,'fixture','2026-12-31T23:59:59.999Z'),(${actor},'reading078-reversal',-5,'fixture','2026-06-01'),(${actor},'reading078-past',999,'fixture','2025-12-31')`;
      await sql`update users set xp=777,genres=array['Romance'],reading_streak=2,max_reading_streak=31,last_streak_date=(now() at time zone 'UTC')::date-8 where id=${actor}`;await sql`select set_reading_goal(${actor},${year},2000)`;
      const {getReadingYear,getPublicReadingYear}=await import('@/lib/reading-statistics'),snapshot=await getReadingYear(actor,year);
      expect(snapshot!.stats).toMatchObject({booksReadThisYear:1006,pagesReadThisYear:10130,averageRating:4,reviewsWrittenThisYear:1,quotesSavedThisYear:1,currentReadingStreak:0,readingStreakMax:31,favouriteGenre:'Fantasy',longestBook:{page_count:10},goal:{progress:{books_read:1006}}});
      expect(snapshot!.wrapped).toMatchObject({booksRead:1006,pagesRead:10130,topGenres:['Fantasy'],topMood:'Cozy',streakMax:31,yearXp:35,totalXp:777,badgesEarned:1,mostActiveMonthNumber:12,favouriteAuthor:'Annual author',readerLevel:500});
      await sql`update shelves set is_public=false where id=${shelf}`;expect(await getPublicReadingYear(actor,year)).toMatchObject({booksRead:0,pagesRead:0,topGenres:[]});expect((await getReadingYear(actor,year))!.wrapped.booksRead).toBe(1006);
      await sql`update users set is_banned=true where id=${actor}`;expect(await getPublicReadingYear(actor,year)).toBeNull();expect(await getReadingYear(actor,year)).toBeNull();
      for(const role of ['anon','authenticated'])for(const routine of ['reading_year_books(uuid,integer,boolean)','public_reading_year_snapshot(uuid,integer)','reading_year_snapshot(uuid,integer)'])expect((await sql`select has_function_privilege(${role},${routine},'EXECUTE') as allowed`)[0].allowed).toBe(false);
    }
    {
      const owner=crypto.randomUUID(),other=crypto.randomUUID();for(const [id,name] of [[owner,'rooms079_owner'],[other,'rooms079_other']])await sql`select create_direct_account(${id},${name+'@example.test'},${name},${name})`;
      const [book]=await sql`insert into books(title,author_name) values('Room edition 079','Writer') returning id,work_id`;const [alias]=await sql`insert into books(title,author_name,work_id,canonical_edition_id) values('Retained room alias','Writer',${book.work_id},${book.id}) returning id`;
      const rooms=await sql`insert into reading_rooms(created_by,name,book_id,is_public) select ${owner},'Public room 079 '||n,${alias.id},true from generate_series(1,23) n returning id`;
      const [privateRoom]=await sql`insert into reading_rooms(created_by,name,is_public) values(${owner},'Private room 079',false) returning id`;const [closed]=await sql`insert into reading_rooms(created_by,name,is_public) values(${owner},'Ended room 079',true) returning id`;await sql`update reading_rooms set is_active=false where id=${closed.id}`;
      const {getReadingRooms,getReadingRoom,getRoomMilestones,getRoomPosts,decodeRoomCursor}=await import('@/lib/reading-rooms');
      const first=await getReadingRooms(owner,'mine');expect(first.rooms).toHaveLength(20);const second=await getReadingRooms(owner,'mine',first.nextCursor);expect(second.rooms).toHaveLength(5);expect(new Set([...first.rooms,...second.rooms].map(room=>room.id)).size).toBe(25);expect([...first.rooms,...second.rooms].find(room=>room.id===privateRoom.id)).toMatchObject({is_public:false,is_member:true,member_count:1,book:null});expect([...first.rooms,...second.rooms].find(room=>room.id===closed.id)).toMatchObject({is_active:false,can_join:false,can_post:false});
      expect(()=>decodeRoomCursor(first.nextCursor,other,'mine')).toThrow('Invalid cursor');expect(()=>decodeRoomCursor(first.nextCursor,owner,'public')).toThrow('Invalid cursor');await expect(getReadingRoom(other,privateRoom.id)).rejects.toMatchObject({status:403});
      let cursor:string|null=null;const publicIds:string[]=[];do{const page=await getReadingRooms(other,'public',cursor);publicIds.push(...page.rooms.map(room=>room.id));cursor=page.nextCursor;}while(cursor);expect(publicIds).not.toContain(privateRoom.id);for(const room of rooms)expect(publicIds).toContain(room.id);expect(new Set(publicIds).size).toBe(publicIds.length);
      const roomId=rooms[0].id;for(let n=0;n<22;n++){const member=n===0?other:crypto.randomUUID();if(n)await sql`select create_direct_account(${member},${'room079_member'+n+'@example.test'},${'room079_member'+n},'Reader')`;await sql`insert into room_participants(room_id,user_id) values(${roomId},${member})`;}
      const detail=await getReadingRoom(owner,roomId);expect(detail).toMatchObject({room:{member_count:23,is_member:true,can_manage:true,book:{id:book.id,title:'Room edition 079'}}});expect(detail.participants).toHaveLength(20);expect((await getReadingRoom(owner,roomId,detail.participantsNextCursor)).participants).toHaveLength(3);expect(()=>decodeRoomCursor(detail.participantsNextCursor,owner,'participants.'+rooms[1].id)).toThrow('Invalid cursor');
      const milestones=await sql`insert into reading_room_milestones(room_id,created_by,title,unlock_date) select ${roomId},${owner},'Opened chapter '||n,now()-n*interval '1 minute' from generate_series(1,25) n returning id`;
      const [locked]=await sql`insert into reading_room_milestones(room_id,created_by,title,unlock_date) values(${roomId},${owner},'Future chapter',now()+interval '1 day') returning id`;
      await sql`insert into reading_room_posts(room_id,user_id,content,milestone_id) select ${roomId},${owner},'Older chapter post '||n,${milestones[0].id} from generate_series(1,105) n`;
      const [general]=await sql`insert into reading_room_posts(room_id,user_id,content) values(${roomId},${owner},'Latest general message') returning id`;
      expect((await getRoomPosts(owner,roomId,'general')).posts.map(post=>post.id)).toEqual([general.id]);cursor=null;const posts:string[]=[];do{const page=await getRoomPosts(owner,roomId,milestones[0].id,cursor);posts.push(...page.posts.map(post=>post.id));cursor=page.nextCursor;}while(cursor);expect(posts).toHaveLength(105);expect(new Set(posts).size).toBe(105);
      const postPage=await getRoomPosts(owner,roomId,milestones[0].id);expect(()=>decodeRoomCursor(postPage.nextCursor,owner,'posts.'+roomId+'.general')).toThrow('Invalid cursor');await expect(getRoomPosts(owner,roomId,locked.id)).rejects.toMatchObject({status:403});await expect(sql`insert into reading_room_posts(room_id,user_id,content,milestone_id) values(${roomId},${owner},'Locked spoiler',${locked.id})`).rejects.toThrow('Milestone unavailable');await expect(sql`insert into reading_room_posts(room_id,user_id,content) values(${roomId},${owner},' ')`).rejects.toThrow('Invalid content');
      cursor=null;const chapters:any[]=[];do{const page=await getRoomMilestones(owner,roomId,cursor);expect(page.total).toBe(26);chapters.push(...page.milestones);cursor=page.nextCursor;}while(cursor);expect(chapters).toHaveLength(26);expect(chapters.find(row=>row.id===milestones[0].id)).toMatchObject({is_unlocked:true,post_count:105});expect(chapters.find(row=>row.id===locked.id)).toMatchObject({is_unlocked:false,post_count:0});
      const {POST:writePost}=await import('@/app/api/reading-rooms/[id]/posts/route');const {POST:writeMilestone}=await import('@/app/api/reading-rooms/[id]/milestones/route');vi.mocked(getCurrentUser).mockResolvedValue({id:owner,email:'rooms079_owner@example.test'});
      const intent=(path:string,key:string,payload:unknown)=>new Request('https://app.test/api/reading-rooms/'+roomId+'/'+path,{method:'POST',headers:{'Content-Type':'application/json','X-Liravo-Actor':owner,'Idempotency-Key':key},body:JSON.stringify(payload)});
      const body={content:'A recoverable room post',milestone_id:null},saved=await writePost(intent('posts','room079-recovered-post',body),{params:{id:roomId}});expect(saved.status).toBe(201);expect(await saved.json()).toMatchObject({actorId:owner,roomId,post:{user_id:owner,users:{id:owner}}});
      const milestoneBody={title:'A recoverable milestone',unlock_date:'2026-01-01T00:00:00.000Z'};expect((await writeMilestone(intent('milestones','room079-recovered-milestone',milestoneBody),{params:{id:roomId}})).status).toBe(201);
      await sql`update reading_rooms set is_active=false where id=${roomId}`;expect((await writePost(intent('posts','room079-recovered-post',body),{params:{id:roomId}})).status).toBe(201);expect((await writeMilestone(intent('milestones','room079-recovered-milestone',milestoneBody),{params:{id:roomId}})).status).toBe(201);expect((await sql`select count(*)::int as n from reading_room_posts where room_id=${roomId} and content=${body.content}`)[0].n).toBe(1);
      await sql`update users set is_banned=true where id=${owner}`;await expect(sql`select join_content_group(${other},'reading_room',${rooms[1].id})`).rejects.toThrow('Organizer unavailable');expect((await sql`select join_content_group(${other},'reading_room',${roomId}) as result`)[0].result).toMatchObject({joined:true,alreadyJoined:true});
      for(const role of ['anon','authenticated']){for(const table of ['reading_rooms','room_participants','reading_room_members','reading_room_posts','reading_room_milestones'])for(const privilege of ['INSERT','UPDATE','DELETE'])expect((await sql`select has_table_privilege(${role},${table},${privilege}) as allowed`)[0].allowed).toBe(false);for(const routine of ['reading_room_catalog_snapshot(uuid,text,timestamptz,uuid,integer)','reading_room_detail_snapshot(uuid,uuid,timestamptz,uuid,integer)','reading_room_milestone_snapshot(uuid,uuid,timestamptz,uuid,integer)','reading_room_posts_snapshot(uuid,uuid,boolean,uuid,timestamptz,uuid,integer)'])expect((await sql`select has_function_privilege(${role},${routine},'EXECUTE') as allowed`)[0].allowed).toBe(false);}
    }
    {
      const actor=crypto.randomUUID();await sql`select create_direct_account(${actor},'content080@example.test','content080','Content writer')`;await sql`update users set created_at=now()-interval '8 days',xp=500 where id=${actor}`;
      const [book]=await sql`insert into books(title,author_name,language,format) values('Content forms 080','Writer','fr','paperback') returning id`;
      vi.mocked(getCurrentUser).mockResolvedValue({id:actor,email:'content080@example.test'});
      const {POST:writeQuote}=await import('@/app/api/quotes/route'),{POST:verifyAuthor}=await import('@/app/api/author/verification-request/route');
      const request=(key:string,body:unknown)=>new Request('https://app.test/content',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key,'X-Liravo-Actor':actor},body:JSON.stringify(body)});
      const payload={book_id:book.id,content:'A meaningful passage.',page_number:2147483647},first=await writeQuote(request('quote080-owned',payload) as never);expect(first.status).toBe(201);const created=await first.json();expect(created.quote).toMatchObject({user_id:actor,book_id:book.id,page_number:2147483647});const replay=await writeQuote(request('quote080-owned',payload) as never);expect((await replay.json()).quote.id).toBe(created.quote.id);
      for(const body of [{book_id:book.id,content:'<b></b>'},{book_id:book.id,content:'&nbsp;'},{book_id:book.id,content:'Passage',page_number:2147483648},{book_id:book.id,content:'Passage',page_number:1.5}])expect((await writeQuote(request('quote080-invalid',body) as never)).status).toBe(400);
      expect((await sql`select count(*)::int as n from quotes where user_id=${actor}`)[0].n).toBe(1);expect((await sql`select count(*)::int as n from xp_ledger where user_id=${actor} and event_key=${'quote:'+created.quote.id}`)[0].n).toBe(1);
      const evidence={pen_name:'Evidence writer',publisher:'',book_titles:'Published work and ISBN',website_url:'https://example.test/author',social_proof_url:''},verification=await verifyAuthor(request('verification080-owned',evidence));expect(verification.status).toBe(201);const data=await verification.json();expect(data).toMatchObject({actorId:actor,request:{user_id:actor,pen_name:'Evidence writer',status:'pending'}});expect((await(await verifyAuthor(request('verification080-owned',evidence))).json()).request.id).toBe(data.request.id);
      expect((await sql`select count(*)::int as n from author_verification_requests where user_id=${actor}`)[0].n).toBe(1);expect((await sql`select is_verified_author from users where id=${actor}`)[0].is_verified_author).toBe(false);expect((await sql`select count(*)::int as n from author_work_claims where author_id=${actor}`)[0].n).toBe(0);
      expect((await verifyAuthor(request('verification080-unsafe',{...evidence,website_url:'javascript:alert(1)'}))).status).toBe(400);expect((await sql`select count(*)::int as n from outbox_events where event_type='notify_admins' and payload->>'requestId'=${data.request.id}`)[0].n).toBe(1);
    }
    {
      const owner=crypto.randomUUID(),reader=crypto.randomUUID();for(const [id,name] of [[owner,'lists081_owner'],[reader,'lists081_reader']])await sql`select create_direct_account(${id},${name+'@example.test'},${name},${name})`;
      const owned=await sql`insert into reading_lists(user_id,name,is_public,created_at) select ${owner},'List 081 '||n,true,'2026-01-01'::timestamptz from generate_series(1,53)n returning id`;
      await sql`insert into reading_list_follows(user_id,list_id) select ${reader},id from reading_lists where user_id=${owner}`;
      const [privateList]=await sql`insert into reading_lists(user_id,name,is_public) values(${owner},'Private 081',false) returning id`;await sql`insert into reading_list_follows(user_id,list_id) values(${reader},${privateList.id})`;
      const {getReadingLists,getReadingList,mutateReadingList}=await import('@/lib/reading-lists');const first=await getReadingLists(owner,'mine'),second=await getReadingLists(owner,'mine',first.nextCursor);expect(first.lists).toHaveLength(50);expect(second.lists).toHaveLength(4);expect(new Set([...first.lists,...second.lists].map(row=>row.id)).size).toBe(54);
      const followed=await getReadingLists(reader,'followed');expect(followed.lists).toHaveLength(50);expect((await getReadingLists(reader,'followed',followed.nextCursor)).lists).toHaveLength(3);await expect(getReadingList(reader,privateList.id)).rejects.toMatchObject({status:404});await expect(getReadingList(null,privateList.id)).rejects.toMatchObject({status:404});
      const books=await sql`insert into books(title,author_name,language,format) select 'List edition 081 '||n,'Writer','fr','paperback' from generate_series(1,55)n returning id,work_id`;
      await sql`update books set work_id=${books[0].work_id} where id=${books[1].id}`;
      const [alias]=await sql`insert into books(title,author_name,work_id,canonical_edition_id) values('Retained list alias','Writer',${books[0].work_id},${books[0].id}) returning id`;
      for(const [n,book]of books.entries())await sql`insert into reading_list_books(list_id,book_id,added_at) values(${owned[0].id},${book.id},${new Date(Date.UTC(2026,0,n+1))})`;
      await sql`insert into reading_list_books(list_id,book_id,added_at) values(${owned[0].id},${alias.id},'2026-01-01')`;
      let detail=await getReadingList(reader,owned[0].id);expect(detail.list).toMatchObject({book_count:55,follower_count:1,is_following:true});expect(detail.books).toHaveLength(20);expect(detail.books[0].id).toBe(books[54].id);const all=[...detail.books];while(detail.nextCursor){detail=await getReadingList(reader,owned[0].id,detail.nextCursor);all.push(...detail.books);}expect(all).toHaveLength(55);expect(new Set(all.map(row=>row.id)).size).toBe(55);expect(all.some(row=>row.id===books[1].id)).toBe(true);
      await expect(mutateReadingList(reader,owned[0].id,'add',{book_id:books[0].id})).rejects.toMatchObject({status:404});await mutateReadingList(owner,owned[0].id,'add',{book_id:alias.id});expect((await getReadingList(owner,owned[0].id)).list.book_count).toBe(55);await mutateReadingList(owner,owned[0].id,'remove',{book_id:books[0].id});expect((await getReadingList(owner,owned[0].id)).list.book_count).toBe(54);expect((await sql`select count(*)::int n from reading_list_books where list_id=${owned[0].id} and book_id in(${alias.id},${books[0].id})`)[0].n).toBe(0);
      await mutateReadingList(owner,owned[0].id,'update',{name:'  Updated list  ',description:'Details',is_public:false});expect((await getReadingList(owner,owned[0].id)).list).toMatchObject({name:'Updated list',description:'Details',is_public:false});await expect(getReadingList(reader,owned[0].id)).rejects.toMatchObject({status:404});
      await expect(sql.begin(async tx=>{await tx`set local role authenticated`;await tx`update reading_lists set name='Bypass' where id=${owned[0].id}`;})).rejects.toMatchObject({code:'42501'});
      await sql`update users set is_banned=true where id=${owner}`;await expect(mutateReadingList(owner,owned[1].id,'add',{book_id:books[0].id})).rejects.toMatchObject({status:403});await sql`update users set is_banned=false where id=${owner}`;
      await mutateReadingList(owner,owned[0].id,'delete');expect(await mutateReadingList(owner,owned[0].id,'delete')).toMatchObject({deleted:true});expect((await sql`select count(*)::int n from books where id=${books[0].id}`)[0].n).toBe(1);
    }
    {
      const owner=crypto.randomUUID(),moderator=crypto.randomUUID(),independent=crypto.randomUUID();for(const [id,name]of [[owner,'appeals082_owner'],[moderator,'appeals082_mod'],[independent,'appeals082_independent']])await sql`select create_direct_account(${id},${name+'@example.test'},${name},${name})`;await sql`update users set is_moderator=true where id in(${moderator},${independent})`;
      const [book]=await sql`insert into books(title,author_name) values('Owned appeal edition 082','Writer') returning id`;const quotes=await sql`insert into quotes(user_id,book_id,content,is_hidden) select ${owner},${book.id},'An owned moderated passage '||n,true from generate_series(1,26)n returning id`;
      const reports=[];for(const quote of quotes){const [report]=await sql`insert into content_reports(reporter_id,entity_type,entity_id,reason,status,moderator_id,moderator_note,resolved_at) values(${moderator},'quote',${quote.id},'PRIVATE REPORTER TEXT','removed',${moderator},'A public decision note','2026-01-01') returning id`;reports.push(report);}
      const {getAppeals}=await import('@/lib/appeals');let page=await getAppeals(owner,'actions');expect(page.actions).toHaveLength(20);expect(JSON.stringify(page)).not.toContain('PRIVATE REPORTER TEXT');expect(page.actions![0]).toMatchObject({label:'Owned appeal edition 082',content_type:'quote',moderator_note:'A public decision note'});expect((await getAppeals(owner,'actions','pending',page.nextCursor)).actions).toHaveLength(6);expect((await getAppeals(independent,'actions')).actions).toHaveLength(0);await expect(getAppeals(owner,'queue')).rejects.toMatchObject({status:403});
      const {POST:submit}=await import('@/app/api/moderation/appeals/route');vi.mocked(getCurrentUser).mockResolvedValue({id:owner,email:'appeals082_owner@example.test'});const request=(key:string,body:unknown)=>new Request('https://app.test/api/moderation/appeals',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key,'X-Liravo-Actor':owner},body:JSON.stringify(body)});
      for(const [n,report]of reports.entries()){const response=await submit(request('appeal082-case-'+n,{reason:'Please reconsider this content decision.',report_id:report.id}));expect(response.status).toBe(201);}
      const general=await submit(request('appeal082-general',{reason:'Please reconsider my account warning.'}));expect(general.status).toBe(201);const data=await general.json();expect(data).toMatchObject({actorId:owner,appeal:{user_id:owner,report_id:null}});expect((await(await submit(request('appeal082-general',{reason:'Please reconsider my account warning.'}))).json()).appeal.id).toBe(data.appeal.id);
      const {getAppealReceipt}=await import('@/lib/appeals');expect((await getAppealReceipt(owner,'appeal082-general')).appeal.id).toBe(data.appeal.id);await expect(getAppealReceipt(independent,'appeal082-general')).rejects.toMatchObject({status:404});await expect(getAppealReceipt(owner,'appeal082-uncommitted')).rejects.toMatchObject({status:404});
      page=await getAppeals(owner,'mine');expect(page.appeals).toHaveLength(20);expect((await getAppeals(owner,'mine','pending',page.nextCursor)).appeals).toHaveLength(7);const ownActions=await getAppeals(owner,'actions');expect(ownActions.actions!.every(action=>action.pending_appeal_id)).toBe(true);
      const [linked]=await sql`select id from appeals where user_id=${owner} and report_id=${reports[0].id}`;expect((await sql`select appeal_document(${moderator},${linked.id},true) doc`)[0].doc.can_review).toBe(false);expect((await sql`select appeal_document(${independent},${linked.id},true) doc`)[0].doc.can_review).toBe(true);
      const [appeal]=await sql`select id from appeals where user_id=${owner} and report_id=${reports[0].id}`;await sql`select apply_community_intent(${independent},'appeal_review',${appeal.id},'appeal082-approved',${sql.json({status:'approved',note:'Restored after independent review.'})},null)`;expect((await sql`select is_hidden from quotes where id=${quotes[0].id}`)[0].is_hidden).toBe(false);expect((await getAppeals(owner,'mine')).appeals!.find(row=>row.id===appeal.id)?.status??(await sql`select status from appeals where id=${appeal.id}`)[0].status).toBe('approved');
      await expect(sql`select apply_community_intent(${moderator},'appeal_review',${(await sql`select id from appeals where report_id=${reports[1].id}`)[0].id},'appeal082-original-moderator',${sql.json({status:'approved',note:null})},null)`).rejects.toMatchObject({code:'P1003'});
      const foreign=await submit(request('appeal082-foreign',{reason:'An appeal with a foreign target.',content_type:'profile',content_id:moderator}));expect(foreign.status).toBe(403);expect((await submit(new Request('https://app.test/appeals',{method:'POST',body:'invalid-json'}))).status).toBe(400);
      const rows=[];let next:string|null=null;do{const result=await getAppeals(independent,'queue','all',next);rows.push(...result.appeals!);next=result.nextCursor;}while(next);expect(new Set(rows.map(row=>row.id)).size).toBe(rows.length);expect(rows.filter(row=>row.user_id===owner)).toHaveLength(27);
      expect((await sql`select has_function_privilege('authenticated','appeal_catalog_snapshot(uuid,text,text,timestamptz,uuid,integer)','EXECUTE') allowed`)[0].allowed).toBe(false);
    }
    {
      const reader=crypto.randomUUID(),lifetime=crypto.randomUUID(),recent=crypto.randomUUID(),restricted=crypto.randomUUID(),banned=crypto.randomUUID(),hidden=crypto.randomUUID();
      for(const [id,name,xp]of [[reader,'board083_reader',0],[lifetime,'board083_lifetime',9000],[recent,'board083_recent',200],[restricted,'board083_restricted',30000],[banned,'board083_banned',40000],[hidden,'board083_hidden',100]] as const){await sql`select create_direct_account(${id},${name+'@example.test'},${name},${name})`;await sql`update users set country='QA',xp=${xp},created_at='2025-01-01' where id=${id}`;}
      await sql`update users set profile_visibility='followers_only' where id=${restricted}`;await sql`update users set is_banned=true where id=${banned}`;await sql`insert into follows(follower_id,following_id) values(${reader},${lifetime}),(${reader},${recent})`;
      for(const [id,key,amount,at]of [[lifetime,'outside-week',100,'2026-10-25T23:59:59.999999Z'],[lifetime,'week-start',10,'2026-10-26T00:00:00Z'],[lifetime,'reversal',-3,'2026-10-28T00:00:00Z'],[recent,'previous-month',20,'2026-10-31T00:00:00Z'],[recent,'month-start',50,'2026-11-01T00:00:00Z'],[recent,'future',99,'2026-11-01T12:00:00.000001Z']] as const)await sql`insert into xp_ledger(user_id,event_key,amount,reason,created_at) values(${id},${'board083-'+key},${amount},'Isolated period boundary',${at}::text::timestamptz)`;
      const snapshot=async(type:string,period:string,country:string|null=null,now='2026-11-01T12:00:00Z')=>(await sql`select leaderboard_snapshot(${reader},${type},${period},${country},100,${now}::text::timestamptz) board`)[0].board;
      const weekly=await snapshot('national','weekly','QA'),monthly=await snapshot('national','monthly','QA'),alltime=await snapshot('national','alltime','QA');expect(new Date(weekly.periodStart).toISOString()).toBe('2026-10-26T00:00:00.000Z');expect(new Date(monthly.periodStart).toISOString()).toBe('2026-11-01T00:00:00.000Z');expect(weekly.leaderboard.find((row:{id:string})=>row.id===lifetime)).toMatchObject({xp:7,lifetime_xp:9000});expect(weekly.leaderboard.find((row:{id:string})=>row.id===recent)).toMatchObject({xp:70});expect(monthly.leaderboard.find((row:{id:string})=>row.id===recent)).toMatchObject({xp:50});expect(alltime.leaderboard[0]).toMatchObject({id:lifetime,xp:9000});expect(alltime.leaderboard.some((row:{id:string})=>[restricted,banned].includes(row.id))).toBe(false);
      expect((await snapshot('friends','weekly')).leaderboard.map((row:{id:string})=>row.id)).toEqual([recent,lifetime,reader]);await sql`insert into follows(follower_id,following_id) values(${reader},${restricted})`;expect((await snapshot('national','alltime','QA')).leaderboard[0].id).toBe(restricted);const yearBoundary=await snapshot('global','weekly',null,'2027-01-01T13:00:00+01:00');expect(new Date(yearBoundary.periodStart).toISOString()).toBe('2026-12-28T00:00:00.000Z');
      const books=await sql`insert into books(title,author_name) select 'Board 083 edition '||n,'Writer' from generate_series(1,1001)n returning id`;await sql`insert into reviews(user_id,book_id,rating,content,review_type,moderation_status,created_at,helpful_votes) select ${lifetime},id,4,'A useful published review.','short','published','2026-01-01',1 from books where id in ${sql(books.map(book=>book.id))}`;
      await sql`insert into review_helpfulness_votes(review_id,user_id,is_helpful,created_at) select id,${reader},true,case when row_number() over(order by id)<=500 then '2026-09-01'::timestamptz else '2026-10-27'::timestamptz end from reviews where user_id=${lifetime}`;
      const [recentReview]=await sql`insert into reviews(user_id,book_id,rating,content,review_type,moderation_status,created_at,helpful_votes) values(${recent},${books[0].id},4,'Another useful review.','short','published','2026-01-01',1) returning id`;const [hiddenReview]=await sql`insert into reviews(user_id,book_id,rating,content,review_type,moderation_status,is_hidden,helpful_votes) values(${hidden},${books[0].id},4,'A hidden review.','short','published',true,1000) returning id`;
      await sql`insert into review_helpfulness_votes(review_id,user_id,is_helpful,created_at) values(${recentReview.id},${reader},true,'2026-11-01'),(${hiddenReview.id},${reader},true,'2026-10-27')`;
      const reviewers=await snapshot('reviewers','weekly'),allReviewers=await snapshot('reviewers','alltime');expect(reviewers.leaderboard.find((row:{id:string})=>row.id===lifetime)).toMatchObject({helpful_votes:501,review_count:501});expect(allReviewers.leaderboard.find((row:{id:string})=>row.id===lifetime)).toMatchObject({helpful_votes:1001,review_count:1001});expect(reviewers.leaderboard.some((row:{id:string})=>row.id===hidden)).toBe(false);expect((await snapshot('reviewers','monthly')).leaderboard.find((row:{id:string})=>row.id===recent)).toMatchObject({helpful_votes:1,review_count:1});
      const [transition]=await sql`insert into reviews(user_id,book_id,rating,content,review_type,moderation_status,created_at) values(${hidden},${books[1].id},4,'A visible vote transition.','short','published','2000-01-01') returning id`;await sql`insert into review_helpfulness_votes(review_id,user_id,is_helpful,created_at) values(${transition.id},${reader},false,'2000-01-01')`;
      const started=Date.now();await sql`select apply_book_interaction(${reader},${books[1].id},'helpfulness','board083-change-old-vote',${transition.id},true)`;const [changed]=await sql`select created_at,cast_at,cast_at::text as cast_text from review_helpfulness_votes where review_id=${transition.id} and user_id=${reader}`;expect(changed.created_at.toISOString()).toBe('2000-01-01T00:00:00.000Z');expect(+changed.cast_at).toBeGreaterThanOrEqual(started);expect((await snapshot('reviewers','weekly',null,changed.cast_text)).leaderboard.find((row:{id:string})=>row.id===hidden)).toMatchObject({helpful_votes:1,review_count:1});
      expect((await sql`select has_function_privilege('authenticated','leaderboard_snapshot(uuid,text,text,text,integer,timestamptz)','EXECUTE') allowed`)[0].allowed).toBe(false);await expect(sql`select leaderboard_snapshot(${banned},'global','weekly')`).rejects.toMatchObject({code:'P1003'});
    }
    {
      const owner=crypto.randomUUID(),other=crypto.randomUUID(),banned=crypto.randomUUID();for(const[id,name]of[[owner,'discovery084_owner'],[other,'discovery084_other'],[banned,'discovery084_banned']])await sql`select create_direct_account(${id},${name+'@example.test'},${name},${name})`;await sql`update users set profile_visibility='followers_only' where id=${other}`;await sql`update users set is_banned=true where id=${banned}`;
      const[edition]=await sql`insert into books(title,author_name,page_count,language,format) values('Discovery canonical 084','Writer',100,'fr','paperback') returning id,work_id`;const[large]=await sql`insert into books(title,author_name,page_count,work_id,language,format) values('Discovery earlier large 084','Writer',500,${edition.work_id},'de','hardcover') returning id`;const[alias]=await sql`insert into books(title,author_name,page_count,work_id,canonical_edition_id) values('Retained discovery alias','Writer',999,${edition.work_id},${edition.id}) returning id`;const[secondWork]=await sql`insert into books(title,author_name,page_count) values('Discovery second work 084','Writer',150) returning id`;
      const quotes=await sql`insert into quotes(user_id,book_id,content,created_at) select ${owner},case when n<=20 then ${edition.id}::uuid else ${alias.id}::uuid end,'Tied quote '||n,'2026-01-01'::timestamptz from generate_series(1,23)n returning id`;await sql`insert into quotes(user_id,book_id,content) values(${owner},${large.id},'A distinct physical edition'),(${other},${edition.id},'Restricted profile passage'),(${banned},${edition.id},'Banned passage')`;await sql`insert into quotes(user_id,book_id,content,is_hidden)values(${owner},${edition.id},'Hidden passage',true)`;
      const {getReadingQuotes,getReadingDebates,getReadingDebate,getReadingChallenges,getReadingChallenge}=await import('@/lib/reading-discovery');const quotePage=await getReadingQuotes(owner);expect(quotePage.total).toBe(24);expect(quotePage.quotes).toHaveLength(20);const rest=await getReadingQuotes(owner,owner,null,quotePage.nextCursor);expect(rest.quotes).toHaveLength(4);expect(new Set([...quotePage.quotes,...rest.quotes].map(row=>row.id)).size).toBe(24);const bookQuotes=await getReadingQuotes(owner,owner,edition.id);expect(bookQuotes.total).toBe(23);expect(bookQuotes.quotes.every(row=>row.books.id===edition.id&&row.books.title==='Discovery canonical 084')).toBe(true);expect((await getReadingQuotes(owner,owner,large.id)).total).toBe(1);await expect(getReadingQuotes(owner,other)).rejects.toMatchObject({status:403});await sql`insert into follows(follower_id,following_id)values(${owner},${other})`;expect((await getReadingQuotes(owner,other)).total).toBe(1);await sql`delete from follows where follower_id=${owner} and following_id=${other}`;
      await expect(getReadingQuotes(other,other,null,quotePage.nextCursor)).rejects.toMatchObject({status:400});await expect(getReadingQuotes(owner,owner,edition.id,quotePage.nextCursor)).rejects.toMatchObject({status:400});expect(quotes).toHaveLength(23);
      await expect(sql`insert into book_debates(book_id,user_id,question)values(${edition.id},${owner},'     ')`).rejects.toMatchObject({code:'P1004'});const {POST:createDebate}=await import('@/app/api/debates/route');vi.mocked(getCurrentUser).mockResolvedValue({id:owner,email:'discovery084_owner@example.test'});const createRequest=()=>new Request('https://app.test/api/debates',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'debate084-created','X-Liravo-Actor':owner},body:JSON.stringify({book_id:edition.id,question:'  A recoverable edition question?  '})});const created=await createDebate(createRequest()as never);expect(created.status).toBe(201);const createdData=await created.json();expect(createdData).toMatchObject({actorId:owner,debate:{user_id:owner,book_id:edition.id,question:'A recoverable edition question?'}});expect((await(await createDebate(createRequest()as never)).json()).debate.id).toBe(createdData.debate.id);await sql`update book_debates set is_active=false where id=${createdData.debate.id}`;
      const debates=await sql`insert into book_debates(book_id,user_id,question,created_at)select ${alias.id},${owner},'Discovery question '||n||'?','2026-01-01'::timestamptz from generate_series(1,55)n returning id`;const[privateDebate]=await sql`insert into book_debates(book_id,user_id,question)values(${edition.id},${other},'A restricted question?')returning id`;const[closed]=await sql`insert into book_debates(book_id,user_id,question,is_active)values(${edition.id},${owner},'A closed question?',false)returning id`;const collected=[];let cursor:string|null=null;do{const result=await getReadingDebates(owner,'active',cursor);collected.push(...result.debates);cursor=result.nextCursor;}while(cursor);const ownDebates=collected.filter(row=>row.user_id===owner);expect(ownDebates).toHaveLength(55);expect(new Set(collected.map(row=>row.id)).size).toBe(collected.length);expect(ownDebates.every(row=>row.book.id===edition.id)).toBe(true);expect((await getReadingDebates(null)).debates.every(row=>!row.can_vote&&row.current_vote===null)).toBe(true);await expect(getReadingDebate(null,privateDebate.id)).rejects.toMatchObject({status:404});expect((await getReadingDebate(other,privateDebate.id)).debate.can_share).toBe(false);
      const {POST:vote}=await import('@/app/api/debates/[id]/vote/route');vi.mocked(getCurrentUser).mockResolvedValue({id:other,email:'discovery084_other@example.test'});const voteRequest=(value:string)=>new Request('https://app.test/api/debates/'+debates[0].id+'/vote',{method:'POST',headers:{'Content-Type':'application/json','X-Liravo-Actor':other},body:JSON.stringify({vote:value})});const result=await vote(voteRequest('yes'),{params:{id:debates[0].id}});expect(await result.json()).toMatchObject({actorId:other,debateId:debates[0].id,vote:'yes',yes_count:1,no_count:0});expect((await vote(voteRequest('yes'),{params:{id:debates[0].id}})).status).toBe(200);await sql`update book_debates set is_active=false where id=${debates[0].id}`;expect((await vote(voteRequest('yes'),{params:{id:debates[0].id}})).status).toBe(200);expect((await vote(voteRequest('no'),{params:{id:debates[0].id}})).status).toBe(409);expect((await getReadingDebates(other,'mine')).debates.some(row=>row.id===debates[0].id&&row.current_vote==='yes'&&!row.can_vote)).toBe(true);expect((await getReadingDebates(owner,'mine')).debates.some(row=>row.id===closed.id)).toBe(true);
      const active=await sql`insert into challenges(title,type,cadence,goal_books,created_at)select 'Discovery challenge '||n,'reading','weekly',5,'2026-01-01'::timestamptz from generate_series(1,105)n returning id`;const[challenge]=await sql`insert into challenges(title,type,cadence,goal_books,goal_pages,start_date,end_date)values('Discovery progress 084','reading','monthly',5,1000,now()-interval '14 days',now()+interval '14 days')returning id`;await sql`insert into challenge_participants(challenge_id,user_id,joined_at)values(${challenge.id},${owner},now()-interval '14 days'),(${challenge.id},${other},now()-interval '14 days')`;
      for(let n=0;n<51;n++){const id=crypto.randomUUID(),name='discovery084_member'+n;await sql`select create_direct_account(${id},${name+'@example.test'},${name},${name})`;await sql`insert into challenge_participants(challenge_id,user_id)values(${challenge.id},${id})`;}
      const[shelf]=await sql`select id from shelves where user_id=${owner} and default_type='have_read'`;await sql`insert into shelf_books(shelf_id,user_id,book_id,finished_at)values(${shelf.id},${owner},${large.id},(now()at time zone 'UTC')::date-5),(${shelf.id},${owner},${edition.id},(now()at time zone 'UTC')::date-2),(${shelf.id},${owner},${alias.id},(now()at time zone 'UTC')::date-1),(${shelf.id},${owner},${secondWork.id},(now()at time zone 'UTC')::date)`;
      let detail=await getReadingChallenge(owner,challenge.id);expect(detail.challenge).toMatchObject({participant_count:53,joined:true,can_join:false});expect(detail.progress).toMatchObject({booksFinished:2,pagesRead:250});const members=[...detail.participants];while(detail.participantsNextCursor){detail=await getReadingChallenge(owner,challenge.id,detail.participantsNextCursor);members.push(...detail.participants);}expect(members).toHaveLength(53);expect(new Set(members.map(row=>row.id)).size).toBe(53);
      const challengeRows:import('@/types/database').ReadingChallenge[]=[];cursor=null;do{const result=await getReadingChallenges(owner,'active',cursor);challengeRows.push(...result.challenges);cursor=result.nextCursor;}while(cursor);expect(active.every(row=>challengeRows.some(value=>value.id===row.id))).toBe(true);expect(new Set(challengeRows.map(row=>row.id)).size).toBe(challengeRows.length);await sql`update challenges set is_active=false where id=${challenge.id}`;expect((await getReadingChallenges(owner,'mine')).challenges.some(row=>row.id===challenge.id)).toBe(true);expect((await sql`select join_reading_challenge(${owner},${challenge.id})result`)[0].result).toMatchObject({joined:true,success:true});const newcomer=crypto.randomUUID();await sql`select create_direct_account(${newcomer},'discovery084_new@example.test','discovery084_new','New reader')`;await expect(sql`select join_reading_challenge(${newcomer},${challenge.id})`).rejects.toMatchObject({code:'P1004'});
      const[window]=await sql`insert into challenges(title,type,cadence,goal_books,goal_pages,start_date,end_date,is_active)values('UTC completion dates 084','reading','weekly',5,1000,'2026-02-01T00:30:00Z','2026-02-03T00:00:00Z',false)returning id`;await sql`insert into challenge_participants(challenge_id,user_id,joined_at)values(${window.id},${owner},'2026-02-01T00:30:00Z')`;await sql`update shelf_books set finished_at=case when book_id=${large.id} then '2026-01-31'::date when book_id=${secondWork.id} then '2026-02-03'::date else '2026-02-01'::date end where user_id=${owner}`;await sql.begin(async tx=>{await tx`set local time zone 'America/New_York'`;expect((await tx`select reading_challenge_progress(${owner},${window.id})result`)[0].result.progress).toMatchObject({booksFinished:1,pagesRead:100});});
      for(const routine of['quote_catalog_snapshot(uuid,uuid,uuid,timestamptz,uuid,integer)','debate_detail_snapshot(uuid,uuid)','reading_challenge_detail_snapshot(uuid,uuid,timestamptz,uuid,integer)'])expect((await sql`select has_function_privilege('authenticated',${routine},'EXECUTE')allowed`)[0].allowed).toBe(false);
    }
    {
      const reader={id:crypto.randomUUID()};await sql`select create_direct_account(${reader.id},'taste085@example.test','taste_editions_085','Taste editions')`;await sql`update users set premium_override=true where id=${reader.id}`;
      const [shelf]=await sql`select id from shelves where user_id=${reader.id} and default_type='have_read'`;
      const [first]=await sql`insert into books(title,author_name,genres)values('Older taste edition','Taste author',array['Horror'])returning id,work_id`;
      const [latest]=await sql`insert into books(title,author_name,genres,work_id)values('Latest taste edition','Taste author',array['Fantasy'],${first.work_id})returning id`;
      const [alias]=await sql`insert into books(title,author_name,genres,work_id,canonical_edition_id)values('Retained taste alias','Taste author',array['Wrong alias genre'],${first.work_id},${latest.id})returning id`;
      for(const [id,date]of[[first.id,'2026-01-01'],[latest.id,'2026-02-01'],[alias.id,'2026-03-01']])await sql`insert into shelf_books(user_id,shelf_id,book_id,finished_at)values(${reader.id},${shelf.id},${id},${date})`;
      await sql`insert into reviews(user_id,book_id,rating,mood_tags,content)values(${reader.id},${alias.id},5,array['Cozy'],'Alias reading preferences.')`;
      const {readTasteProfile}=await import('@/services/ai-profiles');expect((await readTasteProfile(reader.id)).eligible).toBe(false);
      let source=(await sql`select taste_profile_input(${reader.id})source`)[0].source;expect(source.books).toHaveLength(1);expect(source.books[0]).toMatchObject({id:latest.id,title:'Latest taste edition',genres:['Fantasy'],review:{moods:['Cozy']}});
      const [custom]=await sql`insert into shelves(user_id,name,is_default)values(${reader.id},'Not completed',false)returning id`;
      const [outside]=await sql`insert into books(title,author_name)values('Custom shelf only','Taste author')returning id`;await sql`insert into shelf_books(user_id,shelf_id,book_id,finished_at)values(${reader.id},${custom.id},${outside.id},'2026-12-31')`;
      const extra=await sql`insert into books(title,author_name,genres)select 'Other taste work '||n,'Taste author',array['Poetry']from generate_series(1,25)n returning id`;
      for(const [index,book]of extra.entries())await sql`insert into shelf_books(user_id,shelf_id,book_id,finished_at)values(${reader.id},${shelf.id},${book.id},${'2026-04-'+String(index+1).padStart(2,'0')})`;
      source=(await sql`select taste_profile_input(${reader.id})source`)[0].source;expect(source.books).toHaveLength(20);expect(new Set(source.books.map((book:{id:string})=>book.id)).size).toBe(20);expect(source.books.some((book:{id:string})=>[first.id,latest.id,alias.id,outside.id].includes(book.id))).toBe(false);expect(source.books[0].finished_at).toBe('2026-04-25');expect((await readTasteProfile(reader.id)).eligible).toBe(true);
      expect((await sql`select has_function_privilege('authenticated','taste_profile_input(uuid)','EXECUTE')allowed`)[0].allowed).toBe(false);
    }
    {
      const owner=crypto.randomUUID();await sql`select create_direct_account(${owner},'premium086@example.test','premium_status_086','Premium status')`;await sql`update users set is_premium=true,premium_override=false where id=${owner}`;
      const status=async()=>(await sql`select premium_status_snapshot(${owner})result`)[0].result;
      expect(await status()).toEqual({active:false,subscriptions:[]});
      await sql`insert into subscriptions(user_id,provider,status,amount,currency,current_period_end,renewal_cancelled)values(${owner},'google_play','active',4.99,'USD',now()-interval '1 day',false),(${owner},'google_play','active',4.99,'USD',null,false)`;
      expect(await status()).toEqual({active:false,subscriptions:[]});
      const [paid]=await sql`insert into subscriptions(user_id,provider,status,amount,currency,current_period_end,renewal_cancelled)values(${owner},'google_play','active',4.99,'USD',now()+interval '14 days',true)returning id`;
      expect(await status()).toMatchObject({active:true,subscriptions:[{provider:'google_play',renewalCancelled:true}]});await sql`update subscriptions set current_period_end=now()-interval '1 second' where id=${paid.id}`;expect((await status()).active).toBe(false);
      const [legacy]=await sql`insert into subscriptions(user_id,provider,status,amount,currency,current_period_end)values(${owner},'dodopayments','active',4.99,'USD',null)returning id`;expect(await status()).toEqual({active:false,subscriptions:[]});await sql`update subscriptions set status='cancelled' where id=${legacy.id}`;await sql`update users set premium_override=true where id=${owner}`;expect(await status()).toEqual({active:true,subscriptions:[]});
      await sql`update users set is_banned=true where id=${owner}`;await expect(status()).rejects.toMatchObject({code:'P1003'});await sql`update users set is_banned=false,deleted_at=now() where id=${owner}`;await expect(status()).rejects.toMatchObject({code:'P1003'});
      for(const role of['anon','authenticated'])expect((await sql`select has_function_privilege(${role},'premium_status_snapshot(uuid)','EXECUTE')allowed`)[0].allowed).toBe(false);
    }
    {
      const admin=crypto.randomUUID(),reader=crypto.randomUUID();await sql`select create_direct_account(${admin},'admin087@example.test','admin087_staff','Admin catalog')`;await sql`select create_direct_account(${reader},'admin087reader@example.test','admin087_reader','Catalog reader')`;await sql`update users set is_admin=true where id=${admin}`;
      for(let n=0;n<27;n++)await sql`select create_direct_account(${crypto.randomUUID()},${'admin087reader'+n+'@example.test'},${'admin087_reader'+n},${'Catalog reader '+n})`;
      const books=await sql`insert into books(title,author_name,created_at)select 'Admin087 books '||n,'Catalog writer','2026-10-01T12:00:00.123456Z'::timestamptz from generate_series(1,55)n returning id`;
      await sql`insert into custom_themes(name,css_overrides,is_active,created_at)select 'Admin087 theme '||n,'',false,'2026-10-01T12:00:00.123456Z'::timestamptz from generate_series(1,27)n`;
      await sql`insert into seasonal_events(name,start_date,end_date)select 'Admin087 season '||n,'2026-10-01T12:00:00.123456Z'::timestamptz,'2026-11-01'::timestamptz from generate_series(1,105)n`;
      await sql`insert into promoted_listings(book_id,start_date,end_date)select ${books[0].id},'2026-10-01'::timestamptz,'2026-11-01'::timestamptz from generate_series(1,105)n`;
      await sql`insert into writing_challenges(title,type,is_active)select 'Admin087 challenge '||n,'weekly',false from generate_series(1,27)n`;
      const snapshot=async(scope:string,search='',cursor:{at:string;key:string}|null=null)=>(await sql`select admin_catalog_snapshot(${admin},${scope},${search},${cursor?.at??null}::text::timestamptz,${cursor?.key??null},25,0)data`)[0].data;
      for(const scope of['users','books','themes','promotions','seasons','writing']){const search=scope==='users'?'admin087_reader':scope==='books'?'Admin087':'';let page=await snapshot(scope,search),rows=page.rows.slice(0,25),next=page.rows.length>25?rows.at(-1):null;while(next){page=await snapshot(scope,search,next);rows.push(...page.rows.slice(0,25));next=page.rows.length>25?page.rows[24]:null;}expect(rows).toHaveLength(page.total);expect(new Set(rows.map((row:{key:string})=>row.key)).size).toBe(rows.length);if(scope==='users'){expect(rows).toHaveLength(28);expect(rows[0].item).toHaveProperty('display_name');expect(rows[0].item).toHaveProperty('avatar_url');for(const row of rows){expect(row.item).not.toHaveProperty('password_hash');expect(row.item).not.toHaveProperty('pin_hash');expect(row.item).not.toHaveProperty('totp_secret');}}if(scope==='books')expect(rows).toHaveLength(55);if(scope==='themes')expect(rows.some((row:{key:string})=>row.key==='Admin087 theme 27')).toBe(true);}
      vi.mocked(getCurrentUser).mockResolvedValue({id:admin,email:'admin087@example.test'});const {adminCatalogResponse}=await import('@/lib/admin-catalog');let cursor:string|null=null;const ids:string[]=[];do{const response=await adminCatalogResponse(new Request('https://app.test/admin?search=Admin087'+(cursor?'&cursor='+encodeURIComponent(cursor):'')),'books','books');expect(response.status).toBe(200);const data=await response.json();ids.push(...data.books.map((book:{id:string})=>book.id));cursor=data.nextCursor;}while(cursor);expect(ids).toHaveLength(55);expect(new Set(ids).size).toBe(55);
      const {PATCH:updateUser}=await import('@/app/api/admin/users/route');const update=()=>updateUser(new Request('https://app.test/admin/users',{method:'PATCH',headers:{'Content-Type':'application/json','Idempotency-Key':'admin087-owned-suspension','X-Liravo-Actor':admin},body:JSON.stringify({userId:reader,is_suspended:true})}));expect(await(await update()).json()).toMatchObject({actorId:admin,userId:reader,updated:true});expect((await update()).status).toBe(200);expect((await sql`select count(*)::int n from moderation_log where target_user_id=${reader} and action='suspend_user'`)[0].n).toBe(1);
      await expect(sql`select admin_catalog_snapshot(${reader},'users')`).rejects.toMatchObject({code:'P1003'});await expect(sql`select admin_catalog_snapshot(${admin},'users; drop table users')`).rejects.toMatchObject({code:'P1004'});expect((await sql`select has_function_privilege('authenticated','admin_catalog_snapshot(uuid,text,text,timestamptz,text,integer,integer)','EXECUTE')allowed`)[0].allowed).toBe(false);await sql`update users set is_admin=false where id=${admin}`;await expect(sql`select admin_catalog_snapshot(${admin},'users')`).rejects.toMatchObject({code:'P1003'});
    }
    {
      const admin=crypto.randomUUID(),reader=crypto.randomUUID();await sql`select create_direct_account(${admin},'admin088@example.test','admin088_staff','Edition administrator')`;await sql`select create_direct_account(${reader},'admin088reader@example.test','admin088_reader','Edition reader')`;await sql`update users set is_admin=true where id=${admin}`;
      const prefix='979999999901',isbn=prefix+String((10-[...prefix].reduce((sum,digit,index)=>sum+Number(digit)*(index%2?3:1),0)%10)%10);
      const [book]=await sql`insert into books(title,author_name,isbn_13,language,format)values('Edition088 selected','Edition author',${isbn},'fr','paperback')returning id,work_id`;
      const [alias]=await sql`insert into books(title,author_name,work_id,canonical_edition_id)values('Edition088 retained alias','Edition author',${book.work_id},${book.id})returning id`;
      const [other]=await sql`insert into books(title,author_name,work_id,language,format)values('Edition088 other','Edition author',${book.work_id},'de','hardcover')returning id`;
      await sql`insert into affiliate_link_clicks(book_id,user_id_hash,link_type,store_name,country,is_affiliate)select ${book.id},repeat('a',64),'secondary','Fixture store','FR',true from generate_series(1,1005)n`;await sql`insert into affiliate_link_clicks(book_id,user_id_hash,link_type,store_name,country,is_affiliate)select ${alias.id},repeat('a',64),'secondary','Fixture store','FR',n<=5 from generate_series(1,12)n`;
      const[shelf]=await sql`select id from shelves where user_id=${reader} and default_type='have_read'`;for(const id of[book.id,alias.id])await sql`insert into shelf_books(user_id,shelf_id,book_id)values(${reader},${shelf.id},${id})`;
      const snapshot=(await sql`select admin_catalog_snapshot(${admin},'books','Edition088')data`)[0].data;expect(snapshot.total).toBe(2);expect(snapshot.rows.map((row:{item:{id:string}})=>row.item.id)).not.toContain(alias.id);expect(snapshot.rows.find((row:{item:{id:string}})=>row.item.id===book.id).item).toMatchObject({affiliate_click_count:1010,have_read_count:1,language:'fr',format:'paperback'});expect((await sql`select admin_catalog_snapshot(${admin},'books',${isbn})data`)[0].data.rows[0].item.id).toBe(book.id);
      const mutate=()=>sql`select set_admin_edition_audiobook(${admin},${alias.id},true)result`;expect((await mutate())[0].result).toMatchObject({updated:true,actorId:admin,bookId:alias.id,editionId:book.id,has_audiobook:true});const before=(await sql`select updated_at::text value from books where id=${book.id}`)[0].value;expect((await mutate())[0].result.has_audiobook).toBe(true);expect((await sql`select updated_at::text value from books where id=${book.id}`)[0].value).toBe(before);expect((await sql`select has_audiobook from books where id=${other.id}`)[0].has_audiobook).toBe(false);expect((await sql`select catalog_book_snapshot(${alias.id})data`)[0].data.has_audiobook).toBe(true);
      await expect(sql`select set_admin_edition_audiobook(${admin},${crypto.randomUUID()},true)`).rejects.toMatchObject({code:'P1005'});await expect(sql`select set_admin_edition_audiobook(${reader},${book.id},true)`).rejects.toMatchObject({code:'P1003'});await sql`update users set is_admin=false where id=${admin}`;await expect(mutate()).rejects.toMatchObject({code:'P1003'});
      for(const role of['anon','authenticated'])for(const routine of['admin_edition_audiobook_snapshot(uuid,uuid)','set_admin_edition_audiobook(uuid,uuid,boolean)'])expect((await sql`select has_function_privilege(${role},${routine},'EXECUTE')allowed`)[0].allowed).toBe(false);
    }
    {
      const admin=crypto.randomUUID(),moderator=crypto.randomUUID(),reader=crypto.randomUUID();
      for(const [user,name]of [[admin,'admin'],[moderator,'moderator'],[reader,'reader']])await sql`select create_direct_account(${user},${name+'089@example.test'},${name+'089'},${name+' 089'})`;
      await sql`update users set is_admin=true where id=${admin}`;await sql`update users set is_moderator=true where id=${moderator}`;
      const [book]=await sql`insert into books(title,author_name)values('Moderation089 book','Writer')returning id`;
      const [review]=await sql`insert into reviews(user_id,book_id,rating,content)values(${reader},${book.id},4,'<p>Reading &amp; reflection</p>')returning id`;
      await sql`insert into content_reports(reporter_id,entity_type,entity_id,reason,created_at)select ${reader},'review',${review.id},'Moderation089 report '||n,'2026-11-04T00:00:00.123456Z'::timestamptz from generate_series(1,45)n`;
      const snapshot=async(user:string,scope='reports',status='pending',cursor:{at:string;key:string}|null=null)=>(await sql`select moderation_catalog_snapshot(${user},${scope},${status},${cursor?.at??null}::text::timestamptz,${cursor?.key??null}::uuid,20,0)data`)[0].data;
      let page=await snapshot(admin),rows=page.rows.slice(0,20),cursor=page.rows.length>20?rows.at(-1):null;
      while(cursor){page=await snapshot(admin,'reports','pending',cursor);rows.push(...page.rows.slice(0,20));cursor=page.rows.length>20?page.rows[19]:null;}
      expect(rows).toHaveLength(page.total);expect(new Set(rows.map((row:{key:string})=>row.key)).size).toBe(rows.length);expect(rows.filter((row:{item:{reason:string}})=>row.item.reason.startsWith('Moderation089'))).toHaveLength(45);
      const target=rows.find((row:{item:{reason:string}})=>row.item.reason==='Moderation089 report 1').item;
      expect(target).toMatchObject({reporter:{username:'reader089'},target:{owner_id:reader,label:'Moderation089 book'},allowed_actions:['approve','remove','warn','escalate']});expect(JSON.stringify(target)).not.toContain('password_hash');
      await sql`update users set is_moderator=true where id=${reader}`;expect((await sql`select moderation_report_document(${reader},${target.id},false)data`)[0].data.allowed_actions).toEqual([]);await sql`update users set is_moderator=false where id=${reader}`;
      await sql`update content_reports set status='escalated' where id=${target.id}`;expect((await snapshot(moderator,'reports','escalated')).rows.find((row:{key:string})=>row.key===target.id).item.allowed_actions).toEqual([]);
      const [userReport]=await sql`insert into content_reports(reporter_id,entity_type,entity_id,reason)values(${reader},'user',${reader},'Account report')returning id`;
      expect((await snapshot(moderator)).rows.find((row:{key:string})=>row.key===userReport.id).item.allowed_actions).not.toContain('remove');
      const decide=()=>sql`select apply_community_intent(${admin},'report_review',${target.id},'moderation089-owned',${sql.json({status:'approved',note:'Checked'})})data`;
      const decision=(await decide())[0].data;expect((await decide())[0].data).toEqual(decision);expect((await sql`select moderation_receipt_snapshot(${admin},${target.id},'moderation089-owned')data`)[0].data).toEqual(decision);
      expect((await snapshot(admin,'log')).rows.some((row:{item:{report_id:string;moderator:{username:string};action:string}})=>row.item.report_id===target.id&&row.item.action==='approved'&&row.item.moderator.username==='admin089')).toBe(true);
      await expect(snapshot(moderator,'log')).rejects.toMatchObject({code:'P1003'});await expect(snapshot(reader)).rejects.toMatchObject({code:'P1003'});await expect(snapshot(admin,'reports','bogus')).rejects.toMatchObject({code:'P1004'});await expect(sql`select moderation_receipt_snapshot(${moderator},${target.id},'moderation089-owned')`).rejects.toMatchObject({code:'P1005'});
      await sql`update users set is_admin=false where id=${admin}`;await expect(snapshot(admin)).rejects.toMatchObject({code:'P1003'});await expect(sql`select moderation_receipt_snapshot(${admin},${target.id},'moderation089-owned')`).rejects.toMatchObject({code:'P1003'});
      for(const role of['anon','authenticated'])for(const routine of['moderation_report_document(uuid,uuid,boolean)','moderation_catalog_snapshot(uuid,text,text,timestamptz,uuid,integer,integer)','moderation_receipt_snapshot(uuid,uuid,text)'])expect((await sql`select has_function_privilege(${role},${routine},'EXECUTE')allowed`)[0].allowed).toBe(false);
    }
    {
      const owner=crypto.randomUUID(),reader=crypto.randomUUID(),other=crypto.randomUUID();for(const[user,name]of[[owner,'owner'],[reader,'reader'],[other,'other']])await sql`select create_direct_account(${user},${name+'090@example.test'},${name+'090'},${name+' 090'})`;
      await sql`insert into follows(follower_id,following_id)values(${owner},${reader}),(${reader},${owner})`;
      const[book]=await sql`insert into books(title,author_name,language,format)values('Pass090 selected','Writer','fr','paperback')returning id,work_id`;
      const[alias]=await sql`insert into books(title,author_name,work_id,canonical_edition_id)values('Pass090 alias','Writer',${book.work_id},${book.id})returning id`;
      await sql`insert into pass_the_book_chains(book_id,creator_id,created_at)select ${alias.id},${owner},'2026-11-04T00:00:00.123456Z'::timestamptz from generate_series(1,45)n`;
      await sql`insert into book_passes(sender_id,recipient_id,book_id,message,created_at)select ${owner},${reader},${alias.id},'Pass090','2026-11-04T00:00:00.123456Z'::timestamptz from generate_series(1,45)n`;
      await sql`insert into book_passes(sender_id,recipient_id,book_id,message,created_at)select ${reader},${owner},${book.id},'Return090','2026-11-04T00:00:00.123456Z'::timestamptz from generate_series(1,45)n`;
      const catalog=async(scope:string,cursor:{created_at:string;id:string}|null=null)=>(await sql`select book_pass_catalog_snapshot(${owner},${scope},${cursor?.created_at??null}::text::timestamptz,${cursor?.id??null}::uuid,20)data`)[0].data;
      for(const scope of['chains','sent','received']){let page=await catalog(scope),items=page.items.slice(0,20),cursor=page.items.length>20?items.at(-1):null;while(cursor){page=await catalog(scope,cursor);items.push(...page.items.slice(0,20));cursor=page.items.length>20?page.items[19]:null;}expect(items).toHaveLength(page.total);expect(new Set(items.map((item:{id:string})=>item.id)).size).toBe(items.length);if(scope!=='chains'){expect(items).toHaveLength(45);expect(items[0].book).toMatchObject({id:book.id,language:'fr',format:'paperback'});expect(items[0]).not.toHaveProperty('request_hash');}}
      expect((await sql`select book_pass_catalog_snapshot(${other},'sent')data`)[0].data.total).toBe(0);
      const start=()=>sql`select apply_book_chain_intent(${owner},'chain_create',${alias.id},'pass090-chain',${sql.json({note:'Start'})})data`;const receipt=(await start())[0].data,chain=receipt.chainId;expect(receipt).toMatchObject({actorId:owner,bookId:alias.id,chain:{book_id:alias.id,creator_id:owner}});expect((await start())[0].data).toEqual(receipt);
      await sql`update users set deleted_at=now()where id=${reader}`;
      await expect(sql`select apply_book_chain_intent(${owner},'chain_nominate',${chain},'pass090-deleted',${sql.json({nominee_id:reader,note:null})})`).rejects.toMatchObject({code:'P1003'});
      await expect(sql`insert into book_passes(sender_id,recipient_id,book_id)values(${owner},${reader},${book.id})`).rejects.toMatchObject({code:'P1003'});expect((await sql`select count(*)::int n from pass_the_book_nodes where chain_id=${chain}`)[0].n).toBe(1);expect((await sql`select count(*)::int n from content_intents where actor_id=${owner} and intent_key='pass090-deleted'`)[0].n).toBe(0);await sql`update users set deleted_at=null where id=${reader}`;
      const nominations=await Promise.allSettled([reader,other].map((nominee,index)=>sql`select apply_book_chain_intent(${owner},'chain_nominate',${chain},${'pass090-nominate'+index},${sql.json({nominee_id:nominee,note:'Next'})})data`));expect(nominations.filter(result=>result.status==='fulfilled')).toHaveLength(1);const nominated=(nominations.find(result=>result.status==='fulfilled')as PromiseFulfilledResult<any>).value[0].data;expect(nominated).toMatchObject({actorId:owner,chainId:chain,success:true,position:1});
      const[rosterChain]=await sql`insert into pass_the_book_chains(book_id,creator_id)values(${book.id},${owner})returning id`;
      await sql`insert into pass_the_book_nodes(chain_id,user_id,position)select ${rosterChain.id},id,(row_number()over(order by id)/2)::int from users where not is_banned and deleted_at is null limit 45`;
      const roster=async(position=-1,id:string|null=null)=>(await sql`select book_chain_roster_snapshot(${owner},${rosterChain.id},${position},${id}::uuid,20)data`)[0].data;
      let page=await roster(),nodes=page.nodes.slice(0,20),cursor=page.nodes.length>20?nodes.at(-1):null;while(cursor){page=await roster(cursor.position,cursor.id);nodes.push(...page.nodes.slice(0,20));cursor=page.nodes.length>20?page.nodes[19]:null;}expect(nodes).toHaveLength(45);expect(new Set(nodes.map((node:{id:string})=>node.id)).size).toBe(45);
      expect((await sql`select book_pass_receipt_snapshot(${owner},'chain_create','pass090-chain')data`)[0].data).toEqual(receipt);await expect(sql`select book_pass_receipt_snapshot(${reader},'chain_create','pass090-chain')`).rejects.toMatchObject({code:'P1005'});
      await sql`update users set deleted_at=now()where id=${owner}`;await expect(catalog('sent')).rejects.toMatchObject({code:'P1003'});await expect(start()).rejects.toMatchObject({code:'P1003'});await expect(sql`select book_pass_receipt_snapshot(${owner},'chain_create','pass090-chain')`).rejects.toMatchObject({code:'P1003'});
      for(const role of['anon','authenticated'])for(const routine of['book_chain_node_document(uuid)','book_pass_catalog_snapshot(uuid,text,timestamptz,uuid,integer)','book_chain_roster_snapshot(uuid,uuid,integer,uuid,integer)','apply_book_chain_intent(uuid,text,uuid,text,jsonb,text)','book_pass_receipt_snapshot(uuid,text,text)'])expect((await sql`select has_function_privilege(${role},${routine},'EXECUTE')allowed`)[0].allowed).toBe(false);
    }
    {
      await sql`update release_email_campaigns set audience_complete=true`;
      const author=crypto.randomUUID();await sql`select create_direct_account(${author},'author092@example.test','author092','Release author')`;await sql`update users set is_verified_author=true where id=${author}`;
      await sql`select create_direct_account(gen_random_uuid(),'paid092_'||n||'@example.test','paid092_'||n,'Paid reader '||n)from generate_series(1,505)n`;
      await sql`update users set email_verified=true,premium_override=true,is_premium=false,notify_new_releases=true,preferred_locale='fr' where username like 'paid092_%'`;
      await sql`update users set notify_new_releases=false where username='paid092_502'`;await sql`update users set is_banned=true where username='paid092_503'`;await sql`update users set email_verified=false where username='paid092_504'`;await sql`update users set premium_override=false where username='paid092_505'`;
      const[book]=await sql`insert into books(title,author_name,language,format)values('Paid092 selected','Release writer','fr','paperback')returning id,work_id`;
      const[alias]=await sql`insert into books(title,author_name,work_id,canonical_edition_id)values('Paid092 alias','Release writer',${book.work_id},${book.id})returning id`;
      await sql`insert into author_work_claims(author_id,work_id)values(${author},${book.work_id})`;
      await sql`insert into follows(follower_id,following_id,created_at)select id,${author},now()-interval '1 day' from users where username like 'paid092_%'`;
      const[post]=await sql`insert into author_posts(author_id,title,body,type,book_id)values(${author},'Release092','A new release','announcement',${alias.id})returning id`;
      const[blog]=await sql`insert into author_posts(author_id,title,body,type,book_id)values(${author},'Blog092','A linked blog','blog',${book.id})returning id`;expect((await sql`select count(*)::int n from release_email_campaigns where post_id=${blog.id}`)[0].n).toBe(0);
      const recipients=new Set<string>();let first:any;
      const finish=(claim:any,status='sent',message:string|null='fixture-message')=>sql`select finish_paid_email('new_release_alert',${claim.userId},${claim.claimId},${status},${message},null,${claim.postId})ok`;
      for(let round=0;round<20;round++){
        await sql`select queue_release_email_audience(1,100)`;
        while(true){const batch=(await sql`select claim_release_email_batch(20)data`)[0].data;if(!batch.examined)break;for(const claim of batch.claims){expect(recipients.has(claim.userId)).toBe(false);recipients.add(claim.userId);first??=claim;expect(claim).toMatchObject({postId:post.id,bookId:book.id,locale:'fr'});expect(claim.unsubscribeToken).toMatch(/^[a-f0-9]{64}$/);expect((await finish(claim))[0].ok).toBe(true);}}
        if((await sql`select audience_complete from release_email_campaigns where post_id=${post.id}`)[0].audience_complete)break;
      }
      expect(recipients.size).toBe(501);expect((await sql`select count(*)::int n from release_email_deliveries where post_id=${post.id} and status='sent'`)[0].n).toBe(501);expect((await sql`select claim_release_email_batch(20)data`)[0].data.examined).toBe(0);expect((await finish(first))[0].ok).toBe(true);expect((await finish({...first,claimId:crypto.randomUUID()}))[0].ok).toBe(false);
      const tokenHash=(await sql`select encode(sha256(convert_to(${first.unsubscribeToken},'UTF8')),'hex')value`)[0].value;expect((await sql`select token_hash from email_unsubscribe_proofs where token_hash=${tokenHash}`)[0].token_hash).not.toBe(first.unsubscribeToken);
      expect((await sql`select consume_email_unsubscribe(${tokenHash})ok`)[0].ok).toBe(true);expect((await sql`select consume_email_unsubscribe(${tokenHash})ok`)[0].ok).toBe(true);expect((await sql`select notify_new_releases,email_digest_enabled from users where id=${first.userId}`)[0]).toMatchObject({notify_new_releases:false,email_digest_enabled:true});await sql`update users set notify_new_releases=true where id=${first.userId}`;expect((await sql`select consume_email_unsubscribe(${tokenHash})ok`)[0].ok).toBe(false);
      const[newPost]=await sql`insert into author_posts(author_id,title,body,type,book_id)values(${author},'Retry092','Retry release','announcement',${book.id})returning id`;
      await sql`insert into release_email_deliveries(post_id,user_id)values(${newPost.id},${first.userId})`;
      let claim=(await sql`select claim_release_email_batch(1)data`)[0].data.claims[0];expect((await finish(claim,'failed',null))[0].ok).toBe(true);expect((await sql`select claim_release_email_batch(1)data`)[0].data.examined).toBe(0);await sql`update release_email_deliveries set updated_at=now()-interval '6 minutes' where post_id=${newPost.id} and user_id=${first.userId}`;const oldClaim=claim;claim=(await sql`select claim_release_email_batch(1)data`)[0].data.claims[0];expect(claim.claimId).not.toBe(oldClaim.claimId);expect((await finish(oldClaim))[0].ok).toBe(false);await finish(claim,'unknown',null);expect((await sql`select claim_release_email_batch(1)data`)[0].data.examined).toBe(0);await sql`update release_email_deliveries set status='sending',updated_at=now()-interval '6 minutes' where post_id=${newPost.id} and user_id=${first.userId}`;expect((await sql`select claim_release_email_batch(1)data`)[0].data.examined).toBe(0);expect((await sql`select status from release_email_deliveries where post_id=${newPost.id} and user_id=${first.userId}`)[0].status).toBe('unknown');
      await sql`insert into author_posts(author_id,title,body,type,book_id)select ${author},'Bulk092 '||n,'Another announcement','announcement',${book.id} from generate_series(1,53)n`;expect((await sql`select count(*)::int n from release_email_campaigns c join author_posts p on p.id=c.post_id where p.author_id=${author}`)[0].n).toBe(55);
      await sql`select queue_release_email_audience(1,100)`;await sql`update users set is_verified_author=false where id=${author}`;const withheld=(await sql`select claim_release_email_batch(20)data`)[0].data;expect(withheld.examined).toBeGreaterThan(0);expect(withheld.claims).toEqual([]);await sql`update users set is_verified_author=true where id=${author}`;
      const period=(await sql`select to_char(date_trunc('week',now()at time zone 'UTC'),'YYYY-MM-DD')value`)[0].value,shelves=await sql`select id from shelves where user_id=${first.userId} and default_type in('have_read','want_to_read')`;
      for(const shelf of shelves)for(const id of[book.id,alias.id])await sql`insert into shelf_books(user_id,shelf_id,book_id,added_at)values(${first.userId},${shelf.id},${id},${period}::date-interval '1 day')`;
      const digest=(await sql`select claim_paid_digest(${first.userId},${period}::date)data`)[0].data;expect(digest).toMatchObject({userId:first.userId,period,locale:'fr',stats:{booksThisWeek:1}});expect((await sql`select claim_paid_digest(${first.userId},${period}::date)data`)[0].data).toBeNull();expect((await sql`select finish_paid_email('weekly_digest',${digest.userId},${digest.claimId},'sent','digest-receipt',${period}::date,null)ok`)[0].ok).toBe(true);
      const oldPeriod=(await sql`select to_char(${period}::date-7,'YYYY-MM-DD')value`)[0].value;await sql`insert into notifications(user_id,type,message,created_at)values(${first.userId},'account_hardening','Older weekly event',${oldPeriod}::date-interval '1 day')`;expect((await sql`select claim_paid_digest(${first.userId},${oldPeriod}::date)data`)[0].data).toMatchObject({period:oldPeriod,stats:{newNotifications:1}});
      await sql`select queue_paid_digest_audience(10)`;expect((await sql`select count(*)::int n from digest_email_campaigns where period_start=${period}::date`)[0].n).toBe(1);
      const unsubscribeHash=(await sql`select encode(sha256(convert_to(${digest.unsubscribeToken},'UTF8')),'hex')value`)[0].value;expect((await sql`select consume_email_unsubscribe(${unsubscribeHash})ok`)[0].ok).toBe(true);expect((await sql`select email_digest_enabled,notify_new_releases from users where id=${first.userId}`)[0]).toMatchObject({email_digest_enabled:false,notify_new_releases:true});
      const[expired]=await sql`select issue_email_unsubscribe(${first.userId},'weekly_digest')token`;await sql`update email_unsubscribe_proofs set expires_at=now()-interval '1 second' where token_hash=encode(sha256(convert_to(${expired.token},'UTF8')),'hex')`;expect((await sql`select consume_email_unsubscribe(encode(sha256(convert_to(${expired.token},'UTF8')),'hex'))ok`)[0].ok).toBe(false);
      expect((await sql`select financial_integrity_snapshot()data`)[0].data).toMatchObject({uncertainReleaseEmails:1});
      for(const role of['anon','authenticated'])for(const routine of['consume_email_unsubscribe(text)','cleanup_email_unsubscribe_proofs(integer)','issue_email_unsubscribe(uuid,text)','queue_paid_digest_audience(integer)','claim_paid_digest(uuid,date)','claim_digest_email_batch(integer)','queue_release_email_audience(integer,integer)','claim_release_email_batch(integer)','finish_paid_email(text,uuid,uuid,text,text,date,uuid)'])expect((await sql`select has_function_privilege(${role},${routine},'EXECUTE')allowed`)[0].allowed).toBe(false);
    }
    {
      const author=crypto.randomUUID(),reader=crypto.randomUUID(),other=crypto.randomUUID();for(const[id,name]of[[author,'author'],[reader,'reader'],[other,'other']])await sql`select create_direct_account(${id},${name+'093@example.test'},${name+'093'},${name+'093'})`;
      await sql`update users set user_types=array['author'] where id=${author}`;
      await sql`insert into author_qa(author_id,asked_by,question,answer,answered_at,created_at)select ${author},${reader},'Question093 '||n,'Answer093',case when n=45 then null else '2026-11-04T00:00:00.123456Z'::timestamptz end,'2026-11-04T00:00:00.123456Z'::timestamptz from generate_series(1,45)n`;
      await sql`insert into author_qa(author_id,asked_by,question,answer,is_public)values(${author},${reader},'Private question093','Private answer',false),(${author},${reader},'Pending question093',null,true)`;
      const page=async(cursor:{cursor_at:string;id:string}|null=null)=>(await sql`select author_question_snapshot(${author},${cursor?.cursor_at??null}::text::timestamptz,${cursor?.id??null}::uuid,20)data`)[0].data;
      let snapshot=await page(),rows=snapshot.qa.slice(0,20);while(snapshot.qa.length>20){snapshot=await page(snapshot.qa[19]);rows.push(...snapshot.qa.slice(0,20));}expect(snapshot.total).toBe(45);expect(rows).toHaveLength(45);expect(new Set(rows.map((row:{id:string})=>row.id)).size).toBe(45);expect(rows.filter((row:{answered_at:string|null})=>row.answered_at===null)).toHaveLength(1);
      await expect(sql`select author_question_snapshot(${author},null,${crypto.randomUUID()},20)`).rejects.toMatchObject({code:'P1004'});await expect(sql`select author_question_snapshot(${reader})`).rejects.toMatchObject({code:'P1005'});
      const key='shelf093-private-receipt',hash='a'.repeat(64),[shelf]=await sql`insert into shelves(user_id,name,idempotency_key,request_hash)values(${reader},'Receipt093',${key},${hash})returning id,slug`;
      expect((await sql`select content_creation_receipt_snapshot(${reader},'shelves',${key})data`)[0].data).toMatchObject({id:shelf.id,user_id:reader,slug:shelf.slug});await expect(sql`select content_creation_receipt_snapshot(${other},'shelves',${key})`).rejects.toMatchObject({code:'P1005'});await expect(sql`select content_creation_receipt_snapshot(${reader},'users',${key})`).rejects.toMatchObject({code:'P1004'});
      const questionKey='question093-private-receipt',[question]=await sql`insert into author_qa(author_id,asked_by,question,idempotency_key,request_hash)values(${author},${reader},'Question093 & unchanged',${questionKey},${hash})returning id`;
      expect((await sql`select content_creation_receipt_snapshot(${reader},'author_qa',${questionKey})data`)[0].data).toMatchObject({id:question.id,author_id:author,asked_by:reader,question:'Question093 & unchanged'});
      await sql`update users set is_banned=true where id=${reader}`;await expect(sql`select content_creation_receipt_snapshot(${reader},'shelves',${key})`).rejects.toMatchObject({code:'P1003'});
      for(const role of['anon','authenticated'])for(const routine of['author_question_snapshot(uuid,timestamptz,uuid,integer)','content_creation_receipt_snapshot(uuid,text,text)'])expect((await sql`select has_function_privilege(${role},${routine},'EXECUTE')allowed`)[0].allowed).toBe(false);
    }
    {
      const reader=crypto.randomUUID(),other=crypto.randomUUID();for(const[id,name]of[[reader,'reader'],[other,'other']])await sql`select create_direct_account(${id},${name+'094@example.test'},${name+'094'},${name+'094'})`;await sql`update users set premium_override=true where id=${reader}`;
      const[paper]=await sql`insert into books(title,author_name,page_count,language,format)values('Shelf094 paper','Writer094',200,'fr','paperback')returning id,work_id`,[alias]=await sql`insert into books(title,author_name,work_id,canonical_edition_id)values('Shelf094 alias','Writer094',${paper.work_id},${paper.id})returning id`,[hard]=await sql`insert into books(title,author_name,work_id,page_count,language,format)values('Shelf094 hard','Writer094',${paper.work_id},300,'de','hardcover')returning id`;
      const shelves=await sql`select id,default_type from shelves where user_id=${reader}`;const current=shelves.find(shelf=>shelf.default_type==='currently_reading')!,finished=shelves.find(shelf=>shelf.default_type==='have_read')!,want=shelves.find(shelf=>shelf.default_type==='want_to_read')!;
      for(const shelf of[current,finished])for(const book of[paper,alias,hard])await sql`insert into shelf_books(shelf_id,user_id,book_id,progress_pages,progress_percent,finished_at,added_at,updated_at)values(${shelf.id},${reader},${book.id},${book.id===alias.id?70:5},${book.id===alias.id?35:2.5},${shelf===finished?'2026-11-04':null},'2026-11-04T00:00:00.123456Z','2026-11-04T00:00:00Z'::timestamptz+${book.id===alias.id?'1 minute':'0 minute'}::interval)`;
      await sql`insert into shelf_books(shelf_id,user_id,book_id)values(${want.id},${reader},${alias.id})`;await sql`select set_reading_goal(${reader},2026,12)`;
      await sql`insert into shelves(user_id,name,created_at)select ${reader},'Shelf094 '||n,'2026-11-04T00:00:00.123456Z'::timestamptz from generate_series(1,55)n`;
      const catalog=async(before:{is_default:boolean;created_at:string;id:string}|null=null)=>(await sql`select shelf_catalog_snapshot(${reader},${alias.id},${before?.is_default??null},${before?.created_at??null}::text::timestamptz,${before?.id??null}::uuid,50,2026)data`)[0].data;
      let page=await catalog(),rows=page.shelves.slice(0,50);while(page.shelves.length>50){page=await catalog(page.shelves[49]);rows.push(...page.shelves.slice(0,50));}expect(rows).toHaveLength(58);expect(new Set(rows.map((row:{id:string})=>row.id)).size).toBe(58);expect(rows.slice(0,3).every((row:{is_default:boolean})=>row.is_default)).toBe(true);expect(page).toMatchObject({total:58,selectedTotal:3,reading:{goal:{target_books:12},progress:{books_read:1,year:2026}}});expect(rows.find((row:{id:string})=>row.id===current.id)).toMatchObject({book_count:2,contains_book:true});
      const detail=(await sql`select shelf_detail_snapshot(${reader},${current.id})data`)[0].data;expect(detail.total).toBe(2);expect(detail.shelf).not.toHaveProperty('idempotency_key');expect(detail.shelf).not.toHaveProperty('request_hash');expect(rows[0]).not.toHaveProperty('request_hash');const paperback=detail.books.find((row:{entry:{book_id:string}})=>row.entry.book_id===paper.id).entry,hardback=detail.books.find((row:{entry:{book_id:string}})=>row.entry.book_id===hard.id).entry;expect(paperback).toMatchObject({source_book_id:alias.id,progress_pages:70,book:{id:paper.id,page_count:200,language:'fr',format:'paperback'}});expect(hardback.book).toMatchObject({id:hard.id,page_count:300,language:'de',format:'hardcover'});expect((await sql`select count(*)::int n from shelf_books where shelf_id=${current.id}`)[0].n).toBe(3);
      await sql`select update_shelf_progress(${reader},${paperback.id},75,null)`;expect((await sql`select progress_pages from shelf_books where id=${paperback.id}`)[0].progress_pages).toBe(75);expect((await sql`select progress_pages from shelf_books where shelf_id=${current.id} and book_id=${hard.id}`)[0].progress_pages).toBe(5);
      const large=rows.find((row:{is_default:boolean})=>!row.is_default)!;const books=await sql`insert into books(title,author_name)select 'Shelf094 paged '||n,'Writer094 paged'from generate_series(1,55)n returning id`;for(const book of books)await sql`insert into shelf_books(shelf_id,user_id,book_id,added_at)values(${large.id},${reader},${book.id},'2026-11-04T00:00:00.123456Z')`;
      const detailPage=async(before:{at:string;id:string}|null=null)=>(await sql`select shelf_detail_snapshot(${reader},${large.id},${before?.at??null}::text::timestamptz,${before?.id??null}::uuid,50)data`)[0].data;let listing=await detailPage(),entries=listing.books.slice(0,50);while(listing.books.length>50){listing=await detailPage(listing.books[49]);entries.push(...listing.books.slice(0,50));}expect(entries).toHaveLength(55);expect(listing).toMatchObject({total:55,shelf:{book_count:55}});expect(new Set(entries.map((row:{id:string})=>row.id)).size).toBe(55);
      await sql`update users set profile_visibility='followers_only' where id=${reader}`;await expect(sql`select shelf_detail_snapshot(${other},${current.id})`).rejects.toMatchObject({code:'P1003'});await sql`insert into follows(follower_id,following_id)values(${other},${reader})`;expect((await sql`select shelf_detail_snapshot(${other},${current.id})data`)[0].data.total).toBe(2);await sql`update users set shelf_visibility='private' where id=${reader}`;await expect(sql`select shelf_detail_snapshot(${other},${current.id})`).rejects.toMatchObject({code:'P1003'});expect((await sql`select shelf_detail_snapshot(${reader},${current.id})data`)[0].data.total).toBe(2);
      await expect(sql`select shelf_catalog_snapshot(${reader},null,null,now(),${large.id})`).rejects.toMatchObject({code:'P1004'});await sql`update users set is_banned=true where id=${other}`;await expect(sql`select shelf_catalog_snapshot(${other})`).rejects.toMatchObject({code:'P1003'});
      for(const role of['anon','authenticated'])for(const routine of['shelf_edition_rows(uuid)','shelf_catalog_snapshot(uuid,uuid,boolean,timestamptz,uuid,integer,integer)','shelf_detail_snapshot(uuid,uuid,timestamptz,uuid,integer)'])expect((await sql`select has_function_privilege(${role},${routine},'EXECUTE')allowed`)[0].allowed).toBe(false);
    }

  } finally { vi.unstubAllEnvs();await closeAdapter();await sql.end(); }
}, 60_000);


it.skipIf(!process.env.MIGRATION_TEST_DATABASE_URL)('verifies complete discovery, canonical cohorts and privacy on the rehearsed PostgreSQL schema',async()=>{
  const url=process.env.MIGRATION_TEST_DATABASE_URL!;if(!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw Error('Discovery rehearsal requires isolated loopback PostgreSQL');
  const sql=postgres(url,{max:4,prepare:false,ssl:false,onnotice:()=>{}});
  try{
    if(!(await sql`select to_regprocedure('public.recommendation_reader_page(timestamptz,uuid,integer)')ready`)[0].ready)throw Error('Migration rehearsal must complete first');
      const reader=crypto.randomUUID(),friend=crypto.randomUUID(),privateReader=crypto.randomUUID(),banned=crypto.randomUUID();for(const[id,name]of[[reader,'reader'],[friend,'friend'],[privateReader,'private'],[banned,'banned']])await sql`select create_direct_account(${id},${name+'095@example.test'},${name+'095'},${name+'095'})`;await sql`update users set premium_override=true,shelf_visibility='private'where id=${privateReader}`;await sql`update users set is_banned=true where id=${banned}`;
      const[secret]=await sql`insert into books(title,author_name)values('Private discovery095','Writer095')returning id`;const privateShelves=await sql`insert into shelves(user_id,name,is_public)select ${privateReader},'Private095 '||n,false from generate_series(1,1105)n returning id`;for(const shelf of privateShelves)await sql`insert into shelf_books(shelf_id,user_id,book_id)values(${shelf.id},${privateReader},${secret.id})`;
      const[popular]=await sql`insert into books(title,author_name,language,format)values('Popular discovery095','Writer095','fr','paperback')returning id,work_id`,[physical]=await sql`insert into books(title,author_name,work_id,language,format)values('Popular hard095','Writer095',${popular.work_id},'de','hardcover')returning id`,readers:string[]=[];
      for(let n=0;n<200;n++){const id=crypto.randomUUID();readers.push(id);await sql`select create_direct_account(${id},${'popular095'+n+'@example.test'},${'popular095'+n},${'Popular095 '+n})`;await sql`update users set country=${n%2?'FR':'DE'} where id=${id}`;const[shelf]=await sql`select id from shelves where user_id=${id} and default_type='have_read'`;await sql`insert into shelf_books(shelf_id,user_id,book_id,finished_at)values(${shelf.id},${id},${n%2?physical.id:popular.id},current_date)`;}
      const trending=(await sql`select discovery_trending_snapshot()data`)[0].data,national=(await sql`select discovery_trending_snapshot('DE')data`)[0].data;expect(trending.find((row:{work_id:string})=>row.work_id===popular.work_id)).toMatchObject({count:200});expect(trending.filter((row:{work_id:string})=>row.work_id===popular.work_id)).toHaveLength(1);expect(national.find((row:{work_id:string})=>row.work_id===popular.work_id)).toMatchObject({count:100});expect(trending.some((row:{book_id:string})=>row.book_id===secret.id)).toBe(false);await expect(sql`select discovery_trending_snapshot('invalid')`).rejects.toMatchObject({code:'P1004'});
      const shared=await sql`insert into books(title,author_name)select 'Shared095 '||n,'Shared writer095'from generate_series(1,4)n returning id,work_id,title`,[alias]=await sql`insert into books(title,author_name,work_id,canonical_edition_id)values('STALE shared095','Old writer',${shared[0].work_id},${shared[0].id})returning id`,[secondAlias]=await sql`insert into books(title,author_name,work_id,canonical_edition_id)values('STALE second095','Old writer',${shared[0].work_id},${shared[0].id})returning id`;
      const owned=(await sql`select id from shelves where user_id=${reader} and default_type='have_read'`)[0],friendShelf=(await sql`select id from shelves where user_id=${friend} and default_type='have_read'`)[0],want=(await sql`select id from shelves where user_id=${reader} and default_type='want_to_read'`)[0];
      for(const book of[shared[0],alias,secondAlias])await sql`insert into shelf_books(shelf_id,user_id,book_id)values(${owned.id},${reader},${book.id})`;for(const book of[alias,...shared.slice(1)])await sql`insert into shelf_books(shelf_id,user_id,book_id)values(${friendShelf.id},${friend},${book.id})`;expect((await sql`select shelf_overlap_snapshot(${reader})data`)[0].data).toMatchObject({cohort:[],books:[]});
      for(const book of shared.slice(1,3))await sql`insert into shelf_books(shelf_id,user_id,book_id)values(${owned.id},${reader},${book.id})`;let overlap=(await sql`select shelf_overlap_snapshot(${reader})data`)[0].data;expect(overlap.cohort).toContain(friend);expect(overlap.books).toContainEqual(expect.objectContaining({id:shared[3].id}));const signature=overlap.signature;expect(signature).toMatch(/^[a-f0-9]{32}$/);
      await sql`insert into shelf_books(shelf_id,user_id,book_id)values(${want.id},${reader},${shared[0].id})`;await sql`insert into follows(follower_id,following_id)values(${reader},${friend}),(${reader},${privateReader})`;const feed=(await sql`select read_social_feed(${reader})data`)[0].data;expect(feed.find((row:{book:{id:string}})=>row.book.id===shared[0].id)).toMatchObject({book:{title:shared[0].title},wantToRead:true});expect(feed.some((row:{book:{id:string}})=>row.book.id===secret.id||row.book.id===alias.id)).toBe(false);
      const recommended=(await sql`select discovery_friends_snapshot(${reader})data`)[0].data;expect(recommended.some((row:{book_id:string})=>row.book_id===secret.id||row.book_id===alias.id||row.book_id===shared[0].id)).toBe(false);expect(recommended.some((row:{work_id:string})=>row.work_id===shared[3].work_id)).toBe(true);
      await sql`update users set shelf_visibility='private'where id=${friend}`;overlap=(await sql`select shelf_overlap_snapshot(${reader},${sql.array([friend])}::uuid[])data`)[0].data;expect(overlap.cohort).toEqual([]);expect(overlap.books).toEqual([]);await sql`update users set shelf_visibility='public',profile_visibility='followers_only'where id=${friend}`;expect((await sql`select shelf_overlap_snapshot(${reader})data`)[0].data.cohort).toContain(friend);await sql`delete from follows where follower_id=${reader} and following_id=${friend}`;expect((await sql`select shelf_overlap_snapshot(${reader})data`)[0].data.cohort).not.toContain(friend);await sql`insert into follows(follower_id,following_id)values(${reader},${friend})`;await sql`insert into shelf_books(shelf_id,user_id,book_id)values(${want.id},${reader},${shared[3].id})`;expect((await sql`select shelf_overlap_snapshot(${reader})data`)[0].data.books).toEqual([]);
      for(const id of readers.slice(0,45)){await sql`update users set created_at='2026-11-04T00:00:00.123456Z'where id=${id}`;const[shelf]=await sql`select id from shelves where user_id=${id} and default_type='have_read'`;for(const book of shared.slice(1,3))await sql`insert into shelf_books(shelf_id,user_id,book_id)values(${shelf.id},${id},${book.id})`;}
      const readerPage=async(before:{created_at:string;id:string}|null=null)=>(await sql`select recommendation_reader_page(${before?.created_at??null}::text::timestamptz,${before?.id??null}::uuid,40)data`)[0].data;let page=await readerPage(),audience=page.slice(0,40);while(page.length>40){page=await readerPage(page[39]);audience.push(...page.slice(0,40));}expect(new Set(audience.map((row:{id:string})=>row.id)).size).toBe(audience.length);for(const id of readers.slice(0,45))expect(audience.map((row:{id:string})=>row.id)).toContain(id);expect(audience.map((row:{id:string})=>row.id)).not.toContain(banned);
      const[gem]=await sql`insert into books(title,author_name)values('Current gem095','Gem writer095')returning id,work_id`,[gemAlias]=await sql`insert into books(title,author_name,work_id,canonical_edition_id)values('Old gem095','Old writer',${gem.work_id},${gem.id})returning id`,[stale]=await sql`insert into books(title,author_name,average_rating,ratings_count)values('Stale gem095','Other writer095',4.99,900)returning id`;
      for(const id of readers.slice(0,25))await sql`insert into reviews(user_id,book_id,rating,review_type,content)values(${id},${gemAlias.id},5,'short','A current public review095.')`;await sql`insert into reviews(user_id,book_id,rating,review_type,content,is_hidden)values(${readers[26]},${gem.id},1,'short','A hidden review095.',true),(${banned},${gem.id},1,'short','A banned review095.',false),(${readers[27]},${stale.id},1,'short','A current low review095.',false)`;
      const gems=(await sql`select discovery_gems_snapshot()data`)[0].data;expect(gems.find((row:{work_id:string})=>row.work_id===gem.work_id)).toMatchObject({average_rating:5,rating_source:'community'});expect(gems.some((row:{id:string})=>row.id===gemAlias.id||row.id===stale.id)).toBe(false);
      await expect(sql`select shelf_overlap_snapshot(${banned})`).rejects.toMatchObject({code:'P1003'});await expect(sql`select followed_author_books(${banned})`).rejects.toMatchObject({code:'P1003'});
      for(const role of['anon','authenticated'])for(const routine of['discovery_shelf_rows(uuid)','discovery_trending_snapshot(text,integer)','discovery_gems_snapshot(integer)','discovery_friends_snapshot(uuid,integer)','shelf_overlap_snapshot(uuid,uuid[])','recommendation_reader_page(timestamptz,uuid,integer)'])expect((await sql`select has_function_privilege(${role},${routine},'EXECUTE')allowed`)[0].allowed).toBe(false);
  }finally{await sql.end();}
},60_000);
