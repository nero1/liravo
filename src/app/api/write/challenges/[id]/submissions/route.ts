import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// GET /api/write/challenges/[id]/submissions — list public submissions for a challenge (sorted by votes)
export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('writing_challenge_submissions')
    .select('id, content, word_count, community_votes, submitted_at, users:user_id(display_name, username, avatar_url)')
    .eq('challenge_id', params.id)
    .order('community_votes', { ascending: false })
    .order('submitted_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ submissions: data ?? [] });
}
