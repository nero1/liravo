import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { claimIdempotency } from '@/lib/idempotency';
import { checkCriticalRateLimit } from '@/lib/rate-limit';
import crypto from 'crypto';
import { recordMetric } from '@/lib/metrics';
import { getClientIp, getRequestCorrelationId } from '@/lib/utils';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  method: z.enum(['dodopayments', 'paystack']).optional(),
});

const MIN_PAYOUT = new Decimal('5.00');
const MAX_PAYOUT = new Decimal('10000.00');

export async function POST(req: Request) {
  const correlationId = getRequestCorrelationId(req);
  const contentLength = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > 10_000) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  const ip = getClientIp(req);
  const rate = await checkCriticalRateLimit(ip);
  if (!rate.allowed) {
    recordMetric('rate_limit_block', { route: 'src/app/api/earnings/request-payout/route.ts' }, 'warn');
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const supabase = createClient();
  const user = await getCurrentUser();
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
    const raw = await req.text().catch(() => '');
    if (raw.length > 10_000) return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
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

  // Bugfix: perform atomic balance-check/reserve via RPC when available.
    const rpcReserve = await supabase.rpc('create_payout_request_atomic' as never, {
    p_user_id: user.id,
    p_amount: amount.toFixed(2),
    p_method: parsed.data.method ?? 'dodopayments',
    p_idempotency_key: idempotencyKey,
    p_correlation_id: correlationId,
  } as never);
  if (!rpcReserve.error) {
    recordMetric('payout_request_success', { route: 'src/app/api/earnings/request-payout/route.ts', amount: amount.toFixed(2), correlationId, mode: 'rpc' });
    return NextResponse.json({ requested: true, mode: 'rpc' }, { status: 201 });
  }

    const { error: insertError } = await supabase.from('payout_requests').insert({
    user_id: user.id,
    amount: amount.toFixed(2),
    method: parsed.data.method ?? 'dodopayments',
    status: 'pending',
    created_at: new Date().toISOString(),
  });

  if (insertError) {
    recordMetric('payout_request_error', { route: 'src/app/api/earnings/request-payout/route.ts', stage: 'insert', correlationId }, 'error');
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

    const { error: auditError } = await supabase.from('financial_audit_log').insert({
    actor_user_id: user.id,
    target_user_id: user.id,
    action: 'payout_requested',
    amount: amount.toFixed(2),
    currency: 'USD',
    idempotency_key: idempotencyKey,
    correlation_id: correlationId,
    metadata: { method: parsed.data.method ?? 'dodopayments', mode: 'fallback' },
  });
  if (auditError) {
    // Bugfix: fail closed and emit error metric when financial audit trail is missing.
    recordMetric('payout_request_error', { route: 'src/app/api/earnings/request-payout/route.ts', stage: 'audit', correlationId }, 'error');
    return NextResponse.json({ error: 'Failed to persist audit trail' }, { status: 500 });
  }

  const accept = req.headers.get('accept') ?? '';
  if (!accept.includes('application/json')) {
    return new Response(null, {
      status: 303,
      headers: { Location: '/earnings' },
    });
  }

  recordMetric('payout_request_success', { route: 'src/app/api/earnings/request-payout/route.ts', amount: amount.toFixed(2), mode: 'fallback' });
  return NextResponse.json({ requested: true }, { status: 201 });
}
