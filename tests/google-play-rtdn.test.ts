import { beforeEach, expect, it, vi } from 'vitest';
import { createServiceClient } from '@/lib/supabase/server';
import { getSubscriptionPurchase, verifyGooglePlayPush } from '@/lib/google-play';
import { reconcileGooglePlayPurchase } from '@/lib/google-play-reconciliation';
import { POST } from '@/app/api/mobile/rtdn/route';

vi.mock('@/lib/supabase/server',()=>({createServiceClient:vi.fn()}));
vi.mock('@/lib/google-play',async original=>({...await original<typeof import('@/lib/google-play')>(),getSubscriptionPurchase:vi.fn(),verifyGooglePlayPush:vi.fn()}));
vi.mock('@/lib/google-play-reconciliation',async original=>({...await original<typeof import('@/lib/google-play-reconciliation')>(),reconcileGooglePlayPurchase:vi.fn()}));
vi.mock('@/lib/metrics',()=>({recordMetric:vi.fn()}));
vi.mock('@/lib/operational-alerts',()=>({observeOperationalSignal:vi.fn()}));
const lookup=vi.fn();
let table='';
const builder={select:()=>builder,eq:()=>builder,maybeSingle:()=>lookup(table)};
const request=(packageName='org.liravo.app')=>new Request('https://app.test/api/mobile/rtdn',{method:'POST',body:JSON.stringify({subscription:'projects/test/subscriptions/push',message:{messageId:'delivery',data:Buffer.from(JSON.stringify({packageName,subscriptionNotification:{purchaseToken:'private-token',subscriptionId:'liravo_premium_monthly',notificationType:2}})).toString('base64')}})});
beforeEach(()=>{
  vi.clearAllMocks();lookup.mockReset().mockResolvedValue({data:null,error:null});
  vi.mocked(createServiceClient).mockReturnValue({from:(name:string)=>{table=name;return builder;}} as unknown as ReturnType<typeof createServiceClient>);
  vi.mocked(verifyGooglePlayPush).mockResolvedValue('verified');
  vi.mocked(getSubscriptionPurchase).mockResolvedValue({subscriptionState:'SUBSCRIPTION_STATE_ACTIVE',lineItems:[{productId:'liravo_premium_monthly',expiryTime:'2099-11-26T12:00:00Z'}],externalAccountIdentifiers:{obfuscatedExternalAccountId:'registered-account'}});
});

it('rejects an unverified push before reading billing data',async()=>{
  vi.mocked(verifyGooglePlayPush).mockResolvedValue('unauthorized');
  expect((await POST(request())).status).toBe(401);expect(createServiceClient).not.toHaveBeenCalled();
});

it('rejects another package and never fetches its purchase',async()=>{
  expect((await POST(request('another.app'))).status).toBe(400);expect(getSubscriptionPurchase).not.toHaveBeenCalled();
});

it('retries unavailable Google verification instead of acknowledging a lost event',async()=>{
  vi.mocked(getSubscriptionPurchase).mockRejectedValue(new Error('provider timeout'));
  expect((await POST(request())).status).toBe(503);expect(reconcileGooglePlayPurchase).not.toHaveBeenCalled();
});

it('retains an unbound purchase for retry without granting access to a guessed user',async()=>{
  const response=await POST(request());
  expect(response.status).toBe(503);expect(await response.json()).toMatchObject({code:'PURCHASE_ACCOUNT_NOT_BOUND'});
  expect(reconcileGooglePlayPurchase).not.toHaveBeenCalled();
});

it('resolves the registered purchase account before committing the entitlement',async()=>{
  lookup.mockImplementation(async(name:string)=>({data:name==='billing_accounts'?{user_id:'registered-owner'}:null,error:null}));
  expect((await POST(request())).status).toBe(200);
  expect(reconcileGooglePlayPurchase).toHaveBeenCalledWith('registered-owner','private-token',expect.anything(),expect.any(String),expect.any(String),{id:'delivery',fingerprint:expect.stringMatching(/^[a-f0-9]{64}$/)});
});
it('rejects a conflicting delivery before fetching or mutating a purchase',async()=>{
  lookup.mockResolvedValue({data:{fingerprint:'different',status:'processed'},error:null});
  expect((await POST(request())).status).toBe(409);expect(getSubscriptionPurchase).not.toHaveBeenCalled();
});
