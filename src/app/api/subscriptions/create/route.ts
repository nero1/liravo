import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { checkCriticalRateLimit } from '@/lib/rate-limit';
import { claimIdempotency } from '@/lib/idempotency';
import crypto from 'crypto';
import { recordMetric } from '@/lib/metrics';
import { getClientIp, getRequestCorrelationId } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  provider: z.enum(['dodopayments', 'paystack']),
  currency: z.enum(['USD', 'NGN']),
});

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
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: opts.email,
      amount: opts.amountKobo,
      currency: opts.currency,
      reference: opts.reference,
      callback_url: `${APP_URL}/api/subscriptions/webhook`,
      metadata: {
        user_id: opts.userId,
        subscription_id: opts.subscriptionId,
        plan: 'premium',
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Paystack init failed: ${res.status} ${err}`);
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
  const key = process.env.DODOPAYMENTS_API_KEY;
  if (!key) throw new Error('DODOPAYMENTS_API_KEY not configured');

  const res = await fetch('https://api.dodopayments.com/subscriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      payment_link: true,
      customer: { email: opts.email },
      product_cart: [
        {
          product_id: process.env.DODOPAYMENTS_PREMIUM_PRODUCT_ID ?? 'premium_monthly',
          quantity: 1,
        },
      ],
      return_url: `${APP_URL}/premium?activated=1`,
      metadata: {
        user_id: opts.userId,
        subscription_id: opts.subscriptionId,
        reference: opts.reference,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Dodopayments init failed: ${res.status} ${err}`);
  }

  const data = await res.json() as { payment_link?: string; url?: string };
  const url = data.payment_link ?? data.url;
  if (!url) throw new Error('Dodopayments did not return a checkout URL');
  return url;
}

export async function POST(req: Request) {
  const correlationId = getRequestCorrelationId(req);
  const ip = getClientIp(req);
  const rate = await checkCriticalRateLimit(ip);
  if (!rate.allowed) {
    recordMetric('rate_limit_block', { route: 'src/app/api/subscriptions/create/route.ts' }, 'warn');
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    recordMetric('auth_unauthorized', { route: 'src/app/api/subscriptions/create/route.ts' }, 'warn');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const raw = await req.text().catch(() => '');
    if (raw.length > 10_000) return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    try { body = raw ? JSON.parse(raw) : {}; }
    catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  } else {
    const form = await req.formData().catch(() => new FormData());
    body = { provider: form.get('provider'), currency: form.get('currency') };
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { provider, currency } = parsed.data;
  const idemKey = req.headers.get('idempotency-key');
  if (!idemKey || idemKey.length < 8) return NextResponse.json({ error: 'Missing/invalid idempotency key' }, { status: 400 });

  const fingerprint = crypto.createHash('sha256').update(`${user.id}:${provider}:${currency}`).digest('hex');
  const idemState = await claimIdempotency(`sub-create:${user.id}:${idemKey}`, fingerprint, 60 * 30);
  if (idemState === 'replay') return NextResponse.json({ error: 'Duplicate request' }, { status: 409 });
  if (idemState === 'conflict') return NextResponse.json({ error: 'Idempotency key re-used with different payload' }, { status: 409 });

  const amount = currency === 'NGN' ? PRICE_NGN.toFixed(2) : PRICE_USD.toFixed(2);
  const reference = `sub_${user.id}_${Date.now()}`;

  const { data: sub, error: insertError } = await supabase
    .from('subscriptions')
    .insert({ user_id: user.id, provider, status: 'pending', amount, currency })
    .select('id')
    .single();

  if (insertError || !sub) return NextResponse.json({ error: insertError?.message ?? 'Insert failed' }, { status: 500 });

  const { error: auditError } = await supabase.from('financial_audit_log').insert({
    actor_user_id: user.id,
    target_user_id: user.id,
    action: 'subscription_create_pending',
    amount,
    currency,
    provider,
    idempotency_key: idemKey,
    correlation_id: correlationId,
    metadata: { subscription_id: sub.id, reference },
  });
  if (auditError) return NextResponse.json({ error: 'Failed to persist audit trail' }, { status: 500 });

  // Get user email for payment providers
  const { data: profile } = await supabase.from('users').select('email').eq('id', user.id).single();
  const email = profile?.email ?? `user_${user.id}@liravo.org`;

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
    const message = err instanceof Error ? err.message : 'Payment provider error';
    recordMetric('subscription_checkout_error', { provider, error: message });
    return NextResponse.json({ error: `Could not create checkout: ${message}` }, { status: 502 });
  }

  // Store reference in subscription for webhook correlation
  await supabase.from('subscriptions').update({ provider_event_id: reference }).eq('id', sub.id);

  const accept = req.headers.get('accept') ?? '';
  if (!accept.includes('application/json')) {
    return NextResponse.redirect(checkoutUrl, 303);
  }

  recordMetric('subscription_create_success', { route: 'src/app/api/subscriptions/create/route.ts', provider, currency });
  return NextResponse.json({ checkoutUrl }, { status: 201 });
}
