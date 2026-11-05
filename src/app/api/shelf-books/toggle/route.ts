import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { z } from 'zod';
import {checkRouteRateLimit} from '@/lib/rate-limit';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { getRedisClient,REDIS_KEYS } from '@/lib/redis';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  shelfId: z.string().uuid(),
  bookId: z.string().uuid(),
  action: z.enum(['add', 'remove']),
}).strict();

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if(request.headers.has('x-liravo-actor')&&request.headers.get('x-liravo-actor')!==user.id)return NextResponse.json({error:'ACCOUNT_CHANGED'},{status:409});
  const key=request.headers.get('idempotency-key')??request.headers.get('x-idempotency-key');if(!key||key.length<8||key.length>200)return NextResponse.json({error:'Missing/invalid shelf intent'},{status:400});
  if(!await checkRouteRateLimit(user.id,'social'))return NextResponse.json({error:'Too many requests'},{status:429});

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
  const {data,error}=await createServiceClient().rpc('apply_shelf_membership_intent' as never,{p_user_id:user.id,p_shelf_id:shelfId,p_book_id:bookId,p_add:action==='add',p_key:key} as never);
  if(error)return NextResponse.json({error:'Shelf update unavailable'},{status:({P1001:409,P1003:403,P1004:422,P1005:404} as Record<string,number>)[error.code]??503});
  const result=z.object({ok:z.literal(true),defaultType:z.string().nullable(),xp_awarded:z.number().int().nonnegative(),new_total:z.number().int().nonnegative()}).safeParse(data);
  if(!result.success)return NextResponse.json({error:'Shelf receipt unavailable'},{status:503});const shelf=result.data;
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

  return NextResponse.json(shelf);
}
