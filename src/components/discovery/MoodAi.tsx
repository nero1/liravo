'use client';

import { useState,useRef,useEffect } from 'react';
import {useLocale,useTranslations} from 'next-intl';
import {AI_MOOD_MAX_LENGTH} from '@/constants/ai';
import Link from 'next/link';

interface AiBook {
  title: string;
  author: string;
  reason: string;
}

export function MoodAi({actorId}:{actorId:string}) {
  const t=useTranslations('discover'),common=useTranslations('common'),locale=useLocale(),controller=useRef<AbortController|null>(null);
  useEffect(()=>()=>{controller.current?.abort();controller.current=null;},[]);
  const [query, setQuery] = useState('');
  const [books, setBooks] = useState<AiBook[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function change(value:string){controller.current?.abort();controller.current=null;setQuery(value);setBooks([]);setSearched(false);setLoading(false);setError(null);}
  async function search(){
    if(controller.current||query.trim().length<3||query.trim().length>AI_MOOD_MAX_LENGTH)return;
    const current=new AbortController();controller.current=current;setLoading(true);setError(null);setSearched(false);setBooks([]);
    try{const response=await fetch('/api/ai/recommendations?'+new URLSearchParams({mood:query.trim(),userId:actorId}),{cache:'no-store',signal:current.signal,headers:{'X-Liravo-Actor':actorId}}),data=await response.json();
      if(!response.ok||data.actorId!==actorId||data.locale!==locale||!Array.isArray(data.recommendations)||!data.recommendations.every((book:AiBook)=>book&&typeof book.title==='string'&&book.title.length>0&&typeof book.author==='string'&&book.author.length>0&&typeof book.reason==='string'&&book.reason.length>0))throw Error();
      if(controller.current===current&&!current.signal.aborted){setBooks(data.recommendations);setSearched(true);}
    }catch{if(controller.current===current&&!current.signal.aborted)setError(t('aiFailed'));}finally{if(controller.current===current){controller.current=null;setLoading(false);}}
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="mb-6">
        <Link href="/discover" className="text-sm text-neutral-500 hover:underline mb-2 inline-block">
          {t('back')}
        </Link>
        <h1 className="font-display text-2xl font-bold mb-1">{t('aiTitle')}</h1>
        <p className="text-neutral-500 dark:text-neutral-400 text-sm">
          {t('aiDescription')}
        </p>
      </div>

      <div className="flex gap-2 mb-6">
        <input
          type="text"
          value={query}
          onChange={(e) => change(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') search(); }}
          aria-label={t('aiDescription')} placeholder={t('aiPlaceholder')}
          className="flex-1 px-4 py-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          maxLength={AI_MOOD_MAX_LENGTH}
        />
        <button
          onClick={search}
          disabled={loading || query.trim().length < 3}
          className="px-5 py-3 rounded-xl bg-accent text-white font-medium text-sm disabled:opacity-50 hover:bg-accent/90 transition-colors"
        >
          {loading?common('loading'):t('find')}
        </button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive mb-4">{error}</p>
      )}

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-4 p-4 rounded-xl border border-border animate-pulse">
              <div className="w-12 h-16 rounded bg-muted flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/2" />
                <div className="h-3 bg-muted rounded w-full" />
              </div>
            </div>
          ))}
        </div>
      )}

      {searched && books.length === 0 && !loading && (
        <div className="text-center py-12 text-neutral-500">
          <p>{t('aiEmpty')}</p>
        </div>
      )}

      {books.length > 0 && !loading && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground mb-2">{t('aiResults')}</p>
          {books.map((book, i) => (
            <Link
              key={i}
              href={`/discover?q=${encodeURIComponent(book.title)}`}
              className="flex gap-4 p-4 rounded-xl border border-border hover:bg-muted transition-colors"
            >
              <div className="w-12 h-16 flex-shrink-0 rounded overflow-hidden bg-muted flex items-center justify-center text-xl">
                📚
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm leading-tight line-clamp-2">{book.title}</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{book.author}</p>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2 italic">{book.reason}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
