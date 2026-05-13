'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Appeal {
  id: string;
  user_id: string;
  report_id: string | null;
  reason: string;
  content_type: string | null;
  content_id: string | null;
  status: string;
  created_at: string;
}

export default function ModeratorAppealsPage() {
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  async function fetchAppeals() {
    setLoading(true);
    try {
      const res = await fetch('/api/moderation/appeals');
      if (!res.ok) {
        const json = await res.json() as { error?: string };
        setError(json.error ?? 'Failed to load appeals');
        return;
      }
      const json = await res.json() as { appeals: Appeal[] };
      setAppeals(json.appeals);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  async function handleAction(appealId: string, status: 'approved' | 'rejected') {
    setActionLoading(appealId);
    try {
      const res = await fetch(`/api/moderation/appeals/${appealId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setAppeals((prev) => prev.filter((a) => a.id !== appealId));
      }
    } catch {
      // Ignore
    } finally {
      setActionLoading(null);
    }
  }

  useEffect(() => {
    fetchAppeals();
  }, []);

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/moderation" className="text-sm text-muted-foreground hover:underline">
          Moderation
        </Link>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-xl font-bold">Pending Appeals</h1>
      </div>

      {loading && <p className="text-muted-foreground text-sm">Loading...</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {!loading && !error && appeals.length === 0 && (
        <p className="text-muted-foreground text-sm">No pending appeals.</p>
      )}

      <div className="flex flex-col gap-4">
        {appeals.map((appeal) => (
          <div
            key={appeal.id}
            className="bg-card border border-border rounded-xl p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <span>User: {appeal.user_id.slice(0, 8)}...</span>
                  <span>{new Date(appeal.created_at).toLocaleDateString()}</span>
                  {appeal.content_type && (
                    <span className="font-mono bg-muted px-1.5 py-0.5 rounded">
                      {appeal.content_type}
                    </span>
                  )}
                </div>
                <p className="text-sm">{appeal.reason}</p>
              </div>

              <div className="flex gap-2 shrink-0">
                <button
                  onClick={() => handleAction(appeal.id, 'approved')}
                  disabled={actionLoading === appeal.id}
                  className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  Approve
                </button>
                <button
                  onClick={() => handleAction(appeal.id, 'rejected')}
                  disabled={actionLoading === appeal.id}
                  className="px-3 py-1.5 text-xs font-medium bg-destructive text-destructive-foreground rounded-md hover:opacity-90 disabled:opacity-50 transition-colors"
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
