import { createFormatter, createTranslator } from 'next-intl';
import en from '../messages/en.json';
import { it, expect, vi } from 'vitest';
import postgres from 'postgres';
import { readFileSync, readdirSync } from 'node:fs';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

vi.mock('@/lib/auth/getCurrentUser',()=>({getCurrentUser:vi.fn()}));
vi.mock('next-intl/server',()=>({
  getTranslations:async()=>createTranslator({locale:'en',messages:en,namespace:'admin'}),
  getFormatter:async()=>createFormatter({locale:'en'}),
}));

it.skipIf(!process.env.MIGRATION_TEST_DATABASE_URL)('rehearses all migrations, outbox replay and concurrent payouts on local PostgreSQL', async () => {
  const url = process.env.MIGRATION_TEST_DATABASE_URL!;
  if (!['localhost','127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Migration rehearsal requires an isolated loopback database');
  const sql = postgres(url, { max: 4, prepare: false, ssl: false, onnotice: () => {} });
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
      create function auth.uid() returns uuid language sql as $$select null::uuid$$;
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
      await sql.unsafe(readFileSync(`supabase/migrations/${file}`, 'utf8')).simple();
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
        where n.nspname='public' and p.proname in ('create_payout_request_atomic','create_tip_transaction','process_payment_event','apply_social_intent','award_xp_once','claim_outbox_events','process_outbox_event_atomic','create_subscription_intent','cancel_subscriptions_atomic','page_followed_lists','process_subscription_webhook','toggle_review_like_atomic','increment_xp','claim_digest_delivery','financial_integrity_snapshot','increment_streak_atomic','apply_book_interaction','increment_review_helpfulness','set_feature_flag_atomic','attribute_referral_atomic','request_subscription_cancellation','claim_subscription_cancellations','complete_subscription_cancellation','apply_writing_intent','increment_challenge_vote','publish_writing_prompt','has_premium_access','refresh_premium_access','set_premium_override_atomic','register_billing_account','reconcile_google_play_purchase','complete_google_play_delivery','expire_subscription_entitlements','process_payment_event_legacy','creator_balance','claim_payout_request','settle_payout_request','defer_payout_request','cancel_payout_request','release_legacy_payout_request')`;
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
    const payload={tipId:tip,status:'completed'};
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
      await getSql().end();
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
    await sql`select process_payment_event('paystack','play-web-payment',${sql.json({event:'subscription.activated',subscription_id:webId,user_id:playUser,paid_amount_minor:499,currency:'USD',provider_reference:'sub_'+webId})},'play-rehearsal')`;
    expect((await sql`select request_subscription_cancellation(${playUser},'play-rehearsal') as count`)[0].count).toBe(1);
    const webClaims=await sql`select * from claim_subscription_cancellations(${playUser},3)`;
    expect(webClaims).toHaveLength(1);expect(webClaims[0].provider).toBe('paystack');
    await sql`select complete_subscription_cancellation(${webId})`;
    expect((await sql`select is_premium from users where id=${playUser}`)[0].is_premium).toBe(true);
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
  } finally { await sql.end(); }
}, 60_000);
