import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const currentYear = new Date().getFullYear();
  const yearStart = `${currentYear}-01-01`;
  const yearEnd = `${currentYear}-12-31T23:59:59`;

  // Get user profile
  const { data: profile } = await supabase
    .from('users')
    .select('display_name, books_read_count, reading_streak, genres, xp')
    .eq('id', user.id)
    .single();

  // Get have_read shelves
  const { data: shelves } = await supabase
    .from('shelves')
    .select('id')
    .eq('user_id', user.id)
    .eq('default_type', 'have_read');

  const shelfIds = (shelves ?? []).map((s) => s.id);

  let booksRead = 0;
  let pagesRead = 0;

  if (shelfIds.length > 0) {
    const { data: yearBooks } = await supabase
      .from('shelf_books')
      .select('finished_at, progress_pages')
      .in('shelf_id', shelfIds)
      .gte('finished_at', yearStart)
      .lte('finished_at', yearEnd);

    booksRead = (yearBooks ?? []).length;
    pagesRead = (yearBooks ?? []).reduce((sum, b) => sum + (b.progress_pages ?? 0), 0);
  }

  // Top genres from reviews this year
  const { data: yearReviews } = await supabase
    .from('reviews')
    .select('mood_tags')
    .eq('user_id', user.id)
    .gte('created_at', yearStart)
    .lte('created_at', yearEnd);

  // Tally mood tags
  const moodCounts: Record<string, number> = {};
  for (const review of yearReviews ?? []) {
    for (const tag of review.mood_tags ?? []) {
      moodCounts[tag] = (moodCounts[tag] ?? 0) + 1;
    }
  }

  const topMood = Object.entries(moodCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 1)
    .map(([tag]) => tag)[0] ?? null;

  // Badges earned
  const { data: badges } = await (supabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any
    .from('user_badges')
    .select('badge_id, awarded_at')
    .eq('user_id', user.id)
    .gte('awarded_at', yearStart)
    .lte('awarded_at', yearEnd);

  return NextResponse.json({
    year: currentYear,
    userId: user.id,
    displayName: profile?.display_name ?? 'Reader',
    booksRead,
    pagesRead,
    topGenres: profile?.genres?.slice(0, 3) ?? [],
    topMood,
    streakMax: profile?.reading_streak ?? 0,
    badgesEarned: (badges ?? []).length,
    totalXp: profile?.xp ?? 0,
  });
}
