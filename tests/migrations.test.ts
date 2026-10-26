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
    for (const file of migrations) await sql.unsafe(readFileSync(`supabase/migrations/${file}`, 'utf8')).simple();
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
        where n.nspname='public' and p.proname in ('create_payout_request_atomic','create_tip_transaction','process_payment_event','apply_social_intent','award_xp_once','claim_outbox_events','process_outbox_event_atomic','create_subscription_intent','cancel_subscriptions_atomic','page_followed_lists','process_subscription_webhook','toggle_review_like_atomic','increment_xp','claim_digest_delivery','financial_integrity_snapshot','increment_streak_atomic','apply_book_interaction','increment_review_helpfulness','set_feature_flag_atomic','attribute_referral_atomic')`;
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
    const outcomes=await Promise.allSettled(['intent-a','intent-b'].map(key => sql.begin(async tx => {
      await tx`select create_payout_request_atomic(${recipient},60,'paystack',${key},'rehearsal')`;
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
  } finally { await sql.end(); }
}, 60_000);
