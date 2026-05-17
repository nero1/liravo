import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { detectReplay, verifyProviderSignature } from '@/lib/webhook-security';
import { withExponentialBackoff } from '@/lib/retry';
import { withRedisLock } from '@/lib/locks';
import { recordMetric } from '@/lib/metrics';
import { getRequestCorrelationId } from '@/lib/utils';

const webhookSchema = z.object({
  event: z.enum(['subscription.activated', 'subscription.cancelled']),
  user_id: z.string().uuid(),
  subscription_id: z.string().uuid().optional(),
  event_id: z.string().min(8),
});

export async function POST(req: Request) {
  const correlationId = getRequestCorrelationId(req);
  const provider = req.headers.get('x-payment-provider');
  const signature = req.headers.get('x-webhook-signature') ?? req.headers.get('x-paystack-signature');
  const timestamp = req.headers.get('x-webhook-timestamp');
  const expectedSecret = process.env.PAYMENT_WEBHOOK_SECRET;

  if (!expectedSecret || !signature) {
    recordMetric('auth_unauthorized', { route: 'src/app/api/subscriptions/webhook/route.ts' }, 'warn');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!provider || !['dodopayments', 'paystack'].includes(provider)) {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
  }

  const rawBody = await req.text();
  const validSig = verifyProviderSignature({
    provider,
    body: rawBody,
    secret: expectedSecret,
    signature,
    timestamp,
  });
  if (!validSig) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = webhookSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
  }

  const { event, user_id, subscription_id, event_id } = parsed.data;

  // Bugfix: idempotency/replay guard to prevent double credit/debit of premium status.
  try {
    // Bugfix: strengthen replay uniqueness scope across provider, user, and subscription dimensions.
    if (await detectReplay(`${provider}:${event_id}:${user_id}:${subscription_id ?? 'none'}`)) {
      return NextResponse.json({ received: true, replay: true });
    }
  } catch {
    // Bugfix: fail closed when replay protection backend is unavailable.
    return NextResponse.json({ error: 'Replay protection unavailable' }, { status: 503 });
  }

  // Bugfix: extend lock TTL to reduce concurrent interleaving on slow DB retries/fallback work.
  const result = await withRedisLock(`subscription-webhook:${user_id}`, 60, async () => {
    const supabase = createServiceClient();

    // Bugfix: prefer single transactional DB routine when deployed.
    const { error: rpcError } = await withExponentialBackoff(
      async () => supabase.rpc('process_subscription_webhook' as never, {
        p_event: event,
        p_user_id: user_id,
        p_subscription_id: subscription_id ?? null,
      } as never),
      { retries: 2, baseDelayMs: 100 }
    );
    if (!rpcError) {
            const { error: auditError } = await supabase.from('financial_audit_log').insert({
        target_user_id: user_id,
        action: `subscription_${event}`,
        provider,
        provider_event_id: event_id,
        correlation_id: correlationId,
        metadata: { subscription_id, mode: 'rpc' },
      });
      if (auditError) {
        // Bugfix: fail closed when post-transaction audit write fails on financial webhook.
        return NextResponse.json({ error: 'Failed to persist audit trail' }, { status: 500 });
      }
      console.info('subscription_webhook_processed', { provider, event, user_id, event_id, mode: 'rpc' });
      return NextResponse.json({ received: true, mode: 'rpc' });
    }

    // Bugfix: serialize updates per user to reduce race/interleaving without DB transaction support.
    if (event === 'subscription.activated') {
      const { error: userError } = await supabase
        .from('users')
                .update({ is_premium: true })
        .eq('id', user_id);

      if (userError) return NextResponse.json({ error: userError.message }, { status: 500 });

      if (subscription_id) {
                const { error: subError } = await supabase
          .from('subscriptions')
          .update({ status: 'active', activated_at: new Date().toISOString() })
          .eq('id', subscription_id);
        if (subError) {
          // Bugfix: compensate user premium flag if subscription write fails.
          await supabase
            .from('users')
                        .update({ is_premium: false })
            .eq('id', user_id);
          return NextResponse.json({ error: subError.message }, { status: 500 });
        }
      }

      // Credit referral commission (10% of platform gross) to the referrer, if any
      const { data: referredUser } = await supabase
        .from('users')
        .select('referred_by')
        .eq('id', user_id)
        .single();

      if (referredUser?.referred_by) {
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('amount, currency')
          .eq('id', subscription_id ?? '')
          .single();

        if (sub?.amount) {
          const Decimal = (await import('decimal.js')).default;
          const gross = new Decimal(sub.amount);
          const platformFee = gross.times('0.10'); // 10% platform fee
          const commission = platformFee.times('0.10'); // 10% of platform's gross take

          // Use upsert with onConflict to achieve idempotent insert
          await (supabase.from('referral_commissions') as unknown as {
            upsert: (v: unknown, opts: unknown) => Promise<unknown>;
          }).upsert({
            referrer_id: referredUser.referred_by,
            referred_user_id: user_id,
            transaction_id: event_id,
            transaction_type: 'subscription',
            gross_transaction_amount: gross.toFixed(4),
            platform_fee_amount: platformFee.toFixed(4),
            commission_rate: '0.1000',
            commission_amount: commission.toFixed(4),
            idempotency_key: `ref_commission_${event_id}`,
          }, { onConflict: 'idempotency_key', ignoreDuplicates: true });
        }
      }
    } else if (event === 'subscription.cancelled') {
      const { error: userError } = await supabase
        .from('users')
                .update({ is_premium: false })
        .eq('id', user_id);
      if (userError) return NextResponse.json({ error: userError.message }, { status: 500 });

      if (subscription_id) {
                const { error: subError } = await supabase
          .from('subscriptions')
          .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
          .eq('id', subscription_id);
        if (subError) {
          // Bugfix: compensate user premium flag if subscription write fails.
          await supabase
            .from('users')
                        .update({ is_premium: true })
            .eq('id', user_id);
          return NextResponse.json({ error: subError.message }, { status: 500 });
        }
      }
    }

        const { error: auditError } = await supabase.from('financial_audit_log').insert({
      target_user_id: user_id,
      action: `subscription_${event}`,
      provider,
      provider_event_id: event_id,
      correlation_id: correlationId,
      metadata: { subscription_id, mode: 'fallback' },
    });
    if (auditError) {
      // Bugfix: fail closed when fallback-mode audit write fails.
      return NextResponse.json({ error: 'Failed to persist audit trail' }, { status: 500 });
    }
    console.info('subscription_webhook_processed', { provider, event, user_id, event_id, mode: 'fallback' });
    return NextResponse.json({ received: true });
  });

  if (!result) {
    return NextResponse.json({ error: 'Webhook is already being processed' }, { status: 409 });
  }

  recordMetric('subscription_webhook_success', { route: 'src/app/api/subscriptions/webhook/route.ts' });
  return result;
}
