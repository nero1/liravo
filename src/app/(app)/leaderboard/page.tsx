'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';

// Note: metadata cannot be exported from 'use client' files — title is 'Leaderboard'

interface LeaderboardEntry {
  rank: number;
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  xp: number;
  level_title: string;
}

type LeaderboardType = 'global' | 'national' | 'friends';
type LeaderboardPeriod = 'weekly' | 'monthly' | 'alltime';

export default function LeaderboardPage() {
  const [type, setType] = useState<LeaderboardType>('global');
  const [period, setPeriod] = useState<LeaderboardPeriod>('weekly');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    // Get current user id from profile fetch
    fetch('/api/users/me')
      .then((r) => r.json())
      .then((d: { id?: string }) => setCurrentUserId(d?.id ?? null))
      .catch(() => null);
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/leaderboards?type=${type}&period=${period}`)
      .then((r) => r.json())
      .then((d: { leaderboard?: LeaderboardEntry[] }) => {
        setEntries(d.leaderboard ?? []);
      })
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [type, period]);

  const typeLabels: Record<LeaderboardType, string> = {
    global: 'Global',
    national: 'National',
    friends: 'Friends',
  };

  const periodLabels: Record<LeaderboardPeriod, string> = {
    weekly: 'Weekly',
    monthly: 'Monthly',
    alltime: 'All Time',
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <h1 className="font-display text-2xl font-bold">Leaderboard</h1>

      {/* Type Tabs */}
      <div className="flex gap-1 border border-neutral-200 dark:border-neutral-700 rounded-lg p-1">
        {(Object.keys(typeLabels) as LeaderboardType[]).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={cn(
              'flex-1 py-2 text-sm font-medium rounded-md transition-colors',
              type === t
                ? 'bg-accent text-white'
                : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            )}
          >
            {typeLabels[t]}
          </button>
        ))}
      </div>

      {/* Period Tabs */}
      <div className="flex gap-2">
        {(Object.keys(periodLabels) as LeaderboardPeriod[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={cn(
              'px-3 py-1 text-sm rounded-full border transition-colors',
              period === p
                ? 'border-accent text-accent bg-amber-50 dark:bg-amber-950'
                : 'border-neutral-200 dark:border-neutral-700 text-neutral-600 dark:text-neutral-400 hover:border-neutral-400'
            )}
          >
            {periodLabels[p]}
          </button>
        ))}
      </div>

      {/* Leaderboard */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="h-16 bg-neutral-100 dark:bg-neutral-800 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16 text-neutral-500">
          No data yet. Start reading to appear on the leaderboard!
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className={cn(
                'flex items-center gap-3 p-3 rounded-lg border transition-colors',
                entry.id === currentUserId
                  ? 'border-accent bg-amber-50 dark:bg-amber-950'
                  : 'border-neutral-200 dark:border-neutral-700'
              )}
            >
              {/* Rank */}
              <div
                className={cn(
                  'w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold flex-shrink-0',
                  entry.rank === 1
                    ? 'bg-yellow-400 text-yellow-900'
                    : entry.rank === 2
                    ? 'bg-neutral-300 text-neutral-700'
                    : entry.rank === 3
                    ? 'bg-amber-600 text-white'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
                )}
              >
                {entry.rank}
              </div>

              {/* Avatar */}
              <div className="relative w-10 h-10 rounded-full overflow-hidden bg-neutral-200 dark:bg-neutral-700 flex-shrink-0">
                {entry.avatar_url ? (
                  <Image
                    src={entry.avatar_url}
                    alt={entry.display_name}
                    fill
                    className="object-cover"
                    sizes="40px"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-lg">
                    {entry.display_name[0]?.toUpperCase()}
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span className="font-semibold text-sm truncate">{entry.display_name}</span>
                  {entry.id === currentUserId && (
                    <span className="text-xs text-accent font-medium">(you)</span>
                  )}
                </div>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">{entry.level_title}</span>
              </div>

              {/* XP */}
              <div className="text-right flex-shrink-0">
                <p className="font-bold text-sm text-accent">{entry.xp.toLocaleString()}</p>
                <p className="text-xs text-neutral-500">XP</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
