'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import { useRequestIntent } from '@/lib/client/useRequestIntent';

interface Props {
  bookId: string;
  reviewId: string;
  initialVote: boolean | null;
  helpful: number;
  unhelpful: number;
}

export function HelpfulnessButtons({ bookId, reviewId, initialVote, helpful, unhelpful }: Props) {
  const t = useTranslations('book');
  const common = useTranslations('common');
  const intent = useRequestIntent();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [result, setResult] = useState({ vote: initialVote, helpfulVotes: helpful, unhelpfulVotes: unhelpful });

  async function vote(value: boolean) {
    if (busy.current) return;
    busy.current = true;
    setPending(true); setError(false);
    try {
      const response = await fetch(`/api/books/${bookId}/reviews/${reviewId}/helpful?value=${value}`, {
        method: 'POST', headers: intent.headers({value}),
      });
      if (!response.ok) throw new Error('Vote unavailable');
      const data = await response.json() as typeof result;
      if ((data.vote !== null && typeof data.vote !== 'boolean') || !Number.isInteger(data.helpfulVotes) || !Number.isInteger(data.unhelpfulVotes)) throw new Error('Invalid vote response');
      intent.complete(); setResult(data);
    } catch { setError(true); }
    finally { busy.current = false; setPending(false); }
  }

  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground">
      <button type="button" disabled={pending} aria-pressed={result.vote === true} aria-label={t('helpfulVote')} onClick={() => vote(true)} className="flex items-center gap-1 hover:text-green-600 disabled:opacity-50">
        <ThumbsUp aria-hidden="true" size={12} /> {result.helpfulVotes}
      </button>
      <button type="button" disabled={pending} aria-pressed={result.vote === false} aria-label={t('unhelpfulVote')} onClick={() => vote(false)} className="flex items-center gap-1 hover:text-red-500 disabled:opacity-50">
        <ThumbsDown aria-hidden="true" size={12} /> {result.unhelpfulVotes}
      </button>
      {error && <span role="alert">{common('error')}</span>}
    </div>
  );
}
