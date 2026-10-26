import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { checkRouteRateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!z.object({ id: z.string().uuid() }).safeParse(params).success) return NextResponse.json({ error: 'Invalid target' }, { status: 400 });
  const key = request.headers.get('idempotency-key') ?? request.headers.get('x-idempotency-key');
  if (!key || key.length < 8 || key.length > 200) return NextResponse.json({ error: 'Missing/invalid idempotency key' }, { status: 400 });
  if (!await checkRouteRateLimit(user.id,'social')) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  const { data, error } = await createServiceClient().rpc('apply_book_interaction' as never, {
    p_user_id: user.id, p_book_id: params.id, p_action: 'reaction', p_key: key,
  } as never);
  if (error) {
    const status = error.code === 'P1001' ? 409 : error.code === 'P1003' ? 404 : 503;
    return NextResponse.json({ error: status === 409 ? 'Conflicting idempotency key' : status === 404 ? 'Target unavailable' : 'Interaction unavailable' }, { status });
  }
  return NextResponse.json(data);
}
