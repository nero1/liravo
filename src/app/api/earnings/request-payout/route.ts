import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { claimIdempotency } from '@/lib/idempotency';
import { checkCriticalRateLimit } from '@/lib/rate-limit';
import crypto from 'crypto';
import { recordMetric } from '@/lib/metrics';

const bodySchema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  method: z.enum(['dodopayments', 'paystack']).optional(),
});

const MIN_PAYOUT = new Decimal('5.00');
const MAX_PAYOUT = new Decimal('10000.00');

export async function POST(req: Request) {
  // Bugfix: reject unexpectedly large request bodies to reduce parser abuse surface.
  const contentLength = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > 10_000) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rate = await checkCriticalRateLimit(ip);
  if (!rate.allowed) {
    recordMetric('rate_limit_block', { route: 'src/app/api/earnings/request-payout/route.ts' }, 'warn');
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    recordMetric('auth_unauthorized', { route: 'src/app/api/earnings/request-payout/route.ts' }, 'warn');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const idempotencyKey = req.headers.get('idempotency-key');
  if (!idempotencyKey || idempotencyKey.length < 8) {
    return NextResponse.json({ error: 'Missing/invalid idempotency key' }, { status: 400 });
  }

  let body: unknown = {};
  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    body = await req.json().catch(() => ({}));
  } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    const form = await req.formData().catch(() => new FormData());
    body = { amount: form.get('amount'), method: form.get('method') };
  } else {
    return NextResponse.json({ error: 'Unsupported content type' }, { status: 415 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const amount = new Decimal(parsed.data.amount);
  if (amount.lt(MIN_PAYOUT) || amount.gt(MAX_PAYOUT)) {
    return NextResponse.json({ error: `Amount must be between ${MIN_PAYOUT.toFixed(2)} and ${MAX_PAYOUT.toFixed(2)}` }, { status: 400 });
  }
  const fingerprint = crypto.createHash('sha256').update(`${user.id}:${amount.toFixed(2)}:${parsed.data.method ?? 'dodopayments'}`).digest('hex');
  const idemState = await claimIdempotency(`payout:${user.id}:${idempotencyKey}`, fingerprint, 60 * 30);
  if (idemState === 'replay') return NextResponse.json({ error: 'Duplicate request' }, { status: 409 });
  if (idemState === 'conflict') return NextResponse.json({ error: 'Idempotency key re-used with different payload' }, { status: 409 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: insertError } = await (supabase as any).from('payout_requests').insert({
    user_id: user.id,
    amount: amount.toFixed(2),
    method: parsed.data.method ?? 'dodopayments',
    status: 'pending',
    created_at: new Date().toISOString(),
  });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('financial_audit_log').insert({
    actor_user_id: user.id,
    target_user_id: user.id,
    action: 'payout_requested',
    amount: amount.toFixed(2),
    currency: 'USD',
    idempotency_key: idempotencyKey,
    correlation_id: req.headers.get('x-request-id') ?? null,
    metadata: { method: parsed.data.method ?? 'dodopayments' },
  });

  const accept = req.headers.get('accept') ?? '';
  if (!accept.includes('application/json')) {
    return new Response(null, {
      status: 303,
      headers: { Location: '/earnings' },
    });
  }

  recordMetric('payout_request_success', { route: 'src/app/api/earnings/request-payout/route.ts', amount: amount.toFixed(2) });
  return NextResponse.json({ requested: true }, { status: 201 });
}
