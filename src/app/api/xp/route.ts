import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { XP_CONFIG } from '@/constants/config';
import { singleRelation } from '@/lib/utils';

export const dynamic = 'force-dynamic';
const schema = z.object({ action: z.enum(['daily_login','finish_book','add_book']), bookId: z.string().uuid().optional() });

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  const { action, bookId } = parsed.data;
  const service = createServiceClient();
  if (action !== 'daily_login') {
    if (!bookId) return NextResponse.json({ error: 'Book required' }, { status: 400 });
    const { data } = await service.from('shelf_books').select('shelves:shelf_id(default_type)').eq('user_id', user.id).eq('book_id', bookId);
    if (!data?.some(row => action === 'add_book' || singleRelation(row.shelves)?.default_type === 'have_read')) {
      return NextResponse.json({ error: 'Reading activity not found' }, { status: 403 });
    }
  }
  const amount = action === 'daily_login' ? XP_CONFIG.DAILY_LOGIN : action === 'finish_book' ? XP_CONFIG.FINISH_BOOK : XP_CONFIG.WANT_TO_READ_REACTION;
  const { data, error } = await service.rpc('award_xp_once' as never, {
    p_user_id: user.id, p_amount: amount, p_reason: action,
    p_event_key: `${action}:${action === 'daily_login' ? new Date().toISOString().slice(0, 10) : bookId}`,
  } as never);
  if (error) return NextResponse.json({ error: 'Reward unavailable' }, { status: 503 });
  const reward = data as { xp: number; awarded: number };
  return NextResponse.json({ xp_awarded: reward.awarded, new_total: reward.xp });
}
