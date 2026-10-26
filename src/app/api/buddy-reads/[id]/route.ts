import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: buddyRead } = await supabase
    .from('buddy_reads')
    .select('id, book_id, max_participants, current_chapter, is_active, created_by, created_at')
    .eq('id', params.id)
    .single();

  if (!buddyRead) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: participantsRaw } = await supabase
    .from('buddy_read_members')
    .select('user_id')
    .eq('buddy_read_id', params.id);

  const participantIds = ((participantsRaw ?? []) as Array<{ user_id: string }>).map((p) => p.user_id);

  let participants: Array<{ id: string; username: string; display_name: string; avatar_url: string | null }> = [];
  if (participantIds.length > 0) {
    const { data: profiles } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url')
      .in('id', participantIds);
    participants = profiles ?? [];
  }

  const { data: book } = await supabase
    .from('books')
    .select('id, title, author_name, cover_url')
    .eq('id', buddyRead.book_id)
    .single();

  return NextResponse.json({ buddyRead, book, participants });
}
