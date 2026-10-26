import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { checkMoneyRateLimit } from '@/lib/rate-limit';
import { recordMetric } from '@/lib/metrics';
import { getClientIp, getRequestCorrelationId } from '@/lib/utils';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const schema = z.object({
  recipientId: z.string().uuid(),
  amount: z.number().min(0.5).max(5000),
  currency: z.enum(['USD', 'NGN', 'EUR']).default('USD'),
});

export async function POST(req: Request) {
  const correlationId = getRequestCorrelationId(req);
  // Bugfix: enforce strict content type and body-size guard on money-affecting route.
  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return NextResponse.json({ error: 'Unsupported content type' }, { status: 415 });
  }
  const contentLength = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > 10_000) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  // Bugfix: apply abuse controls to expensive money-affecting endpoint.
  const user = await getCurrentUser();

  if (!user) {
    recordMetric('auth_unauthorized', { route: 'src/app/api/tips/create/route.ts' }, 'warn');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = getClientIp(req);
  const rate = await checkMoneyRateLimit(user.id, ip);
  if (!rate.allowed) {
    recordMetric('rate_limit_block', { route: 'src/app/api/tips/create/route.ts' }, 'warn');
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const supabase = createServiceClient();


  const idempotencyKey = req.headers.get('idempotency-key');
  if (!idempotencyKey || (idempotencyKey.length < 8 || idempotencyKey.length > 200)) {
    return NextResponse.json({ error: 'Missing/invalid idempotency key' }, { status: 400 });
  }

  const rawBody = await req.text().catch(() => '');
  if (Buffer.byteLength(rawBody, 'utf8') > 10_000) {
    // Bugfix: enforce body size using actual payload length, not only content-length header.
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }
  let body: unknown = null;
  try {
    body = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { recipientId, amount, currency } = parsed.data;
  const { data: recipient } = await supabase
    .from('users')
    .select('id, display_name')
    .eq('id', recipientId)
    .single();

  if (!recipient) {
    return NextResponse.json({ error: 'Recipient not found' }, { status: 404 });
  }

  const decAmount = new Decimal(amount);
  const platformFee = decAmount.times(0.1).toDecimalPlaces(2);
  const recipientAmount = decAmount.minus(platformFee).toDecimalPlaces(2);

  // Bugfix: prefer transactional DB routine for tip + ledger write; fallback keeps compatibility.
    const rpcResponse = await supabase.rpc('create_tip_transaction' as never, {
    p_user_id: user.id,
    p_recipient_id: recipientId,
    p_amount: decAmount.toFixed(2),
    p_platform_fee: platformFee.toFixed(2),
    p_recipient_amount: recipientAmount.toFixed(2),
    p_currency: currency,
    p_idempotency_key: idempotencyKey,
    p_correlation_id: correlationId,
  } as never);

  if (rpcResponse.error) {
    recordMetric('tip_create_error', { correlationId, code: rpcResponse.error.code }, 'error');
    return NextResponse.json({ error: 'Tip service unavailable', correlationId }, { status: 503 });
  }
  const tip = rpcResponse.data as { id?: string } | null;
  if (!tip?.id) return NextResponse.json({ error: 'Missing tip identifier', correlationId }, { status: 503 });
  return NextResponse.json({ tipId: tip.id, redirectUrl: '/tips/pending', correlationId });
}
