import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  if(!z.string().uuid().safeParse(params.id).success)return NextResponse.json({error:'Invalid buddy read'},{status:400});
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: buddyRead,error:roomError } = await supabase
    .from('buddy_reads')
    .select('id, book_id, max_participants, current_chapter, is_active, is_private, created_by, created_at')
    .eq('id', params.id)
    .maybeSingle();

  if(roomError)return NextResponse.json({error:'Buddy read unavailable'},{status:503});
  if (!buddyRead) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: participantsRaw,error:membersError } = await supabase
    .from('buddy_read_members')
    .select('user_id')
    .eq('buddy_read_id', params.id);

  if(membersError)return NextResponse.json({error:'Participants unavailable'},{status:503});
  if(buddyRead.is_private&&buddyRead.created_by!==user.id&&!(participantsRaw??[]).some(member=>member.user_id===user.id))return NextResponse.json({error:'Buddy read unavailable'},{status:404});
  const participantIds = ((participantsRaw ?? []) as Array<{ user_id: string }>).map((p) => p.user_id);

  let participants: Array<{ id: string; username: string; display_name: string; avatar_url: string | null }> = [];
  if (participantIds.length > 0) {
    const { data: profiles,error:profilesError } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url')
      .in('id', participantIds);
    if(profilesError)return NextResponse.json({error:'Participants unavailable'},{status:503});
    participants = profiles ?? [];
  }

  const { data: book,error:bookError } = await supabase
    .from('books')
    .select('id, title, author_name, cover_url')
    .eq('id', buddyRead.book_id)
    .single();

  if(bookError)return NextResponse.json({error:'Book unavailable'},{status:503});
  return NextResponse.json({ buddyRead, book, participants });
}
