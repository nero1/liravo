import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { detectReplay, isFreshTimestamp, verifyHmacSha256 } from '@/lib/webhook-security';
import { withRedisLock } from '@/lib/locks';

const webhookSchema = z.object({
  event: z.enum(['subscription.activated', 'subscription.cancelled']),
  user_id: z.string().uuid(),
  subscription_id: z.string().uuid().optional(),
  event_id: z.string().min(8),
});

export async function POST(req: Request) {
  const provider = req.headers.get('x-payment-provider');
  const signature = req.headers.get('x-webhook-signature');
  const timestamp = req.headers.get('x-webhook-timestamp');
  const expectedSecret = process.env.PAYMENT_WEBHOOK_SECRET;

  if (!expectedSecret || !signature || !timestamp) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Bugfix: reject stale webhook deliveries to limit replay window.
  if (!isFreshTimestamp(timestamp)) {
    return NextResponse.json({ error: 'Stale webhook timestamp' }, { status: 401 });
  }

  if (!provider || !['dodopayments', 'paystack'].includes(provider)) {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
  }

  const rawBody = await req.text();
  const validSig = verifyHmacSha256({ body: rawBody, secret: expectedSecret, signature, timestamp });
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
  if (await detectReplay(event_id)) {
    return NextResponse.json({ received: true, replay: true });
  }

  const result = await withRedisLock(`subscription-webhook:${user_id}`, 10, async () => {
    const supabase = createServiceClient();

    // Bugfix: prefer single transactional DB routine when deployed.
    const { error: rpcError } = await supabase.rpc('process_subscription_webhook' as never, {
      p_event: event,
      p_user_id: user_id,
      p_subscription_id: subscription_id ?? null,
    } as never);
    if (!rpcError) {
      return NextResponse.json({ received: true, mode: 'rpc' });
    }

    // Bugfix: serialize updates per user to reduce race/interleaving without DB transaction support.
    if (event === 'subscription.activated') {
      const { error: userError } = await supabase
        .from('users')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ is_premium: true } as any)
        .eq('id', user_id);

      if (userError) return NextResponse.json({ error: userError.message }, { status: 500 });

      if (subscription_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: subError } = await (supabase as any)
          .from('subscriptions')
          .update({ status: 'active', activated_at: new Date().toISOString() })
          .eq('id', subscription_id);
        if (subError) {
          // Bugfix: compensate user premium flag if subscription write fails.
          await supabase
            .from('users')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .update({ is_premium: false } as any)
            .eq('id', user_id);
          return NextResponse.json({ error: subError.message }, { status: 500 });
        }
      }
    } else if (event === 'subscription.cancelled') {
      const { error: userError } = await supabase
        .from('users')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ is_premium: false } as any)
        .eq('id', user_id);
      if (userError) return NextResponse.json({ error: userError.message }, { status: 500 });

      if (subscription_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: subError } = await (supabase as any)
          .from('subscriptions')
          .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
          .eq('id', subscription_id);
        if (subError) {
          // Bugfix: compensate user premium flag if subscription write fails.
          await supabase
            .from('users')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .update({ is_premium: true } as any)
            .eq('id', user_id);
          return NextResponse.json({ error: subError.message }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ received: true });
  });

  if (!result) {
    return NextResponse.json({ error: 'Webhook is already being processed' }, { status: 409 });
  }

  return result;
}
