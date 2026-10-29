import {getBuddyReads,decodeBuddyCursor} from '@/lib/buddy-reads';
import { contentIntent, ContentIntentError } from '@/lib/content-intents';
import { createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { awardXP } from '@/services/xp';
import { XP_CONFIG } from '@/constants/config';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  book_id: z.string().uuid(),
  title: z.string().trim().min(1).max(120).optional(),
  max_participants: z.number().int().min(2).max(5),
  current_chapter: z.number().int().min(1).max(100000).default(1),
});

export async function GET(request:Request) {
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});
  const actor=request.headers.get('X-Liravo-Actor');if(actor&&actor!==user.id)return NextResponse.json({error:'Account changed'},{status:409});
  const params=new URL(request.url).searchParams,scope=params.get('scope'),cursor=params.get('cursor');
  if(scope!==null&&scope!=='mine'&&scope!=='open')return NextResponse.json({error:'Invalid catalog'},{status:400});
  try{decodeBuddyCursor(cursor,user.id,scope??'mine');if(!scope&&cursor)throw Error();}catch{return NextResponse.json({error:'Invalid cursor'},{status:400});}
  try{
    if(scope)return NextResponse.json(await getBuddyReads(user.id,scope,cursor),{headers:{'Cache-Control':'private, no-store'}});
    const [mine,open]=await Promise.all([getBuddyReads(user.id,'mine'),getBuddyReads(user.id,'open')]);
    return NextResponse.json({my_reads:mine.buddy_reads,open_reads:open.buddy_reads,myNextCursor:mine.nextCursor,openNextCursor:open.nextCursor,actorId:user.id},{headers:{'Cache-Control':'private, no-store'}});
  }catch{return NextResponse.json({error:'Buddy reads unavailable'},{status:503});}
}

export async function POST(req: Request) {
  const supabase = createServiceClient();
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(()=>null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let buddyRead;
  try {
    const intent = await contentIntent(req, user.id, 'buddy_reads', { book_id: parsed.data.book_id, title: parsed.data.title ?? null, max_participants: parsed.data.max_participants, current_chapter: parsed.data.current_chapter, is_active: true });
    buddyRead = await intent.insert();
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Content creation unavailable' }, { status: error instanceof ContentIntentError ? error.status : 503 });
  }

  // Add creator as first participant
  const { error: memberError } = await supabase
    .from('buddy_read_members')
    .upsert({ buddy_read_id: buddyRead.id, user_id: user.id }, { onConflict: 'buddy_read_id,user_id', ignoreDuplicates: true });

  if (memberError) return NextResponse.json({ error: 'Membership unavailable; retry with the same key' }, { status: 503 });

  // Award XP for starting buddy read
  await awardXP(user.id, XP_CONFIG.START_BUDDY_READ, 'start_buddy_read', `buddy-read:${buddyRead.id}`);

  return NextResponse.json({ buddyRead,actorId:user.id }, { status: 201 });
}
