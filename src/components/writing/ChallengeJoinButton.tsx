'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRequestIntent } from '@/lib/client/useRequestIntent';

export function ChallengeJoinButton({ challengeId, initialJoined = false, onJoined }: { challengeId: string; initialJoined?: boolean; onJoined?: (count: number) => void }) {
  const t = useTranslations('writingChallenge');
  const router = useRouter();
  const intent = useRequestIntent();
  const busy = useRef(false);
  const [joined,setJoined] = useState(false);
  const [pending,setPending] = useState(false);
  const [error,setError] = useState(false);
  async function join() {
    if (busy.current || joined || initialJoined) return;
    busy.current = true;
    setPending(true);
    setError(false);
    try {
      const response = await fetch(`/api/write/challenges/${challengeId}/join`, { method:'POST', headers:intent.headers({challengeId}) });
      const data = await response.json();
      if (!response.ok) throw new Error('Join unavailable');
      intent.complete();
      setJoined(true);
      if (Number.isInteger(data.participant_count)) onJoined?.(data.participant_count);
      router.refresh();
    } catch { setError(true); }
    finally { busy.current = false; setPending(false); }
  }
  return <div className="space-y-1">
    <button type="button" onClick={join} disabled={pending || joined || initialJoined} className="rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm font-medium px-3 py-1.5">{joined || initialJoined ? t('joined') : pending ? t('joining') : t('join')}</button>
    {error && <p role="alert" className="text-sm text-destructive">{t('joinError')}</p>}
  </div>;
}
