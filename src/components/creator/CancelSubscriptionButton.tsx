'use client';

import { useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

export function CancelSubscriptionButton() {
  const t = useTranslations('premium');
  const router = useRouter();
  const busy = useRef(false);
  const [pending,setPending] = useState(false);
  const [message,setMessage] = useState<'cancelPending' | 'cancelError' | 'managedByGoogle' | null>(null);
  const [managementUrl,setManagementUrl] = useState<string | null>(null);
  async function cancel() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    try {
      const response = await fetch('/api/subscriptions/cancel', { method: 'POST' });
      const result = await response.json();
      if (result.managedExternally && typeof result.managementUrl === 'string') {
        const url=new URL(result.managementUrl);
        if (url.origin!=='https://play.google.com') throw new Error('Invalid management link');
        setManagementUrl(url.href);
        setMessage(result.pending ? 'cancelPending' : 'managedByGoogle');
        return;
      }
      if (!response.ok) throw new Error('Cancellation unavailable');
      if (result.cancelled === true) router.refresh();
      else setMessage('cancelPending');
    } catch { setMessage('cancelError'); }
    finally { busy.current = false; setPending(false); }
  }
  return <div className="mt-4 space-y-2">
    <button onClick={cancel} disabled={pending} className="underline text-sm disabled:opacity-50">{pending ? t('cancelling') : t('cancel')}</button>
    {message && <p role={message === 'cancelError' ? 'alert' : 'status'} className="text-sm">{t(message)}</p>}
    {managementUrl && <a href={managementUrl} target="_blank" rel="noopener noreferrer" className="underline text-sm block">{t('manageGoogle')}</a>}
  </div>;
}
