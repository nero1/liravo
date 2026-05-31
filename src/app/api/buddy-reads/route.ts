import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { awardXP } from '@/services/xp';
import { XP_CONFIG } from '@/constants/config';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  book_id: z.string().uuid(),
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
  const { data: participating } = await supabase
    .from('buddy_read_participants')
    .select('buddy_read_id')
    .eq('user_id', user.id);

  const participatingIds = ((participating ?? []) as Array<{ buddy_read_id: string }>).map(
    (p) => p.buddy_read_id
  );

  // Get buddy reads user is in
  let myReads: unknown[] = [];
  if (participatingIds.length > 0) {
    const { data: myReadsData } = await supabase
      .from('buddy_reads')
      .select('id, book_id, max_participants, current_chapter, is_active, created_by, created_at')
      .in('id', participatingIds)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    myReads = myReadsData ?? [];
  }

  // Get open buddy reads user can join
  const { data: openReads } = await supabase
    .from('buddy_reads')
    .select('id, book_id, max_participants, current_chapter, is_active, created_by, created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(20);

  const filteredOpen = ((openReads ?? []) as Array<{ id: string }>).filter(
    (r) => !participatingIds.includes(r.id)
  );

  return NextResponse.json({
    my_reads: myReads ?? [],
    open_reads: filteredOpen,
  });
}

export async function POST(req: Request) {
  const supabase = createClient();
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { data: buddyRead, error } = await supabase
    .from('buddy_reads')
    .insert({
      book_id: parsed.data.book_id,
      max_participants: parsed.data.max_participants,
      current_chapter: parsed.data.current_chapter,
      is_active: true,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Add creator as first participant
  await supabase
    .from('buddy_read_participants')
    .insert({
      buddy_read_id: buddyRead.id,
      user_id: user.id,
    });

  // Award XP for starting buddy read
  await awardXP(user.id, XP_CONFIG.START_BUDDY_READ, 'start_buddy_read');

  return NextResponse.json({ buddyRead }, { status: 201 });
}
