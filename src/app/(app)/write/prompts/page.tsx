'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';

interface WritingPrompt {
  id: string;
  prompt_text: string;
  theme: string | null;
  date: string;
}

interface SubmitState {
  content: string;
  loading: boolean;
  error: string | null;
  success: boolean;
}

interface LeaderEntry {
  rank: number;
  user_id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  xp: number;
  submissions_count: number;
}

type LBPeriod = 'weekly' | 'monthly' | 'all_time';

export default function PromptsPage() {
  const [todayPrompt, setTodayPrompt] = useState<WritingPrompt | null>(null);
  const [pastPrompts, setPastPrompts] = useState<WritingPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [charCount, setCharCount] = useState(0);
  const [submit, setSubmit] = useState<SubmitState>({
    content: '',
    loading: false,
    error: null,
    success: false,
  });

  const [leaderboard, setLeaderboard] = useState<LeaderEntry[]>([]);
  const [lbPeriod, setLbPeriod] = useState<LBPeriod>('monthly');
  const [lbLoading, setLbLoading] = useState(false);

  useEffect(() => {
    fetch('/api/write/prompts')
      .then((r) => r.json())
      .then((data) => {
        setTodayPrompt(data.today ?? null);
        setPastPrompts(data.past ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setLbLoading(true);
    fetch(`/api/write/prompts/leaderboard?period=${lbPeriod}`)
      .then((r) => r.json())
      .then((d) => setLeaderboard(d.leaderboard ?? []))
      .finally(() => setLbLoading(false));
  }, [lbPeriod]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!todayPrompt) return;
    setSubmit((s) => ({ ...s, loading: true, error: null }));
    const res = await fetch(`/api/write/prompts/${todayPrompt.id}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: submit.content }),
    });
    const data = await res.json();
    if (!res.ok) {
      setSubmit((s) => ({ ...s, loading: false, error: data.error?.formErrors?.[0] ?? data.error ?? 'Submission failed' }));
    } else {
      setSubmit((s) => ({ ...s, loading: false, success: true }));
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/2" />
          <div className="h-32 bg-muted rounded" />
        </div>
      </div>
    );
  }

  const PERIODS: { key: LBPeriod; label: string }[] = [
    { key: 'weekly', label: 'This Week' },
    { key: 'monthly', label: 'This Month' },
    { key: 'all_time', label: 'All Time' },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Daily Prompt</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            A new prompt every day — submit your response to earn 10 XP.
          </p>
        </div>
        <Link href="/write" className="text-sm text-muted-foreground hover:text-foreground">
          ← Write Hub
        </Link>
      </div>

      {/* Today's prompt */}
      {todayPrompt ? (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-6 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-medium bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 px-2 py-0.5 rounded-full">
              Today
            </span>
            {todayPrompt.theme && (
              <span className="text-xs text-muted-foreground">{todayPrompt.theme}</span>
            )}
          </div>
          <p className="text-lg font-medium text-amber-900 dark:text-amber-100 mb-4">
            {todayPrompt.prompt_text}
          </p>
          <Link
            href={`/write/prompts/${todayPrompt.id}`}
            className="text-xs text-amber-700 dark:text-amber-400 hover:underline"
          >
            View all responses →
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border bg-muted p-6 mb-6 text-center text-muted-foreground">
          No prompt for today yet — check back soon!
        </div>
      )}

      {/* Submit form */}
      {todayPrompt && !submit.success && (
        <form onSubmit={handleSubmit} className="mb-8">
          <label className="block text-sm font-medium mb-2" htmlFor="response">
            Your Response
          </label>
          <textarea
            id="response"
            rows={8}
            minLength={50}
            maxLength={2000}
            required
            placeholder="Write at least 50 characters..."
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500"
            value={submit.content}
            onChange={(e) => {
              setSubmit((s) => ({ ...s, content: e.target.value }));
              setCharCount(e.target.value.length);
            }}
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-muted-foreground">{charCount}/2000 chars</span>
            {submit.error && <span className="text-xs text-red-500">{submit.error}</span>}
          </div>
          <button
            type="submit"
            disabled={submit.loading || charCount < 50}
            className="mt-3 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 transition-colors"
          >
            {submit.loading ? 'Submitting…' : 'Submit Response (+10 XP)'}
          </button>
        </form>
      )}

      {submit.success && (
        <div className="rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-4 mb-8">
          <p className="text-green-800 dark:text-green-200 font-medium">
            Response submitted! +10 XP earned.
          </p>
        </div>
      )}

      {/* Leaderboard */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Top Writers</h2>
          <div className="flex gap-1">
            {PERIODS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setLbPeriod(key)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${lbPeriod === key ? 'bg-accent text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {lbLoading ? (
          <div className="animate-pulse space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-muted rounded-lg" />)}
          </div>
        ) : leaderboard.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-6">No submissions yet this period.</p>
        ) : (
          <div className="space-y-2">
            {leaderboard.map((entry) => (
              <div key={entry.user_id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
                <span className={`w-6 text-center text-sm font-bold ${entry.rank === 1 ? 'text-yellow-500' : entry.rank === 2 ? 'text-gray-400' : entry.rank === 3 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                  {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `#${entry.rank}`}
                </span>
                {entry.avatar_url ? (
                  <Image src={entry.avatar_url} alt={entry.display_name} width={32} height={32} className="rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-sm">
                    {entry.display_name[0]}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <Link href={`/user/${entry.username}`} className="text-sm font-medium hover:underline truncate block">
                    {entry.display_name}
                  </Link>
                  <p className="text-xs text-muted-foreground">{entry.xp.toLocaleString()} XP</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-accent">{entry.submissions_count}</p>
                  <p className="text-xs text-muted-foreground">prompt{entry.submissions_count !== 1 ? 's' : ''}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Past prompts */}
      {pastPrompts.length > 0 && (
        <div>
          <h2 className="font-semibold mb-3">Recent Prompts</h2>
          <div className="space-y-2">
            {pastPrompts.map((p) => (
              <Link
                key={p.id}
                href={`/write/prompts/${p.id}`}
                className="flex items-start gap-3 rounded-lg border bg-card p-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground mb-1">{p.date}</p>
                  <p className="text-sm line-clamp-2">{p.prompt_text}</p>
                </div>
                <span className="text-muted-foreground text-sm">→</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
