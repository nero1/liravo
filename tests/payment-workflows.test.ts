import { beforeEach, expect, it, vi } from 'vitest';
import { createServiceClient } from '@/lib/supabase/server';
import { cancelProviderSubscription, createTipCheckout } from '@/lib/payment-providers';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { drainSubscriptionCancellations } from '@/lib/subscription-cancellations';
import { POST as cancel } from '@/app/api/subscriptions/cancel/route';
import { POST as createTip } from '@/app/api/tips/create/route';
import { POST as requestPayout } from '@/app/api/earnings/request-payout/route';
import { observeOperationalSignal } from '@/lib/operational-alerts';
import { readPaymentRecovery } from '@/lib/payment-recovery';

vi.mock('@/lib/supabase/server',()=>({createServiceClient:vi.fn()}));
vi.mock('@/lib/account-pin',async original=>({...await original<typeof import('@/lib/account-pin')>(),readAccountPin:vi.fn(async()=>null),verifyAccountPin:vi.fn(async()=>null)}));
vi.mock('@/lib/auth/getCurrentUser',()=>({getCurrentUser:vi.fn()}));
vi.mock('@/lib/payment-providers',async original=>({...await original<typeof import('@/lib/payment-providers')>(),cancelProviderSubscription:vi.fn(),createTipCheckout:vi.fn()}));
vi.mock('@/lib/payment-recovery',()=>({readPaymentRecovery:vi.fn()}));
vi.mock('@/lib/metrics',()=>({recordMetric:vi.fn()}));
vi.mock('@/lib/operational-alerts',()=>({observeOperationalSignal:vi.fn()}));
vi.mock('@/lib/rate-limit',()=>({checkMoneyRateLimit:async()=>({allowed:true})}));
vi.mock('@/lib/locks',()=>({withRedisLock:async(_key:string,_ttl:number,task:()=>Promise<unknown>)=>task()}));
const user='00000000-0000-4000-8000-000000000001';
const recipient='00000000-0000-4000-8000-000000000002';
const tip='00000000-0000-4000-8000-000000000003';
const job={subscription_id:tip,provider:'dodopayments',provider_subscription_id:'sub_remote',attempts:1,correlation_id:'test-request'};
const rpc=vi.fn();
const update=vi.fn();
let googleSubscriptions: {id:string}[]=[];
const filters: [string,unknown][]=[];
const builder={
  select:()=>builder,eq:(key:string,value:unknown)=>{filters.push([key,value]);return builder;},
  gt:()=>builder,limit:()=>builder,
  update:(value:unknown)=>{update(value);return builder;},
  single:async()=>({data:{id:tip,amount:'3.00',currency:'USD',status:'pending',checkout_url:null},error:null}),
  then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data:googleSubscriptions,error:null}).then(resolve),
};
beforeEach(()=>{
  vi.clearAllMocks();filters.length=0;googleSubscriptions=[];
  vi.mocked(readPaymentRecovery).mockResolvedValue([]);
  vi.mocked(getCurrentUser).mockResolvedValue({id:user,email:'authenticated@example.test'});
  vi.mocked(createServiceClient).mockReturnValue({rpc,from:()=>builder} as unknown as ReturnType<typeof createServiceClient>);
  rpc.mockReset();
});
const request=()=>new Request('https://app.test/api/subscriptions/cancel',{method:'POST'});

it('commits local cancellation only after confirmed provider cancellation',async()=>{
  rpc.mockImplementation(async(name:string)=>({data:name==='claim_subscription_cancellations'?[job]:null,error:null}));
  vi.mocked(cancelProviderSubscription).mockResolvedValue();
  expect(await drainSubscriptionCancellations(user)).toEqual({scanned:1,completed:1,failed:0});
  expect(cancelProviderSubscription).toHaveBeenCalledWith('dodopayments','sub_remote',`cancel_${tip}`);
  expect(rpc).toHaveBeenCalledWith('complete_subscription_cancellation',{p_subscription_id:tip});
  expect(update).not.toHaveBeenCalled();
});

it('retains an ambiguous provider failure for retry without revoking entitlement',async()=>{
  rpc.mockResolvedValue({data:[job],error:null});
  vi.mocked(cancelProviderSubscription).mockRejectedValue(new Error('network timeout'));
  expect(await drainSubscriptionCancellations(user)).toEqual({scanned:1,completed:0,failed:1});
  expect(rpc).not.toHaveBeenCalledWith('complete_subscription_cancellation',expect.anything());
  expect(update).toHaveBeenCalledWith(expect.objectContaining({status:'pending'}));
  expect(filters).toContainEqual(['attempts',1]);
});

it('reports pending cancellation honestly and rejects anonymous requests before touching the ledger',async()=>{
  rpc.mockImplementation(async(name:string)=>({data:name==='claim_subscription_cancellations'?[]:1,error:null}));
  const response=await cancel(request());
  expect(response.status).toBe(202);expect(await response.json()).toMatchObject({cancelled:false,pending:true});
  rpc.mockClear();vi.mocked(getCurrentUser).mockResolvedValue(null);
  expect((await cancel(request())).status).toBe(401);expect(rpc).not.toHaveBeenCalled();
});

it('does not report success when the cancellation state cannot be decoded',async()=>{
  rpc.mockImplementation(async(name:string)=>({data:name==='claim_subscription_cancellations'?[]:null,error:null}));
  expect((await cancel(request())).status).toBe(503);
});

it('opens checkout without claiming a tip has been paid, using the authenticated email',async()=>{
  rpc.mockResolvedValue({data:{id:tip},error:null});
  vi.mocked(createTipCheckout).mockResolvedValue({url:'https://checkout.dodopayments.com/pay/tip',checkoutId:'cks_tip_fixture'});
  const response=await createTip(new Request('https://app.test/api/tips/create',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'tip-request-key'},body:JSON.stringify({recipientId:recipient,amount:3,currency:'USD'})}));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({tipId:tip,redirectUrl:'https://checkout.dodopayments.com/pay/tip'});
  expect(createTipCheckout).toHaveBeenCalledWith(expect.objectContaining({id:tip}),'authenticated@example.test');
  expect(rpc).toHaveBeenCalledWith('record_checkout_session',expect.objectContaining({p_user_id:user,p_kind:'tip',p_entity_id:tip,p_checkout_id:'cks_tip_fixture',p_url:'https://checkout.dodopayments.com/pay/tip'}));
});

it('returns a retryable checkout failure while preserving the durable tip intent',async()=>{
  rpc.mockResolvedValue({data:{id:tip},error:null});
  vi.mocked(createTipCheckout).mockRejectedValue(new Error('timeout'));
  const response=await createTip(new Request('https://app.test/api/tips/create',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'tip-request-key'},body:JSON.stringify({recipientId:recipient,amount:3,currency:'USD'})}));
  expect(response.status).toBe(502);
  expect(update).not.toHaveBeenCalled();
  expect(rpc).toHaveBeenCalledWith('create_tip_transaction',expect.objectContaining({p_idempotency_key:'tip-request-key'}));
});

it('returns the owned receipt for an uncredited capture instead of reopening its checkout',async()=>{
  rpc.mockResolvedValue({data:{id:tip},error:null});
  vi.mocked(readPaymentRecovery).mockResolvedValue([{currency:'USD',charged_minor:200,refunded_minor:0,count:1}]);
  const response=await createTip(new Request('https://app.test/api/tips/create',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'tip-request-key'},body:JSON.stringify({recipientId:recipient,amount:3,currency:'USD'})}));
  expect(await response.json()).toMatchObject({tipId:tip,redirectUrl:'/tips/'+tip});
  expect(createTipCheckout).not.toHaveBeenCalled();expect(readPaymentRecovery).toHaveBeenCalledWith(user,'tip',tip);
});

it('alerts on payout dependencies rather than ordinary insufficient-balance rejections',async()=>{
  const payoutRequest=()=>new Request('https://app.test/api/earnings/request-payout',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':'payout-request-key'},body:JSON.stringify({amount:'25.00'})});
  rpc.mockResolvedValueOnce({data:null,error:{code:'P0001'}});
  expect((await requestPayout(payoutRequest())).status).toBe(409);
  expect(observeOperationalSignal).not.toHaveBeenCalled();
  rpc.mockResolvedValueOnce({data:null,error:{code:'08006'}});
  const response=await requestPayout(payoutRequest());
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({code:'PAYOUT_DEPENDENCY_FAILURE'});
  expect(observeOperationalSignal).toHaveBeenCalledWith('payoutFailures',expect.any(String));
});

it('does not claim a Google-managed subscription was cancelled on the web',async()=>{
  rpc.mockImplementation(async(name:string)=>({data:name==='claim_subscription_cancellations'?[]:0,error:null}));
  googleSubscriptions=[{id:tip}];
  const response=await cancel(request());
  expect(response.status).toBe(409);expect(await response.json()).toMatchObject({cancelled:false,pending:false,managedExternally:true,managementUrl:expect.stringContaining('https://play.google.com/store/account/subscriptions?')});
});
