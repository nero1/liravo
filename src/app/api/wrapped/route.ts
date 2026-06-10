import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/getCurrentUser';
import { getLevelTitle } from '@/services/xp';

export const dynamic = 'force-dynamic';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export async function GET() {
  const supabase = createClient();
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const currentYear = new Date().getFullYear();
  const yearStart = `${currentYear}-01-01`;
  const yearEnd = `${currentYear}-12-31T23:59:59`;

  const { data: profile } = await supabase
    .from('users')
    .select('display_name, books_read_count, reading_streak, genres, xp')
    .eq('id', user.id)
    .single();

  const { data: shelves } = await supabase
    .from('shelves')
    .select('id')
    .eq('user_id', user.id)
    .eq('default_type', 'have_read');

  const shelfIds = (shelves ?? []).map((s) => s.id);

  let booksRead = 0;
  let pagesRead = 0;
  let favouriteAuthor: string | null = null;
  let longestBook: { title: string; pageCount: number } | null = null;
  let shortestBook: { title: string; pageCount: number } | null = null;
  let mostActiveMonth: string | null = null;

  if (shelfIds.length > 0) {
    const { data: yearShelfBooks } = await supabase
      .from('shelf_books')
      .select('book_id, finished_at, progress_pages')
      .in('shelf_id', shelfIds)
      .gte('finished_at', yearStart)
      .lte('finished_at', yearEnd);

    booksRead = (yearShelfBooks ?? []).length;
    pagesRead = (yearShelfBooks ?? []).reduce((sum, b) => sum + (b.progress_pages ?? 0), 0);

    if (yearShelfBooks && yearShelfBooks.length > 0) {
      const bookIds = yearShelfBooks.map((b) => b.book_id);
      const { data: bookDetails } = await supabase
        .from('books')
        .select('id, title, author_name, page_count')
        .in('id', bookIds);

      if (bookDetails && bookDetails.length > 0) {
        const authorCounts: Record<string, number> = {};
        for (const b of bookDetails) {
          if (b.author_name) {
            authorCounts[b.author_name] = (authorCounts[b.author_name] ?? 0) + 1;
          }
        }
        favouriteAuthor = Object.entries(authorCounts)
          .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

        const withPages = bookDetails.filter((b) => (b.page_count ?? 0) > 0);
        if (withPages.length > 0) {
          const longest = withPages.reduce((a, b) => (b.page_count! > a.page_count! ? b : a));
          const shortest = withPages.reduce((a, b) => (b.page_count! < a.page_count! ? b : a));
          longestBook = { title: longest.title, pageCount: longest.page_count! };
          shortestBook = { title: shortest.title, pageCount: shortest.page_count! };
        }
      }

      const monthCounts: Record<number, number> = {};
      for (const b of yearShelfBooks) {
        if (b.finished_at) {
          const month = new Date(b.finished_at).getMonth();
          monthCounts[month] = (monthCounts[month] ?? 0) + 1;
        }
      }
      const topMonthEntry = Object.entries(monthCounts).sort((a, b) => b[1] - a[1])[0];
      if (topMonthEntry) mostActiveMonth = MONTH_NAMES[Number(topMonthEntry[0])];
    }
  }

  const { data: yearReviews } = await supabase
    .from('reviews')
    .select('mood_tags')
    .eq('user_id', user.id)
    .gte('created_at', yearStart)
    .lte('created_at', yearEnd);

  const moodCounts: Record<string, number> = {};
  for (const review of yearReviews ?? []) {
    for (const tag of review.mood_tags ?? []) {
      moodCounts[tag] = (moodCounts[tag] ?? 0) + 1;
    }
  }
  const topMood = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const { data: badges } = await supabase
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
    favouriteAuthor,
    longestBook,
    shortestBook,
    mostActiveMonth,
    readerTitle: getLevelTitle(profile?.xp ?? 0),
  });
}
