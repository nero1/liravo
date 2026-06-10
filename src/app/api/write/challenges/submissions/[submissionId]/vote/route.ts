import { createClient, createServiceClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';

export const dynamic = 'force-dynamic';

// POST /api/write/challenges/submissions/[submissionId]/vote — toggle vote on a submission
export async function POST(
  _req: Request,
  { params }: { params: { submissionId: string } }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createClient();

  // Check if already voted
  const { data: existing } = await supabase
    .from('writing_challenge_votes')
    .select('submission_id')
    .eq('submission_id', params.submissionId)
    .eq('user_id', user.id)
    .single();

  const serviceSupabase = createServiceClient();

  if (existing) {
    // Remove vote
    await supabase
      .from('writing_challenge_votes')
      .delete()
      .eq('submission_id', params.submissionId)
      .eq('user_id', user.id);

    await serviceSupabase.rpc('increment_challenge_vote', {
      p_submission_id: params.submissionId,
      p_delta: -1,
    });

    return NextResponse.json({ voted: false });
  } else {
    // Can't vote on own submission
    const { data: submission } = await supabase
      .from('writing_challenge_submissions')
      .select('user_id')
      .eq('id', params.submissionId)
      .single();

    if (submission?.user_id === user.id) {
      return NextResponse.json({ error: 'Cannot vote on your own submission' }, { status: 400 });
    }

    await supabase
      .from('writing_challenge_votes')
      .insert({ submission_id: params.submissionId, user_id: user.id });

    await serviceSupabase.rpc('increment_challenge_vote', {
      p_submission_id: params.submissionId,
      p_delta: 1,
    });

    return NextResponse.json({ voted: true });
  }
}
