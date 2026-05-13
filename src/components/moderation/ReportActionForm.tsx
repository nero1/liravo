'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface ReportActionFormProps {
  reportId: string;
  reportedUserId?: string;
}

type ActionType = 'approve' | 'remove' | 'warn' | 'escalate';

const ACTION_LABELS: Record<ActionType, string> = {
  approve: 'Approve (no action)',
  remove: 'Remove content',
  warn: 'Warn user',
  escalate: 'Escalate to admin',
};

export function ReportActionForm({ reportId }: ReportActionFormProps) {
  const router = useRouter();
  const [action, setAction] = useState<ActionType>('approve');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/moderation/reports/${reportId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason: reason.trim() || undefined }),
      });

      if (!res.ok) {
        const json = await res.json() as { error?: string };
        setError(json.error ?? 'Failed to submit action');
        return;
      }

      setDone(true);
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <p className="text-sm text-green-600 font-medium">Action submitted.</p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2 mt-2">
      <select
        value={action}
        onChange={(e) => setAction(e.target.value as ActionType)}
        className="text-sm border border-border rounded-md px-2 py-1.5 bg-background"
        disabled={loading}
      >
        {(Object.keys(ACTION_LABELS) as ActionType[]).map((a) => (
          <option key={a} value={a}>{ACTION_LABELS[a]}</option>
        ))}
      </select>

      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason / notes (optional)"
        rows={2}
        maxLength={1000}
        className="text-sm border border-border rounded-md px-2 py-1.5 bg-background resize-none"
        disabled={loading}
      />

      {error && <p className="text-xs text-destructive">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="text-sm bg-accent text-accent-foreground rounded-md px-3 py-1.5 font-medium hover:bg-accent/90 disabled:opacity-50 transition-colors"
      >
        {loading ? 'Submitting...' : 'Submit Action'}
      </button>
    </form>
  );
}
