'use client';

import { useState,useRef,useEffect } from 'react';
import {useTranslations,useFormatter} from 'next-intl';
import { cn } from '@/lib/utils';

interface ReadingProgressBarProps {
  shelfBookId: string;
  bookId: string;
  userId:string;
  sourceBookId?:string;
  pageCount: number | null;
  progressPages: number | null;
  progressPercent: number | null;
}

export function ReadingProgressBar(props:ReadingProgressBarProps){return <EntryReadingProgressBar key={props.shelfBookId} {...props}/>;}
function EntryReadingProgressBar({shelfBookId,bookId,userId,sourceBookId=bookId,pageCount,progressPages,progressPercent}:ReadingProgressBarProps){
  const t=useTranslations('readingProgress'),common=useTranslations('common'),formatter=useFormatter(),busy=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),[error,setError]=useState(false);
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  const [isEditing, setIsEditing] = useState(false);
  const [inputPages, setInputPages] = useState(progressPages?.toString() ?? '');
  const [inputPercent, setInputPercent] = useState(progressPercent?.toString() ?? '');
  const [currentPages, setCurrentPages] = useState(progressPages);
  const [currentPercent, setCurrentPercent] = useState(progressPercent);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const displayPercent =
    currentPercent ??
    (currentPages!==null && pageCount ? Math.round((currentPages / pageCount) * 100) : null);

  async function handleUpdate() {
    if(busy.current)return;
    const input=pageCount?inputPages:inputPercent,value=Number(input);
    if(!input.trim()||!Number.isFinite(value)||value<0||value>(pageCount??100)||(pageCount&&!Number.isInteger(value))){setError(true);return;}
    busy.current=true;setLoading(true);setError(false);setSuccess(false);clearTimeout(timer.current);
    try{
      const res=await fetch(`/api/shelf-books/${shelfBookId}/progress`,{method:'PATCH',headers:{'Content-Type':'application/json','X-Liravo-Actor':userId},body:JSON.stringify(pageCount?{progress_pages:value}:{progress_percent:value})});
      const data=await res.json();
      if(!res.ok||data.id!==shelfBookId||data.user_id!==userId||data.book_id!==sourceBookId||typeof data.progress_percent!=='number'||!Number.isFinite(data.progress_percent)||data.progress_percent<0||data.progress_percent>100)throw new Error('Invalid progress receipt');
      setCurrentPages(data.progress_pages??null);setCurrentPercent(data.progress_percent);
      setInputPages(data.progress_pages?.toString()??'');setInputPercent(data.progress_percent.toString());
      setSuccess(true);setIsEditing(false);timer.current=setTimeout(()=>setSuccess(false),2000);
    }catch{setError(true);}
    finally{busy.current=false;setLoading(false);}
  }

  return (
    <div className="mt-2">
      {/* Progress bar */}
      <div role="progressbar" aria-label={t('label')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={displayPercent??0} className="h-1.5 bg-muted rounded-full overflow-hidden mb-1.5">
        <div
          className="h-full bg-amber-500 rounded-full transition-all duration-300"
          style={{ width: `${displayPercent ?? 0}%` }}
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {displayPercent!==null?formatter.number(displayPercent/100,{style:'percent',maximumFractionDigits:2}):t('notStarted')}
          {currentPages!==null&&pageCount?' · '+t('pageCount',{current:currentPages,total:pageCount}):''}
        </span>

        {success && (
          <span role="status" className="text-xs text-amber-600 font-medium">{t('saved')}</span>
        )}

        {!isEditing && (
          <button
            onClick={()=>{setIsEditing(true);setError(false);}}
            className="text-xs text-amber-600 hover:text-amber-700 font-medium ml-auto"
          >
            {t('update')}
          </button>
        )}
      </div>

      {error&&<p role="alert" className="text-xs text-destructive">{t('failed')}</p>}
      {isEditing && (
        <div className="mt-2 flex items-center gap-2">
          {pageCount ? (
            <input
              type="number"
              min={0}
              max={pageCount}
              aria-label={t('pages')} disabled={loading} placeholder={t('pageRange',{count:pageCount})}
              value={inputPages}
              onChange={(e) => setInputPages(e.target.value)}
              className={cn(
                'w-28 text-xs px-2 py-1 border border-border rounded-md bg-background',
                'focus:outline-none focus:ring-1 focus:ring-amber-500'
              )}
            />
          ) : (
            <input
              type="number"
              min={0}
              max={100}
              aria-label={t('percent')} disabled={loading} step="any" placeholder={t('percentRange')}
              value={inputPercent}
              onChange={(e) => setInputPercent(e.target.value)}
              className={cn(
                'w-24 text-xs px-2 py-1 border border-border rounded-md bg-background',
                'focus:outline-none focus:ring-1 focus:ring-amber-500'
              )}
            />
          )}
          <button
            onClick={handleUpdate}
            disabled={loading}
            className="text-xs px-2.5 py-1 bg-amber-500 text-white rounded-md hover:bg-amber-600 disabled:opacity-50 transition-colors"
          >
            {loading?common('saving'):common('save')}
          </button>
          <button
            disabled={loading} onClick={() => setIsEditing(false)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {common('cancel')}
          </button>
        </div>
      )}
    </div>
  );
}
