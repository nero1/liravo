import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { getRequestCorrelationId } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const correlationId = getRequestCorrelationId(request);
  const { error } = await createServiceClient().rpc('cancel_subscriptions_atomic' as never, {
    p_user_id: user.id, p_correlation_id: correlationId,
  } as never);
  if (error) return NextResponse.json({ error: 'Cancellation unavailable', correlationId }, { status: 503 });
  return NextResponse.json({ cancelled: true, correlationId });
}
