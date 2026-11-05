import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const db = new PGlite();
const user = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const tip = '00000000-0000-4000-8000-000000000003';

beforeAll(async () => {
  await db.exec(readFileSync('supabase/migrations/001_schema.sql', 'utf8'));
  for(const [id,name]of[[user,'creator'],[other,'reader']])await db.query('select create_direct_account($1,$2,$3,$4)',[id,name+'@example.test',name,name]);
  await db.query("insert into tips(id,user_id,recipient_id,amount,platform_fee,recipient_amount,status,currency)values($1,$2,$3,100,10,90,'pending','USD')",[tip,other,user]);
  await db.query("insert into user_payout_methods(user_id,provider,display_name,account_number,bank_code,currency)values($1,'manual','Fixture account','1234567890','AUDIT','USD')",[user]);
  const book=(await db.query<{id:string}>("insert into books(title,author_name)values('Fixture book','Fixture writer')returning id")).rows[0];
  await db.query("insert into reviews(id,user_id,book_id,rating,content,review_type,moderation_status)values($1,$2,$3,4,'Fixture review','short','published')",[tip,other,book.id]);

}, 30_000);
afterAll(() => db.close());

async function pay(id: string, payload: object) {
  return db.query('select process_payment_event($1,$2,$3,$4) as applied', ['paystack',id,JSON.stringify(payload),'test-correlation']);
}

describe('financial transactions', () => {
  it('commits once and rejects conflicting webhook replay', async () => {
    const payload = { tipId: tip, status: 'completed', payment_id: 'pglite-payment-1', paid_amount_minor: 10000, currency: 'USD' };
    await pay('payment-1', payload);
    const queued=(await db.query('select id from outbox_events')).rows;
    await pay('payment-1', payload);
    expect((await db.query('select * from payouts')).rows).toHaveLength(1);
    expect((await db.query('select id from outbox_events')).rows).toEqual(queued);
    await expect(pay('payment-1', { ...payload, status: 'failed' })).rejects.toThrow('conflict');
  });
  it('rolls back the event claim when the business write fails', async () => {
    await expect(pay('payment-2', { tipId: other, status: 'completed', payment_id: 'pglite-payment-2', paid_amount_minor: 10000, currency: 'USD' })).rejects.toThrow('Tip unavailable');
    expect((await db.query("select * from payment_events where event_id='payment-2'")).rows).toHaveLength(0);
  });
  it('reserves balances across simultaneous intents and replays safely', async () => {
    const reserve = (key: string, amount=60) => db.query('select create_payout_request_atomic($1,$2,$3,$4,$5)',[user,amount,'manual',key,'test-correlation']);
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


describe('review like integrity',()=>{
  it('maintains exact counts when a second liker is deleted and rejects hidden review likes',async()=>{
    const liker='00000000-0000-4000-8000-000000000004';
    await db.query('select create_direct_account($1,$2,$3,$4)',[liker,'liker@example.test','liker','Second liker']);
    await db.query("update reviews set is_hidden=true where id=$1",[tip]);
    await expect(db.query("select apply_social_intent($1,$2,'like','hidden-like-key')",[liker,tip])).rejects.toThrow('Review unavailable');
    await db.query("update reviews set is_hidden=false where id=$1",[tip]);
    await db.query('insert into review_likes(user_id,review_id)values($1,$2)',[liker,tip]);
    expect((await db.query('select likes_count from reviews where id=$1',[tip])).rows).toEqual([{likes_count:2}]);
    await db.query('delete from users where id=$1',[liker]);
    expect((await db.query('select likes_count from reviews where id=$1',[tip])).rows).toEqual([{likes_count:1}]);
  });
});

describe('profile privilege boundary', () => {
  it('rejects role and XP escalation through an authenticated profile update', async () => {
    await db.exec("select set_config('request.jwt.claim.role','authenticated',false)");
    try {
      await expect(db.query('update users set is_admin=true where id=$1',[user])).rejects.toThrow('Privileged');
      await expect(db.query('update users set xp=xp+1000 where id=$1',[user])).rejects.toThrow('Privileged');
      expect((await db.query<{is_admin:boolean}>('select is_admin from users where id=$1',[user])).rows[0].is_admin).toBe(false);
    } finally { await db.exec("select set_config('request.jwt.claim.role','service_role',false)"); }
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
    const claims=await db.query<{id:string}>('select * from claim_outbox_events(100)');
    expect(claims.rows.length).toBeGreaterThan(0);
    const before=(await db.query('select * from notifications')).rows.length;
    for (const claim of claims.rows) for (let i=0;i<2;i++) await db.query('select process_outbox_event_atomic($1)',[claim.id]);
    expect((await db.query('select * from notifications')).rows).toHaveLength(before+1);
    expect((await db.query("select * from outbox_events where status='processed'")).rows).toHaveLength(claims.rows.length);
  });
});


describe('subscription intents', () => {
  it('commits one pending subscription and audit across retries, rejecting conflicting payloads', async () => {
    const create=(amount=4.99)=>db.query<{intent:{id:string}}>('select create_subscription_intent($1,$2,$3,$4,$5,$6) as intent',[user,'paystack','USD',amount,'subscription-key','test-correlation']);
    const first=await create(); const second=await create();
    expect(first.rows[0].intent).toEqual(second.rows[0].intent);
    expect(first.rows[0].intent.id).toBeTruthy();
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
  it('records underpayments for return without granting access or duplicating capture receipts',async()=>{
    const created=await db.query<{intent:{id:string}}>('select create_subscription_intent($1,$2,$3,$4,$5,$6)as intent',[user,'paystack','USD',4.99,'underpayment-key','test']);
    const id=created.rows[0].intent.id,payload={event:'subscription.activated',user_id:user,subscription_id:id,payment_id:'pglite-underpayment',paid_amount_minor:1,currency:'USD',provider_reference:`sub_${id}`,provider_event_at:new Date().toISOString(),period_end:new Date(Date.now()+30*86400000).toISOString()};
    await pay('underpayment-event',payload);await pay('underpayment-event',payload);
    expect((await db.query("select credited from payment_captures where payment_id='pglite-underpayment'")).rows).toEqual([{credited:false}]);
    expect((await db.query("select status from payment_returns where payment_id='pglite-underpayment'")).rows).toEqual([{status:'pending'}]);
    expect((await db.query('select has_premium_access($1)active',[user])).rows).toEqual([{active:false}]);
  });
  it('rolls back invalid captures and prevents an older payment from undoing a paid-period cancellation', async () => {
    const created=await db.query<{intent:{id:string}}>('select create_subscription_intent($1,$2,$3,$4,$5,$6) as intent',[user,'paystack','USD',4.99,'ordered-payment-key','test']);
    const id=created.rows[0].intent.id;
    const at=new Date().toISOString(); const later=new Date(Date.now()+1000).toISOString();
    const payload={event:'subscription.activated',user_id:user,subscription_id:id,payment_id:'pglite-subscription-payment',paid_amount_minor:499,currency:'USD',provider_reference:`sub_${id}`,provider_event_at:at,period_end:new Date(Date.now()+30*86400000).toISOString()};
    await expect(pay('underpaid-event',{...payload,tax_minor:500})).rejects.toThrow('Invalid payment');
    expect((await db.query("select * from payment_events where event_id='underpaid-event'")).rows).toHaveLength(0);
    await pay('paid-event-valid',{...payload,paid_amount_minor:499});
    await pay('cancelled-event',{event:'subscription.cancelled',user_id:user,subscription_id:id,provider_event_at:later});
    await expect(pay('paid-event-older',{...payload,paid_amount_minor:499})).rejects.toThrow('Payment identity conflict');
    await pay('paid-event-valid',{...payload,paid_amount_minor:499});
    expect((await db.query<{status:string;renewal_cancelled:boolean}>('select status,renewal_cancelled from subscriptions where id=$1',[id])).rows[0]).toEqual({status:'active',renewal_cancelled:true});
    expect((await db.query<{is_premium:boolean}>('select is_premium from users where id=$1',[user])).rows[0].is_premium).toBe(true);
  });
});
