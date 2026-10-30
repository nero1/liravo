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

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!await isAdmin(user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const service = createServiceClient();
  const { data: flags, error } = await service
    .from('feature_flags')
    .select('id, name, enabled, description, updated_at')
    .order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ flags: flags ?? [] });
}

export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!await isAdmin(user.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if(req.headers.has('X-Liravo-Actor')&&req.headers.get('X-Liravo-Actor')!==user.id)return NextResponse.json({error:'Account changed'},{status:409});
  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { name, enabled } = parsed.data;
  const service = createServiceClient();

  const { data: changed, error } = await service.rpc('set_feature_flag_atomic' as never, {
    p_actor_id: user.id, p_name: name, p_enabled: enabled,
  } as never);
  if (error) {
    const status = error.code === 'P1006' ? 409 : error.code === 'P1003' ? 404 : error.code === 'P1005' ? 403 : 503;
    return NextResponse.json({ error: status === 409 ? 'At least one sign-in provider must remain active' : 'Flag update unavailable', code: error.code }, { status });
  }

  if(typeof changed!=='boolean')return NextResponse.json({error:'Flag update unavailable'},{status:503});

  // Invalidate Redis cache immediately
  try { await invalidateFeatureFlag(name); }
  catch { return NextResponse.json({ error: 'Flag saved; retry to synchronize cache', code: 'FLAG_CACHE_UNAVAILABLE' }, { status: 503 }); }

  return NextResponse.json({updated:true,changed,actorId:user.id,name,enabled});
}
