'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function SettingsDataActions() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch('/api/users/delete-account', { method: 'DELETE' });
      const data = await res.json() as { deleted?: boolean; message?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Failed to delete account');
        setDeleting(false);
        return;
      }
      router.push('/');
    } catch {
      setError('An unexpected error occurred');
      setDeleting(false);
    }
  };

  return (
    <div className="pt-4 border-t border-border">
      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          className="flex items-center gap-2 text-sm text-destructive hover:underline"
        >
          <Trash2 size={14} />
          Delete my account
        </button>
      ) : (
        <div className="p-4 border border-destructive/30 rounded-xl bg-destructive/5 space-y-3">
          <p className="text-sm font-medium text-destructive">Are you sure?</p>
          <p className="text-xs text-muted-foreground">
            Your account will be soft-deleted immediately and permanently removed after 30 days. This cannot be undone.
          </p>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-3">
            <button
              onClick={() => setConfirming(false)}
              className="flex-1 py-2 border border-border rounded-lg text-sm hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex-1 py-2 bg-destructive text-white rounded-lg text-sm font-medium hover:bg-destructive/90 transition-colors disabled:opacity-60"
            >
              {deleting ? 'Deleting…' : 'Yes, delete my account'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
