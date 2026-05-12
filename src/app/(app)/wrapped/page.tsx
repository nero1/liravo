'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { APP_URL } from '@/constants/config';

interface WrappedData {
  year: number;
  userId: string;
  displayName: string;
  booksRead: number;
  pagesRead: number;
  topGenres: string[];
  topMood: string | null;
  streakMax: number;
  badgesEarned: number;
  totalXp: number;
}

export default function WrappedPage() {
  const [data, setData] = useState<WrappedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/wrapped')
      .then((r) => r.json())
      .then((d: WrappedData) => setData(d))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  function handleShare() {
    if (!data) return;
    const url = `${APP_URL}/share/wrapped/${data.userId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => null);
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-neutral-200 dark:bg-neutral-800 rounded w-48 mx-auto" />
          <div className="h-4 bg-neutral-200 dark:bg-neutral-800 rounded w-64 mx-auto" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <p className="text-neutral-500">Please log in to see your Reading Wrapped.</p>
      </div>
    );
  }

  const stats = [
    { icon: '📚', value: data.booksRead, label: 'Books Read' },
    { icon: '📄', value: data.pagesRead.toLocaleString(), label: 'Pages Read' },
    { icon: '🔥', value: data.streakMax, label: 'Max Streak (days)' },
    { icon: '🏅', value: data.badgesEarned, label: 'Badges Earned' },
    { icon: '⭐', value: data.totalXp.toLocaleString(), label: 'Total XP' },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-8">
      {/* Header */}
      <div className="text-center">
        <p className="text-accent font-bold tracking-widest text-sm uppercase">Liravo</p>
        <h1 className="font-display text-3xl font-black mt-1">{data.year} Wrapped</h1>
        <p className="text-neutral-600 dark:text-neutral-400 mt-2">
          Hey <strong>{data.displayName}</strong>, here&apos;s your year in reading!
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="p-4 bg-neutral-50 dark:bg-neutral-800 rounded-xl text-center border border-neutral-200 dark:border-neutral-700"
          >
            <div className="text-3xl mb-1">{stat.icon}</div>
            <div className="text-2xl font-black text-accent">{stat.value}</div>
            <div className="text-xs text-neutral-500 mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Top Genres */}
      {data.topGenres.length > 0 && (
        <section className="p-4 bg-neutral-50 dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700">
          <h2 className="font-semibold mb-3">Top Genres</h2>
          <div className="flex flex-wrap gap-2">
            {data.topGenres.map((genre) => (
              <span
                key={genre}
                className="px-3 py-1 bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 rounded-full text-sm font-medium"
              >
                {genre}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Top Mood */}
      {data.topMood && (
        <section className="p-4 bg-neutral-50 dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700">
          <h2 className="font-semibold mb-1">Your Reading Vibe</h2>
          <p className="text-2xl font-bold text-accent">{data.topMood}</p>
          <p className="text-sm text-neutral-500 mt-1">Your most-used mood tag in reviews</p>
        </section>
      )}

      {/* Share Button */}
      <button
        onClick={handleShare}
        className="w-full py-3 bg-accent text-white rounded-xl font-semibold hover:opacity-90 transition-opacity"
      >
        {copied ? 'Link Copied!' : 'Share My Wrapped'}
      </button>

      <p className="text-center text-xs text-neutral-500">
        Your wrapped is available year-round, not just December.{' '}
        <Link href="/discover" className="text-accent hover:underline">
          Discover more books
        </Link>
      </p>
    </div>
  );
}
