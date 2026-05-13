'use client';

import { useState } from 'react';
import { Flag, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ContentType = 'review' | 'quote' | 'profile' | 'debate';

const REASONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'inappropriate', label: 'Inappropriate' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'other', label: 'Other' },
] as const;

interface ReportButtonProps {
  contentType: ContentType;
  contentId: string;
}

export function ReportButton({ contentType, contentId }: ReportButtonProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>('spam');
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpen() {
    setOpen(true);
    setSubmitted(false);
    setError(null);
  }

  function handleClose() {
    setOpen(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const fullReason = details.trim()
      ? `${reason}: ${details.trim()}`
      : reason;

    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content_type: contentType,
          content_id: contentId,
          reason: fullReason,
        }),
      });

      if (!res.ok) {
        const json = await res.json() as { error?: string };
        setError(json.error ?? 'Failed to submit report');
        return;
      }

      setSubmitted(true);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={handleOpen}
        aria-label="Report content"
        className="text-muted-foreground hover:text-destructive transition-colors"
      >
        <Flag size={16} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-sm mx-4 shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-base">Report Content</h2>
              <button
                onClick={handleClose}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {submitted ? (
              <div className="text-center py-4">
                <p className="font-medium text-green-600">Reported — thank you</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Our team will review this report.
                </p>
                <button
                  onClick={handleClose}
                  className="mt-4 text-sm text-muted-foreground hover:underline"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Reason</label>
                  <select
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full border border-border rounded-md px-2 py-1.5 text-sm bg-background"
                    disabled={loading}
                  >
                    {REASONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Additional details (optional)
                  </label>
                  <textarea
                    value={details}
                    onChange={(e) => setDetails(e.target.value)}
                    rows={3}
                    maxLength={400}
                    placeholder="Describe the issue..."
                    className={cn(
                      'w-full border border-border rounded-md px-2 py-1.5 text-sm bg-background resize-none'
                    )}
                    disabled={loading}
                  />
                </div>

                {error && <p className="text-xs text-destructive">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="bg-destructive text-destructive-foreground rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Submitting...' : 'Submit Report'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
