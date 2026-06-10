'use client';

import { useState } from 'react';
import { BookOpen } from 'lucide-react';

interface Props {
  bookId: string;
  onLogged?: (pagesRead: number) => void;
}

export function LogReadingSessionButton({ bookId, onLogged }: Props) {
  const [open, setOpen] = useState(false);
  const [pages, setPages] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    const res = await fetch('/api/reading-sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        book_id: bookId,
        pages_read: pages ? parseInt(pages, 10) : undefined,
        started_at: new Date().toISOString(),
      }),
    });

    setSaving(false);
    if (res.ok) {
      setDone(true);
      onLogged?.(parseInt(pages, 10) || 0);
      setTimeout(() => { setDone(false); setOpen(false); setPages(''); }, 1500);
    }
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
