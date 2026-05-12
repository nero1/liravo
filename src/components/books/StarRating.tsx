'use client';

import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StarRatingProps {
  rating: number;
  readonly?: boolean;
  size?: 'sm' | 'md' | 'lg';
  onChange?: (rating: number) => void;
}

export function StarRating({ rating, readonly = false, size = 'md', onChange }: StarRatingProps) {
  const sizes = { sm: 14, md: 18, lg: 24 };
  const px = sizes[size];

  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          onClick={() => !readonly && onChange?.(star)}
          className={cn(
            'transition-colors',
            readonly ? 'cursor-default' : 'cursor-pointer hover:text-accent'
          )}
          aria-label={readonly ? undefined : `Rate ${star} stars`}
        >
          <Star
            size={px}
            className={cn(
              star <= Math.round(rating) ? 'text-accent fill-accent' : 'text-muted-foreground'
            )}
          />
        </button>
      ))}
    </div>
  );
}
