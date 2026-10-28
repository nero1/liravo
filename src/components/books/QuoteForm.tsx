'use client';

import { useRequestIntent } from '@/lib/client/useRequestIntent';

import {useTranslations} from 'next-intl';
import { useState,useRef,useEffect } from 'react';
import { Quote } from 'lucide-react';
import { cn } from '@/lib/utils';

interface QuoteFormProps {
  bookId: string;
  userId:string;
  onSuccess?: () => void;
}

export function QuoteForm(props:QuoteFormProps){return <OwnedQuoteForm key={props.userId+':'+props.bookId} {...props}/>;}
function OwnedQuoteForm({bookId,userId,onSuccess}:QuoteFormProps){
  const intent=useRequestIntent(userId),t=useTranslations('books'),common=useTranslations('common'),busy=useRef(false),timer=useRef<ReturnType<typeof setTimeout>>();
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState('');
  const [pageNumber, setPageNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);
  const [invalidPage,setInvalidPage]=useState(false);

  const handleSave = async () => {
    if(!content.trim()||busy.current)return;setInvalidPage(false);
    if(pageNumber&&(!Number.isSafeInteger(Number(pageNumber))||Number(pageNumber)<1)){setInvalidPage(true);return;}
    busy.current=true;setSaving(true);
    const body={book_id:bookId,content:content.trim(),...(pageNumber?{page_number:Number(pageNumber)}:{})},scope='quote:'+bookId;

    setError(false);
    try {
      const response = await fetch('/api/quotes', {
        method: 'POST',
        headers:{'Content-Type':'application/json',...await intent.durableHeaders(body,scope)},body:JSON.stringify(body),
      });

      if (!response.ok) { setError(true); return; }
      const result=await response.json();if(typeof result.quote?.id!=='string')throw new Error('Invalid quote receipt');
      intent.complete(scope);
      setDone(true);
      setContent('');
      setPageNumber('');
      setOpen(false);
      onSuccess?.();
      timer.current=setTimeout(() => setDone(false), 3000);
    } catch { setError(true); }
    finally {busy.current=false;setSaving(false);}
  };

  return (
    <div>
      {invalidPage&&<p role="alert" className="text-sm text-red-500 mb-2">{t('quoteInvalidPage')}</p>}
      {error && <p role="alert" className="text-sm text-red-500 mb-2">{t('quoteFailed')}</p>}
      {done && (
        <p role="status" className="text-sm text-accent mb-2">{t('quoteSaved')}</p>
      )}
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 border border-border rounded-lg text-sm font-medium hover:bg-muted transition-colors"
        >
          <Quote size={16} aria-hidden="true"/>
          {t('saveQuote')}
        </button>
      ) : (
        <div className="border border-border rounded-xl p-4 space-y-3">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            id={'quote-content-'+bookId} aria-label={t('quoteText')} disabled={saving} placeholder={t('quotePlaceholder')}
            maxLength={1000}
            rows={3}
            className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent/50"
          />
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={pageNumber}
              onChange={(e) => setPageNumber(e.target.value)}
              id={'quote-page-'+bookId} aria-label={t('quotePage')} disabled={saving} placeholder={t('quotePage')}
              min={1}
              className="w-32 px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
            <div className="flex gap-2 ml-auto">
              <button
                disabled={saving} onClick={() => setOpen(false)}
                className="px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
              >
                {common('cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !content.trim()}
                className={cn(
                  'px-4 py-2 text-sm bg-accent text-accent-foreground rounded-lg font-medium transition-colors',
                  'hover:bg-accent/90 disabled:opacity-60'
                )}
              >
                {saving?common('saving'):common('save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
