import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { getRequestCorrelationId } from '@/lib/utils';
import { drainSubscriptionCancellations } from '@/lib/subscription-cancellations';
import { googlePlayManagementUrl } from '@/lib/google-play';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const correlationId = getRequestCorrelationId(request);
  const client = createServiceClient();
  const { error } = await client.rpc('request_subscription_cancellation' as never, {
    p_user_id: user.id, p_correlation_id: correlationId,
  } as never);
  if (error) return NextResponse.json({ error: 'Cancellation unavailable', correlationId }, { status: 503 });
  try { await drainSubscriptionCancellations(user.id); }
  catch { return NextResponse.json({ error: 'Cancellation queued; confirmation unavailable', correlationId }, { status: 503 }); }
  const { data, error: stateError } = await client.rpc('request_subscription_cancellation' as never, {
    p_user_id: user.id, p_correlation_id: correlationId,
  } as never);
  if (stateError) return NextResponse.json({ error: 'Cancellation status unavailable', correlationId }, { status: 503 });
  if (typeof data !== 'number' || !Number.isSafeInteger(data) || data < 0) return NextResponse.json({ error: 'Cancellation status unavailable', correlationId }, { status: 503 });
  const pending = data > 0;
  const {data:google,error:googleError}=await client.from('subscriptions').select('id').eq('user_id',user.id).eq('provider','google_play').eq('status','active').gt('current_period_end',new Date().toISOString()).limit(1);
  if (googleError || !Array.isArray(google)) return NextResponse.json({error:'Subscription management unavailable',correlationId},{status:503});
  const managedExternally=google.length>0;
  return NextResponse.json({ cancelled: !pending && !managedExternally, pending, managedExternally, ...(managedExternally?{code:'GOOGLE_PLAY_MANAGED_EXTERNALLY',managementUrl:googlePlayManagementUrl()}:{}), correlationId }, { status: pending ? 202 : managedExternally ? 409 : 200 });
}
