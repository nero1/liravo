'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface Debate {
  id: string;
  book_id: string;
  user_id: string;
  question: string;
  yes_count: number;
  no_count: number;
  is_active: boolean;
  created_at: string;
}

export default function DebatesPage() {
  const [debates, setDebates] = useState<Debate[]>([]);
  const [loading, setLoading] = useState(true);
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/debates')
      .then((r) => r.json())
      .then((d: { debates?: Debate[] }) => setDebates(d.debates ?? []))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  async function handleVote(debateId: string, vote: 'yes' | 'no') {
    if (votedIds.has(debateId)) return;

    const res = await fetch(`/api/debates/${debateId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vote }),
    });

    if (res.ok) {
      setVotedIds((prev) => { const next = new Set(Array.from(prev)); next.add(debateId); return next; });
      setDebates((prev) =>
        prev.map((d) =>
          d.id === debateId
            ? { ...d, yes_count: vote === 'yes' ? d.yes_count + 1 : d.yes_count, no_count: vote === 'no' ? d.no_count + 1 : d.no_count }
            : d
        )
      );
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Book Debates</h1>
          <p className="text-sm text-neutral-500 mt-1">Vote yes or no on questions about books.</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 bg-neutral-100 dark:bg-neutral-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : debates.length === 0 ? (
        <div className="text-center py-16 text-neutral-500">
          <p>No debates yet. Start one from a book page!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {debates.map((debate) => {
            const total = debate.yes_count + debate.no_count;
            const yesPercent = total > 0 ? Math.round((debate.yes_count / total) * 100) : 50;
            const noPercent = 100 - yesPercent;
            const hasVoted = votedIds.has(debate.id);

            return (
              <div
                key={debate.id}
                className="p-4 border border-neutral-200 dark:border-neutral-700 rounded-xl space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{debate.question}</p>
                  <Link
                    href={`/book/${debate.book_id}`}
                    className="text-xs text-accent hover:underline flex-shrink-0"
                  >
                    View Book
                  </Link>
                </div>

                {/* Vote buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleVote(debate.id, 'yes')}
                    disabled={hasVoted}
                    className={cn(
                      'flex-1 py-2 rounded-lg text-sm font-medium border transition-colors',
                      hasVoted
                        ? 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-950 text-green-700 dark:text-green-300'
                        : 'border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-950'
                    )}
                  >
                    Yes ({debate.yes_count})
                  </button>
                  <button
                    onClick={() => handleVote(debate.id, 'no')}
                    disabled={hasVoted}
                    className={cn(
                      'flex-1 py-2 rounded-lg text-sm font-medium border transition-colors',
                      hasVoted
                        ? 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-950 text-red-700 dark:text-red-300'
                        : 'border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950'
                    )}
                  >
                    No ({debate.no_count})
                  </button>
                </div>

                {/* Progress bar */}
                {total > 0 && (
                  <div className="flex h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-green-500 transition-all"
                      style={{ width: `${yesPercent}%` }}
                    />
                    <div
                      className="bg-red-500 transition-all"
                      style={{ width: `${noPercent}%` }}
                    />
                  </div>
                )}

                {total > 0 && (
                  <p className="text-xs text-neutral-500 text-center">
                    {yesPercent}% Yes · {noPercent}% No · {total} vote{total !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
