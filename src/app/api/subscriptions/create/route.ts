import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { checkAuthRateLimit } from '@/lib/rate-limit';
import { claimIdempotency } from '@/lib/idempotency';
import crypto from 'crypto';

const bodySchema = z.object({
  provider: z.enum(['dodopayments', 'paystack']),
  currency: z.enum(['USD', 'NGN']),
});

const PRICE_USD = new Decimal('4.99');
const PRICE_NGN = new Decimal('7500');

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rate = await checkAuthRateLimit(ip);
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    body = await req.json().catch(() => ({}));
  } else {
    const form = await req.formData().catch(() => new FormData());
    body = { provider: form.get('provider'), currency: form.get('currency') };
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { provider, currency } = parsed.data;
  const idemKey = req.headers.get('idempotency-key');
  if (!idemKey || idemKey.length < 8) {
    return NextResponse.json({ error: 'Missing/invalid idempotency key' }, { status: 400 });
  }
  const fingerprint = crypto.createHash('sha256').update(`${user.id}:${provider}:${currency}`).digest('hex');
  const idemState = await claimIdempotency(`sub-create:${user.id}:${idemKey}`, fingerprint, 60 * 30);
  if (idemState === 'replay') return NextResponse.json({ error: 'Duplicate request' }, { status: 409 });
  if (idemState === 'conflict') return NextResponse.json({ error: 'Idempotency key re-used with different payload' }, { status: 409 });

  const amount = currency === 'NGN' ? PRICE_NGN.toFixed(2) : PRICE_USD.toFixed(2);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: insertError } = await (supabase as any).from('subscriptions').insert({
    user_id: user.id,
    provider,
    status: 'pending',
    amount,
    currency,
    created_at: new Date().toISOString(),
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('financial_audit_log').insert({
    actor_user_id: user.id,
    target_user_id: user.id,
    action: 'subscription_create_pending',
    amount,
    currency,
    provider,
    idempotency_key: idemKey,
    correlation_id: req.headers.get('x-request-id') ?? null,
    metadata: {},
  });

  const checkoutUrl =
    provider === 'paystack'
      ? `https://placeholder.paystack.co/checkout/${user.id}`
      : `https://placeholder.dodopayments.com/checkout/${user.id}`;

  // For form submissions, redirect to checkout
  const accept = req.headers.get('accept') ?? '';
  if (!accept.includes('application/json')) {
    return NextResponse.redirect(checkoutUrl, 303);
  }

  return NextResponse.json({ checkoutUrl }, { status: 201 });
}
