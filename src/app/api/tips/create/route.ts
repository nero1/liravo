import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { createNotification } from '@/services/notifications';
import { awardXP } from '@/services/xp';
import { claimIdempotency } from '@/lib/idempotency';
import { checkAuthRateLimit } from '@/lib/rate-limit';
import { withExponentialBackoff } from '@/lib/retry';
import crypto from 'crypto';

const schema = z.object({
  recipientId: z.string().uuid(),
  amount: z.number().min(0.5).max(5000),
  currency: z.enum(['USD', 'NGN', 'EUR']).default('USD'),
});

export async function POST(req: Request) {
  // Bugfix: apply abuse controls to expensive money-affecting endpoint.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rate = await checkAuthRateLimit(ip);
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
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
  // Bugfix: idempotency payload binding blocks key reuse across divergent payloads.
  if (idemState === 'replay') {
    return NextResponse.json({ error: 'Duplicate request' }, { status: 409 });
  }
  if (idemState === 'conflict') {
    return NextResponse.json({ error: 'Idempotency key re-used with different payload' }, { status: 409 });
  }

  if (recipientId === user.id) {
    return NextResponse.json({ error: 'You cannot tip yourself' }, { status: 400 });
  }

  // Verify recipient exists
  const { data: recipient } = await supabase
    .from('users')
    .select('id, display_name')
    .eq('id', recipientId)
    .single();

  if (!recipient) {
    return NextResponse.json({ error: 'Recipient not found' }, { status: 404 });
  }

  // Calculate fees using Decimal.js
  const decAmount = new Decimal(amount);
  const platformFee = decAmount.times(0.1).toDecimalPlaces(2);
  const recipientAmount = decAmount.minus(platformFee).toDecimalPlaces(2);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tip, error } = await (supabase as any)
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
  // Bugfix: append immutable audit record for forensic accounting.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('financial_audit_log').insert({
    actor_user_id: user.id,
    target_user_id: recipientId,
    action: 'tip_created',
    amount: decAmount.toFixed(2),
    currency,
    idempotency_key: idempotencyKey,
    correlation_id: req.headers.get('x-request-id') ?? null,
    metadata: { tip_id: tip.id, status: 'pending' },
  });

  // Notify recipient
  // Bugfix: side effects are best-effort and isolated from primary financial write.
  await Promise.allSettled([
    withExponentialBackoff(() => createNotification({
      userId: recipientId,
      type: 'like',
      actorId: user.id,
      entityType: 'tip',
      entityId: tip.id,
      message: `You received a $${decAmount.toFixed(2)} tip!`,
    }), { retries: 2, baseDelayMs: 100 }),
    withExponentialBackoff(() => awardXP(user.id, 5, 'tip_sent'), { retries: 2, baseDelayMs: 100 }),
  ]);

  return NextResponse.json({
    tipId: tip.id,
    redirectUrl: '/tips/pending',
  });
}
