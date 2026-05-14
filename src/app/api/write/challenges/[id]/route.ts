import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();

  const { data: challenge, error } = await supabase
    .from('writing_challenges')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error || !challenge) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Leaderboard: aggregate entries per user
  const { data: entries } = await supabase
    .from('writing_challenge_entries')
    .select('user_id, word_count, users:user_id(display_name, username)')
    .eq('challenge_id', params.id);

  // Group by user
  const userMap = new Map<
    string,
    { user_id: string; total_words: number; submission_count: number; users: unknown }
  >();
  for (const entry of entries ?? []) {
    const existing = userMap.get(entry.user_id);
    if (existing) {
      existing.total_words += entry.word_count ?? 0;
      existing.submission_count += 1;
    } else {
      userMap.set(entry.user_id, {
        user_id: entry.user_id,
        total_words: entry.word_count ?? 0,
        submission_count: 1,
        users: entry.users,
      });
    }
  }

  const leaderboard = Array.from(userMap.values()).sort(
    (a, b) => b.total_words - a.total_words
  );

  return NextResponse.json({ challenge, leaderboard });
}
