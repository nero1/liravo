'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface ReadingProgressBarProps {
  shelfBookId: string;
  bookId: string;
  pageCount: number | null;
  progressPages: number | null;
  progressPercent: number | null;
}

export function ReadingProgressBar({
  shelfBookId,
  pageCount,
  progressPages,
  progressPercent,
}: ReadingProgressBarProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputPages, setInputPages] = useState(progressPages?.toString() ?? '');
  const [inputPercent, setInputPercent] = useState(progressPercent?.toString() ?? '');
  const [currentPages, setCurrentPages] = useState(progressPages);
  const [currentPercent, setCurrentPercent] = useState(progressPercent);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const displayPercent =
    currentPercent ??
    (currentPages && pageCount ? Math.round((currentPages / pageCount) * 100) : null);

  async function handleUpdate() {
    setLoading(true);
    const body: { progress_pages?: number; progress_percent?: number } = {};

    if (inputPages !== '') {
      const p = parseInt(inputPages, 10);
      if (!isNaN(p)) body.progress_pages = p;
    }
    if (inputPercent !== '' && inputPages === '') {
      const p = parseInt(inputPercent, 10);
      if (!isNaN(p)) body.progress_percent = Math.min(100, Math.max(0, p));
    }

    try {
      const res = await fetch(`/api/shelf-books/${shelfBookId}/progress`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentPages(data.progress_pages ?? null);
        setCurrentPercent(data.progress_percent ?? null);
        setSuccess(true);
        setIsEditing(false);
        setTimeout(() => setSuccess(false), 2000);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-2">
      {/* Progress bar */}
      <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-1.5">
        <div
          className="h-full bg-amber-500 rounded-full transition-all duration-300"
          style={{ width: `${displayPercent ?? 0}%` }}
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {displayPercent !== null ? `${displayPercent}%` : 'Not started'}
          {currentPages && pageCount ? ` · p.${currentPages}/${pageCount}` : ''}
        </span>

        {success && (
          <span className="text-xs text-amber-600 font-medium">Saved!</span>
        )}

        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="text-xs text-amber-600 hover:text-amber-700 font-medium ml-auto"
          >
            Update
          </button>
        )}
      </div>

      {isEditing && (
        <div className="mt-2 flex items-center gap-2">
          {pageCount ? (
            <input
              type="number"
              min={0}
              max={pageCount}
              placeholder={`Page (1-${pageCount})`}
              value={inputPages}
              onChange={(e) => setInputPages(e.target.value)}
              className={cn(
                'w-28 text-xs px-2 py-1 border border-border rounded-md bg-background',
                'focus:outline-none focus:ring-1 focus:ring-amber-500'
              )}
            />
          ) : (
            <input
              type="number"
              min={0}
              max={100}
              placeholder="% (0-100)"
              value={inputPercent}
              onChange={(e) => setInputPercent(e.target.value)}
              className={cn(
                'w-24 text-xs px-2 py-1 border border-border rounded-md bg-background',
                'focus:outline-none focus:ring-1 focus:ring-amber-500'
              )}
            />
          )}
          <button
            onClick={handleUpdate}
            disabled={loading}
            className="text-xs px-2.5 py-1 bg-amber-500 text-white rounded-md hover:bg-amber-600 disabled:opacity-50 transition-colors"
          >
            {loading ? '...' : 'Save'}
          </button>
          <button
            onClick={() => setIsEditing(false)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
