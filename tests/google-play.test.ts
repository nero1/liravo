import { beforeEach, afterEach, expect, it, vi } from 'vitest';

const auth=vi.hoisted(()=>({token:vi.fn(),verify:vi.fn()}));
vi.mock('google-auth-library',()=>({JWT:class {getAccessToken=auth.token;},OAuth2Client:class {verifyIdToken=auth.verify;}}));
import { googlePlayAccountId, googlePlayTokenId, getSubscriptionPurchase, playEntitlement, acknowledgeSubscription, verifyGooglePlayPush, type PlaySubscriptionState } from '@/lib/google-play';
const fetchMock=vi.fn();
const now=Date.parse('2026-10-26T12:00:00Z');
const active:PlaySubscriptionState={subscriptionState:'SUBSCRIPTION_STATE_ACTIVE',acknowledgementState:'ACKNOWLEDGEMENT_STATE_PENDING',lineItems:[{productId:'liravo_premium_monthly',expiryTime:'2026-11-26T12:00:00Z'}]};
beforeEach(()=>{
  vi.clearAllMocks();vi.stubGlobal('fetch',fetchMock);fetchMock.mockReset();
  vi.stubEnv('GOOGLE_PLAY_SERVICE_ACCOUNT_KEY',JSON.stringify({client_email:'test@example.test',private_key:'isolated-test-key'}));
  vi.stubEnv('GOOGLE_PLAY_PRODUCT_ID','liravo_premium_monthly');vi.stubEnv('GOOGLE_PLAY_PACKAGE_NAME','org.liravo.app');
  auth.token.mockResolvedValue({token:'isolated-access-token'});
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});

it('uses the V2 top-level state and paid expiry, including a cancelled paid period',()=>{
  expect(playEntitlement(active,now).active).toBe(true);
  expect(playEntitlement({...active,subscriptionState:'SUBSCRIPTION_STATE_CANCELED'},now).active).toBe(true);
  for(const state of ['SUBSCRIPTION_STATE_PENDING','SUBSCRIPTION_STATE_PAUSED','SUBSCRIPTION_STATE_ON_HOLD','SUBSCRIPTION_STATE_EXPIRED'] as const) expect(playEntitlement({...active,subscriptionState:state},now).active).toBe(false);
  expect(playEntitlement(active,Date.parse('2026-12-01T00:00:00Z')).active).toBe(false);
  expect(playEntitlement({...active,lineItems:[{productId:'liravo_premium_monthly'}]},now).active).toBe(false);
});

it('rejects another product instead of trusting the product submitted by a client',()=>{
  expect(()=>playEntitlement({...active,lineItems:[{productId:'unrelated_product',expiryTime:'2026-11-26T12:00:00Z'}]},now)).toThrow('product mismatch');
});

it('validates the actual V2 response shape and encodes opaque purchase tokens',async()=>{
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(active)));
  expect(await getSubscriptionPurchase('private/token?value')).toEqual(active);
  expect(fetchMock.mock.calls[0][0]).toContain('/subscriptionsv2/tokens/private%2Ftoken%3Fvalue');
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({lineItems:[{productId:'liravo_premium_monthly',subscriptionState:'SUBSCRIPTION_STATE_ACTIVE'}]})));
  await expect(getSubscriptionPurchase('opaque-token')).rejects.toThrow();
});

it('keeps receipt storage opaque and account identifiers stable, private and scoped to the user',()=>{
  expect(googlePlayTokenId('raw-purchase-token')).toMatch(/^gplay_[a-f0-9]{64}$/);
  const first=googlePlayAccountId('account-a');
  expect(first).toMatch(/^[a-f0-9]{64}$/);
  expect(googlePlayAccountId('account-a')).toBe(first);
  expect(googlePlayAccountId('account-b')).not.toBe(first);
});

it('acknowledges after verification and reconciles an acknowledgement with a lost response',async()=>{
  fetchMock.mockResolvedValueOnce(new Response(null,{status:204}));
  await acknowledgeSubscription('opaque-token',active);
  expect(fetchMock.mock.calls[0][1]).toMatchObject({method:'POST',body:'{}'});
  expect(fetchMock.mock.calls[0][0]).toContain('/subscriptions/liravo_premium_monthly/tokens/opaque-token:acknowledge');
  fetchMock.mockResolvedValueOnce(new Response('{}',{status:503})).mockResolvedValueOnce(new Response(JSON.stringify({...active,acknowledgementState:'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED'})));
  await expect(acknowledgeSubscription('opaque-token',active)).resolves.toBeUndefined();
});

it('requires an audience-verified Google identity and the configured push service account',async()=>{
  vi.stubEnv('GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL','push@example.test');
  vi.stubEnv('GOOGLE_PLAY_RTDN_AUDIENCE','https://app.test/api/mobile/rtdn');
  const request=new Request('https://app.test/api/mobile/rtdn',{headers:{authorization:'Bearer signed-test-token'}});
  auth.verify.mockResolvedValue({getPayload:()=>({email_verified:true,email:'push@example.test'})});
  expect(await verifyGooglePlayPush(request)).toBe('verified');
  expect(auth.verify).toHaveBeenCalledWith({idToken:'signed-test-token',audience:'https://app.test/api/mobile/rtdn'});
  auth.verify.mockResolvedValue({getPayload:()=>({email_verified:true,email:'other@example.test'})});
  expect(await verifyGooglePlayPush(request)).toBe('unauthorized');
  expect(await verifyGooglePlayPush(new Request('https://app.test/api/mobile/rtdn?secret=legacy-secret'))).toBe('unauthorized');
});
