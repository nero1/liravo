import { JWT } from 'google-auth-library';

const PACKAGE_NAME = process.env.GOOGLE_PLAY_PACKAGE_NAME ?? 'org.liravo.app';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

function getJwtClient(): JWT {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_KEY is not set');

  const key = JSON.parse(raw) as { client_email: string; private_key: string };
  return new JWT({ email: key.client_email, key: key.private_key, scopes: [SCOPE] });
}

async function getAccessToken(): Promise<string> {
  const client = getJwtClient();
  const { token } = await client.getAccessToken();
  if (!token) throw new Error('Failed to obtain Google Play access token');
  return token;
}

export interface PlaySubscriptionState {
  lineItems: Array<{
    productId: string;
    expiryTime?: string;
    autoRenewingPlan?: { autoRenewEnabled: boolean };
    subscriptionState: string;
  }>;
  startTime?: string;
  linkedPurchaseToken?: string;
}

// 'SUBSCRIPTION_STATE_ACTIVE' | 'SUBSCRIPTION_STATE_CANCELED' |
// 'SUBSCRIPTION_STATE_EXPIRED' | 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD' | ...
export async function getSubscriptionPurchase(purchaseToken: string): Promise<PlaySubscriptionState> {
  const accessToken = await getAccessToken();
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Google Play API error ${res.status}: ${body}`);
  }

  return res.json() as Promise<PlaySubscriptionState>;
}

export function isSubscriptionActive(state: PlaySubscriptionState): boolean {
  return state.lineItems?.some((item) =>
    ['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD'].includes(item.subscriptionState),
  ) ?? false;
}
