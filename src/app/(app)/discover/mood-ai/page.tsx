'use client';

import { useState } from 'react';
import Link from 'next/link';

interface AiBook {
  title: string;
  author: string;
  reason: string;
}

export default function MoodAiPage() {
  const [query, setQuery] = useState('');
  const [books, setBooks] = useState<AiBook[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    if (!query.trim() || query.trim().length < 3) return;
    setLoading(true);
    setError(null);
    setSearched(false);
    try {
      const url = new URL('/api/ai/recommendations', window.location.origin);
      url.searchParams.set('mood', query.trim());
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error('Failed to fetch recommendations');
      const data = await res.json() as { recommendations?: AiBook[] };
      setBooks(data.recommendations ?? []);
      setSearched(true);
    } catch {
      setError('Could not get AI recommendations. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="mb-6">
        <Link href="/discover" className="text-sm text-neutral-500 hover:underline mb-2 inline-block">
          ← Back to Discover
        </Link>
        <h1 className="font-display text-2xl font-bold mb-1">AI Mood Search</h1>
        <p className="text-neutral-500 dark:text-neutral-400 text-sm">
          Describe how you&apos;re feeling or what kind of story you want — our AI will find the perfect books.
        </p>
      </div>

      <div className="flex gap-2 mb-6">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
          placeholder='e.g. "cosy mystery with a strong female lead" or "feeling melancholic, want something hopeful"'
          className="flex-1 px-4 py-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          maxLength={200}
        />
        <button
          onClick={search}
          disabled={loading || query.trim().length < 3}
          className="px-5 py-3 rounded-xl bg-accent text-white font-medium text-sm disabled:opacity-50 hover:bg-accent/90 transition-colors"
        >
          {loading ? '...' : 'Find Books'}
        </button>
      </div>

      {error && (
        <p className="text-sm text-destructive mb-4">{error}</p>
      )}

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-4 p-4 rounded-xl border border-border animate-pulse">
              <div className="w-12 h-16 rounded bg-muted flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/2" />
                <div className="h-3 bg-muted rounded w-full" />
              </div>
            </div>
          ))}
        </div>
      )}

      {searched && books.length === 0 && !loading && (
        <div className="text-center py-12 text-neutral-500">
          <p>No recommendations found for that mood. Try being more descriptive.</p>
        </div>
      )}

      {books.length > 0 && !loading && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground mb-2">AI-powered recommendations based on your mood:</p>
          {books.map((book, i) => (
            <Link
              key={i}
              href={`/discover?q=${encodeURIComponent(book.title)}`}
              className="flex gap-4 p-4 rounded-xl border border-border hover:bg-muted transition-colors"
            >
              <div className="w-12 h-16 flex-shrink-0 rounded overflow-hidden bg-muted flex items-center justify-center text-xl">
                📚
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm leading-tight line-clamp-2">{book.title}</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{book.author}</p>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2 italic">{book.reason}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
