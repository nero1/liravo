import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { checkMoneyRateLimit } from '@/lib/rate-limit';
import { recordMetric } from '@/lib/metrics';
import { getClientIp, getRequestCorrelationId } from '@/lib/utils';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { checkoutResult,type ProviderCheckout, validateDodoSubscriptionProduct,validateCheckoutUrl } from '@/lib/payment-providers';
import { readPaymentRecovery } from '@/lib/payment-recovery';
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
}): Promise<ProviderCheckout> {
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

  return checkoutResult('paystack',await res.json(),opts.reference);
}

async function createDodoCheckout(opts: {
  email: string;
  amountUsd: string;
  userId: string;
  subscriptionId: string;
  reference: string;
}): Promise<ProviderCheckout> {
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

  return checkoutResult('dodopayments',await res.json(),opts.reference);
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

  const wantsJson=contentType.includes('application/json')||!!req.headers.get('accept')?.includes('application/json');
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
  const parsedIntent=z.object({id:z.string().uuid(),checkout_url:z.string().nullable()}).safeParse(data);
  if(!parsedIntent.success)return NextResponse.json({error:'Subscription intent unavailable'},{status:503});
  const sub=parsedIntent.data;
  const reference = `sub_${sub.id}`;
  try{
    if((await readPaymentRecovery(user.id,'subscription',sub.id)).length){
      const statusUrl='/premium?payment=return';
      return wantsJson?NextResponse.json({checkoutUrl:statusUrl}):new Response(null,{status:303,headers:{Location:statusUrl}});
    }
  }catch{return NextResponse.json({error:'Payment recovery unavailable'},{status:503});}
  if (sub.checkout_url) {
    let savedUrl:string;try{savedUrl=validateCheckoutUrl(provider,sub.checkout_url);}catch{return NextResponse.json({error:'Invalid stored checkout'},{status:503});}
    return wantsJson
      ? NextResponse.json({ checkoutUrl: savedUrl })
      : new Response(null, { status: 303, headers: { Location: savedUrl } });
  }

  const email = user.email;
  if (!z.email().safeParse(email).success) return NextResponse.json({ error: 'Payment contact email is required', correlationId }, { status: 400 });

  let checkout:ProviderCheckout;
  try {
    if (provider === 'paystack') {
      // Paystack amount is in kobo (NGN) or cents (USD). Use NGN (kobo) for Paystack users.
      const amountInSmallestUnit = currency === 'NGN'
        ? PRICE_NGN.times(100).toFixed(0)  // kobo
        : PRICE_USD.times(100).toFixed(0);  // cents
      checkout = await createPaystackCheckout({
        email,
        amountKobo: parseInt(amountInSmallestUnit, 10),
        currency,
        userId: user.id,
        subscriptionId: sub.id,
        reference,
      });
    } else {
      checkout = await createDodoCheckout({
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

  const checkoutUrl=checkout.url;
  const {error:checkoutError}=await supabase.rpc('record_checkout_session' as never,{p_user_id:user.id,p_kind:'subscription',p_entity_id:sub.id,p_provider:provider,p_checkout_id:checkout.checkoutId,p_url:checkoutUrl} as never);
  if (checkoutError) return NextResponse.json({ error: 'Checkout persistence failed; retry with the same key', correlationId }, { status: 503 });

  if (!wantsJson) {
    return NextResponse.redirect(checkoutUrl, 303);
  }

  recordMetric('subscription_create_success', { route: 'src/app/api/subscriptions/create/route.ts', provider, currency });
  return NextResponse.json({ checkoutUrl }, { status: 201 });
}
