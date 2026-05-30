import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidateFeatureFlag } from '@/lib/feature-flags';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean(),
});

async function checkAdmin(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data } = await supabase
    .from('users')
    .select('is_admin')
    .eq('id', userId)
    .single();
  return data?.is_admin === true;
}

export async function GET() {
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await checkAdmin(supabase, user.id))) {
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
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await checkAdmin(supabase, user.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { name, enabled } = parsed.data;
  const service = createServiceClient();

  const { error } = await service
    .from('feature_flags')
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq('name', name);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Invalidate Redis cache immediately
  await invalidateFeatureFlag(name);

  return NextResponse.json({ updated: true });
}
