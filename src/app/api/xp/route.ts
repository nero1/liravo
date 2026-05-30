import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { awardXP } from '@/services/xp';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const XP_AMOUNTS: Record<string, number> = {
  finish_book: 50,
  write_review: 20,
  like_review: 2,
  daily_login: 10,
  add_book: 5,
  follow_user: 3,
};

export async function POST(request: Request) {
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json() as { action?: string };
  const action = body.action;

  if (!action || !(action in XP_AMOUNTS)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const amount = XP_AMOUNTS[action];
  const newTotal = await awardXP(user.id, amount, action);

  return NextResponse.json({ xp_awarded: amount, new_total: newTotal });
}
