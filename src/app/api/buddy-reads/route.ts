import { contentIntent, ContentIntentError } from '@/lib/content-intents';
import { createClient, createServiceClient } from '@/lib/supabase/server';
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
  current_chapter: z.number().int().min(1).default(1),
});

export async function GET() {
  const supabase = createClient();
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Get buddy reads the user is part of, or open ones they can join
  const { data: participating,error:membershipError } = await supabase
    .from('buddy_read_members')
    .select('buddy_read_id')
    .eq('user_id', user.id);

  if(membershipError)return NextResponse.json({error:'Membership unavailable'},{status:503});
  const participatingIds = ((participating ?? []) as Array<{ buddy_read_id: string }>).map(
    (p) => p.buddy_read_id
  );

  // Get buddy reads user is in
  let myReads: unknown[] = [];
  if (participatingIds.length > 0) {
    const { data: myReadsData,error:readsError } = await supabase
      .from('buddy_reads')
      .select('id, title, book_id, max_participants, current_chapter, is_active, created_by, created_at')
      .in('id', participatingIds)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    if(readsError)return NextResponse.json({error:'Buddy reads unavailable'},{status:503});
    myReads = myReadsData ?? [];
  }

  // Get open buddy reads user can join
  const { data: openReads,error:openError } = await supabase
    .from('buddy_reads')
    .select('id, title, book_id, max_participants, current_chapter, is_active, created_by, created_at')
    .eq('is_active', true)
    .eq('is_private',false)
    .order('created_at', { ascending: false })
    .limit(20);

  if(openError)return NextResponse.json({error:'Buddy reads unavailable'},{status:503});
  const filteredOpen = ((openReads ?? []) as Array<{ id: string }>).filter(
    (r) => !participatingIds.includes(r.id)
  );

  return NextResponse.json({
    my_reads: myReads ?? [],
    open_reads: filteredOpen,
  });
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

  return NextResponse.json({ buddyRead }, { status: 201 });
}
