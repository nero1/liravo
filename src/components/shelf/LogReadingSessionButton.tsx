'use client';

import { useRequestIntent } from '@/lib/client/useRequestIntent';

import { useState } from 'react';
import { BookOpen } from 'lucide-react';

interface Props {
  bookId: string;
  onLogged?: (pagesRead: number) => void;
}

export function LogReadingSessionButton({ bookId, onLogged }: Props) {
  const intent = useRequestIntent();
  const [open, setOpen] = useState(false);
  const [pages, setPages] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(false);

    try {
      const res = await fetch('/api/reading-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...intent.headers({ bookId, pages }) },
        body: JSON.stringify({
          book_id: bookId,
          pages_read: pages ? parseInt(pages, 10) : undefined,
        }),
      });

      if (!res.ok) { setError(true); return; }
      if (res.ok) {
        intent.complete();
        setDone(true);
        onLogged?.(parseInt(pages, 10) || 0);
        setTimeout(() => { setDone(false); setOpen(false); setPages(''); }, 1500);
      }
    } catch { setError(true); } finally { setSaving(false); }
  }

  if (done) {
    return (
      <span className="text-xs text-green-600 font-medium">✓ Session logged!</span>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-accent transition-colors"
      >
        <BookOpen size={12} />
        Log session
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-1.5 mt-1">
      {error && <span role="alert" className="text-xs text-red-500">Unable to log session. Please retry.</span>}
      <input
        type="number"
        min={1}
        max={9999}
        value={pages}
        onChange={(e) => setPages(e.target.value)}
        placeholder="pages read"
        className="w-24 text-xs rounded border border-border bg-card px-2 py-1 focus:outline-none focus:ring-1 focus:ring-accent"
      />
      <button
        type="submit"
        disabled={saving}
        className="text-xs px-2 py-1 rounded bg-accent text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {saving ? '…' : 'Log'}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-xs text-muted-foreground hover:text-foreground"
      >
        ✕
      </button>
    </form>
  );
}
