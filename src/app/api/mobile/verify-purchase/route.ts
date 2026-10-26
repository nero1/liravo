import { clientUser } from '@/lib/user-profile';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { getSubscriptionPurchase, isSubscriptionActive } from '@/lib/google-play';
import { checkCriticalRateLimit } from '@/lib/rate-limit';
import { getClientIp } from '@/lib/utils';
import { recordMetric } from '@/lib/metrics';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  purchaseToken: z.string().min(1),
  productId: z.string().min(1),
  packageName: z.string().min(1),
});

export async function POST(request: Request) {
  const session = await getCurrentUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ip = getClientIp(request);
  const rate = await checkCriticalRateLimit(ip);
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { purchaseToken, productId } = parsed.data;
  const supabase = createServiceClient();

  // Verify the purchase token with Google Play
  let playState;
  try {
    playState = await getSubscriptionPurchase(purchaseToken);
  } catch (err) {
    recordMetric('google_play_verify_error', { error: (err as Error).message }, 'warn');
    return NextResponse.json({ error: 'Could not verify purchase with Google Play' }, { status: 502 });
  }

  const active = isSubscriptionActive(playState);

  // Upsert subscription record using purchase token as the stable identifier
  const { data: existing } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('provider_event_id', purchaseToken)
    .maybeSingle();

  if (!existing) {
    await supabase.from('subscriptions').insert({
      user_id: session.id,
      provider: 'google_play',
      status: active ? 'active' : 'expired',
      amount: '4.99',
      currency: 'USD',
      provider_event_id: purchaseToken,
    });
  } else {
    await supabase
      .from('subscriptions')
      .update({ status: active ? 'active' : 'expired' })
      .eq('id', existing.id);
  }

  // Update the user's premium flag
  await supabase.from('users').update({ is_premium: active }).eq('id', session.id);

  await supabase.from('financial_audit_log').insert({
    actor_user_id: session.id,
    target_user_id: session.id,
    action: active ? 'google_play_subscription_activated' : 'google_play_subscription_expired',
    amount: '4.99',
    currency: 'USD',
    provider: 'google_play',
    idempotency_key: purchaseToken.slice(0, 64),
    metadata: { productId, purchaseToken: purchaseToken.slice(0, 32) + '…' },
  });

  // Return fresh user row so the app can update local state immediately
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', session.id)
    .single();

  recordMetric('google_play_verify_success', { active: String(active), productId });
  return NextResponse.json({ ok: true, active, user: clientUser(user) });
}
