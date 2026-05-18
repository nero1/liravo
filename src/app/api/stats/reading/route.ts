import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import Decimal from 'decimal.js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check premium
  const { data: profile } = await supabase
    .from('users')
    .select('reading_streak')
    .eq('id', user.id)
    .single();

  const isPremium = await checkPremium(supabase, user.id);
  if (!isPremium) {
    return NextResponse.json({ error: 'Premium required' }, { status: 403 });
  }

  const currentYear = new Date().getFullYear();
  const yearStart = `${currentYear}-01-01`;
  const yearEnd = `${currentYear}-12-31`;

  // Books read this year: shelf_books with finished_at in current year on have_read shelf
  const { data: finishedBooks } = await supabase
    .from('shelf_books')
    .select('book_id, finished_at')
    .eq('user_id', user.id)
    .gte('finished_at', yearStart)
    .lte('finished_at', yearEnd + 'T23:59:59');

  const booksReadThisYear = finishedBooks?.length ?? 0;

  // Average rating from reviews
  const { data: reviews } = await supabase
    .from('reviews')
    .select('rating')
    .eq('user_id', user.id);

  let averageRating = 0;
  if (reviews && reviews.length > 0) {
    const total = reviews.reduce((acc, r) => acc.plus(new Decimal(r.rating)), new Decimal(0));
    averageRating = parseFloat(total.div(reviews.length).toFixed(2));
  }

  // Pages read this year: join with books
  let pagesReadThisYear = 0;
  if (finishedBooks && finishedBooks.length > 0) {
    const bookIds = finishedBooks.map((b) => b.book_id);
    const { data: books } = await supabase
      .from('books')
      .select('page_count')
      .in('id', bookIds);
    pagesReadThisYear = (books ?? []).reduce((acc, b) => acc + (b.page_count ?? 0), 0);
  }

  // Reading pace: books per month
  const monthsElapsed = new Date().getMonth() + 1;
  const readingPace = parseFloat(
    new Decimal(booksReadThisYear).div(monthsElapsed).toFixed(2)
  );

  // Favourite genre: from have_read shelf books genres
  let favouriteGenre: string | null = null;
  if (finishedBooks && finishedBooks.length > 0) {
    const bookIds = finishedBooks.map((b) => b.book_id);
    const { data: genreBooks } = await supabase
      .from('books')
      .select('genres')
      .in('id', bookIds);

    const genreCounts: Record<string, number> = {};
    for (const book of genreBooks ?? []) {
      for (const genre of book.genres ?? []) {
        genreCounts[genre] = (genreCounts[genre] ?? 0) + 1;
      }
    }
    const sorted = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]);
    favouriteGenre = sorted[0]?.[0] ?? null;
  }

  // Longest book read
  let longestBook: { title: string; page_count: number } | null = null;
  if (finishedBooks && finishedBooks.length > 0) {
    const bookIds = finishedBooks.map((b) => b.book_id);
    const { data: longBooks } = await supabase
      .from('books')
      .select('title, page_count')
      .in('id', bookIds)
      .order('page_count', { ascending: false })
      .limit(1);
    if (longBooks && longBooks[0]) {
      longestBook = longBooks[0] as { title: string; page_count: number };
    }
  }

  const readingStreakMax = profile?.reading_streak ?? 0;

  return NextResponse.json({
    booksReadThisYear,
    averageRating,
    pagesReadThisYear,
    readingPace,
    favouriteGenre,
    longestBook,
    readingStreakMax,
    year: currentYear,
  });
}

async function checkPremium(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('users')
    .select('is_premium')
    .eq('id', userId)
    .single();
  return (data as { is_premium?: boolean } | null)?.is_premium ?? false;
}
