import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Check challenge exists
  const { data: challenge } = await supabase
    .from('writing_challenges')
    .select('id, participant_count')
    .eq('id', params.id)
    .single();

  if (!challenge) return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });

  // Check already joined
  const { data: existing } = await supabase
    .from('writing_challenge_participants')
    .select('id')
    .eq('user_id', user.id)
    .eq('challenge_id', params.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ message: 'Already joined' });
  }

  const { error } = await supabase
    .from('writing_challenge_participants')
    .insert({ user_id: user.id, challenge_id: params.id });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Increment participant count
  await supabase
    .from('writing_challenges')
    .update({ participant_count: (challenge.participant_count ?? 0) + 1 })
    .eq('id', params.id);

  return NextResponse.json({ success: true });
}
