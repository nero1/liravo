'use client';

import { useRequestIntent } from '@/lib/client/useRequestIntent';
import { useState, useRef,useEffect } from 'react';
import {useTranslations} from 'next-intl';
import { Bookmark } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReactionButtonsProps {
  bookId: string;
  userId: string;
  initialWantToRead: boolean;
  reviewId?:string;
}

export function ReactionButtons({ bookId,userId, initialWantToRead,reviewId }: ReactionButtonsProps) {
  const t=useTranslations('books'),common=useTranslations('common');
  const intent = useRequestIntent(userId);
  const busy = useRef(false);
  const [wantToRead, setWantToRead] = useState(initialWantToRead);
  const [loading, setLoading] = useState(false);
  const [error,setError]=useState(false);
  useEffect(()=>{
    const update=(event:Event)=>{const value=(event as CustomEvent).detail;if(value?.userId===userId&&value?.bookId===bookId&&typeof value.reacted==='boolean')setWantToRead(value.reacted);};
    window.addEventListener('liravo:want-to-read',update);return()=>window.removeEventListener('liravo:want-to-read',update);
  },[bookId,userId]);

  async function handleWantToRead() {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);setError(false);
    const payload={active:reviewId?true:!wantToRead,...(reviewId?{reviewId}:{})},scope='book:'+bookId;
    try {
      const res = await fetch(`/api/books/${bookId}/reactions`, {
        method: 'POST',
        headers: {'Content-Type':'application/json',...await intent.durableHeaders(payload,scope)},body:JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json() as { reacted: boolean };
        if (typeof data.reacted !== 'boolean') throw new Error('Invalid reaction response');
        intent.complete(scope);
        setWantToRead(data.reacted);
        window.dispatchEvent(new CustomEvent('liravo:want-to-read',{detail:{userId,bookId,reacted:data.reacted}}));
      }else throw new Error('Reaction unavailable');
    } catch {setError(true);} finally {
      busy.current = false;
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleWantToRead}
        type="button"
        disabled={loading||!!reviewId&&wantToRead}
        aria-pressed={wantToRead}
        aria-label={reviewId?t('reviewWantToRead'):wantToRead?t('removeWantToRead'):t('addWantToRead')}
        className={cn(
          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50',
          wantToRead
            ? 'bg-amber-100 border-amber-400 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-600'
            : 'border-border text-muted-foreground hover:border-amber-400 hover:text-amber-600'
        )}
      >
        <Bookmark
          size={16} aria-hidden="true"
          className={cn(
            'transition-colors',
            wantToRead ? 'fill-amber-500 stroke-amber-500' : 'stroke-current'
          )}
        />
        <span>{t('wantToRead')}</span>
      </button>
      {error&&<span role="alert" className="text-sm text-destructive">{common('error')}</span>}
    </div>
  );
}
