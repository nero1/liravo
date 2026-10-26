import { it, expect } from 'vitest';
import postgres from 'postgres';
import { readFileSync, readdirSync } from 'node:fs';

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
      create function auth.role() returns text language sql as $$select 'service_role'::text$$;
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
        where n.nspname='public' and p.proname in ('create_payout_request_atomic','create_tip_transaction','process_payment_event','apply_social_intent','award_xp_once','claim_outbox_events','process_outbox_event_atomic','create_subscription_intent','cancel_subscriptions_atomic','page_followed_lists','process_subscription_webhook','toggle_review_like_atomic','increment_xp','claim_digest_delivery','financial_integrity_snapshot')`;
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
  } finally { await sql.end(); }
}, 60_000);
