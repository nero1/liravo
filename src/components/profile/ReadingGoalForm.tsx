'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface ReadingGoalFormProps {
  userId: string;
  currentGoal: number | null;
}

export function ReadingGoalForm({ userId, currentGoal }: ReadingGoalFormProps) {
  const [goal, setGoal] = useState(currentGoal?.toString() ?? '');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const num = parseInt(goal, 10);
    if (isNaN(num) || num < 1 || num > 365) {
      setError('Goal must be between 1 and 365 books.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/users/${userId}/reading-goal`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: num }),
      });
      if (res.ok) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 2000);
      } else {
        const data = await res.json() as { error?: string };
        setError(data.error ?? 'Failed to save goal.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <label htmlFor="reading-goal" className="text-sm font-medium">
          Annual reading goal
        </label>
        <input
          id="reading-goal"
          type="number"
          min={1}
          max={365}
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          placeholder="e.g. 24"
          className={cn(
            'w-20 text-sm px-2 py-1.5 border border-border rounded-lg bg-background',
            'focus:outline-none focus:ring-1 focus:ring-amber-500'
          )}
        />
        <span className="text-sm text-muted-foreground">books</span>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors"
      >
        {loading ? 'Saving...' : 'Save'}
      </button>

      {success && <span className="text-sm text-amber-600 font-medium">Saved!</span>}
      {error && <span className="text-sm text-red-500">{error}</span>}
    </form>
  );
}
