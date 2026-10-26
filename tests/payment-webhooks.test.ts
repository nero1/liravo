import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { Webhook } from 'standardwebhooks';
import { NextResponse } from 'next/server';
import { readPaymentNotice, normalizeSubscription, normalizeTip } from '../src/lib/payment-webhooks';

const user='00000000-0000-4000-8000-000000000001';
const subscription='00000000-0000-4000-8000-000000000002';
const dodoKey=`whsec_${Buffer.from('isolated-unit-test-signing-key').toString('base64')}`;
afterEach(() => vi.unstubAllEnvs());

function paystack(body: string, signatureBody=body) {
  vi.stubEnv('PAYSTACK_SECRET_KEY','unit-test-key');
  return new Request('https://app.test/api/subscriptions/webhook',{method:'POST',body,headers:{'x-paystack-signature':createHmac('sha512','unit-test-key').update(signatureBody).digest('hex')}});
}
function dodo(body: string, date=new Date()) {
  vi.stubEnv('DODOPAYMENTS_WEBHOOK_SECRET',dodoKey);
  const id='msg_unit_test_12345';
  return new Request('https://app.test/api/subscriptions/webhook',{method:'POST',body,headers:{'webhook-id':id,'webhook-timestamp':String(Math.floor(date.getTime()/1000)),'webhook-signature':new Webhook(dodoKey).sign(id,date,body)}});
}

describe('native provider webhook contracts', () => {
  it('verifies and normalizes a real-shaped Paystack charge rather than a custom relay envelope', async () => {
    const body=JSON.stringify({event:'charge.success',data:{id:12345,status:'success',amount:499,currency:'USD',paid_at:'2026-10-26T00:00:00Z',reference:`sub_${subscription}`,metadata:{user_id:user,subscription_id:subscription}}});
    const notice=await readPaymentNotice(paystack(body));
    if (notice instanceof NextResponse) throw new Error('Expected verified notice');
    const normalized=normalizeSubscription(notice);
    expect(normalized?.eventId).toBe('charge:12345');
    expect(normalized?.payload).toMatchObject({event:'subscription.activated',user_id:user,subscription_id:subscription,paid_amount_minor:499,currency:'USD'});
  });
  it('rejects signature/body tampering', async () => {
    const result=await readPaymentNotice(paystack('{"event":"changed"}','{"event":"original"}'));
    expect(result).toBeInstanceOf(NextResponse); expect((result as NextResponse).status).toBe(401);
  });
  it('verifies Dodo Standard Webhooks signatures including ID and timestamp', async () => {
    const body=JSON.stringify({type:'payment.succeeded',timestamp:'2026-10-26T00:00:00Z',data:{payment_id:'pay_unit_test',status:'succeeded',subscription_ids:['sub_gateway'],total_amount:499,currency:'USD',metadata:{user_id:user,subscription_id:subscription,reference:`sub_${subscription}`}}});
    const notice=await readPaymentNotice(dodo(body));
    if (notice instanceof NextResponse) throw new Error('Expected verified notice');
    expect(normalizeSubscription(notice)).toMatchObject({eventId:'payment:pay_unit_test',payload:{provider_subscription_id:'sub_gateway',paid_amount_minor:499}});
  });
  it('rejects stale Dodo signatures', async () => {
    const result=await readPaymentNotice(dodo('{}',new Date(0)));
    expect((result as NextResponse).status).toBe(401);
  });
  it('deduplicates a payment identity across new delivery IDs and rejects ambiguous business targets', () => {
    const notice={provider:'dodopayments' as const,deliveryId:'delivery-a',event:'payment.succeeded',timestamp:'2026-10-26T00:00:00Z',data:{payment_id:'pay_unit_test',total_amount:500,currency:'USD',metadata:{tip_id:subscription}}};
    expect(normalizeTip(notice)?.eventId).toBe(normalizeTip({...notice,deliveryId:'delivery-b'})?.eventId);
    expect(()=>normalizeTip({...notice,data:{...notice.data,metadata:{tip_id:subscription,subscription_id:subscription}}})).toThrow();
  });
  it('ignores signed events for unrelated products instead of crediting an arbitrary user', async () => {
    const notice=await readPaymentNotice(paystack(JSON.stringify({event:'charge.success',data:{metadata:''}})));
    if (notice instanceof NextResponse) throw new Error('Expected verified notice');
    expect(normalizeSubscription(notice)).toBeNull();
  });
});
