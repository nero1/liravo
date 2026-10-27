import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { getRedisClient,REDIS_KEYS } from '@/lib/redis';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  shelfId: z.string().uuid(),
  bookId: z.string().uuid(),
  action: z.enum(['add', 'remove']),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { shelfId, bookId, action } = parsed.data;
  const {data,error}=await createServiceClient().rpc('set_shelf_membership' as never,{p_user_id:user.id,p_shelf_id:shelfId,p_book_id:bookId,p_add:action==='add'} as never);
  if(error)return NextResponse.json({error:'Shelf update unavailable'},{status:error.code==='P1005'?404:error.code==='P1003'?403:503});
  const shelf=data as {defaultType:string|null};
  try{await getRedisClient().del(REDIS_KEYS.book(bookId));}catch{}

  // Invalidate taste profile cache when a book is added to have_read shelf
  if (action === 'add' && shelf.defaultType === 'have_read') {
    try {
      const redis = getRedisClient();
      await redis.del(`taste_profile:${user.id}`);
    } catch {
      // Non-critical
    }
  }

  return NextResponse.json({ ok: true, defaultType: shelf.defaultType });
}
