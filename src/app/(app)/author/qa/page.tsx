'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface QAItem {
  id: string;
  question: string;
  answer: string | null;
  asked_by: string | null;
  created_at: string;
  answered_at: string | null;
}

export default function AuthorQAPage() {
  const [items, setItems] = useState<QAItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [answerDraft, setAnswerDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/author/qa/pending')
      .then((r) => r.json())
      .then((d) => { setItems(d.qa ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function submitAnswer(qaId: string) {
    const answer = answerDraft[qaId]?.trim();
    if (!answer) return;
    setSaving(qaId);
    setError(null);

    const res = await fetch('/api/author/qa/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ qa_id: qaId, answer }),
    });

    if (res.ok) {
      setItems((prev) =>
        prev.map((item) =>
          item.id === qaId
            ? { ...item, answer, answered_at: new Date().toISOString() }
            : item
        )
      );
    } else {
      const data = await res.json();
      setError(data.error ?? 'Something went wrong');
    }
    setSaving(null);
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-muted rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-bold">Reader Q&amp;A</h1>
        <Link href="/author/analytics" className="text-sm text-accent hover:underline">
          ← Analytics
        </Link>
      </div>

      {items.length === 0 && (
        <p className="text-muted-foreground text-sm text-center py-8">
          No questions from readers yet.
        </p>
      )}

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      <div className="space-y-4">
        {items.map((item) => (
          <div key={item.id} className="rounded-xl border border-border p-4 space-y-3">
            <p className="text-sm font-semibold">{item.question}</p>
            <p className="text-xs text-muted-foreground">
              Asked {new Date(item.created_at).toLocaleDateString()}
            </p>

            {item.answer ? (
              <div className="bg-accent/5 rounded-lg p-3">
                <p className="text-xs font-semibold text-accent mb-1">Your answer:</p>
                <p className="text-sm text-foreground">{item.answer}</p>
              </div>
            ) : (
              <div className="space-y-2">
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={answerDraft[item.id] ?? ''}
                  onChange={(e) =>
                    setAnswerDraft((prev) => ({ ...prev, [item.id]: e.target.value }))
                  }
                  placeholder="Write your answer…"
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent resize-none"
                />
                <button
                  onClick={() => submitAnswer(item.id)}
                  disabled={saving === item.id || !(answerDraft[item.id]?.trim())}
                  className="px-4 py-1.5 rounded-lg bg-accent text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {saving === item.id ? 'Saving…' : 'Publish Answer'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
