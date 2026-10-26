import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { checkMoneyRateLimit } from '@/lib/rate-limit';
import { recordMetric } from '@/lib/metrics';
import { getClientIp, getRequestCorrelationId } from '@/lib/utils';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { validateCheckoutUrl, validateDodoSubscriptionProduct } from '@/lib/payment-providers';
import { observeOperationalSignal } from '@/lib/operational-alerts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const bodySchema = z.object({
  provider: z.enum(['dodopayments', 'paystack']),
  currency: z.enum(['USD', 'NGN']),
}).refine(value => value.provider === 'paystack' || value.currency === 'USD', { message: 'Dodo checkout requires USD' });

const PRICE_USD = new Decimal('4.99');
const PRICE_NGN = new Decimal('7500');
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://liravo.org';

async function createPaystackCheckout(opts: {
  email: string;
  amountKobo: number;
  currency: string;
  userId: string;
  subscriptionId: string;
  reference: string;
}): Promise<string> {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new Error('PAYSTACK_SECRET_KEY not configured');

  const res = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    signal: AbortSignal.timeout(8_000),
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': opts.subscriptionId,
    },
    body: JSON.stringify({
      email: opts.email,
      amount: opts.amountKobo,
      currency: opts.currency,
      reference: opts.reference,
      callback_url: `${APP_URL}/premium?payment=pending`,
      metadata: {
        user_id: opts.userId,
        subscription_id: opts.subscriptionId,
        plan: 'premium',
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Paystack init failed: ${res.status}`);
  }

  const data = await res.json() as { data?: { authorization_url?: string } };
  const url = data?.data?.authorization_url;
  if (!url) throw new Error('Paystack did not return an authorization URL');
  return url;
}

async function createDodoCheckout(opts: {
  email: string;
  amountUsd: string;
  userId: string;
  subscriptionId: string;
  reference: string;
}): Promise<string> {
  const key = process.env.DODOPAYMENTS_API_KEY ?? process.env.DODOPAYMENTS_SECRET_KEY;
  if (!key) throw new Error('DODOPAYMENTS_API_KEY not configured');

  const productId = process.env.DODOPAYMENTS_PREMIUM_PRODUCT_ID;
  if (!productId) throw new Error('DODOPAYMENTS_PREMIUM_PRODUCT_ID not configured');
  const mode = process.env.DODOPAYMENTS_ENVIRONMENT ?? 'test_mode';
  if (!['test_mode', 'live_mode'].includes(mode)) throw new Error('Invalid Dodo environment');
  const base = mode === 'test_mode' ? 'https://test.dodopayments.com' : 'https://live.dodopayments.com';
  await validateDodoSubscriptionProduct(productId,opts.amountUsd);
  const res = await fetch(`${base}/checkouts`, {
    method: 'POST',
    signal: AbortSignal.timeout(8_000),
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': opts.subscriptionId,
    },
    body: JSON.stringify({
      customer: { email: opts.email },
      billing_currency: 'USD',
      feature_flags: { allow_currency_selection: false, allow_discount_code: false },
      product_cart: [
        {
          product_id: productId,
          quantity: 1,
        },
      ],
      return_url: `${APP_URL}/premium?payment=pending`,
      metadata: {
        user_id: opts.userId,
        subscription_id: opts.subscriptionId,
        reference: opts.reference,
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Dodopayments init failed: ${res.status}`);
  }

  const data = await res.json() as { checkout_url?: string };
  const url = data.checkout_url;
  if (!url) throw new Error('Dodopayments did not return a checkout URL');
  return url;
}

export async function POST(req: Request) {
  const correlationId = getRequestCorrelationId(req);
  const user = await getCurrentUser();
  if (!user) {
    recordMetric('auth_unauthorized', { route: 'src/app/api/subscriptions/create/route.ts' }, 'warn');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = getClientIp(req);
  const rate = await checkMoneyRateLimit(user.id, ip);
  if (!rate.allowed) {
    recordMetric('rate_limit_block', { route: 'src/app/api/subscriptions/create/route.ts' }, 'warn');
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const supabase = createServiceClient();

  let formKey: string | null = null;
  let body: unknown;
  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const raw = await req.text().catch(() => '');
    if (Buffer.byteLength(raw, 'utf8') > 10_000) return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    try { body = raw ? JSON.parse(raw) : {}; }
    catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  } else {
    const form = await req.formData().catch(() => new FormData());
    formKey = String(form.get('_idempotency') ?? '');
    body = { provider: form.get('provider'), currency: form.get('currency') };
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { provider, currency } = parsed.data;
  const idemKey = req.headers.get('idempotency-key') ?? formKey;
  if (!idemKey || (idemKey.length < 8 || idemKey.length > 200)) return NextResponse.json({ error: 'Missing/invalid idempotency key' }, { status: 400 });

  const amount = currency === 'NGN' ? PRICE_NGN.toFixed(2) : PRICE_USD.toFixed(2);
  const { data, error: intentError } = await supabase.rpc('create_subscription_intent' as never, {
    p_user_id: user.id, p_provider: provider, p_currency: currency, p_amount: amount,
    p_key: idemKey, p_correlation_id: correlationId,
  } as never);
  if (intentError) return NextResponse.json({ error: 'Subscription unavailable', correlationId }, { status: 503 });
  const sub = data as { id: string; checkout_url: string | null };
  const reference = `sub_${sub.id}`;
  if (sub.checkout_url) {
    return req.headers.get('accept')?.includes('application/json')
      ? NextResponse.json({ checkoutUrl: sub.checkout_url })
      : new Response(null, { status: 303, headers: { Location: sub.checkout_url } });
  }

  const email = user.email;
  if (!z.email().safeParse(email).success) return NextResponse.json({ error: 'Payment contact email is required', correlationId }, { status: 400 });

  let checkoutUrl: string;
  try {
    if (provider === 'paystack') {
      // Paystack amount is in kobo (NGN) or cents (USD). Use NGN (kobo) for Paystack users.
      const amountInSmallestUnit = currency === 'NGN'
        ? PRICE_NGN.times(100).toFixed(0)  // kobo
        : PRICE_USD.times(100).toFixed(0);  // cents
      checkoutUrl = await createPaystackCheckout({
        email,
        amountKobo: parseInt(amountInSmallestUnit, 10),
        currency,
        userId: user.id,
        subscriptionId: sub.id,
        reference,
      });
    } else {
      checkoutUrl = await createDodoCheckout({
        email,
        amountUsd: PRICE_USD.toFixed(2),
        userId: user.id,
        subscriptionId: sub.id,
        reference,
      });
    }
  } catch (err) {
    await observeOperationalSignal('paymentFailures',correlationId);
    recordMetric('subscription_checkout_error', { provider, correlationId, name: err instanceof Error ? err.name : 'Unknown' }, 'error');
    return NextResponse.json({ error: 'Payment provider unavailable; retry with the same key', correlationId }, { status: 502 });
  }

  try { checkoutUrl = validateCheckoutUrl(provider,checkoutUrl); }
  catch { return NextResponse.json({ error: 'Invalid checkout destination', correlationId }, { status: 503 }); }

  // Persist checkout URL for retries; the reference was reserved with the intent.
  const { error: checkoutError } = await supabase.from('subscriptions').update({ checkout_url: checkoutUrl }).eq('id', sub.id);
  if (checkoutError) return NextResponse.json({ error: 'Checkout persistence failed; retry with the same key', correlationId }, { status: 503 });

  const accept = req.headers.get('accept') ?? '';
  if (!accept.includes('application/json')) {
    return NextResponse.redirect(checkoutUrl, 303);
  }

  recordMetric('subscription_create_success', { route: 'src/app/api/subscriptions/create/route.ts', provider, currency });
  return NextResponse.json({ checkoutUrl }, { status: 201 });
}
