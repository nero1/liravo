import { createClient } from '@/lib/supabase/server';
import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { USER_TYPE_LABELS } from '@/constants/config';
import type { UserType } from '@/constants/config';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Creator Leaderboard' };

interface LeaderboardEntry {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  user_types: string[];
  is_verified_author: boolean;
  tips_score: number;
  want_to_read_score: number;
  total_score: number;
}

async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/api/creator/leaderboard`,
      { next: { revalidate: 300 } }
    );
    if (res.ok) {
      const data = await res.json();
      return data.leaderboard ?? [];
    }
  } catch {
    // Fall through
  }

  // Fallback: direct DB query
  const supabase = createClient();
  const { data: users } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, user_types, is_verified_author')
    .limit(50);

  return (users ?? []).map((u) => ({
    user_id: u.id,
    username: u.username,
    display_name: u.display_name,
    avatar_url: u.avatar_url,
    user_types: u.user_types ?? [],
    is_verified_author: u.is_verified_author ?? false,
    tips_score: 0,
    want_to_read_score: 0,
    total_score: 0,
  }));
}

export default async function CreatorLeaderboardPage() {
  const entries = await getLeaderboard();

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold">Creator Leaderboard</h1>
        <p className="text-neutral-500 dark:text-neutral-400 text-sm mt-1">
          Top creators ranked by tips received and want-to-read actions triggered.
        </p>
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-neutral-500 dark:text-neutral-400">
            No creators on the leaderboard yet. Be the first!
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 dark:bg-neutral-800">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-neutral-600 dark:text-neutral-400 w-10">
                  #
                </th>
                <th className="text-left px-4 py-3 font-semibold text-neutral-600 dark:text-neutral-400">
                  Creator
                </th>
                <th className="text-right px-4 py-3 font-semibold text-neutral-600 dark:text-neutral-400 hidden sm:table-cell">
                  Tips
                </th>
                <th className="text-right px-4 py-3 font-semibold text-neutral-600 dark:text-neutral-400 hidden sm:table-cell">
                  WTR
                </th>
                <th className="text-right px-4 py-3 font-semibold text-neutral-600 dark:text-neutral-400">
                  Score
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
              {entries.map((entry, index) => {
                const primaryType = entry.user_types[0] as UserType | undefined;
                const typeLabel = primaryType ? (USER_TYPE_LABELS[primaryType] ?? primaryType) : null;

                return (
                  <tr
                    key={entry.user_id}
                    className="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
                  >
                    <td className="px-4 py-3 text-neutral-500 font-mono text-xs">
                      {index + 1}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {entry.avatar_url ? (
                          <Image
                            src={entry.avatar_url}
                            alt={entry.display_name}
                            width={32}
                            height={32}
                            className="rounded-full object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                            {entry.display_name[0]}
                          </div>
                        )}
                        <div className="min-w-0">
                          <Link
                            href={
                              entry.is_verified_author
                                ? `/author/${entry.username}`
                                : `/user/${entry.username}`
                            }
                            className="font-medium hover:text-accent transition-colors truncate block"
                          >
                            {entry.display_name}
                          </Link>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {entry.is_verified_author && (
                              <span className="text-xs text-accent">Verified Author</span>
                            )}
                            {typeLabel && (
                              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                                {typeLabel}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-neutral-600 dark:text-neutral-400 hidden sm:table-cell">
                      ${entry.tips_score.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right text-neutral-600 dark:text-neutral-400 hidden sm:table-cell">
                      {entry.want_to_read_score}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-accent">
                      {entry.total_score.toFixed(1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
