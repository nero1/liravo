'use client';

import { useState } from 'react';

export default function AppealPage() {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 10) {
      setError('Please provide at least 10 characters.');
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/moderation/appeals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });

      if (!res.ok) {
        const json = await res.json() as { error?: string };
        setError(json.error ?? 'Failed to submit appeal');
        return;
      }

      setSuccess(true);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="max-w-lg mx-auto p-6">
        <div className="bg-card border border-border rounded-xl p-6 text-center">
          <p className="text-lg font-semibold mb-2">Appeal Submitted</p>
          <p className="text-sm text-muted-foreground">
            Your appeal has been received. A moderator will review it shortly.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-6">
      <h1 className="text-2xl font-bold mb-2">Submit an Appeal</h1>
      <p className="text-sm text-muted-foreground mb-6">
        If you believe a moderation action was applied in error, please describe your situation below.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="appeal-reason" className="block text-sm font-medium mb-1">
            Your appeal reason
          </label>
          <textarea
            id="appeal-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={6}
            maxLength={500}
            placeholder="Explain why you believe the moderation decision should be reconsidered..."
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background resize-none"
            disabled={loading}
          />
          <p className="text-xs text-muted-foreground mt-1 text-right">
            {reason.length}/500
          </p>
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || reason.trim().length < 10}
          className="bg-accent text-accent-foreground rounded-lg px-4 py-2 text-sm font-medium hover:bg-accent/90 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Submitting...' : 'Submit Appeal'}
        </button>
      </form>
    </div>
  );
}
