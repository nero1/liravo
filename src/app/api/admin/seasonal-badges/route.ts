import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { SEASONAL_BADGE_DEFINITIONS, bulkAwardSeasonalBadge } from '@/services/badges';

export const dynamic = 'force-dynamic';

async function requireAdmin() {
  const supabase = (await createClient());
  const user = await getCurrentUser();
  if (!user) return null;
  const { data } = await supabase.from('users').select('is_admin').eq('id', user.id).single();
  if (!data?.is_admin) return null;
  return user;
}

export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return NextResponse.json({ badges: SEASONAL_BADGE_DEFINITIONS });
}

const AwardSchema = z.object({
  badge_id: z.string(),
  user_ids: z.array(z.string().uuid()).min(1).max(10000),
});

export async function POST(request: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = AwardSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }

  const { badge_id, user_ids } = parsed.data;
  const result = await bulkAwardSeasonalBadge(badge_id, user_ids);
  return NextResponse.json({ awarded: result.awarded });
}
