import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();

  const { data: room, error } = await supabase
    .from('workshop_rooms')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error || !room) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: members } = await supabase
    .from('workshop_members')
    .select('user_id, users:user_id(display_name, username)')
    .eq('room_id', params.id);

  const { data: submissions } = await supabase
    .from('workshop_submissions')
    .select('id, title, excerpt, word_count, created_at, user_id, users:user_id(display_name, username)')
    .eq('room_id', params.id)
    .order('created_at', { ascending: false })
    .limit(5);

  // Fetch feedback for each submission
  const submissionsWithFeedback = await Promise.all(
    (submissions ?? []).map(async (sub: { id: string; [key: string]: unknown }) => {
      const { data: feedback } = await supabase
        .from('workshop_feedback')
        .select('id, comment, created_at, user_id, users:user_id(display_name, username)')
        .eq('submission_id', sub.id)
        .order('created_at', { ascending: true });
      return { ...sub, feedback: feedback ?? [] };
    })
  );

  return NextResponse.json({ room, members: members ?? [], submissions: submissionsWithFeedback });
}
