import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { checkMoneyRateLimit } from '@/lib/rate-limit';
import { recordMetric } from '@/lib/metrics';
import { getClientIp, getRequestCorrelationId } from '@/lib/utils';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { observeOperationalSignal } from '@/lib/operational-alerts';

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

  const user = await getCurrentUser();
  if (!user) {
    recordMetric('auth_unauthorized', { route: 'src/app/api/earnings/request-payout/route.ts' }, 'warn');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = getClientIp(req);
  const rate = await checkMoneyRateLimit(user.id, ip);
  if (!rate.allowed) {
    recordMetric('rate_limit_block', { route: 'src/app/api/earnings/request-payout/route.ts' }, 'warn');
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const supabase = createServiceClient();

  let idempotencyKey = req.headers.get('idempotency-key');

  let body: unknown = {};
  const contentType = req.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const raw = await req.text().catch(() => '');
    if (Buffer.byteLength(raw, 'utf8') > 10_000) return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
  } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    const form = await req.formData().catch(() => new FormData());
    idempotencyKey ??= String(form.get('_idempotency') ?? '');
    body = { amount: form.get('amount'), method: form.get('method') };
  } else {
    return NextResponse.json({ error: 'Unsupported content type' }, { status: 415 });
  }

  if (!idempotencyKey || (idempotencyKey.length < 8 || idempotencyKey.length > 200)) {
    return NextResponse.json({ error: 'Missing/invalid idempotency key' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const amount = new Decimal(parsed.data.amount);
  if (amount.lt(MIN_PAYOUT) || amount.gt(MAX_PAYOUT)) {
    return NextResponse.json({ error: `Amount must be between ${MIN_PAYOUT.toFixed(2)} and ${MAX_PAYOUT.toFixed(2)}` }, { status: 400 });
  }
  // Balance reservation and its audit record must commit together.
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

  const status = rpcReserve.error.code === 'P0001' ? 409 : 503;
  recordMetric('payout_request_error', { correlationId, code: rpcReserve.error.code }, status === 409 ? 'warn' : 'error');
  if (status === 503) await observeOperationalSignal('payoutFailures',correlationId);
  return NextResponse.json({ error: status === 409 ? 'Insufficient balance or conflicting request' : 'Payout service unavailable', code: status === 409 ? 'PAYOUT_RESERVATION_REJECTED' : 'PAYOUT_DEPENDENCY_FAILURE', correlationId }, { status });
}
