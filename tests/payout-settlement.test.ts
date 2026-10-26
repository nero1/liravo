import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { createServiceClient } from '@/lib/supabase/server';
import { processPayout } from '@/lib/payout-settlement';
import { paymentWebhook } from '@/lib/payment-handler';

vi.mock('@/lib/supabase/server',()=>({createServiceClient:vi.fn()}));
vi.mock('@/lib/metrics',()=>({recordMetric:vi.fn()}));
vi.mock('@/lib/operational-alerts',()=>({observeOperationalSignal:vi.fn()}));
const rpc=vi.fn(),transport=vi.fn(),persist=vi.fn();
const payout={id:'00000000-0000-4000-8000-000000000011',claimed:true,status:'processing',amount:'600.00',currency:'NGN',method:'paystack',transfer_reference:'liravo_payout_test',provider_recipient_code:'RCP_saved',attempts:1,destination:{display_name:'Reader',account_number:'1234567890',bank_code:'058',currency:'NGN'}};
const transfer={reference:payout.transfer_reference,amount:60000,currency:'NGN',status:'success',transfer_code:'TRF_confirmed',recipient:{recipient_code:'RCP_saved'}};
const builder={select:()=>builder,eq:()=>builder,update:(value:unknown)=>{persist(value);return builder;},single:async()=>({data:{id:payout.id},error:null}),maybeSingle:async()=>({data:{id:payout.id,provider_recipient_code:'RCP_saved'},error:null})};
const provider=(data:unknown)=>new Response(JSON.stringify({status:true,data}));
beforeEach(()=>{
  vi.clearAllMocks();rpc.mockReset().mockImplementation(async(name:string)=>({data:name==='claim_payout_request'?payout:null,error:null}));
  transport.mockReset();vi.stubGlobal('fetch',transport);vi.stubEnv('PAYSTACK_SECRET_KEY','isolated-provider-key');
  vi.mocked(createServiceClient).mockReturnValue({rpc,from:()=>builder} as unknown as ReturnType<typeof createServiceClient>);
});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});

it('reconciles an existing confirmed transfer without sending another payment',async()=>{
  transport.mockResolvedValue(provider(transfer));
  expect(await processPayout(payout.id,'admin','test-request')).toMatchObject({processed:true,pending:false});
  expect(transport).toHaveBeenCalledTimes(1);expect(transport.mock.calls[0][1].method).toBe('GET');
  expect(rpc).toHaveBeenCalledWith('settle_payout_request',expect.objectContaining({p_reference:payout.transfer_reference,p_amount:'600.00',p_currency:'NGN',p_status:'completed'}));
});

it('retains reservations after timeouts and confirms the same reference on retry',async()=>{
  transport.mockRejectedValueOnce(new Error('Connection reset'));
  expect(await processPayout(payout.id,'admin','test-request')).toMatchObject({processed:false,pending:true});
  expect(rpc).toHaveBeenCalledWith('defer_payout_request',expect.objectContaining({p_payout_id:payout.id}));
  expect(rpc).not.toHaveBeenCalledWith('settle_payout_request',expect.anything());
  transport.mockResolvedValue(provider(transfer));
  expect(await processPayout(payout.id,'admin','test-request')).toMatchObject({processed:true});
  expect(transport.mock.calls.map(call=>call[0])).toEqual(Array(2).fill(`https://api.paystack.co/transfer/verify/${payout.transfer_reference}`));
});

it('does not mark a pending or mismatched provider transfer as paid',async()=>{
  for(const change of [{status:'pending'},{amount:59999},{currency:'USD'},{recipient:{recipient_code:'RCP_other'}}]){
    rpc.mockClear();transport.mockResolvedValue(provider({...transfer,...change}));
    expect(await processPayout(payout.id,'admin','test-request')).toMatchObject({processed:false,pending:true});
    expect(rpc).not.toHaveBeenCalledWith('settle_payout_request',expect.anything());
  }
});

it('uses the captured destination and stable reference, then verifies provider settlement',async()=>{
  rpc.mockImplementation(async(name:string)=>({data:name==='claim_payout_request'?{...payout,provider_recipient_code:null}:null,error:null}));
  transport.mockResolvedValueOnce(provider({recipient_code:'RCP_saved'})).mockResolvedValueOnce(new Response('{}',{status:404})).mockResolvedValueOnce(provider({transfer_code:'TRF_confirmed',status:'pending'})).mockResolvedValueOnce(provider(transfer));
  const result=await processPayout(payout.id,'admin','test-request');
  expect(result.processed).toBe(true);expect(persist).toHaveBeenCalledWith({provider_recipient_code:'RCP_saved'});
  expect(JSON.parse(transport.mock.calls[2][1].body)).toMatchObject({amount:60000,recipient:'RCP_saved',reference:payout.transfer_reference});
  expect(transport.mock.calls[3][1].method).toBe('GET');
});

it('does not treat transfer initiation as settlement when its response is lost',async()=>{
  transport.mockResolvedValueOnce(new Response('{}',{status:404})).mockRejectedValueOnce(new Error('Lost response'));
  expect(await processPayout(payout.id,'admin','test-request')).toMatchObject({processed:false,pending:true});
  expect(rpc).not.toHaveBeenCalledWith('settle_payout_request',expect.anything());
  transport.mockResolvedValue(provider(transfer));
  expect(await processPayout(payout.id,'admin','test-request')).toMatchObject({processed:true});
  expect(transport.mock.calls.filter(call=>call[1].method==='POST')).toHaveLength(1);
});

const signed=(event:string,data:unknown)=>{
  const body=JSON.stringify({event,data});
  return new Request('https://app.test/api/webhooks/payments',{method:'POST',body,headers:{'x-paystack-signature':createHmac('sha512','isolated-provider-key').update(body).digest('hex')}});
};
it('binds a native signed transfer notification to its reserved amount, currency and recipient',async()=>{
  expect((await paymentWebhook(signed('transfer.success',transfer))).status).toBe(200);
  expect(rpc).toHaveBeenCalledWith('settle_payout_request',expect.objectContaining({p_actor_id:null,p_payout_id:payout.id,p_amount:'600.00',p_currency:'NGN',p_provider_code:'TRF_confirmed'}));
  rpc.mockClear();
  const wrongRecipient=await paymentWebhook(signed('transfer.success',{...transfer,recipient:{recipient_code:'RCP_other'}}));
  expect(wrongRecipient.status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});

it('dispatches signed tip and subscription payments through the same configured webhook',async()=>{
  const user='00000000-0000-4000-8000-000000000001';
  const tipNotice={id:12345,status:'success',amount:100,currency:'USD',metadata:{tip_id:payout.id}};
  expect((await paymentWebhook(signed('charge.success',tipNotice))).status).toBe(200);
  expect(rpc).toHaveBeenCalledWith('process_payment_event',expect.objectContaining({p_payload:expect.objectContaining({tipId:payout.id})}));
  rpc.mockClear();
  const subscription=await paymentWebhook(signed('charge.success',{...tipNotice,amount:499,paid_at:'2026-10-26T00:00:00Z',reference:'sub_'+payout.id,metadata:{subscription_id:payout.id,user_id:user}}));
  expect(subscription.status).toBe(200);
  expect(rpc).toHaveBeenCalledWith('process_payment_event',expect.objectContaining({p_payload:expect.objectContaining({subscription_id:payout.id,user_id:user})}));
});
