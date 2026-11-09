import { checkRouteRateLimit } from '@/lib/rate-limit';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';
const paramsSchema = z.object({ id: z.string().uuid() });

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await checkRouteRateLimit(user.id, 'social'))) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  if (!paramsSchema.safeParse(params).success) return NextResponse.json({ error: 'Invalid target' }, { status: 400 });
  const key = request.headers.get('x-idempotency-key');
  if (!key || key.length < 8 || key.length > 200) return NextResponse.json({ error: 'Missing/invalid idempotency key' }, { status: 400 });
  const { data, error } = await createServiceClient().rpc('apply_social_intent', {
    p_actor_id: user.id, p_target_id: params.id, p_action: 'like', p_key: key,
  });
  if (error) return NextResponse.json({ error: 'Action unavailable' }, { status: 503 });
  const active = Array.isArray(data) ? Object.values(data[0] ?? {})[0] : data;
  return NextResponse.json({ liked: active });
}
