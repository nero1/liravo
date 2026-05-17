'use client';

import { useState, useTransition } from 'react';

interface Props {
  bookId: string;
  initial: boolean;
}

export function AudiobookToggle({ bookId, initial }: Props) {
  const [enabled, setEnabled] = useState(initial);
  const [, startTransition] = useTransition();

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    startTransition(async () => {
      const res = await fetch(`/api/admin/books/${bookId}/audiobook`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ has_audiobook: next }),
      });
      if (!res.ok) setEnabled(!next);
    });
  };

  return (
    <button
      onClick={toggle}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        enabled ? 'bg-amber-500' : 'bg-muted'
      }`}
      title={enabled ? 'Has audiobook (click to disable)' : 'No audiobook (click to enable)'}
    >
      <span
        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
          enabled ? 'translate-x-4.5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}
