'use client';

import { useState } from 'react';
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
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);

  async function handleToggle() {
    setLoading(true);
    try {
      const res = await fetch(`/api/reviews/${reviewId}/like`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json() as { liked: boolean };
        setLiked(data.liked);
        setCount((prev) => (data.liked ? prev + 1 : Math.max(0, prev - 1)));
      }
    } catch {
      // Ignore network errors
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      aria-label={liked ? 'Unlike this review' : 'Like this review'}
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
    </button>
  );
}
