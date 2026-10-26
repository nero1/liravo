import { createFormatter, createTranslator } from 'next-intl';
import en from '../messages/en.json';
import { it, expect, vi } from 'vitest';
import postgres from 'postgres';
import { readFileSync, readdirSync } from 'node:fs';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

vi.mock('@/lib/auth/getCurrentUser',()=>({getCurrentUser:vi.fn()}));
vi.mock('@/lib/rate-limit',async original=>({...await original<typeof import('@/lib/rate-limit')>(),checkRouteRateLimit:vi.fn(async()=>true)}));
vi.mock('next-intl/server',()=>({
  getTranslations:async()=>createTranslator({locale:'en',messages:en,namespace:'admin'}),
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
    for (const file of migrations) {
      const legacy=file.startsWith('040_');
      if(legacy)await sql.unsafe(`
        insert into auth.users(id,email,raw_user_meta_data) values('${legacyUser}','legacy@example.test','{"username":"legacy_audit"}');
        insert into tips(id,user_id,recipient_id,amount,platform_fee,recipient_amount,currency,status) values('${legacyUser}','${legacyUser}','${legacyUser}',100,10,90,'USD','completed');
        insert into payouts(tip_id,recipient_id,amount,currency,status,provider) values('${legacyUser}','${legacyUser}',90,'USD','failed','paystack');
      `).simple();
      const legacyRefund=file.startsWith('041_');
      if(legacyRefund)await sql.unsafe(`
        insert into auth.users(id,email,raw_user_meta_data) values('${legacyUser}','legacy@example.test','{"username":"legacy_audit"}');
        insert into tips(id,user_id,recipient_id,amount,platform_fee,recipient_amount,currency,status) values('${legacyUser}','${legacyUser}','${legacyUser}',100,10,90,'USD','refunded');
        insert into payment_events(provider,event_id,payload) values('paystack','charge:legacy-paid-refund','{"tipId":"${legacyUser}","status":"completed","payment_id":"legacy-paid-refund","paid_amount_minor":10000,"currency":"USD"}');
        insert into subscriptions(id,user_id,provider,status,amount,currency,provider_event_id,provider_subscription_id) values('${legacyUser}','${legacyUser}','dodopayments','active',4.99,'USD','sub_${legacyUser}','sub_legacy_period');
        insert into payment_events(provider,event_id,payload) values('dodopayments','payment:legacy-sub-paid','{"event":"subscription.activated","subscription_id":"${legacyUser}","user_id":"${legacyUser}","paid_amount_minor":499,"currency":"USD","provider_reference":"sub_${legacyUser}"}');
      `).simple();
      await sql.unsafe(readFileSync(`supabase/migrations/${file}`, 'utf8')).simple();
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
    const [notifications]=await sql`select count(*) as count from notifications`;
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
      await sql`insert into shelves(user_id,name,slug,is_default,default_type) values(${sender},'Want to Read','want-to-read',true,'want_to_read')`;
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
        for(const page of pages) expect(await page.default()).toBeTruthy();
      } finally { queryGuard.mockRestore(); }
      const answerRequest = new Request('https://app.test/api/content',{headers:{'Idempotency-Key':'answer-intent-key'}});
      const answerPayload = {question_id:questionId,answer:'A sufficiently detailed answer.'};
      await (await contentIntent(answerRequest,recipient,'ask_writer_answers',answerPayload)).insert();
      await (await contentIntent(answerRequest,recipient,'ask_writer_answers',answerPayload)).insert();
      expect((await sql`select answer_count from ask_writer_questions where id=${questionId}`)[0].answer_count).toBe(1);
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
    const bestCandidates=await sql`insert into ask_writer_answers(user_id,question_id,answer) values(${recipient},${bestQuestion.id},'First useful answer for testing.'),(${referred},${bestQuestion.id},'Second useful answer for testing.') returning id,user_id`;
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
  } finally { vi.unstubAllEnvs();await closeAdapter();await sql.end(); }
}, 60_000);
