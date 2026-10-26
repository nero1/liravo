'use client';

import { useRequestIntent } from '@/lib/client/useRequestIntent';
import { useState, useRef } from 'react';
import { Bookmark } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReactionButtonsProps {
  bookId: string;
  userId: string;
  initialWantToRead: boolean;
}

export function ReactionButtons({ bookId, initialWantToRead }: ReactionButtonsProps) {
  const intent = useRequestIntent();
  const busy = useRef(false);
  const [wantToRead, setWantToRead] = useState(initialWantToRead);
  const [loading, setLoading] = useState(false);

  async function handleWantToRead() {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      const res = await fetch(`/api/books/${bookId}/reactions`, {
        method: 'POST',
        headers: intent.headers({bookId}),
      });
      if (res.ok) {
        const data = await res.json() as { reacted: boolean };
        if (typeof data.reacted !== 'boolean') throw new Error('Invalid reaction response');
        intent.complete();
        setWantToRead(data.reacted);
      }
    } catch {
      // Ignore
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleWantToRead}
        disabled={loading}
        aria-label={wantToRead ? 'Remove from want to read' : 'Add to want to read'}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50',
          wantToRead
            ? 'bg-amber-100 border-amber-400 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-600'
            : 'border-border text-muted-foreground hover:border-amber-400 hover:text-amber-600'
        )}
      >
        <Bookmark
          size={16}
          className={cn(
            'transition-colors',
            wantToRead ? 'fill-amber-500 stroke-amber-500' : 'stroke-current'
          )}
        />
        <span>{wantToRead ? 'Want to read' : 'Want to read'}</span>
      </button>
    </div>
  );
}
