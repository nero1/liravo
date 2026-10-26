'use client';

import { useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

export function CancelSubscriptionButton() {
  const t = useTranslations('premium');
  const router = useRouter();
  const busy = useRef(false);
  const [pending,setPending] = useState(false);
  const [message,setMessage] = useState<'cancelPending' | 'cancelError' | null>(null);
  async function cancel() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      const response = await fetch('/api/subscriptions/cancel', { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error('Cancellation unavailable');
      if (result.cancelled === true) router.refresh();
      else setMessage('cancelPending');
    } catch { setMessage('cancelError'); }
    finally { busy.current = false; setPending(false); }
  }
  return <div className="mt-4 space-y-2">
    <button onClick={cancel} disabled={pending} className="underline text-sm disabled:opacity-50">{pending ? t('cancelling') : t('cancel')}</button>
    {message && <p role={message === 'cancelError' ? 'alert' : 'status'} className="text-sm">{t(message)}</p>}
  </div>;
}
