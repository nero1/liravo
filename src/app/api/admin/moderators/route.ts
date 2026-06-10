import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) return null;
  const { data } = await supabase.from('users').select('is_admin').eq('id', user.id).single();
  if (!data?.is_admin) return null;
  return user;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const service = createServiceClient();
  const { data: moderators } = await service
    .from('users')
    .select('id, username, display_name, avatar_url, email, created_at')
    .eq('is_moderator', true)
    .order('created_at', { ascending: false });

  return NextResponse.json({ moderators: moderators ?? [] });
}

const PatchSchema = z.object({
  userId: z.string().uuid(),
  action: z.enum(['grant', 'revoke']),
});

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const { userId, action } = parsed.data;
  const service = createServiceClient();

  const { error } = await service
    .from('users')
    .update({ is_moderator: action === 'grant' } as never)
    .eq('id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Log the action
  await service.from('moderation_log').insert({
    moderator_id: admin.id,
    action: action === 'grant' ? 'grant_moderator' : 'revoke_moderator',
    target_user_id: userId,
    notes: `Moderator role ${action}ed by admin`,
  }).maybeSingle();

  return NextResponse.json({ ok: true, action });
}
