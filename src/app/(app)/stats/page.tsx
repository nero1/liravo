import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Reading Stats — Liravo' };

interface ReadingStats {
  booksReadThisYear: number;
  averageRating: number;
  pagesReadThisYear: number;
  readingPace: number;
  favouriteGenre: string | null;
  longestBook: { title: string; page_count: number } | null;
  readingStreakMax: number;
  year: number;
}

async function getStats(): Promise<ReadingStats | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/stats/reading`, {
      headers: { Cookie: '' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function StatsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('is_premium')
    .eq('id', user.id)
    .single();

  const isPremium = (profile as { is_premium?: boolean } | null)?.is_premium ?? false;

  if (!isPremium) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <div className="text-5xl mb-4">📊</div>
        <h1 className="font-display text-2xl font-bold mb-3">Reading Statistics</h1>
        <p className="text-muted-foreground mb-6">
          Unlock detailed reading stats with a Premium subscription.
        </p>
        <Link
          href="/premium"
          className="inline-block px-6 py-3 bg-accent text-accent-foreground rounded-lg font-semibold hover:bg-accent/90 transition-colors"
        >
          Go Premium — $4.99/month
        </Link>
      </div>
    );
  }

  const stats = await getStats();

  const cards = stats
    ? [
        { label: `Books Read in ${stats.year}`, value: stats.booksReadThisYear.toString() },
        { label: 'Average Rating Given', value: stats.averageRating > 0 ? `${stats.averageRating} ★` : '—' },
        { label: 'Pages Read This Year', value: stats.pagesReadThisYear.toLocaleString() },
        { label: 'Reading Pace', value: `${stats.readingPace} books/month` },
        { label: 'Favourite Genre', value: stats.favouriteGenre ?? '—' },
        {
          label: 'Longest Book Read',
          value: stats.longestBook
            ? `${stats.longestBook.title} (${stats.longestBook.page_count} pages)`
            : '—',
        },
        { label: 'Max Reading Streak', value: `${stats.readingStreakMax} days` },
      ]
    : [];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="font-display text-2xl font-bold mb-6">Reading Statistics</h1>

      {!stats ? (
        <p className="text-muted-foreground">Could not load stats. Please try again later.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {cards.map((card) => (
            <div key={card.label} className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground mb-1">{card.label}</p>
              <p className="font-bold text-lg leading-tight">{card.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
