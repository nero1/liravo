'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface GoalData {
  goal: { id: string; year: number; target_books: number } | null;
  progress: {
    books_read: number;
    year: number;
    percentage: number | null;
  };
}

const PRESET_GOALS = [6, 12, 24, 36, 52, 100];

const MILESTONES = [
  { pct: 25, label: '25%', emoji: '🌱' },
  { pct: 50, label: '50%', emoji: '🌿' },
  { pct: 75, label: '75%', emoji: '🌳' },
  { pct: 100, label: '100%', emoji: '🏆' },
];

export default function ReadingGoalsPage() {
  const [data, setData] = useState<GoalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [targetInput, setTargetInput] = useState('');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    fetch('/api/reading-goals')
      .then((r) => r.json())
      .then((d: GoalData) => {
        setData(d);
        setTargetInput(String(d.goal?.target_books ?? ''));
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    const target = parseInt(targetInput, 10);
    if (!target || target < 1) return;
    setSaving(true);
    const res = await fetch('/api/reading-goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_books: target }),
    });
    const result = await res.json() as { goal?: GoalData['goal']; error?: string };
    if (res.ok && result.goal) {
      setData((prev) => prev ? {
        ...prev,
        goal: result.goal!,
        progress: {
          ...prev.progress,
          percentage: Math.min(100, Math.round(((prev.progress.books_read) / result.goal!.target_books) * 100)),
        },
      } : null);
      setEditing(false);
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="max-w-xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/2" />
          <div className="h-32 bg-muted rounded" />
        </div>
      </div>
    );
  }

  const { goal, progress } = data ?? { goal: null, progress: { books_read: 0, year: new Date().getFullYear(), percentage: null } };
  const pct = progress.percentage ?? 0;
  const booksRead = progress.books_read;
  const target = goal?.target_books ?? 0;

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Reading Goal {progress.year}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Track your annual reading target.
        </p>
      </div>

      {goal && !editing ? (
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          {/* Progress ring / bar */}
          <div className="text-center space-y-2">
            <div className="text-5xl font-bold text-accent">{pct}%</div>
            <p className="text-muted-foreground text-sm">
              {booksRead} of {target} books read this year
            </p>
          </div>

          {/* Progress bar */}
          <div className="h-4 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* Milestones */}
          <div className="grid grid-cols-4 gap-2">
            {MILESTONES.map((m) => {
              const reached = pct >= m.pct;
              return (
                <div
                  key={m.pct}
                  className={`rounded-lg p-2 text-center ${reached ? 'bg-accent/10 border border-accent/30' : 'bg-muted border border-border'}`}
                >
                  <div className={`text-xl ${reached ? '' : 'grayscale opacity-40'}`}>{m.emoji}</div>
                  <div className={`text-xs font-medium mt-0.5 ${reached ? 'text-accent' : 'text-muted-foreground'}`}>{m.label}</div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setEditing(true)}
              className="flex-1 rounded-lg border border-border text-sm py-2 hover:bg-muted transition-colors"
            >
              Change Goal
            </button>
            <Link
              href="/shelf/have_read"
              className="flex-1 rounded-lg bg-accent text-white text-sm font-medium py-2 text-center hover:opacity-90 transition-opacity"
            >
              View Books Read
            </Link>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-6 space-y-5">
          <h2 className="font-semibold">
            {goal ? 'Update Your Goal' : 'Set a Reading Goal'}
          </h2>

          {/* Preset buttons */}
          <div>
            <p className="text-xs text-muted-foreground mb-2">Popular targets</p>
            <div className="flex gap-2 flex-wrap">
              {PRESET_GOALS.map((n) => (
                <button
                  key={n}
                  onClick={() => setTargetInput(String(n))}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                    targetInput === String(n)
                      ? 'border-accent bg-accent/10 text-accent font-medium'
                      : 'border-border text-muted-foreground hover:border-accent'
                  }`}
                >
                  {n} books
                  {n === 12 && <span className="ml-1 text-xs opacity-70">(1/mo)</span>}
                  {n === 52 && <span className="ml-1 text-xs opacity-70">(1/wk)</span>}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Or enter a custom number</label>
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                max={10000}
                value={targetInput}
                onChange={(e) => setTargetInput(e.target.value)}
                placeholder="e.g. 30"
                className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <span className="flex items-center text-sm text-muted-foreground">books</span>
            </div>
          </div>

          <div className="flex gap-2">
            {goal && (
              <button
                onClick={() => setEditing(false)}
                className="flex-1 rounded-lg border border-border text-sm py-2 hover:bg-muted transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={saving || !targetInput || parseInt(targetInput) < 1}
              className="flex-1 rounded-lg bg-accent text-white text-sm font-medium py-2 disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {saving ? 'Saving…' : goal ? 'Update Goal' : 'Set Goal'}
            </button>
          </div>
        </div>
      )}

      {/* Encouragement */}
      {goal && (
        <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-4">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            {pct >= 100
              ? '🎉 You\'ve hit your goal! You\'re a reading champion!'
              : pct >= 75
              ? '📚 Almost there! Keep up the great reading!'
              : pct >= 50
              ? '🌿 You\'re halfway! Keep the momentum going!'
              : pct >= 25
              ? '🌱 Great start! You\'re building momentum.'
              : target > 0
              ? `📖 You need ${target - booksRead} more books to hit your goal. You can do it!`
              : 'Set a goal to track your reading progress.'}
          </p>
        </div>
      )}
    </div>
  );
}
