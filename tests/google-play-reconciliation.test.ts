import { beforeEach, expect, it, vi } from 'vitest';
import { createServiceClient } from '@/lib/supabase/server';
import { acknowledgeSubscription, type PlaySubscriptionState } from '@/lib/google-play';
import { reconcileGooglePlayPurchase } from '@/lib/google-play-reconciliation';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const nativeExports: {monthlyGooglePlayOffer?: (product:unknown,sku:string)=>unknown} = {};
runInNewContext(ts.transpileModule(readFileSync('mobile/lib/google-play-offer.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:nativeExports});
const monthlyGooglePlayOffer=nativeExports.monthlyGooglePlayOffer!;

vi.mock('@/lib/supabase/server',()=>({createServiceClient:vi.fn()}));
vi.mock('@/lib/google-play',async original=>({...await original<typeof import('@/lib/google-play')>(),acknowledgeSubscription:vi.fn()}));
const rpc=vi.fn();
const committed={active:true,expiresAt:'2099-11-26T12:00:00Z',providerState:'SUBSCRIPTION_STATE_ACTIVE',acknowledged:false};
const state:PlaySubscriptionState={subscriptionState:'SUBSCRIPTION_STATE_ACTIVE',acknowledgementState:'ACKNOWLEDGEMENT_STATE_PENDING',lineItems:[{productId:'liravo_premium_monthly',expiryTime:'2099-11-26T12:00:00Z'}]};
beforeEach(()=>{
  vi.clearAllMocks();rpc.mockReset().mockResolvedValue({data:committed,error:null});
  vi.mocked(createServiceClient).mockReturnValue({rpc} as unknown as ReturnType<typeof createServiceClient>);
  vi.mocked(acknowledgeSubscription).mockResolvedValue();
});
const reconcile=()=>reconcileGooglePlayPurchase('owner','private-token',state,new Date().toISOString(),'test-request',{id:'delivery',fingerprint:'a'.repeat(64)});

it('commits ownership before remote acknowledgement and completes the delivery afterwards',async()=>{
  const order:string[]=[];
  rpc.mockImplementation(async(name:string)=>{order.push(name);return {data:committed,error:null};});
  vi.mocked(acknowledgeSubscription).mockImplementation(async()=>{order.push('remote-ack');});
  expect(await reconcile()).toMatchObject({active:true,acknowledged:true});
  expect(order).toEqual(['reconcile_google_play_purchase','remote-ack','complete_google_play_delivery']);
  expect(rpc.mock.calls[0][1].p_token_id).toMatch(/^gplay_[a-f0-9]{64}$/);
});

it('does not acknowledge a purchase when durable ownership cannot commit',async()=>{
  rpc.mockResolvedValue({error:{code:'P1003'}});
  await expect(reconcile()).rejects.toMatchObject({status:403,code:'PURCHASE_ACCOUNT_MISMATCH'});
  expect(acknowledgeSubscription).not.toHaveBeenCalled();expect(rpc).toHaveBeenCalledTimes(1);
});

it('leaves a failed acknowledgement pending and safely retries completion',async()=>{
  vi.mocked(acknowledgeSubscription).mockRejectedValueOnce(new Error('timeout'));
  await expect(reconcile()).rejects.toThrow('timeout');
  expect(rpc).not.toHaveBeenCalledWith('complete_google_play_delivery',expect.anything());
  await expect(reconcile()).resolves.toMatchObject({acknowledged:true});
  rpc.mockResolvedValueOnce({data:committed,error:null}).mockResolvedValueOnce({error:{code:'08006'}});
  await expect(reconcile()).rejects.toMatchObject({status:503,code:'BILLING_ACKNOWLEDGEMENT_UNAVAILABLE'});
});

it('does not acknowledge pending purchases or report them as active',async()=>{
  rpc.mockResolvedValue({data:{...committed,active:false,providerState:'SUBSCRIPTION_STATE_PENDING'},error:null});
  expect(await reconcileGooglePlayPurchase('owner','pending-token',{...state,subscriptionState:'SUBSCRIPTION_STATE_PENDING'},new Date().toISOString(),'test-request')).toMatchObject({active:false,acknowledged:false});
  expect(acknowledgeSubscription).not.toHaveBeenCalled();
});

it('selects an actual monthly base-plan offer and its recurring price',()=>{
  const phase=(billingPeriod:string,formattedPrice:string)=>({billingPeriod,formattedPrice});
  const product={productId:'premium',subscriptionOfferDetails:[
    {offerId:null,offerToken:'year',pricingPhases:{pricingPhaseList:[phase('P1Y','$40')]}},
    {offerId:'trial',offerToken:'trial',pricingPhases:{pricingPhaseList:[phase('P1W','$0'),phase('P1M','$5')]}},
    {offerId:null,offerToken:'monthly',pricingPhases:{pricingPhaseList:[phase('P1M','€4.99')]}},
  ]};
  expect(monthlyGooglePlayOffer(product,'premium')).toEqual({sku:'premium',offerToken:'monthly',formattedPrice:'€4.99'});
  expect(monthlyGooglePlayOffer(product,'other')).toBeNull();
  expect(monthlyGooglePlayOffer({...product,subscriptionOfferDetails:product.subscriptionOfferDetails.slice(0,2)},'premium')).toBeNull();
});

it('returns committed receipt state when a concurrent observation supersedes this response',async()=>{
  rpc.mockResolvedValue({data:{...committed,active:false,providerState:'SUBSCRIPTION_STATE_EXPIRED'},error:null});
  expect(await reconcile()).toMatchObject({active:false,providerState:'SUBSCRIPTION_STATE_EXPIRED'});
  expect(acknowledgeSubscription).not.toHaveBeenCalled();
});
