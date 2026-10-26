import { JWT, OAuth2Client } from 'google-auth-library';
import { createHash, createHmac } from 'node:crypto';
import { z } from 'zod';

const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';
const stateSchema = z.object({
  subscriptionState: z.enum(['SUBSCRIPTION_STATE_UNSPECIFIED','SUBSCRIPTION_STATE_PENDING','SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_PAUSED','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_ON_HOLD','SUBSCRIPTION_STATE_CANCELED','SUBSCRIPTION_STATE_EXPIRED','SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED']),
  acknowledgementState: z.string().optional(),
  lineItems: z.array(z.object({ productId: z.string().min(1), expiryTime: z.string().datetime({offset:true}).nullish(), autoRenewingPlan: z.object({autoRenewEnabled:z.boolean()}).nullish() })).min(1).max(20),
  linkedPurchaseToken: z.string().nullish(),
  externalAccountIdentifiers: z.object({obfuscatedExternalAccountId:z.string().nullish()}).nullish(),
});
export type PlaySubscriptionState = z.infer<typeof stateSchema>;

export function googlePlayConfiguration() {
  return { packageName: process.env.GOOGLE_PLAY_PACKAGE_NAME ?? 'org.liravo.app', productId: process.env.GOOGLE_PLAY_PRODUCT_ID ?? 'liravo_premium_monthly' };
}
export function googlePlayManagementUrl() {
  const configuration=googlePlayConfiguration();
  const url=new URL('https://play.google.com/store/account/subscriptions');
  url.searchParams.set('sku',configuration.productId);
  url.searchParams.set('package',configuration.packageName);
  return url.href;
}

function serviceAccount() {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('Google Play is not configured');
  return { raw, key:z.object({client_email:z.email(),private_key:z.string().min(1)}).parse(JSON.parse(raw)) };
}
let jwt: { raw: string; client: JWT } | null = null;
async function getAccessToken(): Promise<string> {
  const account = serviceAccount();
  if (jwt?.raw !== account.raw) jwt = {raw:account.raw,client:new JWT({email:account.key.client_email,key:account.key.private_key,scopes:[SCOPE],transporterOptions:{timeout:8_000}})};
  const { token } = await jwt.client.getAccessToken();
  if (!token) throw new Error('Google Play authorization unavailable');
  return token;
}

export function googlePlayTokenId(token: string) {
  return `gplay_${createHash('sha256').update(token).digest('hex')}`;
}
export function googlePlayAccountId(userId: string) {
  return createHmac('sha256',serviceAccount().key.private_key).update(`liravo:play-account:${userId}`).digest('hex');
}

export async function getSubscriptionPurchase(purchaseToken: string): Promise<PlaySubscriptionState> {
  const { packageName } = googlePlayConfiguration();
  const token = await getAccessToken();
  const response = await fetch(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`, {
    headers: {Authorization:`Bearer ${token}`}, signal:AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Google Play verification failed: ${response.status}`);
  return stateSchema.parse(await response.json());
}

export function playEntitlement(state: PlaySubscriptionState, now = Date.now()) {
  const { productId } = googlePlayConfiguration();
  const items = state.lineItems.filter(item=>item.productId===productId);
  if (!items.length) throw new Error('Purchase product mismatch');
  const expiry = Math.max(...items.map(item=>item.expiryTime?Date.parse(item.expiryTime):0));
  const active = ['SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_CANCELED'].includes(state.subscriptionState) && expiry>now;
  return { active, expiresAt:expiry?new Date(expiry).toISOString():null, providerState:state.subscriptionState, productId, accountId:state.externalAccountIdentifiers?.obfuscatedExternalAccountId??null };
}
export function isSubscriptionActive(state: PlaySubscriptionState): boolean {
  return playEntitlement(state).active;
}

export async function acknowledgeSubscription(purchaseToken: string, state: PlaySubscriptionState) {
  if (state.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED') return;
  const {packageName,productId} = googlePlayConfiguration();
  const token = await getAccessToken();
  const response = await fetch(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`, {
    method:'POST', headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}, body:'{}', signal:AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    const current = await getSubscriptionPurchase(purchaseToken);
    if (current.acknowledgementState !== 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED') throw new Error('Google Play acknowledgement unavailable');
  }
}

const pushVerifier = new OAuth2Client({transporterOptions:{timeout:8_000}});
export async function verifyGooglePlayPush(request: Request) {
  const account = process.env.GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL;
  const audience = process.env.GOOGLE_PLAY_RTDN_AUDIENCE ?? new URL('/api/mobile/rtdn',process.env.NEXT_PUBLIC_APP_URL??'https://liravo.org').href;
  if (!account) return 'unconfigured' as const;
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return 'unauthorized' as const;
  try {
    const ticket = await pushVerifier.verifyIdToken({idToken:authorization.slice(7),audience});
    const payload = ticket.getPayload();
    return payload?.email_verified === true && payload.email === account ? 'verified' as const : 'unauthorized' as const;
  } catch { return 'unauthorized' as const; }
}
