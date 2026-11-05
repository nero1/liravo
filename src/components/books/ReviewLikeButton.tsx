'use client';

import { useState, useRef } from 'react';
import {useTranslations} from 'next-intl';
import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReviewLikeButtonProps {
  reviewId: string;
  initialLiked: boolean;
  initialCount: number;
}

export function ReviewLikeButton({
  reviewId,
  initialLiked,
  initialCount,
}: ReviewLikeButtonProps) {
  const t=useTranslations('reviewForm'),common=useTranslations('common'),[error,setError]=useState(false);
  const intent = useRef(crypto.randomUUID());
  const busy = useRef(false);
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);

  async function handleToggle() {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);setError(false);
    try {
      const res = await fetch(`/api/reviews/${reviewId}/like`, {
        method: 'POST',
        headers: { 'X-Idempotency-Key': intent.current },
      });
      if (res.ok) {
        const data = await res.json() as { liked: boolean };
        if (typeof data.liked !== 'boolean') throw new Error('Invalid like response');
        intent.current = crypto.randomUUID();
        setLiked(data.liked);
        if (data.liked !== liked) setCount((prev) => (data.liked ? prev + 1 : Math.max(0, prev - 1)));
      }else throw new Error('Like unavailable');
    }catch{setError(true);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2"><button
      onClick={handleToggle}
      disabled={loading}
      aria-label={t(liked?'unlike':'like')} aria-pressed={liked}
      className={cn(
        'flex items-center gap-1 text-xs font-medium transition-colors disabled:opacity-50',
        liked
          ? 'text-rose-500'
          : 'text-muted-foreground hover:text-rose-500'
      )}
    >
      <Heart
        size={14}
        className={cn(liked ? 'fill-rose-500 stroke-rose-500' : 'stroke-current')}
      />
      {count > 0 && <span>{count}</span>}
    </button>{error&&<span role="alert" className="text-xs text-destructive">{common('error')}</span>}</span>
  );
}
