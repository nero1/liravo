import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const db = new PGlite();
const user = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const tip = '00000000-0000-4000-8000-000000000003';

beforeAll(async () => {
  await db.exec(`
    create role service_role;
    create table users(id uuid primary key, is_premium boolean default false, referred_by uuid, xp integer default 0, is_suspended boolean default false);
    create table tips(id uuid primary key default gen_random_uuid(), user_id uuid, recipient_id uuid, creator_id uuid, amount numeric, platform_fee numeric, recipient_amount numeric, creator_amount numeric, status text, currency text, provider_reference text);
    create table subscriptions(id uuid primary key default gen_random_uuid(), user_id uuid, provider text, status text, amount numeric, currency text,provider_event_id text);
    create table payouts(id uuid default gen_random_uuid(),tip_id uuid,recipient_id uuid,amount numeric,currency text,provider text);
    create table referral_commissions(referrer_id uuid,referred_user_id uuid,transaction_id text,transaction_type text,gross_transaction_amount numeric,platform_fee_amount numeric,commission_amount numeric,idempotency_key text,reversed_at timestamptz);
    create table event_revenue(organizer_id uuid,amount numeric,currency text);
    create table payout_requests(id uuid default gen_random_uuid(),user_id uuid,amount numeric,method text,idempotency_key text,status text default 'pending');
    create table financial_audit_log(actor_user_id uuid,target_user_id uuid,action text,amount numeric,currency text,idempotency_key text,correlation_id text,provider text,provider_event_id text,metadata jsonb);
    create table outbox_events(id uuid primary key default gen_random_uuid(),aggregate_type text,aggregate_id text,event_type text,payload jsonb,status text default 'pending',attempts integer default 0,created_at timestamptz default now(),next_attempt_at timestamptz default now(),processed_at timestamptz,last_error text);
    create function process_subscription_webhook(text,uuid,uuid) returns void language sql as 'select';
    insert into users(id) values('${user}'),('${other}');
    insert into tips(id,user_id,recipient_id,creator_id,amount,platform_fee,recipient_amount,creator_amount,status,currency,provider_reference) values('${tip}','${other}','${user}',null,100,10,90,null,'pending','USD',null);
  `);
  await db.exec(readFileSync('supabase/migrations/019_financial_transactions.sql', 'utf8'));
  await db.exec(`
    create table follows(follower_id uuid,following_id uuid,unique(follower_id,following_id));
    create table reviews(id uuid primary key,user_id uuid,likes_count integer default 0);
    create table review_likes(review_id uuid,user_id uuid,unique(review_id,user_id));
    create table notifications(user_id uuid,type text,actor_id uuid,entity_type text,entity_id uuid,message text);
    create function toggle_review_like_atomic(uuid,uuid) returns boolean language sql as 'select false';
    insert into reviews values('${tip}','${other}',0);
  `);
  await db.exec(readFileSync('supabase/migrations/021_social_transactions.sql', 'utf8'));
  await db.exec(`
    create schema auth;
    create function auth.role() returns text language sql as $$select current_setting('test.role',true)$$;
    alter table users add column is_admin boolean default false, add column is_moderator boolean default false,
      add column is_verified_author boolean default false, add column is_banned boolean default false,
      add column email text, add column email_verified boolean default false, add column pin_hash text,
      add column password_hash text, add column totp_secret text, add column totp_enabled boolean default false, add column recovery_codes text[];
  `);
  await db.exec(readFileSync('supabase/migrations/022_privileged_profile_fields.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/024_xp_ledger.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/025_outbox_recovery.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/026_subscription_intents.sql', 'utf8'));

}, 30_000);
afterAll(() => db.close());

async function pay(id: string, payload: object) {
  return db.query('select process_payment_event($1,$2,$3,$4) as applied', ['paystack',id,JSON.stringify(payload),'test-correlation']);
}

describe('financial transactions', () => {
  it('commits once and rejects conflicting webhook replay', async () => {
    const payload = { tipId: tip, status: 'completed' };
    await pay('payment-1', payload);
    await pay('payment-1', payload);
    expect((await db.query('select * from payouts')).rows).toHaveLength(1);
    expect((await db.query('select * from outbox_events')).rows).toHaveLength(2);
    await expect(pay('payment-1', { ...payload, status: 'failed' })).rejects.toThrow('conflict');
  });
  it('rolls back the event claim when the business write fails', async () => {
    await expect(pay('payment-2', { tipId: other, status: 'completed' })).rejects.toThrow('Unknown tip');
    expect((await db.query("select * from payment_events where event_id='payment-2'")).rows).toHaveLength(0);
  });
  it('reserves balances across simultaneous intents and replays safely', async () => {
    const reserve = (key: string, amount=60) => db.query('select create_payout_request_atomic($1,$2,$3,$4,$5)',[user,amount,'paystack',key,'test-correlation']);
    const outcomes = await Promise.allSettled([reserve('intent-1'),reserve('intent-2')]);
    expect(outcomes.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const rows = await db.query<{idempotency_key: string}>('select idempotency_key from payout_requests');
    const key=rows.rows[0].idempotency_key;
    await reserve(key);
    await expect(reserve(key,70)).rejects.toThrow('Conflicting');
    expect((await db.query('select * from payout_requests')).rows).toHaveLength(1);
  });
});


describe('social transactions', () => {
  const apply = (action: string, key: string) => db.query('select apply_social_intent($1,$2,$3,$4) as active',[user,action==='like'?tip:other,action,key]);
  it('deduplicates follow rewards and notifications across distinct retry keys', async () => {
    await apply('follow','follow-1');
    await apply('follow','follow-1');
    await apply('follow','follow-2');
    expect((await db.query('select * from follows')).rows).toHaveLength(1);
    expect((await db.query('select * from notifications')).rows).toHaveLength(1);
    expect((await db.query('select * from social_rewards')).rows).toHaveLength(1);
  });
  it('does not let a delayed unfollow retry undo a subsequent follow', async () => {
    await apply('unfollow','unfollow-1');
    await apply('follow','follow-3');
    await apply('unfollow','unfollow-1');
    expect((await db.query('select * from follows')).rows).toHaveLength(1);
    expect((await db.query("select * from social_rewards where action='follow'")).rows).toHaveLength(1);
  });
  it('replays the committed toggle result and prevents XP farming on relikes', async () => {
    await apply('like','like-key-1');
    await apply('like','like-key-1');
    expect((await db.query('select * from review_likes')).rows).toHaveLength(1);
    await apply('like','like-key-2');
    await apply('like','like-key-3');
    expect((await db.query<{likes_count:number}>('select likes_count from reviews')).rows[0].likes_count).toBe(1);
    expect((await db.query("select * from social_rewards where action='like'")).rows).toHaveLength(1);
  });
});


describe('profile privilege boundary', () => {
  it('rejects role and XP escalation through an authenticated profile update', async () => {
    await db.exec("select set_config('test.role','authenticated',false)");
    try {
      await expect(db.query('update users set is_admin=true where id=$1',[user])).rejects.toThrow('Privileged');
      await expect(db.query('update users set xp=xp+1000 where id=$1',[user])).rejects.toThrow('Privileged');
      expect((await db.query<{is_admin:boolean}>('select is_admin from users where id=$1',[user])).rows[0].is_admin).toBe(false);
    } finally { await db.exec("select set_config('test.role','service_role',false)"); }
  });
});


describe('durable rewards and outbox recovery', () => {
  it('awards a business reward once', async () => {
    const award=()=>db.query<{reward:{awarded:number}}>('select award_xp_once($1,3,$2,$3) as reward',[user,'daily_login','login:2026-10-26']);
    const first=await award(); const replay=await award();
    expect((first.rows[0].reward as {awarded:number}).awarded).toBe(3);
    expect((replay.rows[0].reward as {awarded:number}).awarded).toBe(0);
  });
  it('recovers stale claims and commits notification plus acknowledgement once', async () => {
    await db.exec("update outbox_events set status='processing',claimed_at=now()-interval '6 minutes'");
    const claims=await db.query<{id:string}>('select * from claim_outbox_events(10)');
    expect(claims.rows).toHaveLength(4);
    const before=(await db.query('select * from notifications')).rows.length;
    for (const claim of claims.rows) for (let i=0;i<2;i++) await db.query('select process_outbox_event_atomic($1)',[claim.id]);
    expect((await db.query('select * from notifications')).rows).toHaveLength(before+1);
    expect((await db.query("select * from outbox_events where status='processed'")).rows).toHaveLength(4);
  });
});


describe('subscription intents', () => {
  it('commits one pending subscription and audit across retries, rejecting conflicting payloads', async () => {
    const create=(amount=4.99)=>db.query<{intent:{id:string}}>('select create_subscription_intent($1,$2,$3,$4,$5,$6) as intent',[user,'paystack','USD',amount,'subscription-key','test-correlation']);
    const first=await create(); const second=await create();
    expect(first.rows[0].intent.id).toBe(second.rows[0].intent.id);
    await expect(create(8)).rejects.toThrow('Conflicting');
    expect((await db.query("select * from financial_audit_log where action='subscription_create_pending'")).rows).toHaveLength(1);
  });
  it('cancels local entitlement and audit together without duplicate audit on replay', async () => {
    await db.query("update subscriptions set status='active' where user_id=$1",[user]);
    await db.query('update users set is_premium=true where id=$1',[user]);
    await db.query('select cancel_subscriptions_atomic($1,$2)',[user,'test-correlation']);
    await db.query('select cancel_subscriptions_atomic($1,$2)',[user,'test-correlation']);
    expect((await db.query<{is_premium:boolean}>('select is_premium from users where id=$1',[user])).rows[0].is_premium).toBe(false);
    expect((await db.query("select * from financial_audit_log where action='subscriptions_cancelled'")).rows).toHaveLength(1);
  });
});


describe('payment amount and event ordering', () => {
  it('rolls back underpayments and prevents an older payment from undoing a later cancellation', async () => {
    const created=await db.query<{intent:{id:string}}>('select create_subscription_intent($1,$2,$3,$4,$5,$6) as intent',[user,'paystack','USD',4.99,'ordered-payment-key','test']);
    const id=created.rows[0].intent.id;
    const at=new Date().toISOString(); const later=new Date(Date.now()+1000).toISOString();
    const payload={event:'subscription.activated',user_id:user,subscription_id:id,paid_amount_minor:1,currency:'USD',provider_reference:`sub_${id}`,provider_event_at:at};
    await expect(pay('underpaid-event',payload)).rejects.toThrow('Payment amount mismatch');
    expect((await db.query("select * from payment_events where event_id='underpaid-event'")).rows).toHaveLength(0);
    await pay('paid-event-valid',{...payload,paid_amount_minor:499});
    await pay('cancelled-event',{event:'subscription.cancelled',user_id:user,subscription_id:id,provider_event_at:later});
    await pay('paid-event-older',{...payload,paid_amount_minor:499});
    expect((await db.query<{status:string}>('select status from subscriptions where id=$1',[id])).rows[0].status).toBe('cancelled');
    expect((await db.query<{is_premium:boolean}>('select is_premium from users where id=$1',[user])).rows[0].is_premium).toBe(false);
  });
});
