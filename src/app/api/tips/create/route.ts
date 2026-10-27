import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { checkMoneyRateLimit } from '@/lib/rate-limit';
import { recordMetric } from '@/lib/metrics';
import { getClientIp, getRequestCorrelationId } from '@/lib/utils';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { createTipCheckout,validateCheckoutUrl } from '@/lib/payment-providers';
import { readPaymentRecovery } from '@/lib/payment-recovery';
import { withRedisLock } from '@/lib/locks';
import { observeOperationalSignal } from '@/lib/operational-alerts';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const schema = z.object({
  recipientId: z.string().uuid(),
  amount: z.number().min(0.5).max(5000).multipleOf(0.01),
  currency: z.enum(['USD', 'NGN', 'EUR']).default('USD'),
});

export async function POST(req: Request) {
  const correlationId = getRequestCorrelationId(req);
  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return NextResponse.json({ error: 'Unsupported content type' }, { status: 415 });
  }
  const contentLength = Number(req.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > 10_000) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

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
  if (recipientId === user.id) return NextResponse.json({ error: 'Cannot tip yourself' }, { status: 400 });
  const { data: recipient } = await supabase
    .from('users')
    .select('id, display_name')
    .eq('id', recipientId).eq('is_banned', false)
    .single();

  if (!recipient) {
    return NextResponse.json({ error: 'Recipient not found' }, { status: 404 });
  }

  const decAmount = new Decimal(amount);
  const platformFee = decAmount.times(0.1).toDecimalPlaces(2);
  const recipientAmount = decAmount.minus(platformFee).toDecimalPlaces(2);

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
  try {
    const result = await withRedisLock(`tip-checkout:${tip.id}`, 30, async () => {
      const { data, error } = await supabase.from('tips').select('id,amount,currency,status,checkout_url').eq('id', tip.id!).eq('user_id',user.id).single();
      if (error || !data) throw new Error('Tip lookup failed');
      const saved = data as unknown as { id: string; amount: string; currency: string; status: string; checkout_url: string | null };
      if (saved.status === 'completed'||saved.status==='refunded'||(await readPaymentRecovery(user.id,'tip',tip.id)).length) return { redirectUrl: `/tips/${tip.id}` };
      if (saved.checkout_url) return { redirectUrl: validateCheckoutUrl(saved.currency==='NGN'?'paystack':'dodopayments',saved.checkout_url) };
      if (!z.email().safeParse(user.email).success) throw new Error('Payment contact email is required');
      const checkout = await createTipCheckout(saved, user.email);
      const checkoutUrl=checkout.url;
      const { error: saveError } = await supabase.rpc('record_checkout_session' as never,{p_user_id:user.id,p_kind:'tip',p_entity_id:tip.id,p_provider:saved.currency==='NGN'?'paystack':'dodopayments',p_checkout_id:checkout.checkoutId,p_url:checkoutUrl} as never);
      if (saveError) throw new Error('Checkout persistence failed');
      return { redirectUrl: checkoutUrl };
    });
    if (!result) return NextResponse.json({ error: 'Checkout is processing; retry with the same key', correlationId }, { status: 409 });
    return NextResponse.json({ tipId: tip.id, ...result, correlationId });
  } catch (error) {
    await observeOperationalSignal('paymentFailures',correlationId);
    recordMetric('tip_checkout_error', { correlationId, tipId: tip.id, name: error instanceof Error ? error.name : 'Unknown' }, 'error');
    return NextResponse.json({ error: 'Checkout unavailable; retry with the same key', correlationId }, { status: 502 });
  }
}
