import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { claimIdempotency } from '@/lib/idempotency';
import { checkCriticalRateLimit } from '@/lib/rate-limit';
import crypto from 'crypto';
import { recordMetric } from '@/lib/metrics';
import { enqueueOutboxEvent } from '@/lib/outbox';

const schema = z.object({
  recipientId: z.string().uuid(),
  amount: z.number().min(0.5).max(5000),
  currency: z.enum(['USD', 'NGN', 'EUR']).default('USD'),
});

export async function POST(req: Request) {
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
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rate = await checkCriticalRateLimit(ip);
  if (!rate.allowed) {
    recordMetric('rate_limit_block', { route: 'src/app/api/tips/create/route.ts' }, 'warn');
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    recordMetric('auth_unauthorized', { route: 'src/app/api/tips/create/route.ts' }, 'warn');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const idempotencyKey = req.headers.get('idempotency-key');
  if (!idempotencyKey || idempotencyKey.length < 8) {
    return NextResponse.json({ error: 'Missing/invalid idempotency key' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { recipientId, amount, currency } = parsed.data;
  const fingerprint = crypto
    .createHash('sha256')
    .update(`${user.id}:${recipientId}:${amount}:${currency}`)
    .digest('hex');
  const idemState = await claimIdempotency(`tip:${user.id}:${idempotencyKey}`, fingerprint, 60 * 15);
  if (idemState === 'replay') return NextResponse.json({ error: 'Duplicate request' }, { status: 409 });
  if (idemState === 'conflict') return NextResponse.json({ error: 'Idempotency key re-used with different payload' }, { status: 409 });

  if (recipientId === user.id) {
    return NextResponse.json({ error: 'You cannot tip yourself' }, { status: 400 });
  }

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpcResponse = await (supabase as any).rpc('create_tip_transaction' as never, {
    p_user_id: user.id,
    p_recipient_id: recipientId,
    p_amount: decAmount.toFixed(2),
    p_platform_fee: platformFee.toFixed(2),
    p_recipient_amount: recipientAmount.toFixed(2),
    p_currency: currency,
    p_idempotency_key: idempotencyKey,
    p_correlation_id: req.headers.get('x-request-id') ?? null,
  } as never);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tip: any = rpcResponse.data;
  if (rpcResponse.error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: insertedTip, error } = await (supabase as any)
      .from('tips')
      .insert({
        user_id: user.id,
        recipient_id: recipientId,
        amount: decAmount.toNumber(),
        platform_fee: platformFee.toNumber(),
        recipient_amount: recipientAmount.toNumber(),
        currency,
        status: 'pending',
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    tip = insertedTip;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('financial_audit_log').insert({
      actor_user_id: user.id,
      target_user_id: recipientId,
      action: 'tip_created',
      amount: decAmount.toFixed(2),
      currency,
      idempotency_key: idempotencyKey,
      correlation_id: req.headers.get('x-request-id') ?? null,
      metadata: { tip_id: tip.id, status: 'pending', mode: 'fallback' },
    });
  }

  // Bugfix: durable outbox entries preserve side-effect intent for retry workers under transient failures.
  await Promise.all([
    enqueueOutboxEvent({
      aggregateType: 'tip',
      aggregateId: String(tip.id),
      eventType: 'notify_recipient',
      payload: { userId: recipientId, actorId: user.id, tipId: String(tip.id), amount: decAmount.toFixed(2), currency },
    }),
    enqueueOutboxEvent({
      aggregateType: 'tip',
      aggregateId: String(tip.id),
      eventType: 'award_xp',
      payload: { userId: user.id, amount: 5, reason: 'tip_sent' },
    }),
  ]);




  console.info('tip_create_processed', {
    actor_user_id: user.id,
    recipient_id: recipientId,
    amount: decAmount.toFixed(2),
    currency,
    mode: rpcResponse.error ? 'fallback' : 'rpc',
  });

  recordMetric('tip_create_success', { route: 'src/app/api/tips/create/route.ts', tipId: tip.id, currency });
  return NextResponse.json({ tipId: tip.id, redirectUrl: '/tips/pending' });
}
