import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: challenge } = await (supabase as any)
    .from('writing_challenges')
    .select('id, participant_count')
    .eq('id', params.id)
    .single();

  if (!challenge) return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });

  // Check already joined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from('writing_challenge_participants')
    .select('id')
    .eq('user_id', user.id)
    .eq('challenge_id', params.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ message: 'Already joined' });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('writing_challenge_participants')
    .insert({ user_id: user.id, challenge_id: params.id });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Increment participant count
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('writing_challenges')
    .update({ participant_count: (challenge.participant_count ?? 0) + 1 })
    .eq('id', params.id);

  return NextResponse.json({ success: true });
}
