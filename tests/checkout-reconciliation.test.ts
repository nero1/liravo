import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { drainCheckoutReconciliation } from '@/lib/checkout-reconciliation';
import { createServiceClient } from '@/lib/supabase/server';
import { capturedPaymentEvent,fetchCapturedPayment } from '@/lib/refund-reconciliation';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { POST } from '@/app/api/payments/reconcile/route';
vi.mock('@/lib/supabase/server',()=>({createServiceClient:vi.fn()}));
vi.mock('@/lib/refund-reconciliation',()=>({capturedPaymentEvent:vi.fn(),fetchCapturedPayment:vi.fn()}));
vi.mock('@/lib/auth/getCurrentUser',()=>({getCurrentUser:vi.fn()}));
vi.mock('@/lib/rate-limit',()=>({checkRouteRateLimit:async()=>true}));
vi.mock('@/lib/operational-alerts',()=>({observeOperationalSignal:vi.fn()}));
vi.mock('@/lib/metrics',()=>({recordMetric:vi.fn()}));
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
const actor='00000000-0000-4000-8000-000000000001',entityId='00000000-0000-4000-8000-000000000002',claim='00000000-0000-4000-8000-000000000003';
let job:Record<string,unknown>,entity:Record<string,unknown>;
const rpc=vi.fn(),transport=vi.fn();
beforeEach(()=>{
  vi.clearAllMocks();vi.stubGlobal('fetch',transport);vi.stubEnv('PAYSTACK_SECRET_KEY','isolated-provider-key');vi.stubEnv('DODOPAYMENTS_API_KEY','isolated-provider-key');
  job={entity_type:'tip',entity_id:entityId,user_id:actor,provider:'paystack',reference:'tip_'+entityId,claim_token:claim,scan_page:0,attempts:1};
  entity={id:entityId,user_id:actor,currency:'NGN',created_at:new Date().toISOString(),provider_checkout_id:'tip_'+entityId};
  const builder={select:()=>builder,eq:()=>builder,maybeSingle:async()=>({data:entity,error:null})};
  rpc.mockImplementation(async(name:string)=>({data:name==='claim_checkout_reconciliations'?[job]:true,error:null}));
  vi.mocked(createServiceClient).mockReturnValue({rpc,from:()=>builder} as unknown as ReturnType<typeof createServiceClient>);
  const event:Awaited<ReturnType<typeof capturedPaymentEvent>>={eventId:'charge:verified',payload:{tipId:entityId,status:'completed',providerReference:'verified',payment_id:'verified',paid_amount_minor:300,tax_minor:0,currency:'NGN'}};
  vi.mocked(capturedPaymentEvent).mockResolvedValue(event);vi.mocked(fetchCapturedPayment).mockResolvedValue(event);
});
it('verifies the stable Paystack reference and settles through the existing payment ledger',async()=>{
  transport.mockResolvedValue(Response.json({status:true,data:{reference:'tip_'+entityId,status:'success'}}));
  expect(await drainCheckoutReconciliation('test-request',actor)).toEqual({scanned:1,applied:1,failed:0});
  expect(transport.mock.calls[0][0]).toBe('https://api.paystack.co/transaction/verify/tip_'+entityId);
  expect(rpc).toHaveBeenCalledWith('claim_checkout_reconciliations',{p_user_id:actor,p_limit:3});
  expect(rpc).toHaveBeenCalledWith('process_payment_event',expect.objectContaining({p_event_id:'charge:verified'}));
  expect(rpc).toHaveBeenCalledWith('finish_checkout_reconciliation',expect.objectContaining({p_claim:claim,p_settled:true,p_ok:true}));
});
it('quarantines a verified payment bound to another entity instead of crediting it',async()=>{
  transport.mockResolvedValue(Response.json({status:true,data:{reference:'tip_'+entityId,status:'success'}}));
  vi.mocked(capturedPaymentEvent).mockResolvedValueOnce({eventId:'charge:foreign',payload:{tipId:claim,status:'completed',providerReference:'foreign',payment_id:'foreign',paid_amount_minor:300,tax_minor:0,currency:'NGN'}});
  expect((await drainCheckoutReconciliation('test-request')).failed).toBe(1);
  expect(rpc.mock.calls.some(([name])=>name==='process_payment_event')).toBe(false);
  expect(rpc).toHaveBeenCalledWith('finish_checkout_reconciliation',expect.objectContaining({p_ok:false,p_error:'BINDING_MISMATCH'}));
});
it('checks Dodo session identity before accepting a captured payment',async()=>{
  job.provider='dodopayments';entity.currency='USD';entity.provider_checkout_id='cks_expected';
  transport.mockResolvedValueOnce(Response.json({id:'cks_foreign',payment_status:'succeeded',payment_id:'pay_foreign'}));
  expect((await drainCheckoutReconciliation('test-request')).failed).toBe(1);expect(fetchCapturedPayment).not.toHaveBeenCalled();
  transport.mockResolvedValueOnce(Response.json({id:'cks_expected',payment_status:'succeeded',payment_id:'pay_expected'}));
  expect((await drainCheckoutReconciliation('test-request')).applied).toBe(1);
  expect(fetchCapturedPayment).toHaveBeenCalledWith('dodopayments','pay_expected');
});
it('persists renewal pagination without ending an active recurring contract',async()=>{
  job={...job,provider:'dodopayments',entity_type:'subscription'};entity={...entity,provider:'dodopayments',provider_subscription_id:'sub_remote',renewal_cancelled:false};
  transport.mockResolvedValueOnce(Response.json({items:[{payment_id:'pay_one'},{payment_id:'pay_two'},{payment_id:'pay_three'}]}));
  vi.mocked(fetchCapturedPayment).mockImplementation(async(_provider,id)=>({eventId:'payment:'+id,payload:{event:'subscription.activated',subscription_id:entityId,user_id:actor,provider_event_at:new Date().toISOString(),provider_subscription_id:'sub_remote',payment_id:id,paid_amount_minor:499,tax_minor:0,currency:'USD',period_end:new Date(Date.now()+86400000).toISOString(),provider_reference:'sub_'+entityId}}));
  expect((await drainCheckoutReconciliation('test-request')).applied).toBe(3);
  expect(new URL(transport.mock.calls[0][0]).searchParams.get('subscription_id')).toBe('sub_remote');
  expect(rpc).toHaveBeenCalledWith('finish_checkout_reconciliation',expect.objectContaining({p_settled:false,p_page:1,p_delay:60}));
});
it('retains ambiguous provider failures as retryable work without claiming payment',async()=>{
  transport.mockRejectedValueOnce(new Error('Timeout'));
  expect(await drainCheckoutReconciliation('test-request')).toEqual({scanned:1,applied:0,failed:1});
  expect(rpc.mock.calls.some(([name])=>name==='process_payment_event')).toBe(false);
  expect(rpc).toHaveBeenCalledWith('finish_checkout_reconciliation',expect.objectContaining({p_ok:false,p_error:'DEPENDENCY_FAILURE'}));
});
it('requires authentication and ignores caller-supplied ownership and external return URLs',async()=>{
  vi.mocked(getCurrentUser).mockResolvedValue(null);
  expect((await POST(new Request('https://app.test',{method:'POST'}))).status).toBe(401);expect(rpc).not.toHaveBeenCalled();
  vi.mocked(getCurrentUser).mockResolvedValue({id:actor,email:'reader@example.test'});
  rpc.mockResolvedValue({data:[],error:null});
  const response=await POST(new Request('https://app.test/api/payments/reconcile',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'_return=https%3A%2F%2Fevil.test&userId='+claim}));
  expect(response.status).toBe(303);expect(response.headers.get('Location')).toBe('/premium?payment=pending');
  expect(rpc).toHaveBeenCalledWith('claim_checkout_reconciliations',{p_user_id:actor,p_limit:3});
});
