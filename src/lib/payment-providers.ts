import { z } from 'zod';

export function dodoConnection() {
  const key = process.env.DODOPAYMENTS_API_KEY ?? process.env.DODOPAYMENTS_SECRET_KEY;
  const mode = process.env.DODOPAYMENTS_ENVIRONMENT ?? 'test_mode';
  if (!key || !['test_mode', 'live_mode'].includes(mode)) throw new Error('Dodo is not configured');
  return { key, base: mode === 'live_mode' ? 'https://live.dodopayments.com' : 'https://test.dodopayments.com' };
}

export function validateCheckoutUrl(provider: string, value: unknown) {
  const url = new URL(z.string().url().parse(value));
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
    (provider === 'paystack' ? url.hostname !== 'checkout.paystack.com' : !/(^|\.)dodopayments\.com$/.test(url.hostname))) throw new Error('Invalid checkout destination');
  return url.href;
}

export async function createTipCheckout(tip: { id: string; amount: string; currency: string }, email: string) {
  const reference = `tip_${tip.id}`;
  const amount = Math.round(Number(tip.amount) * 100);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://liravo.org';
  if (tip.currency === 'NGN') {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) throw new Error('Paystack is not configured');
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST', signal: AbortSignal.timeout(8_000),
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, amount, currency: tip.currency, reference,
        callback_url: `${appUrl}/tips/${tip.id}`, metadata: { tip_id: tip.id, reference } }),
    });
    if (!response.ok) throw new Error(`Paystack checkout failed: ${response.status}`);
    const result = await response.json();
    return validateCheckoutUrl('paystack', result.data?.authorization_url);
  }
  const { key, base } = dodoConnection();
  const productId = process.env[`DODOPAYMENTS_TIP_PRODUCT_ID_${tip.currency}`];
  if (!productId) throw new Error('Tip product is not configured');
  const productResponse = await fetch(`${base}/products/${encodeURIComponent(productId)}`, {
    headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5_000),
  });
  if (!productResponse.ok) throw new Error(`Tip product lookup failed: ${productResponse.status}`);
  const product = await productResponse.json();
  if (product.is_recurring !== false || product.price?.type !== 'one_time_price' ||
    product.price.currency !== tip.currency || product.price.pay_what_you_want !== true ||
    product.price.price > amount || product.price.purchasing_power_parity || product.price.discount_bps || product.price.discount) throw new Error('Invalid tip product pricing');
  const response = await fetch(`${base}/checkouts`, {
    method: 'POST', signal: AbortSignal.timeout(8_000),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': reference },
    body: JSON.stringify({ customer: { email }, billing_currency: tip.currency,
      product_cart: [{ product_id: productId, quantity: 1, amount }],
      feature_flags: { allow_currency_selection: false, allow_discount_code: false },
      return_url: `${appUrl}/tips/${tip.id}`, metadata: { tip_id: tip.id, reference } }),
  });
  if (!response.ok) throw new Error(`Dodo checkout failed: ${response.status}`);
  return validateCheckoutUrl('dodopayments', (await response.json()).checkout_url);
}

/** Setting the same remote status is replayable after a lost response. */
export async function cancelProviderSubscription(provider: string, remoteId: string | null, key: string) {
  if (provider === 'paystack') return; // Paystack checkout is a single charge, without a recurring plan.
  if (provider !== 'dodopayments' || !remoteId) throw new Error('Missing recurring subscription binding');
  const connection = dodoConnection();
  const current = await fetch(`${connection.base}/subscriptions/${encodeURIComponent(remoteId)}`, {
    headers: { Authorization: `Bearer ${connection.key}` }, signal: AbortSignal.timeout(5_000),
  });
  if (!current.ok) throw new Error(`Cancellation lookup failed: ${current.status}`);
  const state = await current.json();
  if (state.subscription_id !== remoteId) throw new Error('Subscription binding mismatch');
  if (state.status === 'cancelled') return;
  const response = await fetch(`${connection.base}/subscriptions/${encodeURIComponent(remoteId)}`, {
    method: 'PATCH', signal: AbortSignal.timeout(8_000),
    headers: { Authorization: `Bearer ${connection.key}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify({ status: 'cancelled', cancel_reason: 'cancelled_by_customer', cancel_at_next_billing_date: false }),
  });
  if (!response.ok) throw new Error(`Cancellation failed: ${response.status}`);
  const result = await response.json();
  if (result.subscription_id !== remoteId || result.status !== 'cancelled') throw new Error('Cancellation was not confirmed');
}
