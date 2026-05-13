'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface Challenge {
  id: string;
  name: string;
  description: string | null;
  challenge_type: string;
  goal_type: string;
  goal_value: number;
  start_date: string;
  end_date: string;
  participant_count: number;
}

interface LeaderboardEntry {
  user_id: string;
  total_words: number;
  submission_count: number;
  users: { display_name: string; username: string } | null;
}

export default function ChallengeDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ title: '', body: '' });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    fetch(`/api/write/challenges/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setChallenge(data.challenge);
        setLeaderboard(data.leaderboard ?? []);
      })
      .finally(() => setLoading(false));
  }, [id]);

  async function handleJoin() {
    setJoining(true);
    await fetch(`/api/write/challenges/${id}/join`, { method: 'POST' });
    setJoining(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    const wordCount = form.body.trim().split(/\s+/).filter(Boolean).length;
    const res = await fetch(`/api/write/challenges/${id}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: form.title, body: form.body, word_count: wordCount }),
    });
    const data = await res.json();
    if (!res.ok) {
      setSubmitError(data.error ?? 'Submission failed');
    } else {
      setSubmitSuccess(true);
    }
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/2" />
          <div className="h-24 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (!challenge) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 text-center">
        <p className="text-muted-foreground">Challenge not found.</p>
        <Link href="/write/challenges" className="text-amber-600 hover:underline text-sm mt-2 inline-block">
          ← Back to Challenges
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <Link href="/write/challenges" className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-block">
        ← Challenges
      </Link>

      <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-6 mb-6">
        <span className="text-xs font-medium bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 px-2 py-0.5 rounded-full">
          {challenge.challenge_type === 'weekly' ? 'Weekly' : 'Monthly'}
        </span>
        <h1 className="font-display text-2xl font-bold text-amber-900 dark:text-amber-100 mt-2">
          {challenge.name}
        </h1>
        {challenge.description && (
          <p className="text-amber-800 dark:text-amber-200 text-sm mt-2">{challenge.description}</p>
        )}
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          <span>
            Goal: {challenge.goal_value.toLocaleString()}{' '}
            {challenge.goal_type === 'word_count' ? 'words' : 'submissions'}
          </span>
          <span>Ends: {new Date(challenge.end_date).toLocaleDateString()}</span>
          <span>{challenge.participant_count} participants</span>
        </div>
        <div className="flex gap-2 mt-4">
          <button
            onClick={handleJoin}
            disabled={joining}
            className="rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 transition-colors"
          >
            {joining ? 'Joining…' : 'Join Challenge'}
          </button>
          <Link
            href={`/share/writing-challenge/${challenge.id}`}
            target="_blank"
            className="rounded-lg border px-4 py-2 text-sm hover:bg-muted transition-colors"
          >
            Share Card
          </Link>
        </div>
      </div>

      {/* Leaderboard */}
      <div className="mb-8">
        <h2 className="font-semibold text-lg mb-3">Leaderboard</h2>
        {leaderboard.length === 0 ? (
          <p className="text-sm text-muted-foreground">No submissions yet. Be the first!</p>
        ) : (
          <div className="space-y-2">
            {leaderboard.map((entry, i) => (
              <div
                key={entry.user_id}
                className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3"
              >
                <span className="text-sm font-bold text-muted-foreground w-5">#{i + 1}</span>
                <Link
                  href={`/profile/${entry.users?.username ?? ''}`}
                  className="flex-1 font-medium text-sm hover:underline"
                >
                  {entry.users?.display_name ?? 'Unknown'}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {entry.submission_count} submission{entry.submission_count !== 1 ? 's' : ''}
                </span>
                <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                  {entry.total_words.toLocaleString()} words
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Submit entry */}
      <div>
        <h2 className="font-semibold text-lg mb-3">Submit Entry (+25 XP)</h2>
        {submitSuccess ? (
          <div className="rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-4">
            <p className="text-green-800 dark:text-green-200 font-medium">
              Entry submitted! +25 XP earned.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="title">
                Title
              </label>
              <input
                id="title"
                type="text"
                required
                maxLength={200}
                placeholder="Entry title..."
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="body">
                Your Writing
              </label>
              <textarea
                id="body"
                rows={10}
                required
                placeholder="Write your entry here..."
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500"
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {form.body.trim().split(/\s+/).filter(Boolean).length} words
              </p>
            </div>
            {submitError && <p className="text-xs text-red-500">{submitError}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 transition-colors"
            >
              {submitting ? 'Submitting…' : 'Submit Entry'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
