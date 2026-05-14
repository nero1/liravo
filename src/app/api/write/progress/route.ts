import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('reading_streak, xp')
    .eq('id', user.id)
    .single();

  const { data: promptSubs } = await supabase
    .from('prompt_submissions')
    .select('word_count')
    .eq('user_id', user.id);

  const { data: challengeEntries } = await supabase
    .from('writing_challenge_entries')
    .select('word_count')
    .eq('user_id', user.id);

  const { count: workshopCount } = await supabase
    .from('workshop_submissions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id);

  const promptWords = (promptSubs ?? []).reduce(
    (sum: number, r: { word_count?: number }) => sum + (r.word_count ?? 0),
    0
  );
  const challengeWords = (challengeEntries ?? []).reduce(
    (sum: number, r: { word_count?: number }) => sum + (r.word_count ?? 0),
    0
  );

  return NextResponse.json({
    total_words: promptWords + challengeWords,
    prompts_completed: (promptSubs ?? []).length,
    challenges_completed: (challengeEntries ?? []).length,
    workshop_critiques: workshopCount ?? 0,
    writing_streak: profile?.reading_streak ?? 0,
    xp: profile?.xp ?? 0,
  });
}
