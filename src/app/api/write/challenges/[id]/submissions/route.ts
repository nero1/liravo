import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

// GET /api/write/challenges/[id]/submissions — list public submissions for a challenge (sorted by votes)
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = (await createClient());

  const { data, error } = await supabase
    .from('writing_challenge_submissions')
    .select('id, content, word_count, community_votes, submitted_at, users:user_id(display_name, username, avatar_url)')
    .eq('challenge_id', params.id)
    .order('community_votes', { ascending: false })
    .order('submitted_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const viewer = await getCurrentUser();
  const votes = viewer && data?.length ? await supabase.from('writing_challenge_votes').select('submission_id').eq('user_id',viewer.id).in('submission_id',data.map(entry=>entry.id)) : null;
  if (votes?.error) return NextResponse.json({ error: 'Votes unavailable' }, { status: 503 });
  const voted = new Set((votes?.data ?? []).map(vote=>vote.submission_id));
  return NextResponse.json({ submissions: (data ?? []).map(entry=>({...entry,voted:voted.has(entry.id)})) });
}
