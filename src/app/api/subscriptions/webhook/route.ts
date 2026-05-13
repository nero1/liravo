import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const provider = req.headers.get('x-payment-provider');
  const secret = req.headers.get('x-webhook-secret');
  const expectedSecret = process.env.PAYMENT_WEBHOOK_SECRET;

  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!provider || !['dodopayments', 'paystack'].includes(provider)) {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
  }

  let body: { event?: string; user_id?: string; subscription_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { event, user_id, subscription_id } = body;

  if (!event || !user_id) {
    return NextResponse.json({ error: 'Missing event or user_id' }, { status: 400 });
  }

  const supabase = createServiceClient();

  if (event === 'subscription.activated') {
    await supabase
      .from('users')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ is_premium: true } as any)
      .eq('id', user_id);

    if (subscription_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('subscriptions')
        .update({ status: 'active', activated_at: new Date().toISOString() })
        .eq('id', subscription_id);
    }
  } else if (event === 'subscription.cancelled') {
    await supabase
      .from('users')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ is_premium: false } as any)
      .eq('id', user_id);

    if (subscription_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('subscriptions')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('id', subscription_id);
    }
  }

  return NextResponse.json({ received: true });
}
