'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

interface Props {
  bookId: string;
  initial: boolean;
}

export function AudiobookToggle({ bookId, initial }: Props) {
  const t = useTranslations('admin');
  const busy = useRef(false);
  const [enabled, setEnabled] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  async function toggle() {
    if (busy.current) return;
    busy.current = true; setPending(true); setError(false);
    const next = !enabled;
    setEnabled(next);
    try {
      const response = await fetch(`/api/admin/books/${bookId}/audiobook`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ has_audiobook: next }),
      });
      if (!response.ok) throw new Error('Audiobook update unavailable');
    } catch { setEnabled(!next); setError(true); }
    finally { busy.current = false; setPending(false); }
  }

  return (
    <div>
      <button type="button" role="switch" aria-checked={enabled} aria-label={t('audiobook')} disabled={pending} onClick={toggle} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${enabled ? 'bg-accent' : 'bg-muted'}`}>
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-4' : 'translate-x-1'}`} />
      </button>
      {error && <p role="alert" className="text-xs text-destructive">{t('updateFailed')}</p>}
    </div>
  );
}
