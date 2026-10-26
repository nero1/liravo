import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/server';
import { drainRefundReconciliation, fetchCapturedPayment } from '@/lib/refund-reconciliation';
import { paymentWebhook } from '@/lib/payment-handler';

vi.mock('@/lib/supabase/server',()=>({createServiceClient:vi.fn()}));
vi.mock('@/lib/operational-alerts',()=>({observeOperationalSignal:vi.fn()}));
vi.mock('@/lib/metrics',()=>({recordMetric:vi.fn()}));
const user='00000000-0000-4000-8000-000000000001',target='00000000-0000-4000-8000-000000000002';
const event={provider:'paystack',refund_id:'refund-91',payment_id:'42',amount_minor:'5000',currency:'USD',attempts:1,correlation_id:'refund-request'};
const rpc=vi.fn(),transport=vi.fn(),update=vi.fn();let capture:object|null=null;
const builder={select:()=>builder,eq:()=>builder,update:(value:unknown)=>{update(value);return builder;},maybeSingle:async()=>({data:capture,error:null}),then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({error:null}).then(resolve)};
const transaction={id:42,status:'success',amount:10000,currency:'USD',paid_at:'2026-10-26T00:00:00Z',reference:'tip_'+target,metadata:{tip_id:target}};
beforeEach(()=>{
  vi.clearAllMocks();capture=null;transport.mockReset();rpc.mockReset().mockImplementation(async(name:string)=>({data:name==='claim_refund_reconciliation'?[event]:true,error:null}));
  vi.stubGlobal('fetch',transport);vi.stubEnv('PAYSTACK_SECRET_KEY','isolated-refund-key');
  vi.stubEnv('DODOPAYMENTS_API_KEY','isolated-dodo-key');vi.stubEnv('DODOPAYMENTS_ENVIRONMENT','test_mode');
  vi.mocked(createServiceClient).mockReturnValue({rpc,from:()=>builder} as unknown as ReturnType<typeof createServiceClient>);
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});

it('fetches the original charge and commits missing capture plus refund in one transaction',async()=>{
  transport.mockResolvedValue(new Response(JSON.stringify({status:true,data:transaction})));
  expect(await drainRefundReconciliation('job-request')).toEqual({scanned:1,completed:1,failed:0});
  expect(transport.mock.calls[0][0]).toBe('https://api.paystack.co/transaction/42');
  expect(rpc).toHaveBeenCalledWith('reconcile_capture_and_refund',expect.objectContaining({p_payment_id:'42',p_amount_minor:5000,p_event_id:'charge:42',p_payload:expect.objectContaining({tipId:target,payment_id:'42',paid_amount_minor:10000})}));
});

it('applies a queued refund without another provider call when the charge is already recorded',async()=>{
  capture={payment_id:'42'};
  expect(await drainRefundReconciliation('job-request')).toMatchObject({completed:1,failed:0});
  expect(transport).not.toHaveBeenCalled();
  expect(rpc).toHaveBeenCalledWith('process_refund_event',expect.objectContaining({p_refund_id:'refund-91',p_payment_id:'42'}));
});

it('retains failed lookups for retry without acknowledging a financial adjustment',async()=>{
  transport.mockRejectedValue(new Error('Timeout'));
  expect(await drainRefundReconciliation('job-request')).toEqual({scanned:1,completed:0,failed:1});
  expect(update).toHaveBeenCalledWith(expect.objectContaining({status:'pending',claimed_at:null}));
  expect(rpc).not.toHaveBeenCalledWith('process_refund_event',expect.anything());expect(rpc).not.toHaveBeenCalledWith('reconcile_capture_and_refund',expect.anything());
});

it('uses the immutable Dodo service period rather than the subscription current renewal date',async()=>{
  transport.mockResolvedValue(new Response(JSON.stringify({payment_id:'pay_original',status:'succeeded',created_at:'2026-09-26T00:00:00Z',subscription_ids:['sub_remote'],metadata:{subscription_id:target,user_id:user,reference:'sub_'+target},total_amount:499,currency:'USD',service_periods:[{subscription_id:'sub_remote',starts_at:'2026-09-26T00:00:00Z',ends_at:'2026-10-26T00:00:00Z'}]})));
  expect(await fetchCapturedPayment('dodopayments','pay_original')).toMatchObject({eventId:'payment:pay_original',payload:{period_end:'2026-10-26T00:00:00Z',payment_id:'pay_original'}});
});

it('rejects a provider lookup returning another payment identity',async()=>{
  transport.mockResolvedValue(new Response(JSON.stringify({status:true,data:{...transaction,id:43}})));
  await expect(fetchCapturedPayment('paystack','42')).rejects.toThrow('identity unavailable');
});

const request=()=>{
  const body=JSON.stringify({event:'refund.processed',data:{id:91,transaction:{id:42},amount:5000,currency:'USD',status:'processed'}});
  return new Request('https://app.test/api/webhooks/payments',{method:'POST',body,headers:{'x-paystack-signature':createHmac('sha512','isolated-refund-key').update(body).digest('hex')}});
};
it('passes verified refund identities to the ledger and keeps unmatched captures retryable',async()=>{
  expect((await paymentWebhook(request())).status).toBe(200);
  expect(rpc).toHaveBeenCalledWith('process_refund_event',expect.objectContaining({p_provider:'paystack',p_refund_id:'91',p_payment_id:'42',p_amount_minor:5000,p_currency:'USD'}));
  rpc.mockResolvedValue({data:null,error:null});
  const pending=await paymentWebhook(request());expect(pending.status).toBe(503);expect(await pending.json()).toMatchObject({code:'REFUND_CAPTURE_PENDING'});
});
