'use client';

import { useState,useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {useTranslations,useLocale} from 'next-intl';
import { Search } from 'lucide-react';

interface BookResult {
  id?: string;
  google_books_id?: string;
  title: string;
  author_name: string;
  cover_url?: string;
  published_year?: number;
  _external?:boolean;
  isbn_10?:string;isbn_13?:string;publisher?:string;language?:string;format?:string;edition_name?:string;
}

export function BookSearch({initialQuery=''}:{initialQuery?:string}) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<BookResult[]>([]);
  const [loading, setLoading] = useState(false);
  const t=useTranslations('books'),common=useTranslations('common'),editionText=useTranslations('editions'),locale=useLocale(),[error,setError]=useState(false),[generation,setGeneration]=useState(0);
  useEffect(()=>{
    const controller=new AbortController(),term=query.trim();setResults([]);setError(false);
    if(term.length<2){setLoading(false);return()=>controller.abort();}
    setLoading(true);
    const timer=setTimeout(()=>{
      void fetch('/api/books/search?q='+encodeURIComponent(term),{signal:controller.signal}).then(async response=>{
        if(!response.ok)throw new Error('Search unavailable');const data=await response.json();if(!Array.isArray(data.books))throw new Error('Invalid search results');if(!controller.signal.aborted)setResults(data.books);
      }).catch(()=>{if(!controller.signal.aborted)setError(true);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    },400);
    return()=>{clearTimeout(timer);controller.abort();};
  },[query,generation]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={event=>setQuery(event.target.value)}
          placeholder={t('searchPlaceholder')} aria-label={t('search')} maxLength={200}
          className="w-full pl-10 pr-4 py-3 border border-border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-accent/50 text-sm"
        />
      </div>

      {loading && (
        <div role="status" className="text-center py-8 text-muted-foreground text-sm">{t('searching')}</div>
      )}

      {!loading && results.length > 0 && (
        <div className="space-y-2">
          {results.map((book,i)=>{
            let language=book.language;try{if(language)language=new Intl.DisplayNames([locale],{type:'language'}).of(language)??language;}catch{}
            const details=[language,book.format?editionText('formats.'+book.format):null,book.edition_name,book.publisher,book.published_year].filter(Boolean).join(' · ');
            const href = book.id
              ? `/book/${book.id}`
              : `/book/lookup?gid=${encodeURIComponent(book.google_books_id??'')}`;

            return (
              <Link
                key={book.id ?? book.google_books_id ?? i}
                href={href}
                className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-muted transition-colors"
              >
                <div className="flex-shrink-0 w-10 h-14 relative">
                  {book.cover_url ? (
                    <Image
                      src={book.cover_url}
                      alt={book.title}
                      fill
                      className="object-cover rounded"
                      sizes="40px"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted rounded flex items-center justify-center">
                      <span className="text-[8px] text-muted-foreground text-center px-1">{book.title.slice(0, 10)}</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{book.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{book.author_name}</p>
                  {details&&<p className="text-xs text-muted-foreground">{details}</p>}
                  {(book.isbn_13||book.isbn_10)&&<p className="text-xs text-muted-foreground">{editionText('isbn',{value:book.isbn_13??book.isbn_10!})}</p>}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {error&&<div role="alert" className="text-sm text-destructive"><p>{t('searchUnavailable')}</p><button type="button" onClick={()=>setGeneration(value=>value+1)} className="underline">{common('retry')}</button></div>}
      {!loading&&!error&&query.trim().length>=2&&results.length===0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">{t('noBooksFor',{query})}</div>
      )}
    </div>
  );
}
