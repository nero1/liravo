'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function AskAuthorPage({
  params,
}: {
  params: { username: string };
}) {
  const [question, setQuestion] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    // First, resolve the author_id from username
    const profileRes = await fetch(`/api/author/${params.username}`);
    if (!profileRes.ok) {
      setError('Author not found');
      setPending(false);
      return;
    }
    const { author } = await profileRes.json();

    const res = await fetch('/api/author/qa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ author_id: author.id, question }),
    });

    if (res.ok) {
      setDone(true);
    } else {
      const data = await res.json();
      setError(data.error ?? 'Something went wrong');
    }
    setPending(false);
  }

  if (done) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
        <p className="text-4xl">✅</p>
        <h1 className="font-display text-xl font-bold">Question submitted!</h1>
        <p className="text-sm text-muted-foreground">
          The author will be notified. If they answer publicly, it will appear on their profile.
        </p>
        <Link
          href={`/author/${params.username}`}
          className="inline-block mt-4 px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          Back to author profile
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <div className="mb-6">
        <Link
          href={`/author/${params.username}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Back to {params.username}
        </Link>
      </div>

      <h1 className="font-display text-2xl font-bold mb-2">Ask a Question</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Submit a question to <strong>@{params.username}</strong>. If answered, it will appear publicly on their profile.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Your question</label>
          <textarea
            required
            rows={4}
            minLength={10}
            maxLength={500}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent resize-none"
            placeholder="What inspired you to write…?"
          />
          <p className="text-xs text-muted-foreground mt-1">{question.length}/500</p>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={pending || question.trim().length < 10}
          className="w-full px-4 py-2 rounded-lg bg-accent text-white font-semibold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {pending ? 'Submitting…' : 'Submit Question'}
        </button>
      </form>
    </div>
  );
}
