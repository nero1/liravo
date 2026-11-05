import { adminFeatureFlagsSchema } from '@/lib/feature-flag-contracts';
import { isAdmin } from '@/lib/moderation';
import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidateFeatureFlag } from '@/lib/feature-flags';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean(),
});

const json = (body: unknown, options: { status?: number } = {}) => NextResponse.json(body, { ...options, headers: { 'Cache-Control': 'private, no-store' } });

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: 'Unauthorized' }, { status: 401 });
  if (!await isAdmin(user.id)) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  if (req.headers.has('X-Liravo-Actor') && req.headers.get('X-Liravo-Actor') !== user.id) return json({ error: 'Account changed' }, { status: 409 });

  const service = createServiceClient();
  const { data: flags, error } = await service
    .from('feature_flags')
    .select('id, name, enabled, description, updated_at')
    .order('name');

  const parsed = adminFeatureFlagsSchema.safeParse(flags);
  if (error || !parsed.success) return json({ error: 'Flags unavailable' }, { status: 503 });

  return json({ actorId: user.id, flags: parsed.data });
}

export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: 'Unauthorized' }, { status: 401 });
  if (!await isAdmin(user.id)) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  if(req.headers.has('X-Liravo-Actor')&&req.headers.get('X-Liravo-Actor')!==user.id)return json({error:'Account changed'},{status:409});
  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { name, enabled } = parsed.data;
  const service = createServiceClient();

  const { data: changed, error } = await service.rpc('set_feature_flag_atomic' as never, {
    p_actor_id: user.id, p_name: name, p_enabled: enabled,
  } as never);
  if (error) {
    const status = error.code === 'P1006' ? 409 : error.code === 'P1003' ? 404 : error.code === 'P1005' ? 403 : 503;
    return json({ error: status === 409 ? 'At least one sign-in provider must remain active' : 'Flag update unavailable', code: error.code }, { status });
  }

  if(typeof changed!=='boolean')return json({error:'Flag update unavailable'},{status:503});

  await invalidateFeatureFlag(name);

  return json({updated:true,changed,actorId:user.id,name,enabled});
}
