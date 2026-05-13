'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Question {
  id: string;
  question: string;
  tags: string[];
  answer_count: number;
  created_at: string;
  author: { display_name: string; username: string } | null;
}

type FilterType = 'all' | 'unanswered' | 'most_answered';

export default function AskAWriterPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [askForm, setAskForm] = useState({ question: '', tags: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/write/questions?filter=${filter}`)
      .then((r) => r.json())
      .then((data) => setQuestions(data.questions ?? []))
      .finally(() => setLoading(false));
  }, [filter]);

  async function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    const tags = askForm.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const res = await fetch('/api/write/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: askForm.question, tags }),
    });
    const data = await res.json();
    if (!res.ok) {
      setSubmitError(data.error ?? 'Failed to submit question');
    } else {
      setSubmitSuccess(true);
      setAskForm({ question: '', tags: '' });
      if (data.question) {
        setQuestions((q) => [data.question, ...q]);
      }
    }
    setSubmitting(false);
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Ask a Writer</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Get answers from verified authors and experienced writers.
          </p>
        </div>
        <Link href="/write" className="text-sm text-muted-foreground hover:text-foreground">
          ← Write Hub
        </Link>
      </div>

      {/* Ask form */}
      <div className="rounded-xl border bg-card p-5 mb-6">
        <h2 className="font-semibold mb-3">Ask a Question (+5 XP)</h2>
        {submitSuccess ? (
          <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3">
            <p className="text-green-800 dark:text-green-200 text-sm font-medium">
              Question submitted! +5 XP earned.
            </p>
          </div>
        ) : (
          <form onSubmit={handleAsk} className="space-y-3">
            <div>
              <textarea
                required
                maxLength={280}
                rows={3}
                placeholder="Ask a question about writing craft, publishing, or creativity..."
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-500"
                value={askForm.question}
                onChange={(e) => setAskForm((f) => ({ ...f, question: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground mt-1">{askForm.question.length}/280</p>
            </div>
            <input
              type="text"
              placeholder="Tags (comma-separated, optional)"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              value={askForm.tags}
              onChange={(e) => setAskForm((f) => ({ ...f, tags: e.target.value }))}
            />
            {submitError && <p className="text-xs text-red-500">{submitError}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-medium px-5 py-2 transition-colors"
            >
              {submitting ? 'Submitting…' : 'Submit Question'}
            </button>
          </form>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {(['all', 'unanswered', 'most_answered'] as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === f
                ? 'bg-amber-600 text-white'
                : 'border hover:bg-muted'
            }`}
          >
            {f === 'all' ? 'All' : f === 'unanswered' ? 'Unanswered' : 'Most Answered'}
          </button>
        ))}
      </div>

      {/* Questions list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse h-20 bg-muted rounded-xl" />
          ))}
        </div>
      ) : questions.length === 0 ? (
        <div className="rounded-xl border bg-muted p-8 text-center">
          <p className="text-muted-foreground">No questions yet. Ask the first one!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((q) => (
            <Link
              key={q.id}
              href={`/write/ask/${q.id}`}
              className="block rounded-xl border bg-card p-5 hover:shadow-sm transition-shadow"
            >
              <p className="text-sm font-medium mb-2">{q.question}</p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {q.author && (
                  <span>by {q.author.display_name}</span>
                )}
                <span>{q.answer_count} answer{q.answer_count !== 1 ? 's' : ''}</span>
                <span>{new Date(q.created_at).toLocaleDateString()}</span>
              </div>
              {q.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {q.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs bg-muted px-2 py-0.5 rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
